/**
 * Riquadro in basso sulla mappa con il locale selezionato: nome, indirizzo, stato e due azioni.
 * È l'unica superficie di dettaglio sulla mappa (il pin non apre popup). Si chiude con Escape;
 * all'apertura il focus va al titolo e alla chiusura torna all'elemento che l'aveva aperto.
 */
import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { Venue } from '../../domain/types'
import { useT } from '../../i18n'
import { StatusChip } from '../ui'

export function SelectedVenueSheet({ venue, onClose }: { venue: Venue; onClose: () => void }) {
  const t = useT()
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Focus al titolo all'apertura; alla chiusura torna a chi ha aperto il riquadro (il pin o la riga).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    titleRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // Escape chiude il riquadro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 gutter pb-3" role="region" aria-labelledby={titleId}>
      <div className="card shadow-app p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{t(`venue_type.${venue.type}`)}</div>
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className="font-bold text-base leading-tight outline-none">
              {venue.name}
            </h2>
            <p className="text-sm text-fg-muted">{venue.address}</p>
            <div className="mt-1.5">
              <StatusChip status={venue.status} />
            </div>
          </div>
          <button type="button" className="btn btn-outline w-11 px-0 shrink-0" onClick={onClose} aria-label={t('map.close_selection')}>
            ×
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link className="btn btn-primary" to={`/locale/${venue.id}`}>
            {t('map.open_sheet')}
          </Link>
          <Link className="btn btn-outline" to={`/segnala/${venue.id}`}>
            {t('map.report_here')}
          </Link>
        </div>
      </div>
    </div>
  )
}
