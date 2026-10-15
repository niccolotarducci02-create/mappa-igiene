/** Scheda "Contatti" della ditta: elenco dei contatti (anonimizzati o acquistati) con i preventivi inviati. */
import type { Company, Quote } from '../../domain/types'
import { useStoreData } from '../../data/StoreContext'
import { useT } from '../../i18n'
import { EmptyState, ErrorBox, Section, Spinner } from '../ui'
import { LeadCard } from './LeadCard'

export function LeadsTab({ company, nowIso }: { company: Company; nowIso: string }) {
  const t = useT()
  const q = useStoreData(
    async (s) => {
      // Una sola query per i propri preventivi, poi abbinati ai contatti
      const [leads, mine] = await Promise.all([s.listLeads(company.id), s.listQuotesForCompany(company.id)])
      const quotes = leads.map((l): Quote[] => mine.filter((x) => x.leadId === l.id))
      return { leads, quotes }
    },
    [company.id],
  )

  return (
    <Section title={t('company.tab_leads')} aside={q.data ? <span className="text-sm text-fg-muted tnum">{q.data.leads.length}</span> : undefined}>
      {q.error && <ErrorBox keys={[q.error]} />}
      {q.loading && !q.data && <Spinner />}
      {q.data &&
        (q.data.leads.length === 0 ? (
          <EmptyState title={t('company.leads_empty')} body={t('company.leads_empty_body')} />
        ) : (
          <ul className="grid gap-3">
            {q.data.leads.map((l, i) => (
              <li key={l.id}>
                <LeadCard lead={l} company={company} myQuotes={q.data?.quotes[i] ?? []} nowIso={nowIso} />
              </li>
            ))}
          </ul>
        ))}
    </Section>
  )
}
