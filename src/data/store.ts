/**
 * Interfaccia dello store dati. Due implementazioni:
 *  - LocalStore (src/data/localStore.ts): demo, in memoria + localStorage, nessun server.
 *  - SupabaseStore (src/data/supabaseStore.ts): produzione, Postgres + RLS + Edge Functions.
 * L'interfaccia è l'unico punto di contatto delle pagine con i dati.
 */
import type {
  AiCheck,
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
  Profile,
  Quote,
  Removal,
  Report,
  Reply,
  Stats,
  Venue,
  VenueClaim,
  VenueStatus,
  VenueType,
} from '../domain/types'
import type { ModerationDecision } from '../domain/stateMachine'

export interface VenueFilter {
  status?: VenueStatus[]
  type?: VenueType[]
  q?: string
}

export interface NearbyVenue extends Venue {
  distanceM: number
}

export interface OtpRequestResult {
  ok: boolean
  /** Solo nella demo: il codice da inserire. In produzione arriva via SMS. */
  demoCode?: string
}

export interface SubmitReportResult {
  report: Report
  aiCheck: AiCheck
}

export interface VenueClaimFilter {
  status?: VenueClaim['status'][]
  userId?: string
}

/** Esito di una richiesta di gestione: il locale (ancora senza titolare) e la richiesta in verifica. */
export interface ClaimVenueResult {
  venue: Venue
  claim: VenueClaim
}

export interface DataStore {
  readonly mode: 'demo' | 'supabase'

  /* sessione */
  getSession(): Promise<Profile | null>
  listDemoPersonas(): Promise<Profile[]>
  signInDemo(personaId: string): Promise<Profile>
  requestOtp(phone: string): Promise<OtpRequestResult>
  verifyOtp(phone: string, code: string, displayName?: string): Promise<Profile>
  signOut(): Promise<void>
  /** Si attiva quando cambiano i dati; restituisce la funzione per disiscriversi. */
  subscribe(listener: () => void): () => void

  /* locali */
  listVenues(filter?: VenueFilter): Promise<Venue[]>
  getVenue(id: string): Promise<Venue | null>
  nearestVenues(lat: number, lng: number, limit?: number): Promise<NearbyVenue[]>
  /**
   * Richiesta di gestione del locale: crea una rivendicazione "in_verifica" e NON rende titolare.
   * Lancia rule.claim_pending se una richiesta dello stesso utente è già in verifica.
   */
  claimVenue(venueId: string, userId: string, proof: { vat: string; phone: string }): Promise<ClaimVenueResult>
  /** Richieste di gestione: la moderazione le vede tutte, un utente solo le proprie. */
  listVenueClaims(filter?: VenueClaimFilter): Promise<VenueClaim[]>
  /** Solo moderazione: approva (l'utente diventa titolare) o rifiuta (nota consigliata) una richiesta in verifica. */
  decideVenueClaim(claimId: string, accept: boolean, moderatorId: string, note?: string): Promise<VenueClaim>
  setVenuePremium(venueId: string, months: number): Promise<Venue>

  /* segnalazioni */
  listReportsForVenue(venueId: string, opts?: { includeHidden?: boolean }): Promise<Report[]>
  listReportsByUser(userId: string): Promise<Report[]>
  listAllReports(): Promise<Report[]>
  getReport(id: string): Promise<Report | null>
  countReportsThisMonth(userId: string): Promise<number>
  submitReport(input: NewReportInput): Promise<SubmitReportResult>

  /* moderazione */
  listModerationQueue(): Promise<Report[]>
  /** `actorId`: chi ha controllato i volti (per il registro attività); in produzione è l'utente della sessione. */
  setReportPhotoBlurred(reportId: string, photo: string, actorId?: string): Promise<Report>
  moderateReport(reportId: string, decision: ModerationDecision, moderatorId: string, note?: string): Promise<Report>
  removeReport(reportId: string, reason: string, requestedBy: Removal['requestedBy'], actorId: string): Promise<Report>
  blockUser(userId: string, actorId: string): Promise<Profile>
  /** Revoca il blocco di profilo e dispositivo (solo moderazione). */
  unblockUser(userId: string, actorId: string): Promise<Profile>

  /* repliche */
  listReplies(reportId: string): Promise<Reply[]>
  /** Tutte le repliche delle segnalazioni di un locale, in ordine di creazione. */
  listRepliesForVenue(venueId: string): Promise<Reply[]>
  addReply(reportId: string, authorId: string, text: string): Promise<Reply>

  /* ditte e contatti */
  listCompanies(): Promise<Company[]>
  getCompany(id: string): Promise<Company | null>
  acceptSameConditions(companyId: string): Promise<Company>
  sponsorCompany(companyId: string, months: number): Promise<Company>
  requestQuotes(reportId: string, requesterId: string): Promise<Lead>
  getLeadForReport(reportId: string): Promise<Lead | null>
  listLeads(companyId: string): Promise<LeadView[]>
  buyLead(leadId: string, companyId: string): Promise<Lead>
  submitQuote(leadId: string, companyId: string, amountCents: number, text: string): Promise<Quote>
  listQuotesForLead(leadId: string): Promise<Quote[]>
  /** I preventivi inviati da una ditta, dal più recente. */
  listQuotesForCompany(companyId: string): Promise<Quote[]>
  acceptQuote(quoteId: string, venueOwnerId: string): Promise<Quote>

  /* certificati */
  uploadCertificate(reportId: string, companyId: string, file: string, interventionType: string, uploaderId: string): Promise<Certificate>
  listCertificatesForVenue(venueId: string): Promise<Certificate[]>
  listCertificatesForReport(reportId: string): Promise<Certificate[]>
  listPendingCertificates(): Promise<Certificate[]>
  verifyCertificate(certificateId: string, moderatorId: string, accept: boolean, note?: string): Promise<Certificate>

  /* NAS */
  listNasNotices(): Promise<NasNotice[]>
  importNasNotice(input: Omit<NasNotice, 'id' | 'importedAt' | 'venueId' | 'linkedReportId'>): Promise<NasNotice>
  linkNasNotice(noticeId: string, venueId: string, moderatorId: string): Promise<Report>

  /* trasparenza */
  listRemovals(): Promise<Removal[]>
  submitDsaNotice(reportId: string, contact: string, reason: string): Promise<DsaNotice>
  listDsaNotices(): Promise<DsaNotice[]>
  decideDsaNotice(noticeId: string, decision: DsaDecision, note: string, moderatorId: string): Promise<DsaNotice>
  getStats(): Promise<Stats>

  /* notifiche e audit */
  listNotifications(userId: string): Promise<Notification[]>
  markNotificationRead(id: string): Promise<void>
  listAudit(limit?: number): Promise<AuditEntry[]>

  /* demo */
  resetDemo(): Promise<void>
}
