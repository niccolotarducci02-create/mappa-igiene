/** Esito dell'invio: verdetto del filtro automatico, punteggio, motivi e stato della segnalazione. */
import { Link } from 'react-router-dom'
import type { SubmitReportResult } from '../../data/store'
import { useT } from '../../i18n'
import { KeyValue, Notice, ReportStateChip } from '../ui'

interface Props {
  result: SubmitReportResult
  onRetry: () => void
}

export function ReportResult({ result, onRetry }: Props) {
  const t = useT()
  const { report, aiCheck } = result
  const titleKey = report.state === 'in_verifica' || report.state === 'scartata' ? `report.result.${report.state}` : 'report.result.other'

  return (
    <div className="gutter grid gap-4">
      <div className={`card card-pad grid gap-2 ${report.state === 'scartata' ? 'border-st-confirmed/40' : 'border-st-resolved/40'}`}>
        <ReportStateChip state={report.state} />
        <p className="text-lg font-bold leading-snug">{t(titleKey)}</p>
      </div>

      <section className="card card-pad grid gap-3">
        <h2 className="text-base font-bold">{t('report.result.filter')}</h2>
        <div className="flex gap-3 items-start">
          {report.photo && (
            <img src={report.photo} alt={t('venue.photo_alt', { category: t(`category.${report.category}`) })} className="w-20 h-20 rounded-[var(--radius)] object-cover bg-muted shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <KeyValue
              items={[
                [t('report.result.verdict'), <span key="v" className="font-semibold" data-testid="ai-verdict">{t(`ai.verdict.${aiCheck.verdict}`)}</span>],
                [t('report.result.score'), <span key="s" className="tnum">{Math.round(aiCheck.score * 100)}%</span>],
                [
                  t('report.result.reasons'),
                  <ul key="r" className="list-disc pl-4">
                    {aiCheck.reasons.map((r) => (
                      <li key={r}>{t(r)}</li>
                    ))}
                  </ul>,
                ],
              ]}
            />
          </div>
        </div>
        {aiCheck.simulated && <Notice tone="warn">{t('ai.simulated_note')}</Notice>}
      </section>

      <div className="grid gap-2">
        {report.state === 'scartata' && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {t('report.result.retry')}
          </button>
        )}
        <Link to={`/locale/${report.venueId}`} className={`btn ${report.state === 'scartata' ? 'btn-outline' : 'btn-primary'}`}>
          {t('report.result.go_venue')}
        </Link>
        <Link to="/profilo" className="btn btn-outline">
          {t('report.result.my_reports')}
        </Link>
      </div>
    </div>
  )
}
