/**
 * Scheda di una mia segnalazione nel profilo: foto, locale, categoria, stato, esito del filtro, nota della moderazione
 * e, per le segnalazioni pubblicate o risolte, la replica del locale accanto alla segnalazione (regola 3).
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Report, Venue } from '../../domain/types'
import { isDefinitive, replyHoursLeft } from '../../domain/stateMachine'
import { useStoreData } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtHours, fmtRelative } from '../../lib/format'
import { ReportStateChip, Spinner } from '../ui'

export function ProfileReportCard({ report, venue }: { report: Report; venue: Venue | undefined }) {
  const t = useT()
  const { lang } = useLang()
  const categoryLabel = t(`category.${report.category}`)
  const showReply = report.state === 'pubblicata' || report.state === 'risolta'
  return (
    <li className="card card-pad grid gap-2" data-testid="profile-report" data-report-id={report.id}>
      <div className="flex gap-3 items-start">
        {report.photo ? (
          <img
            src={report.photo}
            alt={t('venue.photo_alt', { category: categoryLabel })}
            className="w-16 h-16 rounded-[var(--radius)] object-cover bg-muted shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-[var(--radius)] bg-muted shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1 grid gap-1">
          <div className="font-semibold leading-tight">{venue?.name ?? t('profile.unknown_venue')}</div>
          <div className="text-sm text-fg-muted">
            {categoryLabel} · <span className="tnum">{fmtRelative(report.submittedAt, lang)}</span>
            {report.captureMode === 'file_demo' && <span> · {t('profile.photo_mode.file_demo')}</span>}
          </div>
          <div>
            <ReportStateChip state={report.state} />
          </div>
        </div>
      </div>
      {report.description && <p className="text-sm break-words">{report.description}</p>}
      {report.aiCheck && (
        <p className="text-xs text-fg-muted tnum">
          {t('profile.ai_line', { verdict: t(`ai.verdict.${report.aiCheck.verdict}`), score: Math.round(report.aiCheck.score * 100) })}
          {report.aiCheck.simulated && <span> · {t('common.simulated')}</span>}
        </p>
      )}
      {report.state === 'archiviata' && report.moderationNote && (
        <div className="rounded-[var(--radius)] bg-muted p-3 text-sm">
          <div className="eyebrow mb-1">{t('profile.moderation_note')}</div>
          {report.moderationNote}
        </div>
      )}
      {showReply && <ProfileReplyAside report={report} />}
      {venue && (
        <Link to={`/locale/${venue.id}`} className="btn btn-outline btn-sm justify-self-start">
          {t('profile.open_venue')} ›
        </Link>
      )}
    </li>
  )
}

/** Replica del locale accanto alla segnalazione pubblicata: stesse regole e testi della scheda pubblica (venue/ReportCard). */
function ProfileReplyAside({ report }: { report: Report }) {
  const t = useT()
  const { lang } = useLang()
  const replies = useStoreData((s) => s.listReplies(report.id), [report.id])
  const nowIso = useMemo(() => new Date().toISOString(), [replies.data])
  const hoursLeft = replyHoursLeft(report, nowIso)
  const definitive = isDefinitive(report, nowIso)

  return (
    <aside
      className="rounded-[var(--radius)] border border-line bg-accent-soft/40 p-3 grid gap-2"
      aria-label={t('venue.reply_title')}
      data-testid="profile-report-reply"
    >
      <h3 className="text-sm font-bold">{t('venue.reply_title')}</h3>
      {replies.loading && !replies.data ? (
        <Spinner />
      ) : replies.data && replies.data.length > 0 ? (
        replies.data.map((r) => (
          <div key={r.id} className="text-sm grid gap-0.5">
            <div className="text-xs text-fg-muted tnum">{fmtDate(r.createdAt, lang, true)}</div>
            <p className="break-words">{r.text}</p>
          </div>
        ))
      ) : hoursLeft !== null && hoursLeft > 0 ? (
        <p className="text-sm text-fg-muted">{t('venue.reply_pending', { time: fmtHours(hoursLeft, lang) })}</p>
      ) : definitive ? (
        <p className="text-sm text-fg-muted">{t('venue.reply_none_definitive')}</p>
      ) : (
        <p className="text-sm text-fg-muted">{t('venue.reply_none')}</p>
      )}
    </aside>
  )
}
