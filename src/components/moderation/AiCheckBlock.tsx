/** Esito del filtro automatico sulla foto: verdetto, punteggio, motivi e marcatura "simulato" nella demo. */
import type { AiCheck } from '../../domain/types'
import { useT } from '../../i18n'

const VERDICT_CLASS: Record<AiCheck['verdict'], string> = {
  coerente: 'chip-risolta',
  non_coerente: 'chip-confermata',
  incerta: 'chip-in_verifica',
}

export function AiCheckBlock({ check }: { check: AiCheck | undefined }) {
  const t = useT()
  if (!check) {
    return <div className="rounded-[var(--radius)] border border-line p-3 text-xs text-fg-muted">{t('mod.queue.ai_none')}</div>
  }
  return (
    <div className="rounded-[var(--radius)] border border-line p-3 grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">{t('mod.queue.ai_title')}</span>
        <span className={`chip ${VERDICT_CLASS[check.verdict]}`}>{t(`ai.verdict.${check.verdict}`)}</span>
        <span className="text-sm font-semibold tnum">{t('mod.queue.ai_score', { score: Math.round(check.score * 100) })}</span>
        {check.simulated && <span className="chip chip-neutral bg-muted text-fg-muted">{t('common.simulated')}</span>}
      </div>
      <ul className="text-sm list-disc pl-4">
        {check.reasons.map((r) => (
          <li key={r}>{t(r)}</li>
        ))}
      </ul>
      {check.simulated && <p className="text-xs text-fg-muted">{t('ai.simulated_note')}</p>}
    </div>
  )
}
