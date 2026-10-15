/** Come si calcola lo stato del locale, in parole semplici (confermata > in verifica > risolta > nessuna). */
import type { VenueStatus } from '../../domain/types'
import { useT } from '../../i18n'

const PRIORITY: VenueStatus[] = ['confermata', 'in_verifica', 'risolta', 'nessuna']

export function StatusSource() {
  const t = useT()
  return (
    <div className="card card-pad text-sm grid gap-2">
      <p>{t('venue.source.intro')}</p>
      <ol className="grid gap-1.5">
        {PRIORITY.map((s, i) => (
          <li key={s} className="flex items-start gap-2">
            <span className="tnum text-fg-muted w-4 shrink-0">{i + 1}.</span>
            <span className={`chip chip-${s} shrink-0`}>{t(`status.short.${s}`)}</span>
            <span className="text-fg-muted">{t(`venue.source.${s}`)}</span>
          </li>
        ))}
      </ol>
      <p className="text-fg-muted">{t('venue.source.excluded')}</p>
      <p className="pt-2 border-t border-line">{t('venue.source.rule')}</p>
    </div>
  )
}
