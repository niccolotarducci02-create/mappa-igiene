/**
 * Pagina iniziale: mappa di Firenze con i pin colorati per stato, ricerca, filtri, elenco e legenda.
 * I dati arrivano solo dallo store (listVenues); i filtri per stato e tipo sono applicati qui
 * per poter mostrare i conteggi di ogni stato.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { VenueStatus } from '../domain/types'
import { useT } from '../i18n'
import { useStore, useStoreData } from '../data/StoreContext'
import { ErrorBox, Notice, Spinner } from '../components/ui'
import { LeafletMap } from '../components/map/LeafletMap'
import type { BasemapMode } from '../lib/basemap'
import { MapControls, type MapView, type StatusFilter, type TypeFilter } from '../components/map/MapControls'
import { MapLegend } from '../components/map/MapLegend'
import { SelectedVenueSheet } from '../components/map/SelectedVenueSheet'
import { VenueList } from '../components/map/VenueList'

const EMPTY_COUNTS: Record<VenueStatus, number> = { nessuna: 0, in_verifica: 0, confermata: 0, risolta: 0 }

export default function MapPage() {
  const t = useT()
  const store = useStore()
  const [q, setQ] = useState('')
  const deferredQ = useDeferredValue(q)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [type, setType] = useState<TypeFilter>('all')
  const [view, setView] = useState<MapView>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [flyRequest, setFlyRequest] = useState(0)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState(false)
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('tiles')

  const venuesQ = useStoreData((s) => s.listVenues({ q: deferredQ.trim() || undefined }), [deferredQ])
  const all = venuesQ.data
  // "Adesso" ricalcolato quando cambiano i dati: serve solo per sapere se il Premium è attivo
  const nowIso = useMemo(() => new Date().toISOString(), [all])

  const byType = useMemo(() => (all ? (type === 'all' ? all : all.filter((v) => v.type === type)) : []), [all, type])
  const counts = useMemo(() => {
    const c = { ...EMPTY_COUNTS }
    for (const v of byType) c[v.status] += 1
    return c
  }, [byType])
  const filtered = useMemo(() => (status === 'all' ? byType : byType.filter((v) => v.status === status)), [byType, status])
  const selected = useMemo(() => (selectedId ? filtered.find((v) => v.id === selectedId) ?? null : null), [filtered, selectedId])

  // Se il locale selezionato esce dai filtri, il riquadro si chiude da solo
  useEffect(() => {
    if (selectedId && !filtered.some((v) => v.id === selectedId)) setSelectedId(null)
  }, [filtered, selectedId])

  const locate = () => {
    setGeoError(false)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(true)
      return
    }
    setLocating(true)
    // Il timeout del browser parte solo dopo il consenso: se la richiesta resta senza risposta
    // (permesso mai dato, iframe senza geolocalizzazione) un timer nostro sblocca il pulsante.
    let done = false
    const giveUp = window.setTimeout(() => {
      if (done) return
      done = true
      setLocating(false)
      setGeoError(true)
    }, 10_000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return
        done = true
        window.clearTimeout(giveUp)
        setLocating(false)
        setUserPos([pos.coords.latitude, pos.coords.longitude])
        setFlyRequest((n) => n + 1)
      },
      () => {
        if (done) return
        done = true
        window.clearTimeout(giveUp)
        setLocating(false)
        setGeoError(true)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* Titolo della pagina solo per le tecnologie assistive: la mappa non ha un titolo visibile */}
      <h1 className="sr-only">{t('map.map_label')}</h1>
      <MapControls
        q={q}
        onQ={setQ}
        status={status}
        onStatus={setStatus}
        counts={counts}
        total={byType.length}
        type={type}
        onType={setType}
        view={view}
        onView={setView}
      />
      {store.mode === 'demo' && (
        <div className="gutter py-1 text-[11px] leading-tight text-center bg-st-verifying-soft text-st-verifying">
          {t('app.demo_banner')}
          {basemapMode === 'schematic' && <span> · {t('map.schematic_note')}</span>}
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <LeafletMap venues={filtered} selectedId={selectedId} onSelect={setSelectedId} userPos={userPos} flyToUser={flyRequest} nowIso={nowIso} onBasemapMode={setBasemapMode} />

        {(venuesQ.error || geoError) && (
          <div className="absolute top-2 inset-x-3 z-20 grid gap-2">
            {venuesQ.error && <ErrorBox keys={[venuesQ.error]} />}
            {geoError && (
              <Notice tone="warn">
                <div className="flex items-start gap-2">
                  <span className="flex-1">{t('map.position_unavailable')}</span>
                  <button type="button" className="font-semibold min-w-[44px] min-h-[24px] -my-1" onClick={() => setGeoError(false)} aria-label={t('common.close')}>
                    ×
                  </button>
                </div>
              </Notice>
            )}
          </div>
        )}

        <MapLegend />

        <button
          type="button"
          className="absolute right-3 bottom-7 z-10 btn bg-elev border border-line shadow-app w-11 px-0"
          onClick={locate}
          disabled={locating}
          aria-label={t('map.my_position')}
          title={t('map.my_position')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="8" />
          </svg>
        </button>

        {selected && view === 'map' && <SelectedVenueSheet venue={selected} onClose={() => setSelectedId(null)} />}

        {view === 'list' && <VenueList venues={filtered} userPos={userPos} />}

        {venuesQ.loading && !all && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-bg/60">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  )
}
