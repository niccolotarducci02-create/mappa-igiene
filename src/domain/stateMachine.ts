/**
 * Macchina a stati di una segnalazione e regole di business, in funzioni pure.
 * Usata dallo store locale (demo) e dalle Edge Functions Supabase: stessa logica, stessi esiti.
 */
import type {
  AiCheck,
  Company,
  Lead,
  Profile,
  Report,
  ReportState,
  RuleResult,
  Venue,
  VenueStatus,
} from './types'
import {
  AI_CHECK_MIN_SCORE,
  LEAD_MAX_BUYERS,
  LEAD_PRICE_CENTS,
  MAX_CAPTURE_AGE_MIN,
  MAX_DISTANCE_M,
  MAX_REPORTS_PER_MONTH,
  REPLY_WINDOW_DAYS,
  REMOVAL_REASONS,
  type RemovalReason,
} from './rules'
import { distanceMeters } from './geo'
import { addDays, isPast } from './time'

export class RuleViolation extends Error {
  readonly reasons: string[]
  constructor(reasons: string[]) {
    super(reasons.join(', '))
    this.name = 'RuleViolation'
    this.reasons = reasons
  }
}

export function assertOk(result: RuleResult): void {
  if (!result.ok) throw new RuleViolation(result.reasons)
}

/* ------------------------------------------------------------------ */
/* Invio di una segnalazione                                           */
/* ------------------------------------------------------------------ */

export interface SubmitContext {
  profile: Profile | null
  venue: Venue | null
  reportsThisMonth: number
  nowIso: string
  /** In produzione true: la foto deve venire dalla fotocamera in-app. */
  enforceCamera: boolean
  deviceBlocked: boolean
  consentAccepted: boolean
  captureMode: 'fotocamera' | 'file_demo'
  capturedAt: string
  lat: number
  lng: number
}

export function canSubmitReport(ctx: SubmitContext): RuleResult & { distanceM: number } {
  const reasons: string[] = []
  let distanceM = 0

  if (!ctx.profile) reasons.push('rule.login_required')
  else {
    if (ctx.profile.blocked) reasons.push('rule.user_blocked')
    if (!ctx.profile.phoneVerified && !ctx.profile.spidVerified) reasons.push('rule.verified_user_required')
  }
  if (ctx.deviceBlocked) reasons.push('rule.device_blocked')
  if (!ctx.consentAccepted) reasons.push('rule.consent_required')
  if (ctx.reportsThisMonth >= MAX_REPORTS_PER_MONTH) reasons.push('rule.max_reports')
  if (ctx.enforceCamera && ctx.captureMode !== 'fotocamera') reasons.push('rule.camera_only')

  const ageMin = (new Date(ctx.nowIso).getTime() - new Date(ctx.capturedAt).getTime()) / 60000
  if (!Number.isFinite(ageMin) || ageMin < -5) reasons.push('rule.capture_time_invalid')
  else if (ageMin > MAX_CAPTURE_AGE_MIN) reasons.push('rule.capture_too_old')

  if (!ctx.venue) reasons.push('rule.venue_required')
  else {
    distanceM = distanceMeters(ctx.lat, ctx.lng, ctx.venue.lat, ctx.venue.lng)
    if (!Number.isFinite(distanceM) || distanceM > MAX_DISTANCE_M) reasons.push('rule.too_far')
  }

  return { ok: reasons.length === 0, reasons, distanceM }
}

/* ------------------------------------------------------------------ */
/* Filtro automatico sulla foto                                        */
/* ------------------------------------------------------------------ */

/** Applica il verdetto del filtro: una foto non coerente viene scartata subito, le altre vanno in moderazione. */
export function applyAiCheck(report: Report, check: AiCheck): Report {
  const passes = check.verdict !== 'non_coerente' && check.score >= AI_CHECK_MIN_SCORE
  const borderline = check.verdict === 'incerta' || (check.verdict === 'coerente' && check.score < AI_CHECK_MIN_SCORE)
  return {
    ...report,
    aiCheck: check,
    // una foto "incerta" non viene scartata: decide un umano
    state: passes || borderline ? 'in_verifica' : 'scartata',
  }
}

/* ------------------------------------------------------------------ */
/* Moderazione                                                         */
/* ------------------------------------------------------------------ */

export type ModerationDecision = 'conferma' | 'archivia'

export function moderate(
  report: Report,
  decision: ModerationDecision,
  moderatorId: string,
  nowIso: string,
  note?: string,
): Report {
  if (report.state !== 'in_verifica') throw new RuleViolation(['rule.not_in_verification'])
  if (decision === 'conferma' && !report.facesBlurred && report.photo) {
    throw new RuleViolation(['rule.blur_required'])
  }
  const base = { ...report, moderatedAt: nowIso, moderatorId, moderationNote: note }
  if (decision === 'archivia') return { ...base, state: 'archiviata' }
  return {
    ...base,
    state: 'pubblicata',
    publishedAt: nowIso,
    replyDeadlineAt: addDays(nowIso, REPLY_WINDOW_DAYS),
  }
}

/** Il locale può replicare finché la segnalazione è visibile (pubblicata o risolta). */
export function canReply(report: Report, venueOwnerIds: string[], authorId: string): RuleResult {
  const reasons: string[] = []
  if (!(report.state === 'pubblicata' || report.state === 'risolta')) reasons.push('rule.not_published')
  if (!venueOwnerIds.includes(authorId)) reasons.push('rule.not_venue_owner')
  return { ok: reasons.length === 0, reasons }
}

/** Dopo 7 giorni senza replica lo stato resta "confermata" e diventa definitivo. */
export function isDefinitive(report: Report, nowIso: string): boolean {
  return report.state === 'pubblicata' && isPast(report.replyDeadlineAt, nowIso)
}

export function replyHoursLeft(report: Report, nowIso: string): number | null {
  if (!report.replyDeadlineAt || report.state !== 'pubblicata') return null
  const ms = new Date(report.replyDeadlineAt).getTime() - new Date(nowIso).getTime()
  return Math.max(0, ms / 3_600_000)
}

/* ------------------------------------------------------------------ */
/* Rimozione                                                           */
/* ------------------------------------------------------------------ */

export function isRemovalReason(x: string): x is RemovalReason {
  return (REMOVAL_REASONS as readonly string[]).includes(x)
}

/**
 * Solo la moderazione (anche su istanza DSA o del locale/utente) può rimuovere.
 * Non esiste un motivo "pagamento" e non esiste un percorso di rimozione per le ditte: regola 4.
 */
export function removeReport(
  report: Report,
  reason: string,
  actor: Profile,
  nowIso: string,
): Report {
  if (!(actor.role === 'moderatore' || actor.role === 'admin')) throw new RuleViolation(['rule.moderator_only'])
  if (!isRemovalReason(reason)) throw new RuleViolation(['rule.invalid_removal_reason'])
  if (!(report.state === 'pubblicata' || report.state === 'risolta')) throw new RuleViolation(['rule.not_published'])
  return { ...report, state: 'rimossa', removedAt: nowIso, removalReason: reason }
}

/* ------------------------------------------------------------------ */
/* Contatti venduti alle ditte                                         */
/* ------------------------------------------------------------------ */

export function newLeadFromReport(report: Report, zone: string, nowIso: string, id: string): Lead {
  if (report.state !== 'pubblicata') throw new RuleViolation(['rule.not_published'])
  return {
    id,
    reportId: report.id,
    venueId: report.venueId,
    category: report.category,
    zone,
    createdAt: nowIso,
    priceCents: LEAD_PRICE_CENTS,
    maxBuyers: LEAD_MAX_BUYERS,
    purchases: [],
    status: 'aperto',
  }
}

/** Stesso prezzo per tutte le ditte, compresa quella del fondatore. Niente sconti, niente priorità. */
export function priceForCompany(lead: Lead, _company: Company): number {
  return lead.priceCents
}

export function canBuyLead(lead: Lead, company: Company): RuleResult {
  const reasons: string[] = []
  if (!company.sameConditionsAck) reasons.push('rule.same_conditions_ack')
  if (lead.status !== 'aperto') reasons.push('rule.lead_closed')
  if (lead.purchases.length >= lead.maxBuyers) reasons.push('rule.lead_full')
  if (lead.purchases.some((p) => p.companyId === company.id)) reasons.push('rule.lead_already_bought')
  if (!company.services.includes(lead.category) && !company.services.includes('altro')) reasons.push('rule.service_mismatch')
  return { ok: reasons.length === 0, reasons }
}

export function buyLead(lead: Lead, company: Company, nowIso: string): Lead {
  assertOk(canBuyLead(lead, company))
  const purchases = [...lead.purchases, { companyId: company.id, paidCents: priceForCompany(lead, company), createdAt: nowIso }]
  return {
    ...lead,
    purchases,
    status: purchases.length >= lead.maxBuyers ? 'completo' : 'aperto',
  }
}

/** Una ditta è sponsor se ha pagato la scheda sponsorizzata e l'abbonamento non è scaduto. */
export function isSponsorActive(company: Company, nowIso: string): boolean {
  return !!company.sponsorUntil && new Date(company.sponsorUntil).getTime() > new Date(nowIso).getTime()
}

/** Premium attivo = data di scadenza nel futuro. Non riguarda l'igiene: cambia solo l'anello del pin e gli avvisi. */
export function isPremiumActive(venue: { premiumUntil?: string | null }, nowIso: string): boolean {
  return !!venue.premiumUntil && new Date(venue.premiumUntil).getTime() > new Date(nowIso).getTime()
}

/**
 * Ordine dei preventivi mostrati al locale: prima gli sponsor attivi (è ciò che la sponsorizzazione compra),
 * poi per ordine di arrivo. La ditta del fondatore NON gode mai della priorità, nemmeno se sponsor
 * (piano: "mai un vantaggio nella lista dei preventivi").
 */
export function sortQuotesForVenue<T extends { createdAt: string; companyId: string }>(
  quotes: T[],
  companies: Company[],
  nowIso: string,
): T[] {
  const rank = (q: T): number => {
    const c = companies.find((x) => x.id === q.companyId)
    if (!c || c.isFounderCompany) return 1
    return isSponsorActive(c, nowIso) ? 0 : 1
  }
  return [...quotes].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt))
}

/* ------------------------------------------------------------------ */
/* Risoluzione con certificato                                         */
/* ------------------------------------------------------------------ */

export function resolveWithCertificate(report: Report, nowIso: string): Report {
  if (report.state !== 'pubblicata') throw new RuleViolation(['rule.not_published'])
  return { ...report, state: 'risolta', resolvedAt: nowIso }
}

/* ------------------------------------------------------------------ */
/* Stato del locale                                                    */
/* ------------------------------------------------------------------ */

const VISIBLE_STATES: ReportState[] = ['pubblicata', 'risolta']

export function isPubliclyVisible(report: Report): boolean {
  return VISIBLE_STATES.includes(report.state)
}

/** confermata > in_verifica > risolta > nessuna */
export function deriveVenueStatus(reports: Report[]): VenueStatus {
  if (reports.some((r) => r.state === 'pubblicata')) return 'confermata'
  if (reports.some((r) => r.state === 'in_verifica')) return 'in_verifica'
  if (reports.some((r) => r.state === 'risolta')) return 'risolta'
  return 'nessuna'
}

/* ------------------------------------------------------------------ */
/* Statistiche di trasparenza                                          */
/* ------------------------------------------------------------------ */

export function medianModerationHours(reports: Report[]): number | null {
  const hs = reports
    .filter((r) => r.moderatedAt)
    .map((r) => (new Date(r.moderatedAt!).getTime() - new Date(r.submittedAt).getTime()) / 3_600_000)
    .sort((a, b) => a - b)
  if (!hs.length) return null
  const mid = Math.floor(hs.length / 2)
  return hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2
}
