/**
 * Regole del prodotto. Ogni numero qui corrisponde a una riga del piano "Mappa dell'Igiene – Piano Firenze".
 * Cambiare un valore qui cambia il comportamento di app, store demo ed Edge Functions.
 */

/** Massimo 3 segnalazioni al mese per utente (contromisura alle segnalazioni false). */
export const MAX_REPORTS_PER_MONTH = 3

/** Il locale ha 7 giorni per rispondere prima che lo stato diventi definitivo. */
export const REPLY_WINDOW_DAYS = 7

/** Verifica umana entro 24 ore. */
export const MODERATION_SLA_HOURS = 24

/** Rimozione entro 48 ore se la prova non regge. */
export const REMOVAL_SLA_HOURS = 48

/** Distanza massima tra GPS della foto e posizione del locale. */
export const MAX_DISTANCE_M = 150

/** La foto deve essere scattata al massimo N minuti prima dell'invio (niente galleria). */
export const MAX_CAPTURE_AGE_MIN = 30

/** Un contatto venduto alle ditte: 30 € per contatto, massimo 3 ditte per contatto. */
export const LEAD_PRICE_CENTS = 3000
export const LEAD_MAX_BUYERS = 3

/** Alternativa alla tariffa fissa: 10% su interventi da 150 a 500 €. */
export const COMMISSION_PCT = 10
export const COMMISSION_MIN_CENTS = 15000
export const COMMISSION_MAX_CENTS = 50000

/** Scheda sponsorizzata della ditta: 100 €/mese. */
export const SPONSOR_PRICE_CENTS_MONTH = 10000

/** Locale Premium: 20 €/mese (avviso immediato, certificati in evidenza). */
export const PREMIUM_PRICE_CENTS_MONTH = 2000

/** Soglia del filtro automatico sulle foto. */
export const AI_CHECK_MIN_SCORE = 0.55

/** Le quattro regole non negoziabili, scritte nei termini d'uso. */
export const FOUR_RULES = [
  {
    id: 1,
    it: 'Mai una lista nera: l\'app pubblica "segnalazioni degli utenti" con prova, mai un giudizio proprio sul locale.',
    en: 'Never a blacklist: the app publishes "user reports" with evidence, never its own judgement of a venue.',
  },
  {
    id: 2,
    it: 'Una segnalazione vale solo con foto scattata dentro l\'app (niente galleria), posizione GPS, ora e utente verificato con SPID/CIE o numero di telefono.',
    en: 'A report counts only with a photo taken inside the app (no gallery), GPS position, time and a user verified with SPID/CIE or phone number.',
  },
  {
    id: 3,
    it: 'Il locale ha sempre il diritto di replica, visibile accanto alla segnalazione, e 7 giorni per rispondere prima che lo stato diventi definitivo.',
    en: 'The venue always has the right to reply, shown next to the report, and 7 days to respond before the status becomes final.',
  },
  {
    id: 4,
    it: 'Nessun inserzionista tocca le segnalazioni, nemmeno la ditta del fondatore: niente "paga e sparisce", mai.',
    en: 'No advertiser touches the reports, not even the founder\'s own company: no "pay and it disappears", ever.',
  },
] as const

/** Motivi ammessi per una rimozione. "pagamento" non esiste e non deve mai esistere. */
export const REMOVAL_REASONS = [
  'prova_insufficiente',
  'foto_non_pertinente',
  'locale_errato',
  'contenuto_illecito',
  'richiesta_dsa_accolta',
  'richiesta_utente',
] as const
export type RemovalReason = (typeof REMOVAL_REASONS)[number]

export const REPORT_CATEGORIES = [
  'blatte',
  'roditori',
  'formiche',
  'mosche',
  'sporcizia',
  'muffa',
  'alimenti',
  'altro',
] as const

export const VENUE_TYPES = [
  'ristorante',
  'trattoria',
  'pizzeria',
  'bar',
  'gelateria',
  'pasticceria',
  'altro',
] as const

/** Firenze, centro storico: centro e zoom iniziali della mappa. */
export const FLORENCE_CENTER: [number, number] = [43.7711, 11.2556]
export const FLORENCE_ZOOM = 14
