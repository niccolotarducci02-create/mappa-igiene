/**
 * /come-funziona: tre pubblici a schede (Clienti, Locali, Ditte), il percorso di una segnalazione in 11 passi
 * e 2 decisioni, la tabella dei prezzi costruita dalle costanti di src/domain/rules.ts, inviti all'azione.
 */
import { useId, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { PageHeader, Section } from '../components/ui'
import { CompaniesPanel, CustomersPanel, VenuesPanel } from '../components/legal/AudiencePanels'
import { ReportJourney } from '../components/legal/ReportJourney'
import { PricingTable, type PriceRow } from '../components/legal/PricingTable'
import { useLegalVars } from '../components/legal/vars'

type Audience = 'clienti' | 'locali' | 'ditte'
const AUDIENCES: Audience[] = ['clienti', 'locali', 'ditte']

export default function HowItWorksPage() {
  const t = useT()
  const vars = useLegalVars()
  const uid = useId()
  const [tab, setTab] = useState<Audience>('clienti')

  const tabId = (a: Audience) => `${uid}-tab-${a}`
  const panelId = (a: Audience) => `${uid}-panel-${a}`

  // Frecce sinistra/destra tra le schede, come richiesto dal pattern "tabs" WAI-ARIA.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = AUDIENCES.indexOf(tab)
    const next = AUDIENCES[(i + (e.key === 'ArrowRight' ? 1 : AUDIENCES.length - 1)) % AUDIENCES.length]
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  const pricing: PriceRow[] = [
    { label: t('how.price.customer'), value: t('how.price.customer_value'), note: t('how.price.customer_note'), tone: 'ok' },
    { label: t('how.price.lead'), value: t('how.price.lead_value', vars), note: t('how.price.lead_note', vars) },
    { label: t('how.price.commission'), value: t('how.price.commission_value', vars), note: t('how.price.commission_note', vars) },
    { label: t('how.price.sponsor'), value: t('how.price.sponsor_value', vars), note: t('how.price.sponsor_note') },
    { label: t('how.price.premium'), value: t('how.price.premium_value', vars), note: t('how.price.premium_note') },
    { label: t('how.price.removal'), value: t('how.price.removal_value'), note: t('how.price.removal_note'), tone: 'danger' },
  ]

  return (
    <>
      <PageHeader eyebrow={t('how.eyebrow')} title={t('how.title')} subtitle={t('how.subtitle')} />

      <Section>
        <div role="tablist" aria-label={t('how.tabs_label')} className="card p-1 grid grid-cols-3 gap-1" onKeyDown={onKeyDown}>
          {AUDIENCES.map((a) => {
            const active = a === tab
            return (
              <button
                key={a}
                type="button"
                role="tab"
                id={tabId(a)}
                aria-selected={active}
                aria-controls={panelId(a)}
                tabIndex={active ? 0 : -1}
                className={`min-h-[44px] rounded-[var(--radius)] font-semibold text-sm px-2 ${active ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-muted'}`}
                onClick={() => setTab(a)}
              >
                {t(`how.tab.${a}`)}
              </button>
            )
          })}
        </div>
        <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} className="mt-3">
          {tab === 'clienti' && <CustomersPanel />}
          {tab === 'locali' && <VenuesPanel />}
          {tab === 'ditte' && <CompaniesPanel />}
        </div>
      </Section>

      <Section title={t('how.journey_title')}>
        <p className="text-sm text-fg-muted mb-3">{t('how.journey_intro')}</p>
        <ReportJourney />
      </Section>

      <Section title={t('how.pricing_title')}>
        <PricingTable rows={pricing} />
      </Section>

      <Section title={t('how.cta_title')}>
        <div className="grid gap-2">
          <Link to="/segnala" className="btn btn-primary btn-block">
            {t('how.cta_report')}
          </Link>
          <Link to="/accedi" className="btn btn-outline btn-block">
            {t('how.cta_login')}
          </Link>
          <Link to="/ditte" className="btn btn-outline btn-block">
            {t('how.cta_companies')}
          </Link>
        </div>
      </Section>
    </>
  )
}
