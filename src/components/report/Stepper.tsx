/** Intestazione del flusso: "Passo n di 5", nome del passo e barra a segmenti. */
import { useT } from '../../i18n'
import { REPORT_STEPS } from './types'

const STEP_KEYS = ['report.step.venue', 'report.step.photo', 'report.step.what', 'report.step.position', 'report.step.review']

export function Stepper({ step }: { step: number }) {
  const t = useT()
  return (
    <div className="gutter pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="eyebrow tnum">
          {t('report.step')} {t('common.n_of_m', { n: step, m: REPORT_STEPS })}
        </div>
        <div className="text-sm font-semibold">{t(STEP_KEYS[step - 1])}</div>
      </div>
      <ol className="mt-2 grid grid-cols-5 gap-1" aria-label={`${t('report.step')} ${t('common.n_of_m', { n: step, m: REPORT_STEPS })}`}>
        {STEP_KEYS.map((k, i) => (
          <li key={k} aria-current={i + 1 === step ? 'step' : undefined} className={`h-1.5 rounded-full ${i + 1 <= step ? 'bg-accent' : 'bg-muted'}`}>
            {/* Il segmento è solo colore: il nome del passo resta disponibile agli screen reader */}
            <span className="sr-only">
              {t('common.n_of_m', { n: i + 1, m: REPORT_STEPS })} · {t(k)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
