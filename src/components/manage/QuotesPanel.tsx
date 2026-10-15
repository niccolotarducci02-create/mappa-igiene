/**
 * Preventivi delle ditte partner per una segnalazione pubblicata: richiesta del contatto (idempotente),
 * stato del contatto (quante ditte su 3 lo hanno acquistato), elenco dei preventivi nell'ordine dello store
 * (sponsor attivi prima, mai la ditta del fondatore in testa) e accettazione con conferma in linea.
 */
import { useState } from 'react'
import type { Company, Lead, Quote, Report } from '../../domain/types'
import { isSponsorActive } from '../../domain/stateMachine'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtMoney } from '../../lib/format'
import { ErrorBox } from '../ui'

interface Props {
  report: Report
  lead: Lead | null
  quotes: Quote[]
  companies: Company[]
  ownerId: string
  nowIso: string
}

export function QuotesPanel({ report, lead, quotes, companies, ownerId, nowIso }: Props) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const companyOf = (id: string) => companies.find((c) => c.id === id)
  const companyName = (id: string) => companyOf(id)?.name ?? t('manage.company_unknown')

  const request = async () => {
    setBusy(true)
    setErr(null)
    try {
      await store.requestQuotes(report.id, ownerId)
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  const accept = async (q: Quote) => {
    setBusy(true)
    setErr(null)
    try {
      await store.acceptQuote(q.id, ownerId)
      setConfirmId(null)
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-bold">{t('manage.quotes_title')}</h4>

      {!lead && (
        <>
          <p className="text-sm text-fg-muted">{t('manage.quotes_request_hint')}</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={request}>
            {busy ? t('manage.quotes_request_busy') : t('manage.quotes_request')}
          </button>
        </>
      )}

      {lead && (
        <>
          <p className="text-sm tnum" data-testid="lead-status">{t('manage.quotes_lead_sent', { n: lead.purchases.length, m: lead.maxBuyers })}</p>
          {quotes.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('manage.quotes_none_yet')}</p>
          ) : (
            <ul className="grid gap-2">
              {quotes.map((q) => {
                const c = companyOf(q.companyId)
                // Il badge Sponsor non compare mai per la ditta del fondatore: nessun vantaggio, nemmeno visivo.
                const sponsor = !!c && !c.isFounderCompany && isSponsorActive(c, nowIso)
                return (
                  <li
                    key={q.id}
                    className={`rounded-[var(--radius)] border p-3 grid gap-1.5 ${q.accepted ? 'border-st-resolved bg-st-resolved-soft/40' : 'border-line bg-elev'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-semibold">{companyName(q.companyId)}</span>
                        {sponsor && <span className="chip chip-neutral bg-accent-soft text-fg">{t('manage.quotes_sponsor_badge')}</span>}
                        {q.accepted && <span className="chip chip-risolta">{t('manage.quote_accepted')}</span>}
                      </div>
                      <span className="text-lg font-bold tnum">{fmtMoney(q.amountCents, lang)}</span>
                    </div>
                    {q.text && <p className="text-sm">{q.text}</p>}
                    <div className="text-xs text-fg-muted tnum">{t('manage.quote_sent_on', { date: fmtDate(q.createdAt, lang, true) })}</div>

                    {!q.accepted &&
                      (confirmId === q.id ? (
                        <div className="grid gap-2">
                          <p className="text-sm">{t('manage.quote_accept_confirm', { company: companyName(q.companyId), amount: fmtMoney(q.amountCents, lang) })}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <button type="button" className="btn btn-ok" disabled={busy} onClick={() => accept(q)}>
                              {busy ? t('manage.quote_accept_busy') : t('common.confirm')}
                            </button>
                            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirmId(null)}>
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-outline justify-self-start" onClick={() => setConfirmId(q.id)}>
                          {t('manage.quote_accept')}
                        </button>
                      ))}
                  </li>
                )
              })}
            </ul>
          )}
          {quotes.length > 0 && <p className="text-xs text-fg-muted">{t('manage.quotes_sponsor_note')}</p>}
        </>
      )}

      {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
    </div>
  )
}
