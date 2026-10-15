/**
 * Una segnalazione vista dal titolare: foto, categoria, data, descrizione, stato; sotto, la replica (regola 3),
 * la riga esplicita sulla regola 4 con il link DSA, i preventivi delle ditte e i certificati di intervento.
 */
import { Link } from 'react-router-dom'
import type { Certificate, Company, Lead, Quote, Reply, Report } from '../../domain/types'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { ReportStateChip } from '../ui'
import { ReplyBox } from './ReplyBox'
import { QuotesPanel } from './QuotesPanel'
import { CertificatePanel } from './CertificatePanel'

interface Props {
  report: Report
  replies: Reply[]
  lead: Lead | null
  quotes: Quote[]
  certificates: Certificate[]
  companies: Company[]
  ownerId: string
  nowIso: string
}

export function OwnerReportCard({ report, replies, lead, quotes, certificates, companies, ownerId, nowIso }: Props) {
  const t = useT()
  const { lang } = useLang()
  const isNas = report.source === 'nas'
  const published = report.state === 'pubblicata'
  const acceptedCompanyId = quotes.find((q) => q.accepted)?.companyId

  return (
    <article className="card overflow-hidden" data-testid="owner-report" data-report-id={report.id}>
      {/* Segnalazione */}
      <div className="p-3 grid gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ReportStateChip state={report.state} />
          <span className="chip chip-neutral bg-muted text-fg">{t(`category.${report.category}`)}</span>
          {isNas && <span className="chip chip-neutral bg-accent-soft text-fg">{t('manage.nas_badge')}</span>}
        </div>

        {!isNas && report.photo && (
          <img
            src={report.photo}
            alt={t('manage.photo_alt', { category: t(`category.${report.category}`) })}
            className="w-full max-h-[60vw] object-cover rounded-[var(--radius)] bg-muted"
            loading="lazy"
          />
        )}

        <p className="text-sm">{report.description}</p>

        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted tnum">
          <li>{t('manage.published_on', { date: fmtDate(report.publishedAt, lang, true) })}</li>
          {report.resolvedAt && <li>{t('manage.resolved_on', { date: fmtDate(report.resolvedAt, lang, true) })}</li>}
        </ul>
      </div>

      {/* Replica (regola 3) */}
      <div className="px-3 pb-3">
        <ReplyBox report={report} replies={replies} authorId={ownerId} nowIso={nowIso} />
      </div>

      {/* Regola 4, esplicita */}
      <div className="px-3 py-2 border-t border-line text-xs text-fg-muted grid gap-1">
        <p>{t('manage.rule4_line')}</p>
        <Link to={`/dsa/${report.id}`} className="inline-flex items-center min-h-[44px] underline font-semibold text-fg">
          {t('manage.rule4_dsa_link')}
        </Link>
      </div>

      {/* Preventivi: solo per le segnalazioni pubblicate e non ancora risolte */}
      {published && (
        <div className="p-3 border-t border-line">
          <QuotesPanel report={report} lead={lead} quotes={quotes} companies={companies} ownerId={ownerId} nowIso={nowIso} />
        </div>
      )}

      {/* Certificati: modulo di caricamento solo se pubblicata; l'elenco sempre */}
      {(published || certificates.length > 0) && (
        <div className="p-3 border-t border-line">
          <CertificatePanel report={report} certificates={certificates} companies={companies} defaultCompanyId={acceptedCompanyId} uploaderId={ownerId} />
        </div>
      )}
    </article>
  )
}
