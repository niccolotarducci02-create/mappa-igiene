/**
 * Store di PRODUZIONE su Supabase (Postgres + Auth OTP via SMS + Storage + Edge Functions).
 * Si attiva quando sono presenti VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (vedi src/data/index.ts).
 *
 * Come si mappa sul backend (schema in /supabase/migrations, dettagli in docs/SUPABASE_STORE.md):
 *  - letture: tabelle e viste pubbliche via .from() (la RLS decide le righe visibili);
 *  - operazioni con regole di business: RPC SECURITY DEFINER via .rpc('nome', { p_param }) con le regole
 *    applicate nei trigger/funzioni SQL (3 segnalazioni al mese, 150 m, 30 minuti, 7 giorni di replica,
 *    30 € a contatto per tutti, rimozione solo dalla moderazione...);
 *  - foto e certificati: bucket privati `report-photos` e `certificates`; il client carica il data URL come
 *    Blob e, in lettura, risolve URL firmati (1 ora) così la UI usa Report.photo / Certificate.file come src;
 *  - sessione: signInWithOtp({ phone }) + verifyOtp({ type: 'sms' }); il profilo nasce dal trigger su auth.users;
 *  - subscribe(): canale realtime `db-changes` su tutte le tabelle di `public` + eventi di autenticazione.
 *
 * Errori: ogni eccezione Postgres il cui messaggio inizia con 'rule.' diventa RuleViolation con le chiavi i18n
 * (più chiavi unite da virgola, come in buy_lead); tutto il resto diventa RuleViolation(['common.error'])
 * dopo un console.error. Le righe snake_case sono mappate nei tipi camelCase di src/domain/types.ts.
 */
import {
  createClient,
  type AuthChangeEvent,
  type RealtimeChannel,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type {
  AiCheck,
  AuditEntry,
  CaptureMode,
  Certificate,
  Company,
  DsaDecision,
  DsaNotice,
  Lead,
  LeadPurchase,
  LeadStatus,
  LeadView,
  NasNotice,
  NewReportInput,
  Notification,
  NotificationKind,
  Profile,
  Quote,
  Removal,
  RemovalRequester,
  Report,
  ReportCategory,
  ReportSource,
  ReportState,
  Reply,
  Role,
  Stats,
  Venue,
  VenueClaim,
  VenueClaimStatus,
  VenueStatus,
  VenueType,
} from '../domain/types'
import type { ClaimVenueResult, DataStore, NearbyVenue, OtpRequestResult, SubmitReportResult, VenueClaimFilter, VenueFilter } from './store'
import { assertOk, canSubmitReport, RuleViolation, type ModerationDecision } from '../domain/stateMachine'
import { quickHash } from '../lib/ids'

/* ------------------------------------------------------------------ */
/* Costanti                                                            */
/* ------------------------------------------------------------------ */

/** Durata degli URL firmati per foto e certificati (la UI li usa come src). */
const SIGNED_URL_TTL_S = 3600
/** Gli URL firmati vengono riusati finché restano validi con margine (evita una richiesta per ogni render). */
const SIGNED_URL_CACHE_MS = (SIGNED_URL_TTL_S - 300) * 1000
/** In produzione la foto deve venire dalla fotocamera in-app (stesso valore applicato dal trigger SQL). */
const ENFORCE_CAMERA = true
/** Prefisso internazionale aggiunto ai numeri senza '+': l'app è per Firenze. */
const DEFAULT_COUNTRY_PREFIX = '+39'
/** Nome della Edge Function del filtro foto (chiamata dopo submit_report). */
const AI_PHOTO_CHECK_FUNCTION = 'ai-photo-check'

const BUCKET_PHOTOS = 'report-photos'
const BUCKET_CERTIFICATES = 'certificates'

const ROLES: readonly Role[] = ['utente', 'locale', 'ditta', 'moderatore', 'admin']
/** Tabelle il cui cambiamento invalida il profilo in cache (ruolo, locali, ditta). */
const PROFILE_TABLES = new Set(['profiles', 'venue_owners', 'venues', 'companies'])

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/* ------------------------------------------------------------------ */
/* Righe snake_case (come arrivano da PostgREST)                        */
/* ------------------------------------------------------------------ */

interface ProfileRow {
  id: string
  display_name: string | null
  role: string | null
  phone: string | null
  phone_verified: boolean | null
  spid_verified: boolean | null
  device_hash: string | null
  company_id: string | null
  blocked: boolean | null
  created_at: string
}

interface VenueRow {
  id: string
  name: string
  type: VenueType
  address: string | null
  lat: number
  lng: number
  status: VenueStatus
  claimed_by: string | null
  premium_until: string | null
  created_at: string
  /** Solo da nearest_venues */
  distance_m?: number | null
}

interface VenueClaimRow {
  id: string
  venue_id: string
  user_id: string
  vat: string
  phone: string | null
  status: VenueClaimStatus
  note: string | null
  created_at: string
  decided_at: string | null
  decided_by: string | null
}

/** Riga di `reports` oppure della vista `public_reports` (che non ha user_id e alcune colonne di moderazione). */
interface ReportRow {
  id: string
  venue_id: string
  user_id?: string | null
  source: ReportSource
  category: ReportCategory
  description: string | null
  photo_path: string | null
  photo_hash?: string | null
  capture_mode: CaptureMode
  captured_at: string
  lat: number
  lng: number
  distance_m: number | null
  ai_verdict: AiCheck['verdict'] | null
  ai_score: number | null
  ai_reasons?: string[] | null
  ai_simulated: boolean | null
  ai_checked_at: string | null
  state: ReportState
  submitted_at: string
  moderated_at: string | null
  moderator_id?: string | null
  moderation_note?: string | null
  published_at: string | null
  reply_deadline_at: string | null
  resolved_at: string | null
  removed_at?: string | null
  removal_reason?: string | null
  nas_notice_id: string | null
  faces_blurred: boolean | null
}

interface ReplyRow {
  id: string
  report_id: string
  venue_id: string
  author_id: string
  text: string
  created_at: string
}

/** Riga di `companies` oppure della vista `companies_public` (senza owner_user_id, phone, email). */
interface CompanyRow {
  id: string
  name: string
  vat: string
  zones: string[] | null
  services: ReportCategory[] | null
  owner_user_id?: string | null
  sponsor_until: string | null
  same_conditions_ack: boolean | null
  is_founder_company: boolean | null
  phone?: string | null
  email?: string | null
}

interface LeadRow {
  id: string
  report_id: string
  venue_id: string
  category: ReportCategory
  zone: string
  created_at: string
  price_cents: number
  max_buyers: number
  status: LeadStatus
}

/** Vista leads_anonymised: niente locale/segnalazione, solo conteggio acquisti e "comprato da me". */
interface LeadAnonRow {
  id: string
  category: ReportCategory
  zone: string
  created_at: string
  price_cents: number
  max_buyers: number
  status: LeadStatus
  purchases_count: number | null
  purchased_by_me: boolean | null
}

interface LeadPurchaseRow {
  lead_id: string
  company_id: string
  paid_cents: number
  created_at: string
}

/** JSON camelCase restituito dalla RPC lead_details. */
interface LeadDetailsJson {
  leadId: string
  venueId: string
  venueName: string | null
  venueAddress: string | null
  venuePhone: string | null
  photoPath: string | null
  category: ReportCategory
  description: string | null
}

interface QuoteRow {
  id: string
  lead_id: string
  company_id: string
  amount_cents: number
  text: string | null
  created_at: string
  accepted: boolean | null
}

interface CertificateRow {
  id: string
  report_id: string
  venue_id: string
  company_id: string
  file_path: string | null
  intervention_type: string
  issued_at: string
  verified_at: string | null
  verified_by: string | null
  rejected_at: string | null
  rejection_note: string | null
}

interface NasNoticeRow {
  id: string
  venue_name_raw: string
  address_raw: string | null
  source_url: string
  published_at: string
  summary: string
  imported_at: string
  imported_by: string | null
  venue_id: string | null
  linked_report_id: string | null
}

interface RemovalRow {
  id: string
  report_id: string
  venue_name: string
  reason: string
  requested_by: RemovalRequester
  published_at: string
  removed_at: string
}

/** Riga di `dsa_notices` oppure della vista `dsa_notices_public` (senza contact e reason). */
interface DsaNoticeRow {
  id: string
  report_id: string
  contact?: string | null
  reason?: string | null
  received_at: string
  decided_at: string | null
  decision: DsaDecision | null
  decision_note: string | null
}

interface NotificationRow {
  id: string
  to_user_id: string
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  created_at: string
  read: boolean | null
}

interface AuditRow {
  id: string
  at: string
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  note: string | null
}

interface PgError {
  message?: string
  code?: string
  details?: string
  hint?: string
}

interface PgResult {
  data: unknown
  error: PgError | null
}

/* ------------------------------------------------------------------ */
/* Utilità                                                             */
/* ------------------------------------------------------------------ */

/** Normalizza un timestamptz di Postgres ('2026-01-01 10:00:00+00') in ISO UTC come fa la demo. */
function iso(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

function optIso(value: string | null | undefined): string | undefined {
  return value ? iso(value) : undefined
}

function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return ''
}

/**
 * Traduce un errore (PostgREST, Auth, Storage, rete) in RuleViolation.
 * Le funzioni SQL alzano eccezioni con messaggio = chiave i18n ('rule.max_reports,rule.too_far').
 */
function toRuleViolation(e: unknown, fallbackKey = 'common.error'): RuleViolation {
  if (e instanceof RuleViolation) return e
  const msg = errorMessage(e).trim()
  if (msg.startsWith('rule.')) {
    const keys = msg
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.startsWith('rule.'))
    if (keys.length) return new RuleViolation(keys)
  }
  console.error('[supabaseStore]', e)
  return new RuleViolation([fallbackKey])
}

/** Esito di una query .from(): lancia RuleViolation sull'errore, altrimenti restituisce i dati tipizzati. */
function unwrap<T>(res: PgResult): T {
  if (res.error) throw toRuleViolation(res.error)
  return res.data as T
}

/**
 * Come unwrap, ma un id malformato (22P02), nessuna riga (PGRST116) o la mancanza del privilegio di lettura
 * (42501: tabelle revocate ad anon, es. leads) valgono "non trovato" invece di un errore in pagina.
 */
function rowOrNull<T>(res: PgResult): T | null {
  if (res.error) {
    if (res.error.code === '22P02' || res.error.code === 'PGRST116') return null
    if (res.error.code === '42501') {
      console.warn('[supabaseStore] lettura non consentita per questo ruolo', res.error.message)
      return null
    }
    throw toRuleViolation(res.error)
  }
  return (res.data as T | null) ?? null
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s().-]/g, '')
}

/** Supabase Auth vuole il formato E.164: un numero senza prefisso è considerato italiano. */
function toE164(phone: string): string {
  const p = normalizePhone(phone)
  if (p.startsWith('+')) return p
  if (p.startsWith('00')) return `+${p.slice(2)}`
  if (p.length === 12 && p.startsWith('39')) return `+${p}`
  return `${DEFAULT_COUNTRY_PREFIX}${p}`
}

interface DecodedDataUrl {
  bytes: Uint8Array<ArrayBuffer>
  mime: string
  ext: string
}

/** Decodifica un data URL (immagine della fotocamera, PDF del certificato) in byte + MIME. */
function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const m = /^data:([^;,]*)((?:;[^,]*)*),([\s\S]*)$/.exec(dataUrl)
  if (!m) throw new RuleViolation(['photo.unreadable'])
  const mime = (m[1] || 'application/octet-stream').toLowerCase()
  const isBase64 = /;base64/i.test(m[2] ?? '')
  const payload = m[3] ?? ''
  let bytes: Uint8Array<ArrayBuffer>
  try {
    if (isBase64) {
      const bin = atob(payload.replace(/\s+/g, ''))
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload))
    }
  } catch {
    throw new RuleViolation(['photo.unreadable'])
  }
  return { bytes, mime, ext: MIME_EXT[mime] ?? 'bin' }
}

/** SHA-256 esadecimale dei byte della foto (confronto duplicati per utente); fallback FNV-1a come la demo. */
async function hashBytes(bytes: Uint8Array<ArrayBuffer>, fallbackInput: string): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* ambiente senza WebCrypto: si usa l'hash rapido */
  }
  return quickHash(fallbackInput.slice(0, 20000) + fallbackInput.length)
}

function fileName(ext: string): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

function isModeratorRole(role: Role | undefined | null): boolean {
  return role === 'moderatore' || role === 'admin'
}

/* ------------------------------------------------------------------ */
/* Mapper snake_case -> dominio                                        */
/* ------------------------------------------------------------------ */

function mapVenue(r: VenueRow): Venue {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    address: r.address ?? '',
    lat: num(r.lat),
    lng: num(r.lng),
    status: r.status,
    claimedBy: opt(r.claimed_by),
    premiumUntil: optIso(r.premium_until),
    createdAt: iso(r.created_at),
  }
}

function mapVenueClaim(r: VenueClaimRow): VenueClaim {
  return {
    id: r.id,
    venueId: r.venue_id,
    userId: r.user_id,
    vat: r.vat,
    phone: r.phone ?? '',
    status: r.status,
    requestedAt: iso(r.created_at),
    decidedAt: optIso(r.decided_at),
    decidedBy: opt(r.decided_by),
    note: opt(r.note),
  }
}

function mapAiCheck(r: ReportRow): AiCheck | undefined {
  if (!r.ai_verdict) return undefined
  return {
    verdict: r.ai_verdict,
    score: num(r.ai_score),
    reasons: r.ai_reasons ?? [],
    simulated: !!r.ai_simulated,
    checkedAt: iso(r.ai_checked_at ?? r.submitted_at),
  }
}

/** `photo` è l'URL firmato già risolto ('' per le segnalazioni NAS o se la foto non è leggibile dal chiamante). */
function mapReport(r: ReportRow, photo: string): Report {
  return {
    id: r.id,
    venueId: r.venue_id,
    userId: r.user_id ?? '',
    source: r.source,
    category: r.category,
    description: r.description ?? '',
    photo,
    photoHash: r.photo_hash ?? '',
    captureMode: r.capture_mode,
    capturedAt: iso(r.captured_at),
    lat: num(r.lat),
    lng: num(r.lng),
    distanceM: num(r.distance_m),
    aiCheck: mapAiCheck(r),
    state: r.state,
    submittedAt: iso(r.submitted_at),
    moderatedAt: optIso(r.moderated_at),
    moderatorId: opt(r.moderator_id),
    moderationNote: opt(r.moderation_note),
    publishedAt: optIso(r.published_at),
    replyDeadlineAt: optIso(r.reply_deadline_at),
    resolvedAt: optIso(r.resolved_at),
    removedAt: optIso(r.removed_at),
    removalReason: opt(r.removal_reason),
    nasNoticeId: opt(r.nas_notice_id),
    facesBlurred: !!r.faces_blurred,
  }
}

function mapReply(r: ReplyRow): Reply {
  return { id: r.id, reportId: r.report_id, venueId: r.venue_id, authorId: r.author_id, text: r.text, createdAt: iso(r.created_at) }
}

function mapCompany(r: CompanyRow): Company {
  return {
    id: r.id,
    name: r.name,
    vat: r.vat,
    zones: r.zones ?? [],
    services: r.services ?? [],
    ownerUserId: r.owner_user_id ?? '',
    sponsorUntil: optIso(r.sponsor_until),
    sameConditionsAck: !!r.same_conditions_ack,
    isFounderCompany: !!r.is_founder_company,
    phone: opt(r.phone),
    email: opt(r.email),
  }
}

function mapPurchase(r: LeadPurchaseRow): LeadPurchase {
  return { companyId: r.company_id, paidCents: num(r.paid_cents), createdAt: iso(r.created_at) }
}

function mapLead(r: LeadRow, purchases: LeadPurchase[]): Lead {
  return {
    id: r.id,
    reportId: r.report_id,
    venueId: r.venue_id,
    category: r.category,
    zone: r.zone,
    createdAt: iso(r.created_at),
    priceCents: num(r.price_cents),
    maxBuyers: num(r.max_buyers),
    purchases,
    status: r.status,
  }
}

function mapQuote(r: QuoteRow): Quote {
  return {
    id: r.id,
    leadId: r.lead_id,
    companyId: r.company_id,
    amountCents: num(r.amount_cents),
    text: r.text ?? '',
    createdAt: iso(r.created_at),
    accepted: opt(r.accepted),
  }
}

function mapCertificate(r: CertificateRow, file: string): Certificate {
  return {
    id: r.id,
    reportId: r.report_id,
    venueId: r.venue_id,
    companyId: r.company_id,
    file,
    interventionType: r.intervention_type,
    issuedAt: iso(r.issued_at),
    verifiedAt: optIso(r.verified_at),
    verifiedBy: opt(r.verified_by),
    rejectedAt: optIso(r.rejected_at),
    rejectionNote: opt(r.rejection_note),
  }
}

function mapNasNotice(r: NasNoticeRow): NasNotice {
  return {
    id: r.id,
    venueNameRaw: r.venue_name_raw,
    addressRaw: opt(r.address_raw),
    sourceUrl: r.source_url,
    publishedAt: iso(r.published_at),
    summary: r.summary,
    importedAt: iso(r.imported_at),
    importedBy: r.imported_by ?? '',
    venueId: opt(r.venue_id),
    linkedReportId: opt(r.linked_report_id),
  }
}

function mapRemoval(r: RemovalRow): Removal {
  return {
    id: r.id,
    reportId: r.report_id,
    venueName: r.venue_name,
    reason: r.reason,
    requestedBy: r.requested_by,
    publishedAt: iso(r.published_at),
    removedAt: iso(r.removed_at),
  }
}

function mapDsaNotice(r: DsaNoticeRow): DsaNotice {
  return {
    id: r.id,
    reportId: r.report_id,
    contact: r.contact ?? '',
    reason: r.reason ?? '',
    receivedAt: iso(r.received_at),
    decidedAt: optIso(r.decided_at),
    decision: opt(r.decision),
    decisionNote: opt(r.decision_note),
  }
}

function mapNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    toUserId: r.to_user_id,
    kind: r.kind,
    title: r.title,
    body: r.body ?? '',
    link: opt(r.link),
    createdAt: iso(r.created_at),
    read: !!r.read,
  }
}

function mapAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    at: iso(r.at),
    actorId: r.actor_id ?? '',
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id ?? '',
    note: opt(r.note),
  }
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // solo OTP via SMS: nessun token nell'URL da intercettare (e nessun conflitto con HashRouter)
      detectSessionInUrl: false,
    },
  })
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

class SupabaseStore implements DataStore {
  readonly mode = 'supabase' as const

  private listeners = new Set<() => void>()
  private channel: RealtimeChannel | null = null
  private authUnsubscribe: (() => void) | null = null
  private emitTimer: ReturnType<typeof setTimeout> | null = null
  /** Profilo della sessione corrente (ricaricato quando cambiano auth, profili, locali o ditte). */
  private profileCache: { uid: string; profile: Profile } | null = null
  /** URL firmati validi, per bucket/percorso. */
  private signedCache = new Map<string, { url: string; expiresAt: number }>()
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  /* ----------------------------- infrastruttura ----------------------------- */

  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args)
    if (error) throw toRuleViolation(error)
    return data as T
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  /** Gli eventi realtime arrivano a raffica (una riga per tabella toccata): un solo refresh ogni 150 ms. */
  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit()
    }, 150)
  }

  private invalidateProfile(): void {
    this.profileCache = null
  }

  private ensureRealtime(): void {
    if (this.channel) return
    this.channel = this.client
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        if (PROFILE_TABLES.has(payload.table)) this.invalidateProfile()
        this.scheduleEmit()
      })
      .subscribe((status, err) => {
        if (err) console.warn('[supabaseStore] realtime non disponibile: i dati si aggiornano solo dopo le azioni locali', status, err)
      })
    const { data } = this.client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // INITIAL_SESSION e TOKEN_REFRESHED non cambiano i dati: nessun refresh inutile
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
      if (!session || this.profileCache?.uid !== session.user.id) this.invalidateProfile()
      if (event === 'USER_UPDATED') this.invalidateProfile()
      this.scheduleEmit()
    })
    this.authUnsubscribe = () => data.subscription.unsubscribe()
  }

  private teardownRealtime(): void {
    if (this.channel) {
      void this.client.removeChannel(this.channel)
      this.channel = null
    }
    this.authUnsubscribe?.()
    this.authUnsubscribe = null
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    this.ensureRealtime()
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) this.teardownRealtime()
    }
  }

  /* -------------------------------- storage --------------------------------- */

  /**
   * URL firmati (1 ora) per i percorsi indicati. I percorsi non leggibili dal chiamante (RLS dello Storage)
   * restano fuori dalla mappa: la UI non mostra l'immagine invece di ricevere un errore.
   */
  private async signedUrls(bucket: string, paths: Array<string | null | undefined>): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const now = Date.now()
    const wanted = [...new Set(paths.filter((p): p is string => !!p && p.trim() !== ''))]
    const missing: string[] = []
    for (const p of wanted) {
      const hit = this.signedCache.get(`${bucket}/${p}`)
      if (hit && hit.expiresAt > now) out.set(p, hit.url)
      else missing.push(p)
    }
    if (!missing.length) return out
    const { data, error } = await this.client.storage.from(bucket).createSignedUrls(missing, SIGNED_URL_TTL_S)
    if (error || !data) {
      console.warn('[supabaseStore] URL firmati non disponibili', bucket, error)
      return out
    }
    data.forEach((item, i) => {
      const path = item.path ?? missing[i]
      if (item.error || !item.signedUrl || !path) return
      out.set(path, item.signedUrl)
      this.signedCache.set(`${bucket}/${path}`, { url: item.signedUrl, expiresAt: now + SIGNED_URL_CACHE_MS })
    })
    return out
  }

  /** Carica un data URL nel bucket al percorso dato (MIME preso dal data URL). */
  private async uploadDataUrl(bucket: string, path: string, decoded: DecodedDataUrl): Promise<void> {
    const blob = new Blob([decoded.bytes], { type: decoded.mime })
    const { error } = await this.client.storage.from(bucket).upload(path, blob, {
      contentType: decoded.mime,
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw toRuleViolation(error)
  }

  private async mapReports(rows: ReportRow[]): Promise<Report[]> {
    const urls = await this.signedUrls(BUCKET_PHOTOS, rows.map((r) => r.photo_path))
    return rows.map((r) => mapReport(r, r.photo_path ? (urls.get(r.photo_path) ?? '') : ''))
  }

  private async mapOneReport(row: ReportRow): Promise<Report> {
    const [report] = await this.mapReports([row])
    return report
  }

  private async mapCertificates(rows: CertificateRow[]): Promise<Certificate[]> {
    const urls = await this.signedUrls(BUCKET_CERTIFICATES, rows.map((r) => r.file_path))
    return rows.map((r) => mapCertificate(r, r.file_path ? (urls.get(r.file_path) ?? '') : ''))
  }

  /* -------------------------------- sessione -------------------------------- */

  async getSession(): Promise<Profile | null> {
    const { data, error } = await this.client.auth.getSession()
    if (error) {
      console.error('[supabaseStore] getSession', error)
      return null
    }
    const session = data.session
    if (!session?.user) {
      this.invalidateProfile()
      return null
    }
    const uid = session.user.id
    if (this.profileCache?.uid === uid) return this.profileCache.profile
    const profile = await this.loadProfile(uid, session)
    this.profileCache = profile ? { uid, profile } : null
    return profile
  }

  /**
   * Profilo completo: riga di `profiles` (creata dal trigger su auth.users), locali gestiti
   * (venue_owners + venues.claimed_by) e ditta (profiles.company_id oppure companies.owner_user_id).
   */
  private async loadProfile(uid: string, session: Session): Promise<Profile | null> {
    const [profRes, ownersRes, claimedRes, companyRes] = await Promise.all([
      this.client.from('profiles').select('*').eq('id', uid).maybeSingle(),
      this.client.from('venue_owners').select('venue_id').eq('user_id', uid),
      this.client.from('venues').select('id').eq('claimed_by', uid),
      this.client.from('companies').select('id').eq('owner_user_id', uid).limit(1),
    ])
    let row = rowOrNull<ProfileRow>(profRes)
    if (!row) {
      // il trigger non ha creato la riga (es. utente nato prima della migrazione): la crea il client per sé
      const ins = await this.client
        .from('profiles')
        .insert({
          id: uid,
          display_name: `Utente ${(session.user.phone ?? uid).slice(-4)}`,
          phone: session.user.phone ?? null,
          phone_verified: !!session.user.phone_confirmed_at,
        })
        .select('*')
        .single()
      if (ins.error) {
        console.error('[supabaseStore] profilo mancante e non creabile', ins.error)
        return null
      }
      row = ins.data as ProfileRow
    }
    const owners = (ownersRes.data as Array<{ venue_id: string }> | null) ?? []
    const claimed = (claimedRes.data as Array<{ id: string }> | null) ?? []
    const ownedCompany = ((companyRes.data as Array<{ id: string }> | null) ?? [])[0]
    const venueIds = [...new Set([...owners.map((o) => o.venue_id), ...claimed.map((v) => v.id)])]

    // il ruolo nel JWT (app_metadata.role) ha la precedenza, come fa current_profile_role() in SQL
    const claim = session.user.app_metadata?.role
    const role: Role = ROLES.includes(claim as Role) ? (claim as Role) : ROLES.includes(row.role as Role) ? (row.role as Role) : 'utente'

    return {
      id: row.id,
      displayName: row.display_name || `Utente ${(row.phone ?? row.id).slice(-4)}`,
      role,
      phone: row.phone ?? session.user.phone ?? undefined,
      phoneVerified: !!row.phone_verified || !!session.user.phone_confirmed_at,
      spidVerified: !!row.spid_verified,
      deviceHash: opt(row.device_hash),
      companyId: row.company_id ?? ownedCompany?.id,
      venueIds: venueIds.length ? venueIds : undefined,
      createdAt: iso(row.created_at),
      blocked: !!row.blocked,
    }
  }

  private async requireSession(): Promise<Profile> {
    const p = await this.getSession()
    if (!p) throw new RuleViolation(['rule.login_required'])
    return p
  }

  async listDemoPersonas(): Promise<Profile[]> {
    throw new RuleViolation(['rule.not_allowed'])
  }

  async signInDemo(_personaId: string): Promise<Profile> {
    throw new RuleViolation(['rule.not_allowed'])
  }

  async requestOtp(phone: string): Promise<OtpRequestResult> {
    const normalized = normalizePhone(phone)
    if (!/^\+?\d{8,15}$/.test(normalized)) throw new RuleViolation(['rule.invalid_phone'])
    const { error } = await this.client.auth.signInWithOtp({ phone: toE164(normalized) })
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'validation_failed' || code === 'phone_provider_disabled') throw new RuleViolation(['rule.invalid_phone'])
      throw toRuleViolation(error)
    }
    // in produzione il codice arriva via SMS: nessun demoCode
    return { ok: true }
  }

  async verifyOtp(phone: string, code: string, displayName?: string): Promise<Profile> {
    const normalized = normalizePhone(phone)
    if (!/^\+?\d{8,15}$/.test(normalized)) throw new RuleViolation(['rule.invalid_phone'])
    const token = code.replace(/\s+/g, '')
    if (!token) throw new RuleViolation(['rule.invalid_otp'])
    const { data, error } = await this.client.auth.verifyOtp({ phone: toE164(normalized), token, type: 'sms' })
    if (error || !data.session) {
      if (error) console.warn('[supabaseStore] verifyOtp', error.message)
      throw new RuleViolation(['rule.invalid_otp'])
    }
    this.invalidateProfile()
    let profile = await this.getSession()
    if (!profile) throw new RuleViolation(['common.error'])

    // il nome scelto all'accesso sostituisce quello di default assegnato dal trigger (come nella demo per i nuovi utenti)
    const chosen = displayName?.trim()
    if (chosen && (!profile.displayName || /^Utente \d{0,4}$/.test(profile.displayName))) {
      const upd = await this.client.from('profiles').update({ display_name: chosen }).eq('id', profile.id)
      if (upd.error) console.warn('[supabaseStore] display_name non aggiornato', upd.error.message)
      else {
        this.invalidateProfile()
        profile = (await this.getSession()) ?? profile
      }
    }
    this.emit()
    return profile
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut()
    if (error) console.warn('[supabaseStore] signOut', error.message)
    this.invalidateProfile()
    this.signedCache.clear()
    this.emit()
  }

  /* --------------------------------- locali --------------------------------- */

  async listVenues(filter?: VenueFilter): Promise<Venue[]> {
    let q = this.client.from('venues').select('*')
    if (filter?.status?.length) q = q.in('status', filter.status)
    if (filter?.type?.length) q = q.in('type', filter.type)
    const rows = unwrap<VenueRow[]>(await q.order('name'))
    let list = rows.map(mapVenue)
    if (filter?.q?.trim()) {
      const needle = filter.q.trim().toLowerCase()
      list = list.filter((v) => v.name.toLowerCase().includes(needle) || v.address.toLowerCase().includes(needle))
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }

  async getVenue(id: string): Promise<Venue | null> {
    const row = rowOrNull<VenueRow>(await this.client.from('venues').select('*').eq('id', id).maybeSingle())
    return row ? mapVenue(row) : null
  }

  async nearestVenues(lat: number, lng: number, limit = 8): Promise<NearbyVenue[]> {
    const rows = await this.rpc<VenueRow[]>('nearest_venues', { p_lat: lat, p_lng: lng, p_limit: limit })
    return (rows ?? []).map((r) => ({ ...mapVenue(r), distanceM: num(r.distance_m) }))
  }

  /**
   * claim_venue crea una richiesta "in_verifica" (rule.claim_pending se ce n'è già una) e restituisce il locale
   * ancora senza titolare; la richiesta viene riletta da venue_claims (RLS: le proprie righe).
   * La titolarità (claimed_by, venue_owners, ruolo 'locale') arriva solo da decide_venue_claim della moderazione.
   */
  async claimVenue(venueId: string, _userId: string, proof: { vat: string; phone: string }): Promise<ClaimVenueResult> {
    const me = await this.requireSession()
    const row = await this.rpc<VenueRow>('claim_venue', {
      p_venue_id: venueId,
      p_vat: proof.vat,
      p_phone: proof.phone?.trim() ? normalizePhone(proof.phone) : null,
    })
    const venue = mapVenue(row)
    const claimRow = rowOrNull<VenueClaimRow>(
      await this.client.from('venue_claims').select('*').eq('venue_id', venueId).eq('user_id', me.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    )
    this.emit()
    if (claimRow) return { venue, claim: mapVenueClaim(claimRow) }
    // Nessuna riga: la RPC non crea nulla per chi è già titolare (es. inserito dalla moderazione in venue_owners)
    const now = new Date().toISOString()
    return { venue, claim: { id: '', venueId, userId: me.id, vat: proof.vat.replace(/\s+/g, ''), phone: normalizePhone(proof.phone ?? ''), status: 'approvata', requestedAt: now, decidedAt: now } }
  }

  async listVenueClaims(filter?: VenueClaimFilter): Promise<VenueClaim[]> {
    let q = this.client.from('venue_claims').select('*')
    if (filter?.status?.length) q = q.in('status', filter.status)
    if (filter?.userId) q = q.eq('user_id', filter.userId)
    const res = await q.order('created_at', { ascending: false })
    // anon non ha alcun privilegio sulla tabella (42501): per chi non è collegato non ci sono richieste
    if (res.error?.code === '42501') return []
    return unwrap<VenueClaimRow[]>(res).map(mapVenueClaim)
  }

  async decideVenueClaim(claimId: string, accept: boolean, _moderatorId: string, note?: string): Promise<VenueClaim> {
    const row = await this.rpc<VenueClaimRow>('decide_venue_claim', { p_claim_id: claimId, p_accept: accept, p_note: note?.trim() || null })
    this.emit()
    return mapVenueClaim(row)
  }

  async setVenuePremium(venueId: string, months: number): Promise<Venue> {
    // beta: la chiama il titolare e l'audit riporta "pagamento simulato"; in produzione il webhook del pagamento
    const row = await this.rpc<VenueRow>('set_venue_premium', { p_venue_id: venueId, p_months: Math.round(months) })
    this.emit()
    return mapVenue(row)
  }

  /* ------------------------------ segnalazioni ------------------------------ */

  /** Unione di righe della tabella (con user_id) e della vista pubblica: la tabella vince sull'id. */
  private mergeReportRows(tableRows: ReportRow[], viewRows: ReportRow[]): ReportRow[] {
    const byId = new Map<string, ReportRow>()
    for (const r of viewRows) byId.set(r.id, r)
    for (const r of tableRows) byId.set(r.id, r)
    return [...byId.values()].sort((a, b) => iso(b.submitted_at).localeCompare(iso(a.submitted_at)))
  }

  async listReportsForVenue(venueId: string, opts?: { includeHidden?: boolean }): Promise<Report[]> {
    const publicQuery = this.client.from('public_reports').select('*').eq('venue_id', venueId).order('submitted_at', { ascending: false })
    if (!opts?.includeHidden) return this.mapReports(unwrap<ReportRow[]>(await publicQuery))
    // includeHidden: la tabella restituisce ciò che la RLS concede (le proprie segnalazioni; tutte per la moderazione)
    const [tableRes, viewRes] = await Promise.all([
      this.client.from('reports').select('*').eq('venue_id', venueId).order('submitted_at', { ascending: false }),
      publicQuery,
    ])
    return this.mapReports(this.mergeReportRows(unwrap<ReportRow[]>(tableRes), unwrap<ReportRow[]>(viewRes)))
  }

  async listReportsByUser(userId: string): Promise<Report[]> {
    const rows = unwrap<ReportRow[]>(
      await this.client.from('reports').select('*').eq('user_id', userId).order('submitted_at', { ascending: false }),
    )
    return this.mapReports(rows)
  }

  async listAllReports(): Promise<Report[]> {
    const [tableRes, viewRes] = await Promise.all([
      this.client.from('reports').select('*').order('submitted_at', { ascending: false }),
      this.client.from('public_reports').select('*').order('submitted_at', { ascending: false }),
    ])
    return this.mapReports(this.mergeReportRows(unwrap<ReportRow[]>(tableRes), unwrap<ReportRow[]>(viewRes)))
  }

  private async fetchReportRow(id: string): Promise<ReportRow | null> {
    const own = rowOrNull<ReportRow>(await this.client.from('reports').select('*').eq('id', id).maybeSingle())
    if (own) return own
    return rowOrNull<ReportRow>(await this.client.from('public_reports').select('*').eq('id', id).maybeSingle())
  }

  async getReport(id: string): Promise<Report | null> {
    const row = await this.fetchReportRow(id)
    return row ? this.mapOneReport(row) : null
  }

  async countReportsThisMonth(userId: string): Promise<number> {
    // mese di calendario UTC, solo segnalazioni 'utente' (come isSameMonth nella demo)
    return num(await this.rpc<number>('count_reports_this_month', { p_user_id: userId }))
  }

  async submitReport(input: NewReportInput): Promise<SubmitReportResult> {
    const now = new Date().toISOString()
    const profile = await this.requireSession()

    // Stesse regole del backend, verificate prima di caricare la foto (il trigger SQL resta l'autorità).
    const [venue, reportsThisMonth] = await Promise.all([this.getVenue(input.venueId), this.countReportsThisMonth(profile.id)])
    assertOk(
      canSubmitReport({
        profile,
        venue,
        reportsThisMonth,
        nowIso: now,
        enforceCamera: ENFORCE_CAMERA,
        deviceBlocked: false, // lo sa solo il server (blocked_devices): lo verifica submit_report
        consentAccepted: input.consentAccepted,
        captureMode: input.captureMode,
        capturedAt: input.capturedAt,
        lat: input.lat,
        lng: input.lng,
      }),
    )

    // 1) foto: data URL -> Blob -> report-photos/<uid>/<file>
    const decoded = decodeDataUrl(input.photo)
    const photoHash = await hashBytes(decoded.bytes, input.photo)
    const photoPath = `${profile.id}/${fileName(decoded.ext)}`
    await this.uploadDataUrl(BUCKET_PHOTOS, photoPath, decoded)

    // 2) riga della segnalazione (trigger: 3/mese, 150 m, 30 min, utente verificato, duplicati...)
    const created = await this.rpc<ReportRow>('submit_report', {
      p_venue_id: input.venueId,
      p_category: input.category,
      p_description: input.description.trim(),
      p_photo_path: photoPath,
      p_photo_hash: photoHash,
      p_capture_mode: input.captureMode,
      p_captured_at: input.capturedAt,
      p_lat: input.lat,
      p_lng: input.lng,
      p_consent_accepted: input.consentAccepted,
      p_device_hash: input.deviceHash ?? null,
    })

    // 3) filtro automatico: la Edge Function chiama apply_ai_check con il service role e aggiorna la riga.
    //    Se non risponde, la segnalazione resta "in verifica" e decide un umano (come il verdetto 'incerta').
    let finalRow = created
    try {
      const { error } = await this.client.functions.invoke(AI_PHOTO_CHECK_FUNCTION, { body: { reportId: created.id } })
      if (error) console.warn('[supabaseStore] ai-photo-check', error)
      const refreshed = await this.fetchReportRow(created.id)
      if (refreshed) finalRow = refreshed
    } catch (e) {
      console.warn('[supabaseStore] ai-photo-check non raggiungibile: resta la verifica umana', e)
    }

    const report = await this.mapOneReport(finalRow)
    const aiCheck: AiCheck = report.aiCheck ?? {
      verdict: 'incerta',
      score: 0.5,
      reasons: ['ai.verdict.incerta'],
      simulated: false,
      checkedAt: now,
    }
    this.emit()
    return { report, aiCheck }
  }

  /* ------------------------------- moderazione ------------------------------ */

  async listModerationQueue(): Promise<Report[]> {
    const rows = unwrap<ReportRow[]>(
      await this.client.from('reports').select('*').eq('state', 'in_verifica').order('submitted_at', { ascending: true }),
    )
    return this.mapReports(rows)
  }

  /**
   * `photo`: data URL della versione sfocata (caricata in report-photos/blurred/<reportId>/...), un percorso già nel
   * bucket, oppure l'URL firmato corrente (il pulsante "Nessun volto visibile" passa Report.photo).
   * La versione pubblicabile deve sempre stare fuori dalla cartella <user_id>/ del segnalante: il percorso compare
   * nella vista pubblica e nei dati del contatto e rivelerebbe chi ha segnalato (set_report_blurred lo rifiuta).
   * Quindi anche senza volti da sfocare il file originale viene copiato in blurred/<reportId>/.
   */
  async setReportPhotoBlurred(reportId: string, photo: string, _actorId?: string): Promise<Report> {
    // l'attore del registro è auth.uid() dentro la RPC
    const input = photo.trim()
    let path: string
    if (input.startsWith('data:')) {
      const decoded = decodeDataUrl(input)
      path = `blurred/${reportId}/${fileName(decoded.ext)}`
      await this.uploadDataUrl(BUCKET_PHOTOS, path, decoded)
    } else {
      // URL firmato o vuoto -> si parte dal percorso attuale della segnalazione
      let source = input
      if (!source || /^https?:\/\//i.test(source)) {
        const current = await this.fetchReportRow(reportId)
        source = current?.photo_path?.trim() ?? ''
      }
      if (!source) throw new RuleViolation(['rule.empty_text'])
      if (source.startsWith('blurred/')) path = source
      else {
        const ext = source.split('.').pop() ?? ''
        path = `blurred/${reportId}/${fileName(/^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : 'jpg')}`
        const { error } = await this.client.storage.from(BUCKET_PHOTOS).copy(source, path)
        if (error) throw toRuleViolation(error)
      }
    }
    const row = await this.rpc<ReportRow>('set_report_blurred', { p_report_id: reportId, p_new_photo_path: path })
    this.emit()
    return this.mapOneReport(row)
  }

  async moderateReport(reportId: string, decision: ModerationDecision, _moderatorId: string, note?: string): Promise<Report> {
    const row = await this.rpc<ReportRow>('moderate_report', { p_report_id: reportId, p_decision: decision, p_note: note?.trim() || null })
    this.emit()
    return this.mapOneReport(row)
  }

  async removeReport(reportId: string, reason: string, requestedBy: Removal['requestedBy'], _actorId: string): Promise<Report> {
    const row = await this.rpc<ReportRow>('remove_report', { p_report_id: reportId, p_reason: reason, p_requested_by: requestedBy })
    this.emit()
    return this.mapOneReport(row)
  }

  async blockUser(userId: string, _actorId: string): Promise<Profile> {
    const row = await this.rpc<ProfileRow>('block_user', { p_user_id: userId })
    this.invalidateProfile()
    this.emit()
    return {
      id: row.id,
      displayName: row.display_name ?? '',
      role: ROLES.includes(row.role as Role) ? (row.role as Role) : 'utente',
      phone: opt(row.phone),
      phoneVerified: !!row.phone_verified,
      spidVerified: !!row.spid_verified,
      deviceHash: opt(row.device_hash),
      companyId: opt(row.company_id),
      createdAt: iso(row.created_at),
      blocked: !!row.blocked,
    }
  }

  async unblockUser(userId: string, _actorId: string): Promise<Profile> {
    const row = await this.rpc<ProfileRow>('unblock_user', { p_user_id: userId })
    this.invalidateProfile()
    this.emit()
    return {
      id: row.id,
      displayName: row.display_name ?? '',
      role: ROLES.includes(row.role as Role) ? (row.role as Role) : 'utente',
      phone: opt(row.phone),
      phoneVerified: !!row.phone_verified,
      spidVerified: !!row.spid_verified,
      deviceHash: opt(row.device_hash),
      companyId: opt(row.company_id),
      createdAt: iso(row.created_at),
      blocked: !!row.blocked,
    }
  }

  /* --------------------------------- repliche -------------------------------- */

  async listReplies(reportId: string): Promise<Reply[]> {
    const rows = unwrap<ReplyRow[]>(await this.client.from('replies').select('*').eq('report_id', reportId).order('created_at'))
    return rows.map(mapReply)
  }

  async listRepliesForVenue(venueId: string): Promise<Reply[]> {
    const rows = unwrap<ReplyRow[]>(await this.client.from('replies').select('*').eq('venue_id', venueId).order('created_at'))
    return rows.map(mapReply)
  }

  async addReply(reportId: string, _authorId: string, text: string): Promise<Reply> {
    if (!text.trim()) throw new RuleViolation(['rule.empty_text'])
    const row = await this.rpc<ReplyRow>('add_reply', { p_report_id: reportId, p_text: text.trim() })
    this.emit()
    return mapReply(row)
  }

  /* ----------------------------- ditte e contatti ---------------------------- */

  async listCompanies(): Promise<Company[]> {
    // vista pubblica per tutti + righe complete (telefono, email, titolare) per i membri e la moderazione
    const [publicRes, fullRes] = await Promise.all([
      this.client.from('companies_public').select('*'),
      this.client.from('companies').select('*'),
    ])
    const byId = new Map<string, CompanyRow>()
    for (const r of unwrap<CompanyRow[]>(publicRes)) byId.set(r.id, r)
    if (!fullRes.error) for (const r of (fullRes.data as CompanyRow[] | null) ?? []) byId.set(r.id, r)
    return [...byId.values()].map(mapCompany).sort((a, b) => a.name.localeCompare(b.name))
  }

  async getCompany(id: string): Promise<Company | null> {
    const full = rowOrNull<CompanyRow>(await this.client.from('companies').select('*').eq('id', id).maybeSingle())
    if (full) return mapCompany(full)
    const pub = rowOrNull<CompanyRow>(await this.client.from('companies_public').select('*').eq('id', id).maybeSingle())
    return pub ? mapCompany(pub) : null
  }

  async acceptSameConditions(companyId: string): Promise<Company> {
    const row = await this.rpc<CompanyRow>('accept_same_conditions', { p_company_id: companyId })
    this.emit()
    return mapCompany(row)
  }

  async sponsorCompany(companyId: string, months: number): Promise<Company> {
    const row = await this.rpc<CompanyRow>('sponsor_company', { p_company_id: companyId, p_months: Math.round(months) })
    this.emit()
    return mapCompany(row)
  }

  /** Acquisti visibili al chiamante (la ditta vede i propri; titolare e moderazione tutti), per contatto. */
  private async purchasesFor(leadIds: string[]): Promise<Map<string, LeadPurchase[]>> {
    const out = new Map<string, LeadPurchase[]>()
    if (!leadIds.length) return out
    const rows = unwrap<LeadPurchaseRow[]>(
      await this.client.from('lead_purchases').select('*').in('lead_id', leadIds).order('created_at'),
    )
    for (const r of rows) {
      const list = out.get(r.lead_id) ?? []
      list.push(mapPurchase(r))
      out.set(r.lead_id, list)
    }
    return out
  }

  private async leadWithPurchases(row: LeadRow): Promise<Lead> {
    const purchases = await this.purchasesFor([row.id])
    return mapLead(row, purchases.get(row.id) ?? [])
  }

  async requestQuotes(reportId: string, _requesterId: string): Promise<Lead> {
    const row = await this.rpc<LeadRow>('request_quotes', { p_report_id: reportId })
    this.emit()
    return this.leadWithPurchases(row)
  }

  async getLeadForReport(reportId: string): Promise<Lead | null> {
    const row = rowOrNull<LeadRow>(await this.client.from('leads').select('*').eq('report_id', reportId).maybeSingle())
    return row ? this.leadWithPurchases(row) : null
  }

  /**
   * Contatti per una ditta: elenco anonimizzato (zona e categoria) dalla vista leads_anonymised; per quelli
   * acquistati dalla ditta del chiamante si aggiungono locale, indirizzo, telefono e foto (RPC lead_details).
   * Gli acquisti delle altre ditte compaiono come voci anonime (companyId '') così purchases.length è esatto.
   */
  async listLeads(_companyId: string): Promise<LeadView[]> {
    const anon = unwrap<LeadAnonRow[]>(
      await this.client.from('leads_anonymised').select('*').order('created_at', { ascending: false }),
    )
    const mineIds = anon.filter((r) => r.purchased_by_me).map((r) => r.id)
    const [fullRows, purchases, details] = await Promise.all([
      mineIds.length ? this.client.from('leads').select('*').in('id', mineIds).then((res) => unwrap<LeadRow[]>(res)) : Promise.resolve([] as LeadRow[]),
      this.purchasesFor(mineIds),
      Promise.all(
        mineIds.map((id) =>
          this.rpc<LeadDetailsJson>('lead_details', { p_lead_id: id }).catch((e: unknown) => {
            console.warn('[supabaseStore] lead_details', id, e)
            return null
          }),
        ),
      ),
    ])
    const detailById = new Map<string, LeadDetailsJson>()
    for (const d of details) if (d) detailById.set(d.leadId, d)
    const photos = await this.signedUrls(BUCKET_PHOTOS, details.map((d) => d?.photoPath))

    return anon.map((r) => {
      const full = fullRows.find((f) => f.id === r.id)
      const own = purchases.get(r.id) ?? []
      const hiddenCount = Math.max(0, num(r.purchases_count) - own.length)
      const hidden: LeadPurchase[] = Array.from({ length: hiddenCount }, () => ({
        companyId: '',
        paidCents: num(r.price_cents),
        createdAt: iso(r.created_at),
      }))
      const lead = mapLead({ ...r, report_id: full?.report_id ?? '', venue_id: full?.venue_id ?? '' }, [...own, ...hidden])
      const d = detailById.get(r.id)
      const view: LeadView = { ...lead, purchasedByMe: !!r.purchased_by_me }
      if (!d) return view
      return {
        ...view,
        venueId: lead.venueId || d.venueId,
        venueName: opt(d.venueName),
        venueAddress: opt(d.venueAddress),
        venuePhone: opt(d.venuePhone),
        photo: d.photoPath ? photos.get(d.photoPath) : undefined,
      }
    })
  }

  async buyLead(leadId: string, _companyId: string): Promise<Lead> {
    // prezzo deciso dal server: lead.price_cents, identico per ogni ditta (anche quella del fondatore)
    const row = await this.rpc<LeadRow>('buy_lead', { p_lead_id: leadId })
    this.emit()
    return this.leadWithPurchases(row)
  }

  async submitQuote(leadId: string, _companyId: string, amountCents: number, text: string): Promise<Quote> {
    if (!(amountCents > 0)) throw new RuleViolation(['rule.invalid_amount'])
    const row = await this.rpc<QuoteRow>('submit_quote', { p_lead_id: leadId, p_amount_cents: Math.round(amountCents), p_text: text.trim() })
    this.emit()
    return mapQuote(row)
  }

  async listQuotesForLead(leadId: string): Promise<Quote[]> {
    // ordine deciso dal server: sponsor attivi prima (mai la ditta del fondatore), poi ordine di arrivo
    const rows = await this.rpc<QuoteRow[]>('quotes_for_lead', { p_lead_id: leadId })
    return (rows ?? []).map(mapQuote)
  }

  async listQuotesForCompany(companyId: string): Promise<Quote[]> {
    // policy quotes_select: la ditta legge solo i propri preventivi
    const rows = unwrap<QuoteRow[]>(
      await this.client.from('quotes').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    )
    return rows.map(mapQuote)
  }

  async acceptQuote(quoteId: string, _venueOwnerId: string): Promise<Quote> {
    const row = await this.rpc<QuoteRow>('accept_quote', { p_quote_id: quoteId })
    this.emit()
    return mapQuote(row)
  }

  /* -------------------------------- certificati ------------------------------ */

  /** `file`: data URL (PDF o immagine) caricato in certificates/<venue_id>/<file>, oppure un percorso già nel bucket. */
  async uploadCertificate(reportId: string, companyId: string, file: string, interventionType: string, _uploaderId: string): Promise<Certificate> {
    if (!interventionType.trim()) throw new RuleViolation(['rule.empty_text'])
    const report = await this.getReport(reportId)
    if (!report) throw new RuleViolation(['rule.unknown_report'])
    let path = file.trim()
    if (path.startsWith('data:')) {
      const decoded = decodeDataUrl(path)
      path = `${report.venueId}/${fileName(decoded.ext)}`
      await this.uploadDataUrl(BUCKET_CERTIFICATES, path, decoded)
    }
    const row = await this.rpc<CertificateRow>('upload_certificate', {
      p_report_id: reportId,
      p_company_id: companyId,
      p_file_path: path,
      p_intervention_type: interventionType.trim(),
    })
    this.emit()
    const [cert] = await this.mapCertificates([row])
    return cert
  }

  async listCertificatesForVenue(venueId: string): Promise<Certificate[]> {
    const rows = unwrap<CertificateRow[]>(
      await this.client.from('certificates').select('*').eq('venue_id', venueId).order('issued_at', { ascending: false }),
    )
    return this.mapCertificates(rows)
  }

  async listCertificatesForReport(reportId: string): Promise<Certificate[]> {
    const rows = unwrap<CertificateRow[]>(
      await this.client.from('certificates').select('*').eq('report_id', reportId).order('issued_at', { ascending: false }),
    )
    return this.mapCertificates(rows)
  }

  async listPendingCertificates(): Promise<Certificate[]> {
    const rows = unwrap<CertificateRow[]>(
      await this.client.from('certificates').select('*').is('verified_at', null).is('rejected_at', null).order('issued_at'),
    )
    return this.mapCertificates(rows)
  }

  async verifyCertificate(certificateId: string, _moderatorId: string, accept: boolean, note?: string): Promise<Certificate> {
    const row = await this.rpc<CertificateRow>('verify_certificate', { p_certificate_id: certificateId, p_accept: accept, p_note: note?.trim() || null })
    this.emit()
    const [cert] = await this.mapCertificates([row])
    return cert
  }

  /* ------------------------------------ NAS ---------------------------------- */

  async listNasNotices(): Promise<NasNotice[]> {
    const rows = unwrap<NasNoticeRow[]>(await this.client.from('nas_notices').select('*').order('published_at', { ascending: false }))
    return rows.map(mapNasNotice)
  }

  async importNasNotice(input: Omit<NasNotice, 'id' | 'importedAt' | 'venueId' | 'linkedReportId'>): Promise<NasNotice> {
    if (!/^https?:\/\//.test(input.sourceUrl)) throw new RuleViolation(['rule.invalid_url'])
    // importedBy è auth.uid() lato server
    const row = await this.rpc<NasNoticeRow>('import_nas_notice', {
      p_venue_name_raw: input.venueNameRaw,
      p_address_raw: input.addressRaw ?? null,
      p_source_url: input.sourceUrl,
      p_published_at: input.publishedAt,
      p_summary: input.summary,
    })
    this.emit()
    return mapNasNotice(row)
  }

  async linkNasNotice(noticeId: string, venueId: string, _moderatorId: string): Promise<Report> {
    const row = await this.rpc<ReportRow>('link_nas_notice', { p_notice_id: noticeId, p_venue_id: venueId })
    this.emit()
    return this.mapOneReport(row)
  }

  /* -------------------------------- trasparenza ------------------------------ */

  async listRemovals(): Promise<Removal[]> {
    const rows = unwrap<RemovalRow[]>(await this.client.from('removals').select('*').order('removed_at', { ascending: false }))
    return rows.map(mapRemoval)
  }

  async submitDsaNotice(reportId: string, contact: string, reason: string): Promise<DsaNotice> {
    if (!contact.trim() || !reason.trim()) throw new RuleViolation(['rule.empty_text'])
    // consentita anche in anonimo (regola DSA): la RPC è eseguibile da anon
    const row = await this.rpc<DsaNoticeRow>('submit_dsa_notice', { p_report_id: reportId, p_contact: contact.trim(), p_reason: reason.trim() })
    this.emit()
    return mapDsaNotice(row)
  }

  async listDsaNotices(): Promise<DsaNotice[]> {
    // moderazione: tabella completa (contatto e motivo); tutti gli altri: richieste decise senza contatto
    const me = await this.getSession()
    const source = isModeratorRole(me?.role) ? 'dsa_notices' : 'dsa_notices_public'
    const rows = unwrap<DsaNoticeRow[]>(await this.client.from(source).select('*').order('received_at', { ascending: false }))
    return rows.map(mapDsaNotice)
  }

  async decideDsaNotice(noticeId: string, decision: DsaDecision, note: string, _moderatorId: string): Promise<DsaNotice> {
    const row = await this.rpc<DsaNoticeRow>('decide_dsa_notice', { p_notice_id: noticeId, p_decision: decision, p_note: note.trim() })
    this.emit()
    return mapDsaNotice(row)
  }

  async getStats(): Promise<Stats> {
    const s = (await this.rpc<Partial<Stats> | null>('get_stats')) ?? {}
    const byStatus: Record<VenueStatus, number> = { nessuna: 0, in_verifica: 0, confermata: 0, risolta: 0 }
    for (const k of Object.keys(byStatus) as VenueStatus[]) byStatus[k] = num(s.venuesByStatus?.[k])
    const byState: Record<ReportState, number> = { in_verifica: 0, scartata: 0, archiviata: 0, pubblicata: 0, risolta: 0, rimossa: 0 }
    for (const k of Object.keys(byState) as ReportState[]) byState[k] = num(s.reportsByState?.[k])
    const median = s.medianModerationHours
    return {
      venues: num(s.venues),
      venuesByStatus: byStatus,
      reportsTotal: num(s.reportsTotal),
      reportsByState: byState,
      repliesTotal: num(s.repliesTotal),
      leadsSold: num(s.leadsSold),
      removals: num(s.removals),
      dsaNotices: num(s.dsaNotices),
      medianModerationHours: median === null || median === undefined ? null : num(median),
    }
  }

  /* ----------------------------- notifiche e audit --------------------------- */

  async listNotifications(userId: string): Promise<Notification[]> {
    const rows = unwrap<NotificationRow[]>(
      await this.client.from('notifications').select('*').eq('to_user_id', userId).order('created_at', { ascending: false }),
    )
    return rows.map(mapNotification)
  }

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await this.client.from('notifications').update({ read: true }).eq('id', id)
    if (error) throw toRuleViolation(error)
    this.emit()
  }

  async listAudit(limit = 100): Promise<AuditEntry[]> {
    const rows = await this.rpc<AuditRow[]>('list_audit', { p_limit: limit })
    return (rows ?? []).map(mapAudit)
  }

  /* ------------------------------------ demo --------------------------------- */

  async resetDemo(): Promise<void> {
    throw new RuleViolation(['rule.not_allowed'])
  }
}

/** Store di produzione: ogni metodo rispecchia LocalStore ma via Postgres/RPC/Storage. */
export function createSupabaseStore(client: SupabaseClient): DataStore {
  return new SupabaseStore(client)
}
