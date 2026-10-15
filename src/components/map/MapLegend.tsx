/**
 * Legenda richiudibile in basso a sinistra: i quattro colori dei pin, il punto Premium
 * e la frase della regola 1 (segnalazioni degli utenti, non giudizi dell'app).
 */
import { useState } from 'react'
import { useT } from '../../i18n'
import { STATUS_ORDER } from './MapControls'

export function MapLegend() {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="absolute left-3 bottom-7 z-10">
        <button type="button" className="btn bg-elev border border-line shadow-app" onClick={() => setOpen(true)} aria-expanded={false}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 16v-4M12 8h.01" /><circle cx="12" cy="12" r="9" /></svg>
          {t('map.legend')}
        </button>
      </div>
    )
  }

  return (
    <div className="absolute left-3 bottom-7 z-10 w-[min(320px,calc(100%-1.5rem))]">
      <div className="card shadow-app p-3 text-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <strong className="text-sm">{t('map.legend')}</strong>
          <button type="button" className="btn btn-outline w-11 px-0" onClick={() => setOpen(false)} aria-label={t('map.legend_hide')}>
            ×
          </button>
        </div>
        <ul className="grid gap-2">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-start gap-2">
              <span className="relative inline-block w-[26px] h-[26px] shrink-0 scale-75 origin-top">
                <span className={`pin pin-${s} block`} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong className="text-fg">{t(`status.${s}`)}</strong> <span className="text-fg-muted">{t(`map.legend.${s}`)}</span>
              </div>
            </li>
          ))}
          <li className="flex items-start gap-2">
            <span className="relative inline-block w-[26px] h-[26px] shrink-0 scale-75 origin-top">
              <span className="pin pin-nessuna pin-premium block" aria-hidden="true" />
            </span>
            <span className="text-fg-muted min-w-0">{t('map.legend.premium')}</span>
          </li>
        </ul>
        <p className="mt-2 pt-2 border-t border-line text-fg-muted">{t('map.legend_rule')}</p>
      </div>
    </div>
  )
}
