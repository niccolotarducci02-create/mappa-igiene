/**
 * Riassunto compatto di una segnalazione (foto, locale, categoria, stato, descrizione) con la replica del locale
 * accanto, come ovunque viene mostrata una segnalazione (regola 3): usato da certificati, DSA e rimozioni.
 */
import { Link } from 'react-router-dom'
import type { Reply, Report, Venue } from '../../domain/types'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { ReportStateChip } from '../ui'

interface Props {
  report: Report
  venue: Venue | undefined
  /** Repliche del locale a questa segnalazione; se omesse il blocco della replica non viene mostrato */
  replies?: Reply[]
}

export function ReportSummary({ report, venue, replies }: Props) {
  const t = useT()
  const { lang } = useLang()
  return (
    <div className="grid gap-2">
      <div className="flex gap-3 items-start">
        {report.photo ? (
          <img
            src={report.photo}
            alt={t('venue.photo_alt', { category: t(`category.${report.category}`) })}
            className="w-16 h-16 rounded-[var(--radius)] object-cover bg-muted shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-16 h-16 rounded-[var(--radius)] bg-accent-soft shrink-0 grid place-items-center text-[10px] leading-tight text-center text-fg-muted px-1" aria-hidden="true">
            {t('mod.common.nas_short')}
          </div>
        )}
        <div className="min-w-0 flex-1 grid gap-1">
          <div className="font-semibold leading-tight">
            {venue ? (
              <Link to={`/locale/${venue.id}`} className="underline">
                {venue.name}
              </Link>
            ) : (
              t('mod.common.venue_unknown')
            )}
          </div>
          <div className="text-sm text-fg-muted">
            {t(`category.${report.category}`)} · <span className="tnum">{fmtDate(report.publishedAt ?? report.submittedAt, lang, true)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ReportStateChip state={report.state} />
            {report.source === 'nas' && <span className="chip chip-neutral bg-accent-soft text-fg">{t('source.nas')}</span>}
          </div>
          {report.description && <p className="text-sm break-words">{report.description}</p>}
        </div>
      </div>
      {replies && (
        <aside className="rounded-[var(--radius)] border border-line bg-accent-soft/40 p-3 grid gap-2 text-sm" aria-label={t('mod.common.reply_title')}>
          <h4 className="text-xs font-bold">{t('mod.common.reply_title')}</h4>
          {replies.length > 0 ? (
            replies.map((r) => (
              <div key={r.id} className="grid gap-0.5">
                <div className="text-xs text-fg-muted tnum">{fmtDate(r.createdAt, lang, true)}</div>
                <p className="break-words">{r.text}</p>
              </div>
            ))
          ) : (
            <p className="text-fg-muted">{t('mod.common.reply_none')}</p>
          )}
        </aside>
      )}
    </div>
  )
}
