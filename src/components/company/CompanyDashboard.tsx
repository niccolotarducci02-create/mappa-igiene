/**
 * Area riservata della ditta partner: banner per la ditta del fondatore (regola 4 dimostrata),
 * cancello delle condizioni uguali per tutti, poi tre schede: Contatti, Sponsorizzazione, La mia ditta.
 */
import { useMemo, useState, type KeyboardEvent } from 'react'
import { LEAD_PRICE_CENTS } from '../../domain/rules'
import { useStoreData } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtMoney } from '../../lib/format'
import { EmptyState, ErrorBox, Notice, PageHeader, Section, Spinner } from '../ui'
import { SameConditionsGate } from './SameConditionsGate'
import { LeadsTab } from './LeadsTab'
import { SponsorCard } from './SponsorCard'
import { CompanyInfo } from './CompanyInfo'

type Tab = 'leads' | 'sponsor' | 'me'

export function CompanyDashboard({ companyId }: { companyId: string }) {
  const t = useT()
  const { lang } = useLang()
  const companyQ = useStoreData((s) => s.getCompany(companyId), [companyId])
  const [tab, setTab] = useState<Tab>('leads')
  const nowIso = useMemo(() => new Date().toISOString(), [companyQ.data])

  if (companyQ.loading && !companyQ.data) return <Spinner />
  if (companyQ.error) {
    return (
      <div className="gutter py-6">
        <ErrorBox keys={[companyQ.error]} />
      </div>
    )
  }
  const company = companyQ.data
  if (!company) {
    return (
      <div className="gutter py-8">
        <EmptyState title={t('company.not_found')} body={t('company.not_found_body')} />
      </div>
    )
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'leads', label: t('company.tab_leads') },
    { id: 'sponsor', label: t('company.tab_sponsor') },
    { id: 'me', label: t('company.tab_me') },
  ]

  // Pattern "tabs" WAI-ARIA come in moderation/TabBar: un solo tab nel giro del Tab, frecce tra le schede
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = tabs.findIndex((tb) => tb.id === tab)
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    if (!next) return
    setTab(next.id)
    document.getElementById(`company-tab-${next.id}`)?.focus()
  }

  return (
    <>
      <PageHeader eyebrow={t('role.ditta')} title={company.name} subtitle={company.zones.join(' · ')} />

      {company.isFounderCompany && (
        <Section>
          <Notice tone="warn" testId="founder-banner">
            <strong>{t('company.founder_banner', { price: fmtMoney(LEAD_PRICE_CENTS, lang) })}</strong>
          </Notice>
        </Section>
      )}

      {!company.sameConditionsAck ? (
        <Section>
          <SameConditionsGate company={company} />
        </Section>
      ) : (
        <>
          <div className="gutter pt-1">
            <div role="tablist" aria-label={t('nav.companies')} className="grid grid-cols-3 gap-1 p-1 rounded-[var(--radius)] bg-muted" onKeyDown={onTabKeyDown}>
              {tabs.map((tb) => {
                const active = tab === tb.id
                return (
                  <button
                    key={tb.id}
                    type="button"
                    role="tab"
                    id={`company-tab-${tb.id}`}
                    aria-selected={active}
                    aria-controls={active ? `company-panel-${tb.id}` : undefined}
                    tabIndex={active ? 0 : -1}
                    className={`min-h-[44px] px-1 rounded-[calc(var(--radius)-4px)] text-sm font-semibold truncate ${active ? 'bg-elev text-fg shadow-app' : 'text-fg-muted'}`}
                    onClick={() => setTab(tb.id)}
                  >
                    {tb.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div role="tabpanel" id={`company-panel-${tab}`} aria-labelledby={`company-tab-${tab}`}>
            {tab === 'leads' && <LeadsTab company={company} nowIso={nowIso} />}
            {tab === 'sponsor' && (
              <Section>
                <SponsorCard company={company} nowIso={nowIso} />
              </Section>
            )}
            {tab === 'me' && (
              <Section>
                <CompanyInfo company={company} />
              </Section>
            )}
          </div>
        </>
      )}
    </>
  )
}
