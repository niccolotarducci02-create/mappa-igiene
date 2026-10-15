/**
 * Scheda "Richieste DSA": richieste di rimozione arrivate dal modulo DSA. Da decidere entro 48 ore dalla ricezione:
 * "Rimuovi la segnalazione" (entra nel registro pubblico) oppure "Mantieni". Entrambe richiedono una nota.
 */
import { useState } from 'react'
import type { DsaDecision, DsaNotice } from '../../domain/types'
import { REMOVAL_SLA_HOURS } from '../../domain/rules'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtRelative } from '../../lib/format'
import { EmptyState, ErrorBox, KeyValue, Notice } from '../ui'
import { ReportSummary } from './ReportSummary'
import { SlaChip } from './SlaChip'
import type { TabProps } from './types'
import { useAsyncAction } from './useAsyncAction'

export function DsaTab({ data, profile, nowIso }: TabProps) {
  const t = useT()
  // le richieste in attesa prima, dalla più vecchia (è quella più vicina alla scadenza)
  const pending = data.dsa.filter((n) => !n.decidedAt).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  const decided = data.dsa.filter((n) => n.decidedAt)

  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <p className="text-sm text-fg-muted">{t('mod.dsa.intro')}</p>
        <h3 className="font-bold">
          {t('mod.dsa.pending_title')} <span className="text-fg-muted font-normal tnum">({pending.length})</span>
        </h3>
        {pending.length === 0 ? (
          <EmptyState title={t('mod.dsa.empty')} body={t('mod.dsa.empty_body')} />
        ) : (
          <ul className="grid gap-4">
            {pending.map((n) => (
              <DsaCard key={n.id} notice={n} data={data} moderatorId={profile.id} nowIso={nowIso} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-bold">
          {t('mod.dsa.decided_title')} <span className="text-fg-muted font-normal tnum">({decided.length})</span>
        </h3>
        <DecidedTable notices={decided} data={data} />
      </section>
    </div>
  )
}

function DsaCard({ notice, data, moderatorId, nowIso }: { notice: DsaNotice; data: TabProps['data']; moderatorId: string; nowIso: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [note, setNote] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { run, busy, error, clearError } = useAsyncAction()

  const report = data.reports.find((r) => r.id === notice.reportId)
  const venue = report ? data.venueById.get(report.venueId) : undefined
  const noteOk = note.trim().length > 0
  const decide = (decision: DsaDecision) => run(() => store.decideDsaNotice(notice.id, decision, note.trim(), moderatorId))
  const noteId = `dsa-note-${notice.id}`

  return (
    <li className="card card-pad grid gap-3" data-testid="dsa-card" data-notice-id={notice.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-muted tnum">{t('mod.dsa.received', { when: fmtRelative(notice.receivedAt, lang, nowIso) })}</span>
        <SlaChip sinceIso={notice.receivedAt} nowIso={nowIso} maxHours={REMOVAL_SLA_HOURS} />
      </div>

      <div className="grid gap-1">
        <div className="eyebrow">{t('mod.dsa.report')}</div>
        {report ? <ReportSummary report={report} venue={venue} replies={data.repliesByReport.get(report.id) ?? []} /> : <p className="text-sm text-fg-muted">{t('mod.dsa.report_missing')}</p>}
      </div>

      <KeyValue items={[[t('mod.dsa.contact'), <span className="break-all">{notice.contact}</span>]]} />
      <div className="rounded-[var(--radius)] bg-muted p-3 text-sm">
        <div className="eyebrow mb-1">{t('mod.dsa.reason')}</div>
        <p className="break-words">{notice.reason}</p>
      </div>

      <div className="field">
        <label htmlFor={noteId}>{t('mod.dsa.note')}</label>
        <textarea id={noteId} className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mod.dsa.note_placeholder')} />
        <span className="text-xs text-fg-muted">{t('mod.dsa.note_hint')}</span>
      </div>

      {!confirmRemove ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-danger" disabled={!noteOk || busy} onClick={() => setConfirmRemove(true)}>
            {t('mod.dsa.remove')}
          </button>
          <button type="button" className="btn btn-ok" disabled={!noteOk || busy} onClick={() => decide('mantenuta')}>
            {t('mod.dsa.keep')}
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Notice tone="danger">
            <p>{t('mod.dsa.remove_hint')}</p>
          </Notice>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => decide('rimossa')}>
              {t('mod.dsa.remove_confirm')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirmRemove(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-fg-muted">{t('mod.dsa.keep_hint')}</p>
      <ErrorBox keys={error} onClose={clearError} />
    </li>
  )
}

function DecidedTable({ notices, data }: { notices: DsaNotice[]; data: TabProps['data'] }) {
  const t = useT()
  const { lang } = useLang()
  if (!notices.length) return <p className="text-sm text-fg-muted">{t('mod.dsa.no_decided')}</p>
  return (
    <table className="w-full table-fixed text-xs card">
      <thead className="text-left text-fg-muted">
        <tr>
          <th scope="col" className="p-2 w-[28%] font-semibold">{t('mod.dsa.col_dates')}</th>
          <th scope="col" className="p-2 w-[32%] font-semibold">{t('mod.dsa.col_report')}</th>
          <th scope="col" className="p-2 font-semibold">{t('mod.dsa.col_decision')}</th>
        </tr>
      </thead>
      <tbody>
        {notices.map((n) => {
          const report = data.reports.find((r) => r.id === n.reportId)
          const venue = report ? data.venueById.get(report.venueId) : undefined
          const removed = n.decision === 'rimossa'
          return (
            <tr key={n.id} className="border-t border-line align-top">
              <td className="p-2 tnum break-words">
                <div>{fmtDate(n.receivedAt, lang)}</div>
                <div className="text-fg-muted">→ {fmtDate(n.decidedAt, lang)}</div>
              </td>
              <td className="p-2 break-words">
                <div className="font-semibold">{venue?.name ?? t('mod.common.venue_unknown')}</div>
                {report && <div className="text-fg-muted">{t(`category.${report.category}`)}</div>}
              </td>
              <td className="p-2 break-words">
                <span className={`chip ${removed ? 'chip-nessuna' : 'chip-risolta'}`}>{t(`mod.dsa.decision.${n.decision ?? 'mantenuta'}`)}</span>
                {n.decisionNote && <div className="text-fg-muted mt-1">{n.decisionNote}</div>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
