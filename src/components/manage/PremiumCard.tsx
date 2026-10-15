/**
 * Locale Premium (20 €/mese): avvisi immediati e certificati in evidenza. Non cambia mai le segnalazioni
 * né la loro visibilità (regola 4): il testo lo dice e lo store non offre nulla del genere.
 */
import { useState } from 'react'
import { isPremiumActive } from '../../domain/stateMachine'
import type { Venue } from '../../domain/types'
import { PREMIUM_PRICE_CENTS_MONTH } from '../../domain/rules'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtMoney } from '../../lib/format'
import { Notice } from '../ui'
import { SimulatedPayment } from './SimulatedPayment'

export { isPremiumActive }

export function PremiumCard({ venue, nowIso }: { venue: Venue; nowIso: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [months, setMonths] = useState<number | null>(null)
  const active = isPremiumActive(venue, nowIso)
  const price = (n: number) => fmtMoney(PREMIUM_PRICE_CENTS_MONTH * n, lang)

  return (
    <section className="card card-pad grid gap-3" aria-labelledby="premium-title">
      <div className="grid gap-1">
        <h2 id="premium-title" className="text-lg font-bold">
          {t('manage.premium_title', { price: price(1) })}
        </h2>
        <p className="text-sm text-fg-muted">{t('manage.premium_intro')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`chip ${active ? 'chip-risolta' : 'chip-nessuna'}`}>{t('manage.premium_label')}</span>
        <span className="tnum">{active ? t('manage.premium_active', { date: fmtDate(venue.premiumUntil, lang) }) : t('manage.premium_inactive')}</span>
      </div>

      <ul className="grid gap-1.5 text-sm list-disc pl-5">
        <li>{t('manage.premium_benefit_1')}</li>
        <li>{t('manage.premium_benefit_2')}</li>
        <li>{t('manage.premium_benefit_3')}</li>
      </ul>

      <Notice tone="info">{t('manage.premium_disclaimer')}</Notice>

      {months === null ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-primary" onClick={() => setMonths(1)}>
            {t('manage.premium_1', { price: price(1) })}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setMonths(3)}>
            {t('manage.premium_3', { price: price(3) })}
          </button>
        </div>
      ) : (
        <SimulatedPayment
          label={t('manage.premium_pay_label', { n: months })}
          amountCents={PREMIUM_PRICE_CENTS_MONTH * months}
          onConfirm={async () => {
            await store.setVenuePremium(venue.id, months)
            setMonths(null)
          }}
          onCancel={() => setMonths(null)}
        />
      )}
      {active && <p className="text-xs text-fg-muted">{t('manage.premium_extend_note')}</p>}
    </section>
  )
}
