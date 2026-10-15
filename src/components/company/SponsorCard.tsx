/**
 * Scheda sponsorizzata della ditta (100 €/mese): in evidenza nella città e prima nella lista dei preventivi.
 * Non tocca mai le segnalazioni (regola 4); la ditta del fondatore non ottiene priorità nemmeno se sponsorizza.
 */
import { useState } from 'react'
import type { Company } from '../../domain/types'
import { SPONSOR_PRICE_CENTS_MONTH } from '../../domain/rules'
import { isSponsorActive } from '../../domain/stateMachine'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtMoney } from '../../lib/format'
import { Notice } from '../ui'
import { SimulatedPayment } from '../manage/SimulatedPayment'

export function SponsorCard({ company, nowIso }: { company: Company; nowIso: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [months, setMonths] = useState<number | null>(null)
  const active = isSponsorActive(company, nowIso)
  const price = (n: number) => fmtMoney(SPONSOR_PRICE_CENTS_MONTH * n, lang)

  return (
    <section className="card card-pad grid gap-3" aria-labelledby="sponsor-title">
      <h2 id="sponsor-title" className="text-lg font-bold">
        {t('company.sponsor_title', { price: price(1) })}
      </h2>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`chip ${active ? 'chip-risolta' : 'chip-nessuna'}`}>{t('company.sponsor_badge')}</span>
        <span className="tnum">{active ? t('company.sponsor_active', { date: fmtDate(company.sponsorUntil, lang) }) : t('company.sponsor_inactive')}</span>
      </div>

      <ul className="grid gap-1.5 text-sm list-disc pl-5">
        <li>{t('company.sponsor_benefit_1')}</li>
        <li>{t('company.sponsor_benefit_2')}</li>
      </ul>

      <Notice tone="info">
        <span className="block">{t('company.sponsor_rule4')}</span>
        <span className="block mt-0.5">{t('company.sponsor_founder_note')}</span>
      </Notice>

      {months === null ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-primary" onClick={() => setMonths(1)}>
            {t('company.sponsor_1', { price: price(1) })}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setMonths(3)}>
            {t('company.sponsor_3', { price: price(3) })}
          </button>
        </div>
      ) : (
        <SimulatedPayment
          label={t('company.pay_sponsor_label', { n: months })}
          amountCents={SPONSOR_PRICE_CENTS_MONTH * months}
          onConfirm={async () => {
            await store.sponsorCompany(company.id, months)
            setMonths(null)
          }}
          onCancel={() => setMonths(null)}
        />
      )}
      {active && <p className="text-xs text-fg-muted">{t('company.sponsor_extend_note')}</p>}
    </section>
  )
}
