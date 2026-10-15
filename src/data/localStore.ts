/**
 * Store della DEMO: tutto in memoria, salvato in localStorage quando disponibile.
 * Applica le stesse regole del backend (src/domain/stateMachine.ts), così la demo
 * si comporta come la produzione, tranne per fotocamera/GPS (sostituiti da upload e posizione simulata).
 */
import type {
  AiCheck,
  Lang,
  AuditEntry,
  Certificate,
  Company,
  DsaDecision,
  DsaNotice,
  Lead,
  LeadView,
  NasNotice,
  NewReportInput,
  Notification,
  NotificationKind,
  Profile,
  Quote,
  Removal,
  Report,
  ReportCategory,
  Reply,
  Stats,
  Venue,
  VenueClaim,
  VenueStatus,
  ReportState,
} from '../domain/types'
import type { ClaimVenueResult, DataStore, NearbyVenue, OtpRequestResult, SubmitReportResult, VenueClaimFilter, VenueFilter } from './store'
import {
  applyAiCheck,
  buyLead as buyLeadRule,
  canReply,
  canSubmitReport,
  deriveVenueStatus,
  isPubliclyVisible,
  medianModerationHours,
  moderate,
  newLeadFromReport,
  removeReport as removeReportRule,
  resolveWithCertificate,
  RuleViolation,
  sortQuotesForVenue,
  type ModerationDecision,
  assertOk,
} from '../domain/stateMachine'
import { distanceMeters, zoneFor } from '../domain/geo'
import { addHours, addMonths, isSameMonth } from '../domain/time'
import { REMOVAL_SLA_HOURS, REPLY_WINDOW_DAYS } from '../domain/rules'
import { newId, quickHash } from '../lib/ids'
import { analyzePhoto, featuresToCheck } from '../lib/photoCheck'
import { fmtMoney } from '../lib/format'
import { translate } from '../i18n'
import * as seed from './seed'

const STORAGE_KEY = 'mappa-igiene-demo-v1'
const SESSION_KEY = 'mappa-igiene-demo-session'
/** Stessa chiave di src/i18n/index.tsx: la lingua scelta nell'interfaccia. */
const LANG_KEY = 'mappa-igiene-lang'

/**
 * Categoria di un comunicato NAS dedotta dal testo (la fonte pubblica non ha un campo categoria).
 * In assenza di indizi resta 'altro': mai attribuire "alimenti mal conservati" a un comunicato che parla d'altro.
 */
function nasCategoryFromSummary(summary: string): ReportCategory {
  const s = summary.toLowerCase()
  const rules: [RegExp, ReportCategory][] = [
    [/blatt|scarafagg|cockroach/, 'blatte'],
    [/roditor|\btop[io]\b|\bratt[io]\b|rodent|\bmice\b|\brats?\b/, 'roditori'],
    [/formich|\bants?\b/, 'formiche'],
    [/\bmosc[ah]|insett|\bflies\b|\binsects?\b/, 'mosche'],
    [/\bmuff|umidit|\bmould|\bmold|\bdamp/, 'muffa'],
    [/aliment|\bcib[oi]\b|tracciabilit|scadut|conservaz|congelat|\bfood\b|expired/, 'alimenti'],
    [/sporc|\bdirt|\bfilth|unclean/, 'sporcizia'],
  ]
  for (const [re, cat] of rules) if (re.test(s)) return cat
  return 'altro'
}

interface Db {
  profiles: Profile[]
  venues: Venue[]
  reports: Report[]
  replies: Reply[]
  companies: Company[]
  leads: Lead[]
  quotes: Quote[]
  certificates: Certificate[]
  /** Richieste di gestione dei locali: la titolarità nasce solo da una richiesta approvata. */
  claims: VenueClaim[]
  nasNotices: NasNotice[]
  removals: Removal[]
  dsaNotices: DsaNotice[]
  notifications: Notification[]
  audit: AuditEntry[]
  blockedDevices: string[]
  otpCodes: Record<string, string>
}

/**
 * I due titolari dei dati di partenza (Marco, Sara) risultano da richieste già approvate dalla moderazione:
 * la demo parte con dei titolari senza saltare la coda che vale per tutti gli altri.
 */
const SEED_CLAIM_VAT: Record<string, string> = { v_giglio: '01234567890', v_arnolfo: '09876543210' }

function seededClaims(): VenueClaim[] {
  return seed.personas
    .filter((p) => p.role === 'locale' && p.venueIds?.length)
    .flatMap((p) =>
      p.venueIds!.map((venueId): VenueClaim => ({
        id: `claim_${venueId}`,
        venueId,
        userId: p.id,
        vat: SEED_CLAIM_VAT[venueId] ?? '00000000000',
        phone: p.phone ?? '',
        status: 'approvata',
        requestedAt: p.createdAt,
        decidedAt: addHours(p.createdAt, 20),
        decidedBy: 'u_mod',
      })),
    )
}

function freshDb(): Db {
  const db: Db = {
    profiles: structuredClone(seed.personas),
    venues: structuredClone(seed.venues),
    reports: structuredClone(seed.reports),
    replies: structuredClone(seed.replies),
    companies: structuredClone(seed.companies),
    leads: [],
    quotes: [],
    certificates: [],
    claims: seededClaims(),
    nasNotices: structuredClone(seed.nasNotices),
    removals: structuredClone(seed.removals),
    dsaNotices: structuredClone(seed.dsaNotices),
    notifications: [],
    audit: [],
    blockedDevices: [],
    otpCodes: {},
  }
  // contatto già aperto per la segnalazione pubblicata della Trattoria del Giglio
  const giglio = db.reports.find((r) => r.id === 'r_giglio_1')!
  const lead = newLeadFromReport(giglio, zoneFor(giglio.lat, giglio.lng), giglio.publishedAt!, 'l_giglio_1')
  lead.purchases.push({ companyId: 'c_disinfesta', paidCents: lead.priceCents, createdAt: seed.replies[0].createdAt })
  db.leads.push(lead)
  db.quotes.push({ id: 'q_1', leadId: lead.id, companyId: 'c_disinfesta', amountCents: 28000, text: 'Trattamento gel + monitoraggio 30 giorni, intervento entro 48 ore.', createdAt: seed.replies[0].createdAt })
  // certificato verificato per la pizzeria risolta
  const santo = db.reports.find((r) => r.id === 'r_santo_1')!
  db.certificates.push({ id: 'cert_1', reportId: santo.id, venueId: santo.venueId, companyId: 'c_disinfesta', file: '', interventionType: 'Disinfestazione formiche con gel insetticida', issuedAt: santo.resolvedAt!, verifiedAt: santo.resolvedAt!, verifiedBy: 'u_mod' })
  recomputeVenueStatuses(db)
  return db
}

function recomputeVenueStatuses(db: Db): void {
  for (const v of db.venues) {
    v.status = deriveVenueStatus(db.reports.filter((r) => r.venueId === v.id))
  }
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const k = '__mi_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    return null
  }
}

export class LocalStore implements DataStore {
  readonly mode = 'demo' as const
  private db: Db
  private sessionUserId: string | null = null
  private listeners = new Set<() => void>()
  private storage = safeStorage()

  constructor() {
    this.db = this.load() ?? freshDb()
    try {
      this.sessionUserId = this.storage?.getItem(SESSION_KEY) ?? null
    } catch {
      this.sessionUserId = null
    }
  }

  /* ----------------------------- infrastruttura ----------------------------- */

  private load(): Db | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Db & { version?: number }
      if (!parsed.venues || !parsed.reports) return null
      // Dati salvati da una versione senza coda delle rivendicazioni: i titolari esistenti valgono come approvati
      if (!Array.isArray(parsed.claims)) parsed.claims = seededClaims()
      return parsed
    } catch {
      return null
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.db))
    } catch {
      /* quota piena o storage bloccato: la demo continua in memoria */
    }
  }

  private commit(): void {
    recomputeVenueStatuses(this.db)
    this.persist()
    for (const l of this.listeners) l()
  }

  private now(): string {
    return new Date().toISOString()
  }

  private audit(actorId: string, action: string, targetType: string, targetId: string, note?: string): void {
    this.db.audit.unshift({ id: newId('au'), at: this.now(), actorId, action, targetType, targetId, note })
    if (this.db.audit.length > 500) this.db.audit.length = 500
  }

  /** Lingua dell'interfaccia (come detectLang in src/i18n/index.tsx): nella demo chi legge le notifiche è chi usa questo browser. */
  private uiLang(): Lang {
    try {
      const saved = this.storage?.getItem(LANG_KEY)
      if (saved === 'it' || saved === 'en') return saved
    } catch {
      /* storage non disponibile */
    }
    const nav = typeof navigator !== 'undefined' ? navigator.language : 'it'
    return nav.toLowerCase().startsWith('it') ? 'it' : 'en'
  }

  /**
   * Titolo e testo vengono generati nella lingua dell'interfaccia dalle chiavi notif.<textKey>.title/body
   * (src/i18n/modules/core.ts), con interpolazione {var} come useT().
   */
  private notify(toUserId: string, kind: NotificationKind, textKey: string, vars?: Record<string, string | number>, link?: string): void {
    const lang = this.uiLang()
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars && k in vars ? String(vars[k]) : `{${k}}`))
    const title = fill(translate(lang, `notif.${textKey}.title`))
    const body = fill(translate(lang, `notif.${textKey}.body`))
    this.db.notifications.unshift({ id: newId('n'), toUserId, kind, title, body, link, createdAt: this.now(), read: false })
  }

  /** Avvisa tutti i profili di moderazione (nella demo: Chiara e Admin), come notify_moderators in SQL. */
  private notifyModerators(textKey: string, vars?: Record<string, string | number>, link?: string): void {
    for (const p of this.db.profiles) {
      if (p.role === 'moderatore' || p.role === 'admin') this.notify(p.id, 'generico', textKey, vars, link)
    }
  }

  private profile(id: string): Profile {
    const p = this.db.profiles.find((x) => x.id === id)
    if (!p) throw new RuleViolation(['rule.unknown_user'])
    return p
  }

  private requireModerator(id: string): Profile {
    const actor = this.profile(id)
    if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
    return actor
  }

  private venue(id: string): Venue {
    const v = this.db.venues.find((x) => x.id === id)
    if (!v) throw new RuleViolation(['rule.unknown_venue'])
    return v
  }

  private report(id: string): Report {
    const r = this.db.reports.find((x) => x.id === id)
    if (!r) throw new RuleViolation(['rule.unknown_report'])
    return r
  }

  private company(id: string): Company {
    const c = this.db.companies.find((x) => x.id === id)
    if (!c) throw new RuleViolation(['rule.unknown_company'])
    return c
  }

  private venueOwnerIds(venueId: string): string[] {
    const v = this.venue(venueId)
    const owners = this.db.profiles.filter((p) => p.venueIds?.includes(venueId)).map((p) => p.id)
    if (v.claimedBy) owners.push(v.claimedBy)
    return [...new Set(owners)]
  }

  private replaceReport(next: Report): Report {
    const i = this.db.reports.findIndex((r) => r.id === next.id)
    if (i >= 0) this.db.reports[i] = next
    else this.db.reports.unshift(next)
    return next
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /* -------------------------------- sessione -------------------------------- */

  async getSession(): Promise<Profile | null> {
    if (!this.sessionUserId) return null
    return this.db.profiles.find((p) => p.id === this.sessionUserId) ?? null
  }

  async listDemoPersonas(): Promise<Profile[]> {
    return this.db.profiles.filter((p) => p.id !== 'u_none')
  }

  async signInDemo(personaId: string): Promise<Profile> {
    const p = this.profile(personaId)
    this.sessionUserId = p.id
    try {
      this.storage?.setItem(SESSION_KEY, p.id)
    } catch {
      /* ignora */
    }
    this.commit()
    return p
  }

  async requestOtp(phone: string): Promise<OtpRequestResult> {
    const normalized = phone.replace(/\s+/g, '')
    if (!/^\+?\d{8,15}$/.test(normalized)) throw new RuleViolation(['rule.invalid_phone'])
    const code = String(Math.floor(100000 + Math.random() * 900000))
    this.db.otpCodes[normalized] = code
    this.persist()
    return { ok: true, demoCode: code }
  }

  async verifyOtp(phone: string, code: string, displayName?: string): Promise<Profile> {
    const normalized = phone.replace(/\s+/g, '')
    if (this.db.otpCodes[normalized] !== code) throw new RuleViolation(['rule.invalid_otp'])
    delete this.db.otpCodes[normalized]
    let p = this.db.profiles.find((x) => x.phone?.replace(/\s+/g, '') === normalized)
    if (!p) {
      p = { id: newId('u'), displayName: displayName?.trim() || `Utente ${normalized.slice(-4)}`, role: 'utente', phone: normalized, phoneVerified: true, spidVerified: false, createdAt: this.now() }
      this.db.profiles.push(p)
      this.audit(p.id, 'signup_phone', 'profile', p.id)
    }
    this.sessionUserId = p.id
    try {
      this.storage?.setItem(SESSION_KEY, p.id)
    } catch {
      /* ignora */
    }
    this.commit()
    return p
  }

  async signOut(): Promise<void> {
    this.sessionUserId = null
    try {
      this.storage?.removeItem(SESSION_KEY)
    } catch {
      /* ignora */
    }
    this.commit()
  }

  /* --------------------------------- locali --------------------------------- */

  async listVenues(filter?: VenueFilter): Promise<Venue[]> {
    let list = [...this.db.venues]
    if (filter?.status?.length) list = list.filter((v) => filter.status!.includes(v.status))
    if (filter?.type?.length) list = list.filter((v) => filter.type!.includes(v.type))
    if (filter?.q?.trim()) {
      const q = filter.q.trim().toLowerCase()
      list = list.filter((v) => v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q))
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }

  async getVenue(id: string): Promise<Venue | null> {
    return this.db.venues.find((v) => v.id === id) ?? null
  }

  async nearestVenues(lat: number, lng: number, limit = 8): Promise<NearbyVenue[]> {
    return this.db.venues
      .map((v) => ({ ...v, distanceM: distanceMeters(lat, lng, v.lat, v.lng) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit)
  }

  /**
   * Richiesta di gestione (stesse regole di claim_venue in SQL): nasce "in_verifica" e non rende titolare.
   * La titolarità arriva solo con decideVenueClaim della moderazione (regola 3: la replica spetta al locale, non a chiunque).
   */
  async claimVenue(venueId: string, userId: string, proof: { vat: string; phone: string }): Promise<ClaimVenueResult> {
    const v = this.venue(venueId)
    const p = this.profile(userId)
    if (v.claimedBy && v.claimedBy !== userId) throw new RuleViolation(['rule.venue_already_claimed'])
    const vat = proof.vat.replace(/\s+/g, '').toUpperCase()
    const phone = proof.phone.replace(/\s+/g, '')
    if (this.venueOwnerIds(venueId).includes(userId)) {
      // già titolare: nessuna nuova richiesta; si restituisce quella approvata (o la si registra, se mancava)
      let claim = this.db.claims.find((c) => c.venueId === venueId && c.userId === userId && c.status === 'approvata')
      if (!claim) {
        claim = { id: newId('claim'), venueId, userId, vat, phone, status: 'approvata', requestedAt: this.now(), decidedAt: this.now() }
        this.db.claims.unshift(claim)
        this.persist()
      }
      return { venue: v, claim }
    }
    if (!/^(IT)?\d{11}$/.test(vat)) throw new RuleViolation(['rule.invalid_vat'])
    if (this.db.claims.some((c) => c.venueId === venueId && c.userId === userId && c.status === 'in_verifica')) {
      throw new RuleViolation(['rule.claim_pending'])
    }
    const claim: VenueClaim = { id: newId('claim'), venueId, userId, vat, phone, status: 'in_verifica', requestedAt: this.now() }
    this.db.claims.unshift(claim)
    this.audit(userId, 'claim_venue_requested', 'venue', venueId, vat)
    this.notifyModerators('claim_richiesta', { venue: v.name, vat, user: p.displayName }, `/moderazione`)
    this.commit()
    return { venue: v, claim }
  }

  async listVenueClaims(filter?: VenueClaimFilter): Promise<VenueClaim[]> {
    let list = [...this.db.claims]
    if (filter?.status?.length) list = list.filter((c) => filter.status!.includes(c.status))
    if (filter?.userId) list = list.filter((c) => c.userId === filter.userId)
    return list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  }

  /** Solo moderazione (come decide_venue_claim in SQL): l'approvazione scrive titolarità, ruolo e locali gestiti. */
  async decideVenueClaim(claimId: string, accept: boolean, moderatorId: string, note?: string): Promise<VenueClaim> {
    this.requireModerator(moderatorId)
    const claim = this.db.claims.find((c) => c.id === claimId)
    if (!claim) throw new RuleViolation(['rule.unknown_claim'])
    if (claim.status !== 'in_verifica') throw new RuleViolation(['rule.already_decided'])
    const v = this.venue(claim.venueId)
    const p = this.profile(claim.userId)
    const now = this.now()
    const cleanNote = note?.trim() || undefined
    if (accept) {
      if (v.claimedBy && v.claimedBy !== claim.userId) throw new RuleViolation(['rule.venue_already_claimed'])
      if (p.blocked) throw new RuleViolation(['rule.user_blocked'])
      v.claimedBy = claim.userId
      p.venueIds = [...new Set([...(p.venueIds ?? []), claim.venueId])]
      if (p.role === 'utente') p.role = 'locale'
      if (!p.phone && claim.phone) p.phone = claim.phone
      Object.assign(claim, { status: 'approvata' as const, note: cleanNote, decidedAt: now, decidedBy: moderatorId })
      this.audit(moderatorId, 'claim_venue_approved', 'venue', v.id, claim.vat)
      this.notify(claim.userId, 'generico', 'claim_approvata', { venue: v.name }, `/locale/${v.id}/gestisci`)
    } else {
      Object.assign(claim, { status: 'rifiutata' as const, note: cleanNote, decidedAt: now, decidedBy: moderatorId })
      this.audit(moderatorId, 'claim_venue_rejected', 'venue', v.id, cleanNote ?? claim.vat)
      this.notify(claim.userId, 'generico', cleanNote ? 'claim_rifiutata_motivo' : 'claim_rifiutata', { venue: v.name, note: cleanNote ?? '' }, `/locale/${v.id}/gestisci`)
    }
    this.commit()
    return claim
  }

  async setVenuePremium(venueId: string, months: number): Promise<Venue> {
    const v = this.venue(venueId)
    const base = v.premiumUntil && new Date(v.premiumUntil) > new Date() ? v.premiumUntil : this.now()
    v.premiumUntil = addMonths(base, months)
    this.audit(v.claimedBy ?? 'system', 'premium', 'venue', venueId, `${months} mesi`)
    this.commit()
    return v
  }

  /* ------------------------------ segnalazioni ------------------------------ */

  async listReportsForVenue(venueId: string, opts?: { includeHidden?: boolean }): Promise<Report[]> {
    return this.db.reports
      .filter((r) => r.venueId === venueId && (opts?.includeHidden || isPubliclyVisible(r)))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  }

  async listReportsByUser(userId: string): Promise<Report[]> {
    return this.db.reports.filter((r) => r.userId === userId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  }

  async listAllReports(): Promise<Report[]> {
    return [...this.db.reports].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  }

  async getReport(id: string): Promise<Report | null> {
    return this.db.reports.find((r) => r.id === id) ?? null
  }

  async countReportsThisMonth(userId: string): Promise<number> {
    const now = this.now()
    return this.db.reports.filter((r) => r.userId === userId && r.source === 'utente' && isSameMonth(r.submittedAt, now)).length
  }

  async submitReport(input: NewReportInput): Promise<SubmitReportResult> {
    const now = this.now()
    const profile = this.db.profiles.find((p) => p.id === input.userId) ?? null
    const venue = this.db.venues.find((v) => v.id === input.venueId) ?? null
    const check = canSubmitReport({
      profile,
      venue,
      reportsThisMonth: await this.countReportsThisMonth(input.userId),
      nowIso: now,
      enforceCamera: false, // demo: la fotocamera non è disponibile nella pagina pubblicata
      deviceBlocked: !!input.deviceHash && this.db.blockedDevices.includes(input.deviceHash),
      consentAccepted: input.consentAccepted,
      captureMode: input.captureMode,
      capturedAt: input.capturedAt,
      lat: input.lat,
      lng: input.lng,
    })
    assertOk(check)
    // Il dispositivo resta associato al profilo: blockUser blocca anche questo, non solo il numero di telefono
    if (profile && input.deviceHash) profile.deviceHash = input.deviceHash

    const photoHash = quickHash(input.photo.slice(0, 20000) + input.photo.length)
    if (this.db.reports.some((r) => r.photoHash === photoHash && r.userId === input.userId)) {
      throw new RuleViolation(['rule.duplicate_photo'])
    }

    let aiCheck: AiCheck
    try {
      aiCheck = featuresToCheck(await analyzePhoto(input.photo), now)
    } catch {
      aiCheck = { verdict: 'incerta', score: 0.5, reasons: ['photo.unreadable'], simulated: true, checkedAt: now }
    }

    const draft: Report = {
      id: newId('r'),
      venueId: input.venueId,
      userId: input.userId,
      source: 'utente',
      category: input.category,
      description: input.description.trim(),
      photo: input.photo,
      photoHash,
      captureMode: input.captureMode,
      capturedAt: input.capturedAt,
      lat: input.lat,
      lng: input.lng,
      distanceM: check.distanceM,
      state: 'in_verifica',
      submittedAt: now,
      facesBlurred: false,
    }
    const report = applyAiCheck(draft, aiCheck)
    this.replaceReport(report)
    this.audit(input.userId, 'submit_report', 'report', report.id, report.state)
    if (report.state === 'scartata') {
      this.notify(input.userId, 'segnalazione_scartata', 'scartata', undefined, `/profilo`)
    }
    this.commit()
    return { report, aiCheck }
  }

  /* ------------------------------- moderazione ------------------------------ */

  async listModerationQueue(): Promise<Report[]> {
    return this.db.reports.filter((r) => r.state === 'in_verifica').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  }

  async setReportPhotoBlurred(reportId: string, photo: string, actorId?: string): Promise<Report> {
    const r = this.report(reportId)
    if (r.state !== 'in_verifica') throw new RuleViolation(['rule.not_in_verification'])
    if (!photo.trim()) throw new RuleViolation(['rule.empty_text'])
    const next = this.replaceReport({ ...r, photo, facesBlurred: true })
    // Attribuzione: il moderatore indicato, altrimenti chi è collegato, altrimenti chi ha già in carico la segnalazione
    this.audit(actorId ?? this.sessionUserId ?? r.moderatorId ?? 'u_mod', 'blur_photo', 'report', reportId)
    this.commit()
    return next
  }

  async moderateReport(reportId: string, decision: ModerationDecision, moderatorId: string, note?: string): Promise<Report> {
    this.requireModerator(moderatorId)
    const r = this.report(reportId)
    const next = this.replaceReport(moderate(r, decision, moderatorId, this.now(), note))
    this.audit(moderatorId, `moderate_${decision}`, 'report', reportId, note)
    const venue = this.venue(r.venueId)
    if (next.state === 'pubblicata') {
      this.notify(r.userId, 'segnalazione_pubblicata', 'pubblicata', { venue: venue.name }, `/locale/${venue.id}`)
      for (const owner of this.venueOwnerIds(venue.id)) {
        this.notify(owner, 'nuova_segnalazione_locale', 'nuova_segnalazione_locale', { days: REPLY_WINDOW_DAYS }, `/locale/${venue.id}/gestisci`)
      }
    } else {
      this.notify(r.userId, 'segnalazione_archiviata', note ? 'archiviata_motivo' : 'archiviata', note ? { note } : undefined, `/profilo`)
    }
    this.commit()
    return next
  }

  async removeReport(reportId: string, reason: string, requestedBy: Removal['requestedBy'], actorId: string): Promise<Report> {
    const actor = this.profile(actorId)
    const r = this.report(reportId)
    const next = this.replaceReport(removeReportRule(r, reason, actor, this.now()))
    const venue = this.venue(r.venueId)
    this.db.removals.unshift({ id: newId('rm'), reportId, venueName: venue.name, reason, requestedBy, publishedAt: r.publishedAt ?? r.submittedAt, removedAt: next.removedAt! })
    this.audit(actorId, 'remove_report', 'report', reportId, `${requestedBy}: ${reason}`)
    this.notify(r.userId, 'segnalazione_rimossa', 'rimossa', undefined, `/trasparenza`)
    this.commit()
    return next
  }

  async blockUser(userId: string, actorId: string): Promise<Profile> {
    const actor = this.profile(actorId)
    if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
    const p = this.profile(userId)
    p.blocked = true
    if (p.deviceHash && !this.db.blockedDevices.includes(p.deviceHash)) this.db.blockedDevices.push(p.deviceHash)
    this.audit(actorId, 'block_user', 'profile', userId)
    this.commit()
    return p
  }

  async unblockUser(userId: string, actorId: string): Promise<Profile> {
    const actor = this.profile(actorId)
    if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
    const p = this.profile(userId)
    if (!p.blocked) throw new RuleViolation(['rule.not_allowed'])
    p.blocked = false
    if (p.deviceHash) this.db.blockedDevices = this.db.blockedDevices.filter((h) => h !== p.deviceHash)
    this.audit(actorId, 'unblock_user', 'profile', userId)
    this.commit()
    return p
  }

  /* --------------------------------- repliche -------------------------------- */

  async listReplies(reportId: string): Promise<Reply[]> {
    return this.db.replies.filter((x) => x.reportId === reportId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listRepliesForVenue(venueId: string): Promise<Reply[]> {
    return this.db.replies.filter((x) => x.venueId === venueId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async addReply(reportId: string, authorId: string, text: string): Promise<Reply> {
    const r = this.report(reportId)
    assertOk(canReply(r, this.venueOwnerIds(r.venueId), authorId))
    if (!text.trim()) throw new RuleViolation(['rule.empty_text'])
    const reply: Reply = { id: newId('rep'), reportId, venueId: r.venueId, authorId, text: text.trim(), createdAt: this.now() }
    this.db.replies.push(reply)
    this.audit(authorId, 'reply', 'report', reportId)
    this.notify(r.userId, 'replica_ricevuta', 'replica', undefined, `/locale/${r.venueId}`)
    this.commit()
    return reply
  }

  /* ----------------------------- ditte e contatti ---------------------------- */

  async listCompanies(): Promise<Company[]> {
    return [...this.db.companies].sort((a, b) => a.name.localeCompare(b.name))
  }

  async getCompany(id: string): Promise<Company | null> {
    return this.db.companies.find((c) => c.id === id) ?? null
  }

  async acceptSameConditions(companyId: string): Promise<Company> {
    const c = this.company(companyId)
    c.sameConditionsAck = true
    this.audit(c.ownerUserId, 'accept_same_conditions', 'company', companyId)
    this.commit()
    return c
  }

  async sponsorCompany(companyId: string, months: number): Promise<Company> {
    const c = this.company(companyId)
    const base = c.sponsorUntil && new Date(c.sponsorUntil) > new Date() ? c.sponsorUntil : this.now()
    c.sponsorUntil = addMonths(base, months)
    this.audit(c.ownerUserId, 'sponsor', 'company', companyId, `${months} mesi`)
    this.commit()
    return c
  }

  async requestQuotes(reportId: string, requesterId: string): Promise<Lead> {
    const r = this.report(reportId)
    if (!this.venueOwnerIds(r.venueId).includes(requesterId)) throw new RuleViolation(['rule.not_venue_owner'])
    const existing = this.db.leads.find((l) => l.reportId === reportId)
    if (existing) return existing
    const lead = newLeadFromReport(r, zoneFor(r.lat, r.lng), this.now(), newId('l'))
    this.db.leads.unshift(lead)
    this.audit(requesterId, 'request_quotes', 'lead', lead.id)
    for (const c of this.db.companies) {
      if (c.services.includes(lead.category) || c.services.includes('altro')) {
        this.notify(c.ownerUserId, 'nuovo_contatto', 'nuovo_contatto', { category: translate(this.uiLang(), `category.${lead.category}`), zone: lead.zone, price: fmtMoney(lead.priceCents, this.uiLang()), max: lead.maxBuyers }, `/ditte`)
      }
    }
    this.commit()
    return lead
  }

  async getLeadForReport(reportId: string): Promise<Lead | null> {
    return this.db.leads.find((l) => l.reportId === reportId) ?? null
  }

  async listLeads(companyId: string): Promise<LeadView[]> {
    return this.db.leads
      .map((l) => {
        const mine = l.purchases.some((p) => p.companyId === companyId)
        const base: LeadView = { ...l, purchasedByMe: mine }
        if (!mine) return base
        const v = this.venue(l.venueId)
        const r = this.report(l.reportId)
        const owner = this.db.profiles.find((p) => this.venueOwnerIds(v.id).includes(p.id))
        return { ...base, venueName: v.name, venueAddress: v.address, venuePhone: owner?.phone, photo: r.photo }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async buyLead(leadId: string, companyId: string): Promise<Lead> {
    const lead = this.db.leads.find((l) => l.id === leadId)
    if (!lead) throw new RuleViolation(['rule.unknown_lead'])
    const company = this.company(companyId)
    const next = buyLeadRule(lead, company, this.now())
    const i = this.db.leads.findIndex((l) => l.id === leadId)
    this.db.leads[i] = next
    this.audit(company.ownerUserId, 'buy_lead', 'lead', leadId, `${next.purchases.at(-1)!.paidCents / 100} €`)
    this.commit()
    return next
  }

  async submitQuote(leadId: string, companyId: string, amountCents: number, text: string): Promise<Quote> {
    const lead = this.db.leads.find((l) => l.id === leadId)
    if (!lead) throw new RuleViolation(['rule.unknown_lead'])
    if (!lead.purchases.some((p) => p.companyId === companyId)) throw new RuleViolation(['rule.lead_not_purchased'])
    if (!(amountCents > 0)) throw new RuleViolation(['rule.invalid_amount'])
    const q: Quote = { id: newId('q'), leadId, companyId, amountCents: Math.round(amountCents), text: text.trim(), createdAt: this.now() }
    this.db.quotes.push(q)
    const r = this.report(lead.reportId)
    for (const owner of this.venueOwnerIds(r.venueId)) {
      this.notify(owner, 'preventivo_ricevuto', 'preventivo', { company: this.company(companyId).name, amount: fmtMoney(q.amountCents, this.uiLang()) }, `/locale/${r.venueId}/gestisci`)
    }
    this.audit(this.company(companyId).ownerUserId, 'quote', 'lead', leadId)
    this.commit()
    return q
  }

  async listQuotesForLead(leadId: string): Promise<Quote[]> {
    // sponsor attivi prima (è ciò che pagano), poi ordine di arrivo; la ditta del fondatore mai in testa
    return sortQuotesForVenue(this.db.quotes.filter((q) => q.leadId === leadId), this.db.companies, this.now())
  }

  async listQuotesForCompany(companyId: string): Promise<Quote[]> {
    this.company(companyId)
    return this.db.quotes.filter((q) => q.companyId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async acceptQuote(quoteId: string, venueOwnerId: string): Promise<Quote> {
    const q = this.db.quotes.find((x) => x.id === quoteId)
    if (!q) throw new RuleViolation(['rule.unknown_quote'])
    const lead = this.db.leads.find((l) => l.id === q.leadId)!
    if (!this.venueOwnerIds(lead.venueId).includes(venueOwnerId)) throw new RuleViolation(['rule.not_venue_owner'])
    for (const other of this.db.quotes.filter((x) => x.leadId === q.leadId)) other.accepted = other.id === quoteId
    this.audit(venueOwnerId, 'accept_quote', 'quote', quoteId)
    this.commit()
    return q
  }

  /* -------------------------------- certificati ------------------------------ */

  async uploadCertificate(reportId: string, companyId: string, file: string, interventionType: string, uploaderId: string): Promise<Certificate> {
    const r = this.report(reportId)
    if (r.state !== 'pubblicata') throw new RuleViolation(['rule.not_published'])
    const company = this.company(companyId)
    const allowed = this.venueOwnerIds(r.venueId).includes(uploaderId) || company.ownerUserId === uploaderId
    if (!allowed) throw new RuleViolation(['rule.not_allowed'])
    if (!interventionType.trim()) throw new RuleViolation(['rule.empty_text'])
    const cert: Certificate = { id: newId('cert'), reportId, venueId: r.venueId, companyId, file, interventionType: interventionType.trim(), issuedAt: this.now() }
    this.db.certificates.unshift(cert)
    this.audit(uploaderId, 'upload_certificate', 'report', reportId, company.name)
    this.commit()
    return cert
  }

  async listCertificatesForVenue(venueId: string): Promise<Certificate[]> {
    return this.db.certificates.filter((c) => c.venueId === venueId)
  }

  async listCertificatesForReport(reportId: string): Promise<Certificate[]> {
    return this.db.certificates.filter((c) => c.reportId === reportId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }

  async listPendingCertificates(): Promise<Certificate[]> {
    return this.db.certificates.filter((c) => !c.verifiedAt && !c.rejectedAt)
  }

  async verifyCertificate(certificateId: string, moderatorId: string, accept: boolean, note?: string): Promise<Certificate> {
    const actor = this.profile(moderatorId)
    if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
    const cert = this.db.certificates.find((c) => c.id === certificateId)
    if (!cert) throw new RuleViolation(['rule.unknown_certificate'])
    const now = this.now()
    if (accept) {
      const r = this.report(cert.reportId)
      this.replaceReport(resolveWithCertificate(r, now))
      cert.verifiedAt = now
      cert.verifiedBy = moderatorId
      for (const owner of this.venueOwnerIds(cert.venueId)) {
        this.notify(owner, 'certificato_verificato', 'certificato', undefined, `/locale/${cert.venueId}`)
      }
    } else {
      cert.rejectedAt = now
      cert.rejectionNote = note
    }
    this.audit(moderatorId, accept ? 'verify_certificate' : 'reject_certificate', 'certificate', certificateId, note)
    this.commit()
    return cert
  }

  /* ------------------------------------ NAS ---------------------------------- */

  async listNasNotices(): Promise<NasNotice[]> {
    return [...this.db.nasNotices].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  async importNasNotice(input: Omit<NasNotice, 'id' | 'importedAt' | 'venueId' | 'linkedReportId'>): Promise<NasNotice> {
    const actor = this.profile(input.importedBy)
    if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
    if (!/^https?:\/\//.test(input.sourceUrl)) throw new RuleViolation(['rule.invalid_url'])
    const n: NasNotice = { ...input, id: newId('nas'), importedAt: this.now() }
    this.db.nasNotices.unshift(n)
    this.audit(input.importedBy, 'import_nas', 'nas', n.id)
    this.commit()
    return n
  }

  async linkNasNotice(noticeId: string, venueId: string, moderatorId: string): Promise<Report> {
    const actor = this.profile(moderatorId)
    if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
    const n = this.db.nasNotices.find((x) => x.id === noticeId)
    if (!n) throw new RuleViolation(['rule.unknown_notice'])
    if (n.linkedReportId) throw new RuleViolation(['rule.notice_already_linked'])
    const v = this.venue(venueId)
    const now = this.now()
    const draft: Report = {
      id: newId('r'), venueId, userId: moderatorId, source: 'nas', category: nasCategoryFromSummary(n.summary),
      description: `Comunicato NAS: ${n.summary}`, photo: '', photoHash: '', captureMode: 'fotocamera',
      capturedAt: n.publishedAt, lat: v.lat, lng: v.lng, distanceM: 0, state: 'in_verifica', submittedAt: now,
      nasNoticeId: n.id, facesBlurred: true,
    }
    const published = moderate(draft, 'conferma', moderatorId, now, 'Fonte pubblica: comunicato NAS')
    this.replaceReport(published)
    n.venueId = venueId
    n.linkedReportId = published.id
    this.audit(moderatorId, 'link_nas', 'nas', noticeId, venueId)
    for (const owner of this.venueOwnerIds(venueId)) {
      this.notify(owner, 'nuova_segnalazione_locale', 'nas_collegato', { days: REPLY_WINDOW_DAYS }, `/locale/${venueId}/gestisci`)
    }
    this.commit()
    return published
  }

  /* -------------------------------- trasparenza ------------------------------ */

  async listRemovals(): Promise<Removal[]> {
    return [...this.db.removals].sort((a, b) => b.removedAt.localeCompare(a.removedAt))
  }

  async submitDsaNotice(reportId: string, contact: string, reason: string): Promise<DsaNotice> {
    this.report(reportId)
    if (!contact.trim() || !reason.trim()) throw new RuleViolation(['rule.empty_text'])
    const n: DsaNotice = { id: newId('dsa'), reportId, contact: contact.trim(), reason: reason.trim(), receivedAt: this.now() }
    this.db.dsaNotices.unshift(n)
    this.audit('anonymous', 'dsa_notice', 'report', reportId)
    this.notify('u_mod', 'generico', 'dsa', { hours: REMOVAL_SLA_HOURS }, `/moderazione`)
    this.commit()
    return n
  }

  async listDsaNotices(): Promise<DsaNotice[]> {
    return [...this.db.dsaNotices].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }

  async decideDsaNotice(noticeId: string, decision: DsaDecision, note: string, moderatorId: string): Promise<DsaNotice> {
    const n = this.db.dsaNotices.find((x) => x.id === noticeId)
    if (!n) throw new RuleViolation(['rule.unknown_notice'])
    if (n.decidedAt) throw new RuleViolation(['rule.already_decided'])
    if (!note.trim()) throw new RuleViolation(['rule.empty_text'])
    if (decision === 'rimossa') {
      // Accogliere una richiesta significa rimuovere: se la segnalazione non è più in mappa non c'è nulla da rimuovere
      const r = this.report(n.reportId)
      if (!(r.state === 'pubblicata' || r.state === 'risolta')) throw new RuleViolation(['rule.not_published'])
      await this.removeReport(n.reportId, 'richiesta_dsa_accolta', 'dsa', moderatorId)
    }
    n.decidedAt = this.now()
    n.decision = decision
    n.decisionNote = note.trim()
    this.audit(moderatorId, `dsa_${decision}`, 'dsa', noticeId, note)
    this.commit()
    return n
  }

  async getStats(): Promise<Stats> {
    const byStatus: Record<VenueStatus, number> = { nessuna: 0, in_verifica: 0, confermata: 0, risolta: 0 }
    for (const v of this.db.venues) byStatus[v.status]++
    const byState: Record<ReportState, number> = { in_verifica: 0, scartata: 0, archiviata: 0, pubblicata: 0, risolta: 0, rimossa: 0 }
    for (const r of this.db.reports) byState[r.state]++
    return {
      venues: this.db.venues.length,
      venuesByStatus: byStatus,
      reportsTotal: this.db.reports.length,
      reportsByState: byState,
      repliesTotal: this.db.replies.length,
      leadsSold: this.db.leads.reduce((n, l) => n + l.purchases.length, 0),
      removals: this.db.removals.length,
      dsaNotices: this.db.dsaNotices.length,
      medianModerationHours: medianModerationHours(this.db.reports),
    }
  }

  /* ----------------------------- notifiche e audit --------------------------- */

  async listNotifications(userId: string): Promise<Notification[]> {
    return this.db.notifications.filter((n) => n.toUserId === userId)
  }

  async markNotificationRead(id: string): Promise<void> {
    const n = this.db.notifications.find((x) => x.id === id)
    if (n) {
      n.read = true
      this.commit()
    }
  }

  async listAudit(limit = 100): Promise<AuditEntry[]> {
    return this.db.audit.slice(0, limit)
  }

  /* ------------------------------------ demo --------------------------------- */

  async resetDemo(): Promise<void> {
    this.db = freshDb()
    // Un profilo creato via OTP non esiste più nei dati di partenza: la sessione non deve restare appesa a un id ignoto
    if (this.sessionUserId && !this.db.profiles.some((p) => p.id === this.sessionUserId)) {
      this.sessionUserId = null
      try {
        this.storage?.removeItem(SESSION_KEY)
      } catch {
        /* ignora */
      }
    }
    this.commit()
  }
}
