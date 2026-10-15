/**
 * Scheda "Rimozioni": solo la moderazione rimuove, solo per i motivi ammessi (mai "pagamento"), e ogni rimozione
 * finisce nel registro pubblico (/trasparenza) con locale, motivo e chi l'ha chiesta. Regola 4.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Removal, RemovalRequester, Reply, Report, Venue } from '../../domain/types'
import { REMOVAL_REASONS, type RemovalReason } from '../../domain/rules'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { EmptyState, ErrorBox, Notice } from '../ui'
import { ReportSummary } from './ReportSummary'
import type { TabProps } from './types'
import { useAsyncAction } from './useAsyncAction'

const REQUESTERS: RemovalRequester[] = ['locale', 'moderazione', 'dsa', 'utente']

export function RemovalsTab({ data, profile }: TabProps) {
  const t = useT()
  const [openId, setOpenId] = useState<string | null>(null)
  const candidates = data.reports.filter((r) => r.state === 'pubblicata' || r.state === 'risolta')

  return (
    <div className="grid gap-5">
      <Notice tone="info">
        <p>{t('mod.removals.intro')}</p>
        <Link to="/trasparenza" className="underline font-semibold inline-flex items-center min-h-[44px]">
          {t('mod.removals.registry_link')} ›
        </Link>
      </Notice>

      <section className="grid gap-2">
        <h3 className="font-bold">
          {t('mod.removals.candidates')} <span className="text-fg-muted font-normal tnum">({candidates.length})</span>
        </h3>
        {candidates.length === 0 ? (
          <EmptyState title={t('mod.removals.empty')} body={t('mod.removals.empty_body')} />
        ) : (
          <ul className="grid gap-3">
            {candidates.map((r) => (
              <RemovalCandidate
                key={r.id}
                report={r}
                venue={data.venueById.get(r.venueId)}
                replies={data.repliesByReport.get(r.id) ?? []}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                moderatorId={profile.id}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-bold">
          {t('mod.removals.registry_title')} <span className="text-fg-muted font-normal tnum">({data.removals.length})</span>
        </h3>
        <RemovalsRegistry removals={data.removals} />
      </section>
    </div>
  )
}

interface CandidateProps {
  report: Report
  venue: Venue | undefined
  replies: Reply[]
  open: boolean
  onToggle: () => void
  moderatorId: string
}

function RemovalCandidate({ report, venue, replies, open, onToggle, moderatorId }: CandidateProps) {
  const t = useT()
  const store = useStore()
  const [reason, setReason] = useState<RemovalReason>(REMOVAL_REASONS[0])
  const [requestedBy, setRequestedBy] = useState<RemovalRequester>('moderazione')
  const [confirming, setConfirming] = useState(false)
  const { run, busy, error, clearError } = useAsyncAction()

  const close = () => {
    setConfirming(false)
    onToggle()
  }
  const remove = () => run(() => store.removeReport(report.id, reason, requestedBy, moderatorId))

  return (
    <li className="card card-pad grid gap-3">
      <ReportSummary report={report} venue={venue} replies={replies} />
      {!open ? (
        <button type="button" className="btn btn-outline justify-self-start" onClick={onToggle}>
          {t('mod.removals.remove')}
        </button>
      ) : (
        <div className="grid gap-3 border-t border-line pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="field">
              <label htmlFor={`reason-${report.id}`}>{t('mod.removals.reason')}</label>
              <select id={`reason-${report.id}`} className="select" value={reason} onChange={(e) => setReason(e.target.value as RemovalReason)}>
                {REMOVAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`removal.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`by-${report.id}`}>{t('mod.removals.requested_by')}</label>
              <select id={`by-${report.id}`} className="select" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value as RemovalRequester)}>
                {REQUESTERS.map((x) => (
                  <option key={x} value={x}>
                    {t(`requester.${x}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!confirming ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirming(true)}>
                {t('mod.removals.remove')}
              </button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={close}>
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <div className="grid gap-2">
              <Notice tone="danger">
                <p>{t('mod.removals.confirm_hint', { reason: t(`removal.${reason}`), by: t(`requester.${requestedBy}`) })}</p>
              </Notice>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
                  {t('mod.removals.confirm')}
                </button>
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirming(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
          <ErrorBox keys={error} onClose={clearError} />
        </div>
      )}
    </li>
  )
}

function RemovalsRegistry({ removals }: { removals: Removal[] }) {
  const t = useT()
  const { lang } = useLang()
  if (!removals.length) return <p className="text-sm text-fg-muted">{t('mod.removals.registry_empty')}</p>
  return (
    <ul className="card divide-y divide-line">
      {removals.map((rm) => (
        <li key={rm.id} className="p-3 grid gap-1 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{rm.venueName}</span>
            <span className="chip chip-neutral bg-muted text-fg">{t(`removal.${rm.reason}`)}</span>
          </div>
          <div className="text-xs text-fg-muted">
            {t('mod.removals.requested_by')}: {t(`requester.${rm.requestedBy}`)}
          </div>
          <div className="text-xs text-fg-muted tnum">{t('mod.removals.dates', { p: fmtDate(rm.publishedAt, lang), r: fmtDate(rm.removedAt, lang) })}</div>
        </li>
      ))}
    </ul>
  )
}
