/**
 * Mappa Leaflet con i pin dei locali.
 * La mappa viene creata una volta sola (ref); i marker vivono in un layer group e sono aggiornati
 * per id, così cambiare filtri o dati non fa sfarfallare i pin già presenti.
 * Il pin non apre popup: il dettaglio e le azioni stanno solo nel riquadro in basso (SelectedVenueSheet).
 */
import { useEffect, useRef } from 'react'
import { isPremiumActive } from '../../domain/stateMachine'
import L from 'leaflet'
import type { Venue, VenueStatus } from '../../domain/types'
import { FLORENCE_CENTER, FLORENCE_ZOOM } from '../../domain/rules'
import { useT } from '../../i18n'
import { createBasemap, type BasemapHandle, type BasemapMode } from '../../lib/basemap'

export interface LeafletMapProps {
  venues: Venue[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Posizione dell'utente (lat, lng) se concessa dal browser */
  userPos: [number, number] | null
  /** Contatore: ogni incremento chiede alla mappa di centrarsi sulla posizione utente */
  flyToUser: number
  nowIso: string
  /** Avvisa quando la mappa di base passa dai tile OpenStreetMap alla schematica incorporata */
  onBasemapMode?: (mode: BasemapMode) => void
}

/** Premium attivo: definizione unica in src/domain (non riguarda l'igiene, cambia solo l'anello del pin). */
export { isPremiumActive }

/** Area di tocco di 44×44 px (il pin disegnato resta 26×26, appoggiato in basso al centro). */
const HIT = 44
const PIN = 26

function pinIcon(status: VenueStatus, premium: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${HIT}px;height:${HIT}px"><div class="pin pin-${status}${premium ? ' pin-premium' : ''}" style="position:absolute;left:${(HIT - PIN) / 2}px;top:${HIT - PIN}px"></div></div>`,
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT],
  })
}

/** I pin con segnalazioni in corso stanno sopra a quelli senza, così non vengono coperti nel centro. */
const Z_BY_STATUS: Record<VenueStatus, number> = { confermata: 3000, in_verifica: 2000, risolta: 1000, nessuna: 0 }
const Z_SELECTED = 10000

interface Entry {
  marker: L.Marker
  key: string
}

export function LeafletMap({ venues, selectedId, onSelect, userPos, flyToUser, nowIso, onBasemapMode }: LeafletMapProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, Entry>>(new Map())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onBasemapModeRef = useRef(onBasemapMode)
  onBasemapModeRef.current = onBasemapMode
  const basemapRef = useRef<BasemapHandle | null>(null)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId

  // Creazione della mappa una volta sola; pulizia completa allo smontaggio.
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { center: FLORENCE_CENTER, zoom: FLORENCE_ZOOM, zoomControl: true })
    // Tile OpenStreetMap; se non arrivano (offline, o pagina pubblicata che blocca le immagini esterne) ripiego schematico
    const basemap = createBasemap(map)
    basemapRef.current = basemap
    basemap.onChange((mode) => onBasemapModeRef.current?.(mode))
    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer
    // Un tocco sulla mappa vuota chiude il riquadro del locale selezionato
    map.on('click', () => onSelectRef.current(null))

    // Dimensioni corrette dopo il montaggio e a ogni ridimensionamento del contenitore
    const invalidate = () => map.invalidateSize()
    const raf = requestAnimationFrame(invalidate)
    const timer = window.setTimeout(invalidate, 250)
    window.addEventListener('resize', invalidate)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null
    ro?.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.removeEventListener('resize', invalidate)
      ro?.disconnect()
      basemapRef.current?.remove()
      basemapRef.current = null
      map.remove()
      mapRef.current = null
      layerRef.current = null
      userMarkerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Aggiornamento dei marker per id: aggiunge i nuovi, aggiorna quelli cambiati, toglie gli assenti.
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const seen = new Set<string>()
    for (const v of venues) {
      seen.add(v.id)
      const premium = isPremiumActive(v, nowIso)
      const key = `${v.status}|${premium}|${v.lat}|${v.lng}`
      const existing = markersRef.current.get(v.id)
      if (existing) {
        if (existing.key !== key) {
          existing.marker.setIcon(pinIcon(v.status, premium))
          existing.marker.setLatLng([v.lat, v.lng])
          existing.marker.setZIndexOffset(Z_BY_STATUS[v.status] + (selectedRef.current === v.id ? Z_SELECTED : 0))
          existing.key = key
        }
        continue
      }
      // Nessun popup: il tocco sul pin seleziona il locale e il dettaglio sta solo nel riquadro in basso
      const marker = L.marker([v.lat, v.lng], {
        icon: pinIcon(v.status, premium),
        title: v.name,
        alt: v.name,
        zIndexOffset: Z_BY_STATUS[v.status] + (selectedRef.current === v.id ? Z_SELECTED : 0),
      })
      marker.on('click', () => onSelectRef.current(v.id))
      marker.addTo(layer)
      markersRef.current.set(v.id, { marker, key })
    }
    for (const [id, entry] of markersRef.current) {
      if (!seen.has(id)) {
        layer.removeLayer(entry.marker)
        markersRef.current.delete(id)
      }
    }
  }, [venues, nowIso])

  // Locale selezionato (dal pin o dall'elenco): porta il pin in vista e sopra agli altri.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const [id, entry] of markersRef.current) {
      const status = (entry.key.split('|')[0] ?? 'nessuna') as VenueStatus
      entry.marker.setZIndexOffset((Z_BY_STATUS[status] ?? 0) + (id === selectedId ? Z_SELECTED : 0))
    }
    if (!selectedId) return
    const entry = markersRef.current.get(selectedId)
    if (!entry) return
    const ll = entry.marker.getLatLng()
    if (!map.getBounds().pad(-0.15).contains(ll)) map.panTo(ll)
  }, [selectedId, venues])

  // Posizione dell'utente: un cerchio pieno (divIcon con i token del tema).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userPos) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userPos)
      return
    }
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:var(--accent);border:3px solid var(--bg-elev);box-shadow:var(--shadow)"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
    userMarkerRef.current = L.marker(userPos, { icon, interactive: false, keyboard: false, zIndexOffset: 500, alt: t('map.you_are_here') }).addTo(map)
  }, [userPos, t])

  // Richiesta esplicita di centrare la mappa sull'utente.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userPos || !flyToUser) return
    map.flyTo(userPos, Math.max(map.getZoom(), 16), { duration: 0.6 })
  }, [flyToUser, userPos])

  return <div ref={containerRef} className="absolute inset-0 z-0 isolate" role="region" aria-label={t('map.map_label')} />
}
