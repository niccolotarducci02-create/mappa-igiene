/**
 * Variabili di interpolazione per i testi legali e informativi: tutti i numeri vengono da src/domain/rules.ts,
 * i prezzi sono formattati con fmtMoney nella lingua corrente. Nessun numero del piano è scritto a mano nei testi.
 */
import { useMemo } from 'react'
import {
  COMMISSION_MAX_CENTS,
  COMMISSION_MIN_CENTS,
  COMMISSION_PCT,
  LEAD_MAX_BUYERS,
  LEAD_PRICE_CENTS,
  MAX_CAPTURE_AGE_MIN,
  MAX_DISTANCE_M,
  MAX_REPORTS_PER_MONTH,
  MODERATION_SLA_HOURS,
  PREMIUM_PRICE_CENTS_MONTH,
  REMOVAL_SLA_HOURS,
  REPLY_WINDOW_DAYS,
  SPONSOR_PRICE_CENTS_MONTH,
} from '../../domain/rules'
import { useLang } from '../../i18n'
import { fmtMoney } from '../../lib/format'

/** Punto di contatto DSA: segnaposto finché non c'è il dominio definitivo (evidenziato nelle pagine). */
export const DSA_CONTACT_EMAIL = 'dsa@[dominio]'
/** Recapito privacy: stesso segnaposto. */
export const PRIVACY_CONTACT_EMAIL = 'privacy@[dominio]'

export type LegalVars = Record<string, string | number>

export function useLegalVars(): LegalVars {
  const { lang } = useLang()
  return useMemo(
    () => ({
      distance: MAX_DISTANCE_M,
      minutes: MAX_CAPTURE_AGE_MIN,
      maxReports: MAX_REPORTS_PER_MONTH,
      hours: MODERATION_SLA_HOURS,
      days: REPLY_WINDOW_DAYS,
      removalHours: REMOVAL_SLA_HOURS,
      lead: fmtMoney(LEAD_PRICE_CENTS, lang),
      maxBuyers: LEAD_MAX_BUYERS,
      pct: COMMISSION_PCT,
      commMin: fmtMoney(COMMISSION_MIN_CENTS, lang),
      commMax: fmtMoney(COMMISSION_MAX_CENTS, lang),
      sponsor: fmtMoney(SPONSOR_PRICE_CENTS_MONTH, lang),
      premium: fmtMoney(PREMIUM_PRICE_CENTS_MONTH, lang),
      email: DSA_CONTACT_EMAIL,
      dsaEmail: DSA_CONTACT_EMAIL,
      privacyEmail: PRIVACY_CONTACT_EMAIL,
    }),
    [lang],
  )
}
