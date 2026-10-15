/**
 * "Il percorso di una segnalazione": 11 passi e 2 decisioni come <ol> verticale con linea del tempo.
 * I passi-decisione (filtro automatico, conferma umana) hanno un aspetto distinto e il chip "decisione",
 * con i due rami (sì/no) scritti sotto. I numeri del piano vengono da useLegalVars.
 */
import { useT } from '../../i18n'
import { useLegalVars } from './vars'

interface Step {
  n: number
  decision?: boolean
  final?: boolean
}

const STEPS: Step[] = [
  { n: 1 },
  { n: 2, decision: true },
  { n: 3 },
  { n: 4, decision: true },
  { n: 5 },
  { n: 6 },
  { n: 7 },
  { n: 8 },
  { n: 9 },
  { n: 10 },
  { n: 11, final: true },
]

export function ReportJourney() {
  const t = useT()
  const vars = useLegalVars()

  const bubble = (s: Step) =>
    s.decision
      ? 'bg-elev border-2 border-st-verifying text-st-verifying'
      : s.final
        ? 'bg-st-resolved-soft border-2 border-st-resolved text-st-resolved'
        : 'bg-accent text-accent-fg'

  return (
    <ol className="relative ml-4 border-l-2 border-line pl-6 grid gap-4" aria-label={t('how.journey_title')}>
      {STEPS.map((s) => (
        <li key={s.n} className="relative min-h-[28px]">
          <span
            aria-hidden="true"
            className={`absolute -left-[39px] top-0 w-7 h-7 rounded-full grid place-items-center text-xs font-bold tnum ${bubble(s)}`}
          >
            {s.n}
          </span>
          <div className={`card card-pad ${s.decision ? 'border-st-verifying/50' : s.final ? 'border-st-resolved/50' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className={`${s.decision ? 'font-semibold' : ''} min-w-0 flex-1`}>{t(`how.journey.${s.n}`, vars)}</p>
              {s.decision && <span className="chip chip-in_verifica">{t('how.decision')}</span>}
            </div>
            {s.decision && (
              <ul className="mt-2 grid gap-1 text-sm">
                <li className="flex gap-2">
                  <span aria-hidden="true" className="text-st-resolved font-bold shrink-0">→</span>
                  <span>{t(`how.journey.${s.n}_yes`, vars)}</span>
                </li>
                <li className="flex gap-2 text-fg-muted">
                  <span aria-hidden="true" className="font-bold shrink-0">→</span>
                  <span>{t(`how.journey.${s.n}_no`, vars)}</span>
                </li>
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
