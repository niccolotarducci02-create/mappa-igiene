/**
 * Una segnalazione pubblicata con, accanto, la replica del locale (regola 3).
 * Su schermi stretti la replica sta sotto la segnalazione, nella stessa scheda; da "sm" in su è a fianco.
 */
import { Link } from 'react-router-dom'
import type { Certificate, Company, NasNotice, Reply, Report, Venue } from '../../domain/types'
import { isDefinitive, replyHoursLeft } from '../../domain/stateMachine'
import { useStoreData } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtHours } from '../../lib/format'
import { Notice, ReportStateChip } from '../ui'

interface Props {
  report: Report
  replies: Reply[]
  certificates: Certificate[]
  companies: Company[]
  notice?: NasNotice
  nowIso: string
  /** Il locale della segnalazione; se non viene passato, la scheda lo carica dallo store. */
  venue?: Venue
}

export function ReportCard({ report, replies, certificates, companies, notice, nowIso, venue }: Props) {
  const t = useT()
  const { lang } = useLang()
  const isNas = report.source === 'nas'
  const hoursLeft = replyHoursLeft(report, nowIso)
  const definitive = isDefinitive(report, nowIso)
  // L'avviso dei 7 giorni arriva solo a chi ha rivendicato la scheda (termini, diritto di replica):
  // per un locale mai rivendicato "nessuna replica" non va presentato come una scelta del titolare.
  const venueQ = useStoreData(async (s) => venue ?? (await s.getVenue(report.venueId)), [venue, report.venueId])
  const unclaimed = venueQ.data !== null && !venueQ.data?.claimedBy
  const verifiedCert = certificates.find((c) => c.verifiedAt)
  const pendingCert = certificates.find((c) => !c.verifiedAt && !c.rejectedAt)
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? t('venue.company_unknown')

  return (
    <article className="card overflow-hidden" data-testid="venue-report" data-report-id={report.id}>
      <div className="grid sm:grid-cols-2">
        {/* Segnalazione */}
        <div className="p-3 grid gap-2 content-start">
          <div className="flex flex-wrap items-center gap-1.5">
            <ReportStateChip state={report.state} />
            <span className="chip chip-neutral bg-muted text-fg">{t(`category.${report.category}`)}</span>
            {isNas && <span className="chip chip-neutral bg-accent-soft text-fg">{t('venue.nas_badge')}</span>}
          </div>

          {!isNas && report.photo && (
            <img
              src={report.photo}
              alt={t('venue.photo_alt', { category: t(`category.${report.category}`) })}
              className="w-full max-h-[60vw] object-cover rounded-[var(--radius)] bg-muted"
              loading="lazy"
            />
          )}

          {isNas && (
            <div className="rounded-[var(--radius)] border border-line bg-muted p-3 text-sm grid gap-1">
              <div className="text-xs text-fg-muted">{t('venue.nas_imported')}</div>
              {notice && (
                <>
                  <p>{notice.summary}</p>
                  <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all inline-flex items-center min-h-[44px]">
                    {t('venue.nas_source')}
                  </a>
                </>
              )}
            </div>
          )}

          <p className="text-sm">{report.description}</p>

          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            <li className="tnum">{t('venue.published_on', { date: fmtDate(report.publishedAt, lang, true) })}</li>
            {!isNas && <li className="tnum">{t('venue.distance', { n: Math.round(report.distanceM) })}</li>}
            {!isNas && (
              <li>
                <span className="chip chip-neutral bg-st-resolved-soft text-st-resolved">{t('venue.verified_user')}</span>
              </li>
            )}
            {!isNas && report.photo && report.facesBlurred && <li>{t('venue.faces_blurred')}</li>}
          </ul>
        </div>

        {/* Replica del locale, sempre accanto alla segnalazione */}
        <aside className="p-3 border-t sm:border-t-0 sm:border-l border-line bg-accent-soft/40 grid gap-2 content-start" aria-label={t('venue.reply_title')}>
          <h3 className="text-sm font-bold">{t('venue.reply_title')}</h3>
          {replies.length > 0 ? (
            replies.map((r) => (
              <div key={r.id} className="text-sm grid gap-0.5">
                <div className="text-xs text-fg-muted tnum">{fmtDate(r.createdAt, lang, true)}</div>
                <p>{r.text}</p>
              </div>
            ))
          ) : hoursLeft !== null && hoursLeft > 0 ? (
            <p className="text-sm text-fg-muted">{t('venue.reply_pending', { time: fmtHours(hoursLeft, lang) })}</p>
          ) : definitive && unclaimed ? (
            <div className="text-sm text-fg-muted grid gap-0.5">
              <p>{t('venue.reply_none_unclaimed')}</p>
              <Link to={`/locale/${report.venueId}/gestisci`} className="text-accent underline inline-flex items-center min-h-[44px]">
                {t('venue.reply_unclaimed_link')}
              </Link>
            </div>
          ) : definitive ? (
            <p className="text-sm text-fg-muted">{t('venue.reply_none_definitive')}</p>
          ) : (
            <p className="text-sm text-fg-muted">{t('venue.reply_none')}</p>
          )}

          {report.state === 'risolta' && verifiedCert && (
            <Notice tone="ok">
              <strong className="block">{t('venue.certificate_title')}</strong>
              <span className="block mt-0.5">
                {t('venue.certificate_line', {
                  intervention: verifiedCert.interventionType,
                  company: companyName(verifiedCert.companyId),
                  date: fmtDate(verifiedCert.verifiedAt, lang),
                })}
              </span>
            </Notice>
          )}
          {report.state === 'pubblicata' && pendingCert && <Notice tone="info">{t('venue.certificate_pending')}</Notice>}
        </aside>
      </div>

      <div className="px-3 border-t border-line text-xs flex">
        <Link to={`/dsa/${report.id}`} className="text-fg-muted underline inline-flex items-center min-h-[44px]">
          {t('venue.dsa_link')}
        </Link>
      </div>
    </article>
  )
}
