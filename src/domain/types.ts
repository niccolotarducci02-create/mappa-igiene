/**
 * Modello di dominio di Nitido.
 * Questo file è condiviso tra l'app web, lo store locale (demo) e le Edge Functions Supabase.
 * Nessuna dipendenza da React o dal browser.
 */

export type Lang = 'it' | 'en'

export type VenueType =
  | 'ristorante'
  | 'trattoria'
  | 'pizzeria'
  | 'bar'
  | 'gelateria'
  | 'pasticceria'
  | 'altro'

/** Stato igienico mostrato sulla mappa (derivato dalle segnalazioni). */
export type VenueStatus = 'nessuna' | 'in_verifica' | 'confermata' | 'risolta'

/**
 * Stati di una segnalazione.
 *  in_verifica  -> appena inviata, superato il filtro automatico, in coda alla moderazione (SLA 24 ore)
 *  scartata     -> filtro automatico negativo (foto non coerente); avviso all'utente; mai in mappa
 *  archiviata   -> moderazione negativa; mai in mappa
 *  pubblicata   -> confermata dalla moderazione, visibile in mappa; avviso al locale; 7 giorni per la replica
 *  risolta      -> il locale ha dimostrato la risoluzione con certificato verificato
 *  rimossa      -> rimossa dopo la pubblicazione (prova non regge / DSA); entra nel registro pubblico delle rimozioni
 */
export type ReportState =
  | 'in_verifica'
  | 'scartata'
  | 'archiviata'
  | 'pubblicata'
  | 'risolta'
  | 'rimossa'

export type ReportCategory =
  | 'blatte'
  | 'roditori'
  | 'formiche'
  | 'mosche'
  | 'sporcizia'
  | 'muffa'
  | 'alimenti'
  | 'altro'

export type ReportSource = 'utente' | 'nas'

/** Come è stata acquisita la foto. In produzione è ammessa solo 'fotocamera'. */
export type CaptureMode = 'fotocamera' | 'file_demo'

export type Role = 'utente' | 'locale' | 'ditta' | 'moderatore' | 'admin'

export interface AiCheck {
  verdict: 'coerente' | 'non_coerente' | 'incerta'
  /** 0..1, confidenza che la foto mostri un problema igienico in un locale */
  score: number
  reasons: string[]
  /** true quando il verdetto arriva dall'euristica locale della demo e non dal modello */
  simulated: boolean
  checkedAt: string
}

export interface Venue {
  id: string
  name: string
  type: VenueType
  address: string
  lat: number
  lng: number
  /** Derivato: ricalcolato ogni volta che cambia una segnalazione. */
  status: VenueStatus
  claimedBy?: string
  premiumUntil?: string
  createdAt: string
}

/**
 * Stati di una richiesta di gestione (rivendicazione) di un locale.
 *  in_verifica -> inviata dal presunto titolare con partita IVA e telefono; la moderazione controlla i dati
 *  approvata   -> l'utente diventa titolare (venue.claimedBy, profile.venueIds, ruolo 'locale')
 *  rifiutata   -> dati non confermati; l'utente può inviare una nuova richiesta
 */
export type VenueClaimStatus = 'in_verifica' | 'approvata' | 'rifiutata'

/** Richiesta di gestione di un locale: diventa titolarità solo se approvata dalla moderazione (regola 3). */
export interface VenueClaim {
  id: string
  venueId: string
  userId: string
  vat: string
  /** Telefono dell'attività dichiarato nella richiesta; vuoto se non indicato. */
  phone: string
  status: VenueClaimStatus
  requestedAt: string
  decidedAt?: string
  decidedBy?: string
  /** Nota della moderazione (soprattutto il motivo di un rifiuto). */
  note?: string
}

export interface Profile {
  id: string
  displayName: string
  role: Role
  phone?: string
  phoneVerified: boolean
  spidVerified: boolean
  deviceHash?: string
  companyId?: string
  venueIds?: string[]
  createdAt: string
  blocked?: boolean
}

export interface Report {
  id: string
  venueId: string
  userId: string
  source: ReportSource
  category: ReportCategory
  description: string
  /** Data URL (demo) oppure path nello storage (produzione). Vuoto per le segnalazioni NAS. */
  photo: string
  photoHash: string
  captureMode: CaptureMode
  capturedAt: string
  lat: number
  lng: number
  distanceM: number
  aiCheck?: AiCheck
  state: ReportState
  submittedAt: string
  moderatedAt?: string
  moderatorId?: string
  moderationNote?: string
  publishedAt?: string
  /** publishedAt + 7 giorni: finestra del diritto di replica */
  replyDeadlineAt?: string
  resolvedAt?: string
  removedAt?: string
  removalReason?: string
  /** Solo per source = 'nas' */
  nasNoticeId?: string
  /** Volti sfocati prima della pubblicazione */
  facesBlurred: boolean
}

export interface Reply {
  id: string
  reportId: string
  venueId: string
  authorId: string
  text: string
  createdAt: string
}

export interface Company {
  id: string
  name: string
  vat: string
  zones: string[]
  services: ReportCategory[]
  ownerUserId: string
  sponsorUntil?: string
  /** Accettazione esplicita delle condizioni uguali per tutti (regola 4). */
  sameConditionsAck: boolean
  /** La ditta del fondatore: serve solo a dimostrare che NON ha vantaggi. */
  isFounderCompany?: boolean
  phone?: string
  email?: string
}

export type LeadStatus = 'aperto' | 'completo' | 'chiuso'

export interface LeadPurchase {
  companyId: string
  paidCents: number
  createdAt: string
}

export interface Lead {
  id: string
  reportId: string
  venueId: string
  category: ReportCategory
  zone: string
  createdAt: string
  priceCents: number
  maxBuyers: number
  purchases: LeadPurchase[]
  status: LeadStatus
}

/** Vista di un contatto per una ditta: i dati del locale compaiono solo dopo l'acquisto. */
export interface LeadView extends Lead {
  purchasedByMe: boolean
  venueName?: string
  venueAddress?: string
  venuePhone?: string
  photo?: string
}

export interface Quote {
  id: string
  leadId: string
  companyId: string
  amountCents: number
  text: string
  createdAt: string
  accepted?: boolean
}

export interface Certificate {
  id: string
  reportId: string
  venueId: string
  companyId: string
  file: string
  interventionType: string
  issuedAt: string
  verifiedAt?: string
  verifiedBy?: string
  rejectedAt?: string
  rejectionNote?: string
}

export interface NasNotice {
  id: string
  venueNameRaw: string
  addressRaw?: string
  sourceUrl: string
  publishedAt: string
  summary: string
  importedAt: string
  importedBy: string
  venueId?: string
  linkedReportId?: string
}

export type RemovalRequester = 'locale' | 'moderazione' | 'dsa' | 'utente'

export interface Removal {
  id: string
  reportId: string
  venueName: string
  reason: string
  requestedBy: RemovalRequester
  publishedAt: string
  removedAt: string
}

export type DsaDecision = 'rimossa' | 'mantenuta'

export interface DsaNotice {
  id: string
  reportId: string
  contact: string
  reason: string
  receivedAt: string
  decidedAt?: string
  decision?: DsaDecision
  decisionNote?: string
}

export type NotificationKind =
  | 'segnalazione_scartata'
  | 'segnalazione_archiviata'
  | 'segnalazione_pubblicata'
  | 'nuova_segnalazione_locale'
  | 'replica_ricevuta'
  | 'nuovo_contatto'
  | 'preventivo_ricevuto'
  | 'certificato_verificato'
  | 'segnalazione_rimossa'
  | 'generico'

export interface Notification {
  id: string
  toUserId: string
  kind: NotificationKind
  title: string
  body: string
  link?: string
  createdAt: string
  read: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actorId: string
  action: string
  targetType: string
  targetId: string
  note?: string
}

export interface Stats {
  venues: number
  venuesByStatus: Record<VenueStatus, number>
  reportsTotal: number
  reportsByState: Record<ReportState, number>
  repliesTotal: number
  leadsSold: number
  removals: number
  dsaNotices: number
  medianModerationHours: number | null
}

export interface NewReportInput {
  venueId: string
  userId: string
  category: ReportCategory
  description: string
  photo: string
  captureMode: CaptureMode
  capturedAt: string
  lat: number
  lng: number
  consentAccepted: boolean
  deviceHash?: string
}

export interface RuleResult {
  ok: boolean
  /** chiavi i18n dei motivi di rifiuto, es. 'rule.max_reports' */
  reasons: string[]
}
