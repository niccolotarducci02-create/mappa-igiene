/**
 * Una segnalazione in coda: foto grande con strumento di sfocatura, locale, autore, SLA 24 h, esito del filtro
 * automatico e decisione (conferma e pubblica / archivia con nota). Per le fonti pubbliche (NAS) non c'è foto né sfocatura.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Report, Venue } from '../../domain/types'
import type { ModerationDecision } from '../../domain/stateMachine'
import { MODERATION_SLA_HOURS } from '../../domain/rules'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtRelative } from '../../lib/format'
import { ErrorBox } from '../ui'
import { AiCheckBlock } from './AiCheckBlock'
import { FaceBlurTool } from './FaceBlurTool'
import { SlaChip } from './SlaChip'
import { shortId } from './types'
import { useAsyncAction } from './useAsyncAction'

interface Props {
  report: Report
  venue: Venue | undefined
  reporterCount: number
  moderatorId: string
  nowIso: string
}

export function QueueItem({ report, venue, reporterCount, moderatorId, nowIso }: Props) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [note, setNote] = useState('')
  const { run, busy, error, clearError } = useAsyncAction()

  const isNas = report.source === 'nas' || !report.photo
  // La regola rule.blur_required vale solo per le segnalazioni con foto
  const canPublish = isNas || report.facesBlurred
  const noteOk = note.trim().length > 0
  const decide = (decision: ModerationDecision) => run(() => store.moderateReport(report.id, decision, moderatorId, note.trim() || undefined))
  const noteId = `note-${report.id}`

  return (
    <li className="card overflow-hidden" data-testid="queue-item" data-report-id={report.id}>
      <div className="p-3 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="chip chip-neutral bg-muted text-fg">{t(`category.${report.category}`)}</span>
            {isNas && <span className="chip chip-neutral bg-accent-soft text-fg">{t('source.nas')}</span>}
          </div>
          <SlaChip sinceIso={report.submittedAt} nowIso={nowIso} maxHours={MODERATION_SLA_HOURS} />
        </div>

        <div className="min-w-0">
          <div className="font-semibold leading-tight">
            {venue ? (
              <Link to={`/locale/${venue.id}`} className="underline">
                {venue.name}
              </Link>
            ) : (
              t('mod.common.venue_unknown')
            )}
          </div>
          {venue && (
            <div className="text-xs text-fg-muted">
              {venue.address} · {t(`venue_type.${venue.type}`)}
            </div>
          )}
        </div>

        {isNas ? (
          <div className="rounded-[var(--radius)] border border-line bg-muted p-3 text-sm text-fg-muted">{t('mod.queue.nas_no_blur')}</div>
        ) : (
          <FaceBlurTool report={report} moderatorId={moderatorId} />
        )}

        <p className="text-sm break-words">{report.description}</p>

        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          <li>
            {t('mod.queue.reporter')}: <span className="font-data text-fg">{shortId(report.userId)}</span>
            {' · '}
            <span className="tnum">{reporterCount === 1 ? t('mod.queue.reporter_one') : t('mod.queue.reporter_count', { n: reporterCount })}</span>
          </li>
          {!isNas && <li className="tnum">{t('mod.queue.distance', { n: Math.round(report.distanceM) })}</li>}
          <li className="tnum">{t('mod.queue.submitted', { when: fmtRelative(report.submittedAt, lang, nowIso) })}</li>
        </ul>

        <AiCheckBlock check={report.aiCheck} />
      </div>

      <div className="p-3 border-t border-line bg-muted/40 grid gap-2">
        <div className="field">
          <label htmlFor={noteId}>{t('mod.queue.note_label')}</label>
          <textarea id={noteId} className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mod.queue.note_placeholder')} rows={3} />
          <span className="text-xs text-fg-muted">{t('mod.queue.note_hint')}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-primary" disabled={!canPublish || busy} onClick={() => decide('conferma')}>
            {t('mod.queue.confirm')}
          </button>
          <button type="button" className="btn btn-danger" disabled={!noteOk || busy} onClick={() => decide('archivia')}>
            {t('mod.queue.archive')}
          </button>
        </div>
        <p className="text-xs text-fg-muted">{canPublish ? t('mod.queue.confirm_hint') : t('rule.blur_required')}</p>
        <ErrorBox keys={error} onClose={clearError} />
      </div>
    </li>
  )
}
