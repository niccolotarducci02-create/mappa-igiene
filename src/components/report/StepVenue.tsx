/** Passo 1: scelta del locale. Locali vicini (GPS) oppure ricerca per nome o via. */
import { useEffect, useState } from 'react'
import type { Venue } from '../../domain/types'
import { useStoreData } from '../../data/StoreContext'
import { useT } from '../../i18n'
import { fmtDistance } from '../../lib/format'
import { Notice, StatusChip } from '../ui'
import type { Geolocation } from './useGeolocation'

interface Props {
  selected: Venue | null
  preselected: boolean
  onSelect: (v: Venue | null) => void
  geo: Geolocation
}

export function StepVenue({ selected, preselected, onSelect, geo }: Props) {
  const t = useT()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')

  // Al primo ingresso senza locale scelto proviamo subito il GPS
  useEffect(() => {
    if (!selected && geo.status === 'idle') geo.locate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Piccolo ritardo sulla ricerca per non interrogare lo store a ogni tasto
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 250)
    return () => window.clearTimeout(id)
  }, [q])

  const nearby = useStoreData(
    (s) => (geo.fix ? s.nearestVenues(geo.fix.lat, geo.fix.lng, 8) : Promise.resolve([])),
    [geo.fix?.lat, geo.fix?.lng],
  )
  const results = useStoreData(
    (s) => (debounced.length >= 2 ? s.listVenues({ q: debounced }) : Promise.resolve<Venue[]>([])),
    [debounced],
  )

  if (selected) {
    return (
      <div className="card card-pad grid gap-3">
        <div className="eyebrow">{preselected ? t('report.venue.preselected') : t('report.venue.selected')}</div>
        <VenueRow venue={selected} />
        <button type="button" className="btn btn-outline" onClick={() => onSelect(null)}>
          {t('report.venue.change')}
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h2 className="text-base font-bold">{t('report.venue.nearby')}</h2>
        {geo.status === 'locating' && (
          <div className="card card-pad text-sm text-fg-muted" role="status">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-line border-t-accent animate-spin align-middle mr-2" />
            {t('report.venue.locating')}
          </div>
        )}
        {(geo.status === 'error' || geo.status === 'idle') && (
          <Notice tone="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t('report.venue.geo_failed')}</span>
              <button type="button" className="btn btn-sm btn-outline" onClick={geo.locate}>
                {t('report.venue.use_location')}
              </button>
            </div>
          </Notice>
        )}
        {geo.status === 'ok' && (
          <ul className="grid gap-2">
            {nearby.data?.map((v) => (
              <li key={v.id}>
                <VenueButton venue={v} distanceM={v.distanceM} onClick={() => onSelect(v)} label={t('report.venue.select')} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <div className="field">
          <label htmlFor="venue-search">{t('report.venue.search_label')}</label>
          <input
            id="venue-search"
            className="input"
            type="search"
            autoComplete="off"
            placeholder={t('report.venue.search_placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {debounced.length < 2 && <p className="text-xs text-fg-muted">{t('report.venue.search_hint')}</p>}
        {debounced.length >= 2 && results.data && results.data.length === 0 && !results.loading && (
          <p className="text-sm text-fg-muted">{t('report.venue.no_results')}</p>
        )}
        <ul className="grid gap-2">
          {results.data?.map((v) => (
            <li key={v.id}>
              <VenueButton venue={v} onClick={() => onSelect(v)} label={t('report.venue.select')} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function VenueRow({ venue, distanceM }: { venue: Venue; distanceM?: number }) {
  const t = useT()
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">{venue.name}</div>
        <div className="text-sm text-fg-muted">
          {t(`venue_type.${venue.type}`)} · {venue.address}
          {distanceM !== undefined && <span className="tnum"> · {fmtDistance(distanceM)}</span>}
        </div>
      </div>
      <StatusChip status={venue.status} short />
    </div>
  )
}

function VenueButton({ venue, distanceM, onClick, label }: { venue: Venue; distanceM?: number; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="card card-pad w-full text-left hover:bg-muted flex items-center gap-3 min-h-[44px]" aria-label={`${label}: ${venue.name}`}>
      <div className="flex-1 min-w-0">
        <VenueRow venue={venue} distanceM={distanceM} />
      </div>
      <span className="text-accent font-semibold text-sm shrink-0">{label} ›</span>
    </button>
  )
}
