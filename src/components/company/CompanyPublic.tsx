/**
 * Faccia pubblica di /ditte: come funziona in 3 passi, tariffe costruite dalle costanti di rules.ts,
 * regola 4 (compresa la ditta del fondatore), elenco delle ditte partner, invito a diventare partner.
 */
import { Link } from 'react-router-dom'
import type { Company } from '../../domain/types'
import { COMMISSION_MAX_CENTS, COMMISSION_MIN_CENTS, COMMISSION_PCT, LEAD_MAX_BUYERS, LEAD_PRICE_CENTS, SPONSOR_PRICE_CENTS_MONTH } from '../../domain/rules'
import { useLang, useT } from '../../i18n'
import { fmtMoney } from '../../lib/format'
import { Notice, PageHeader, Section } from '../ui'
import { PartnerDirectory } from './PartnerDirectory'

export function CompanyPublic({ companies, nowIso }: { companies: Company[]; nowIso: string }) {
  const t = useT()
  const { lang } = useLang()
  const m = (cents: number) => fmtMoney(cents, lang)

  const steps = [
    { title: t('company.how_1_title'), body: t('company.how_1_body') },
    {
      title: t('company.how_2_title'),
      body: t('company.how_2_body', { price: m(LEAD_PRICE_CENTS), max: LEAD_MAX_BUYERS, pct: COMMISSION_PCT, min: m(COMMISSION_MIN_CENTS), max_amount: m(COMMISSION_MAX_CENTS) }),
    },
    { title: t('company.how_3_title'), body: t('company.how_3_body') },
  ]

  const pricing: Array<{ label: string; value: string; note: string; tone?: 'danger' }> = [
    { label: t('company.pricing_lead'), value: t('company.pricing_lead_value', { price: m(LEAD_PRICE_CENTS) }), note: t('company.pricing_lead_note', { max: LEAD_MAX_BUYERS }) },
    {
      label: t('company.pricing_commission'),
      value: t('company.pricing_commission_value', { pct: COMMISSION_PCT }),
      note: t('company.pricing_commission_note', { min: m(COMMISSION_MIN_CENTS), max: m(COMMISSION_MAX_CENTS) }),
    },
    { label: t('company.pricing_sponsor'), value: t('company.pricing_sponsor_value', { price: m(SPONSOR_PRICE_CENTS_MONTH) }), note: t('company.pricing_sponsor_note') },
    { label: t('company.pricing_removal'), value: t('company.pricing_removal_value'), note: t('company.pricing_removal_note'), tone: 'danger' },
  ]

  return (
    <>
      <PageHeader eyebrow={t('company.public_eyebrow')} title={t('company.public_title')} subtitle={t('company.public_subtitle')} />

      <Section title={t('company.how_title')}>
        <ol className="grid gap-2">
          {steps.map((s, i) => (
            <li key={s.title} className="card card-pad flex gap-3">
              <span className="w-8 h-8 shrink-0 rounded-full bg-accent text-accent-fg grid place-items-center font-bold tnum" aria-hidden="true">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-fg-muted mt-0.5">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t('company.pricing_title')}>
        <div className="card divide-y divide-line">
          {pricing.map((row) => (
            <div key={row.label} className="p-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className="min-w-0">
                <div className="font-semibold">{row.label}</div>
                <div className="text-xs text-fg-muted">{row.note}</div>
              </div>
              <div className={`font-bold tnum ${row.tone === 'danger' ? 'text-st-confirmed' : ''}`}>{row.value}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <Notice tone="info">
          <strong className="block">{t('company.rule4_title')}</strong>
          <span className="block mt-0.5">{t('company.rule4_body')}</span>
        </Notice>
      </Section>

      <Section title={t('company.directory_title')}>
        <PartnerDirectory companies={companies} nowIso={nowIso} />
      </Section>

      <Section>
        <div className="card card-pad grid gap-3">
          <h2 className="text-lg font-bold">{t('company.cta_title')}</h2>
          <p className="text-sm text-fg-muted">{t('company.cta_body')}</p>
          <Link className="btn btn-primary" to="/accedi">
            {t('company.cta_button')}
          </Link>
        </div>
      </Section>
    </>
  )
}
