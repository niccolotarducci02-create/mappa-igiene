/**
 * Vista a elenco (alternativa alla mappa): i locali filtrati come schede.
 * Regola 1 (mai una lista nera): l'elenco non classifica i locali per stato. È ordinato per
 * distanza dall'utente quando la posizione è nota, altrimenti per nome; lo stato resta un chip
 * informativo su ogni riga e i filtri per stato restano disponibili nella barra dei controlli.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Venue } from '../../domain/types'
import { distanceMeters } from '../../domain/geo'
import { useT } from '../../i18n'
import { EmptyState, StatusChip } from '../ui'

/** Ordine neutro: per distanza dall'utente se nota, altrimenti alfabetico. Mai per gravità. */
export function sortVenues(venues: Venue[], userPos: [number, number] | null | undefined): Venue[] {
  if (userPos) {
    const [lat, lng] = userPos
    const dist = new Map(venues.map((v) => [v.id, distanceMeters(lat, lng, v.lat, v.lng)]))
    return [...venues].sort((a, b) => (dist.get(a.id) ?? 0) - (dist.get(b.id) ?? 0) || a.name.localeCompare(b.name))
  }
  return [...venues].sort((a, b) => a.name.localeCompare(b.name))
}

export function VenueList({ venues, userPos }: { venues: Venue[]; userPos?: [number, number] | null }) {
  const t = useT()
  const sorted = useMemo(() => sortVenues(venues, userPos), [venues, userPos])

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-bg">
      <div className="gutter py-3">
        <p className="text-xs text-fg-muted mb-2">
          <span className="tnum font-semibold text-fg">{sorted.length === 1 ? t('map.one_venue') : t('map.n_venues', { n: sorted.length })}</span> ·{' '}
          {userPos ? t('map.sorted_hint_distance') : t('map.sorted_hint')}
        </p>
        {sorted.length === 0 ? (
          <EmptyState title={t('map.no_results')} body={t('map.no_results_hint')} />
        ) : (
          <ul className="grid gap-2">
            {sorted.map((v) => (
              <li key={v.id}>
                <Link to={`/locale/${v.id}`} className="card p-3 flex items-center gap-3 min-h-[44px] hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight">{v.name}</div>
                    <div className="text-xs text-fg-muted mt-0.5">
                      {t(`venue_type.${v.type}`)} · {v.address}
                    </div>
                  </div>
                  <StatusChip status={v.status} short />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
