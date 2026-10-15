/**
 * Mappa di base con ripiego.
 * In produzione: tile OpenStreetMap. Se i tile non arrivano (nessuna rete, oppure la pagina è pubblicata in un
 * contenitore che blocca le immagini esterne, come la demo), si passa a una mappa SCHEMATICA di Firenze
 * disegnata da coordinate incorporate: fiume, viali, strade principali, parchi e nomi dei luoghi.
 * La schematica è approssimata e serve solo a orientarsi: lo dichiara una nota nell'interfaccia.
 */
import L from 'leaflet'

export type BasemapMode = 'tiles' | 'schematic'

type LngLat = [number, number]

const ARNO_CENTER: LngLat[] = [
  [11.292, 43.7565], [11.284, 43.758], [11.276, 43.7602], [11.270, 43.7625], [11.266, 43.7641],
  [11.2615, 43.7658], [11.2585, 43.7667], [11.2555, 43.7675], [11.2531, 43.7681], [11.2510, 43.7690],
  [11.2500, 43.7696], [11.2470, 43.7710], [11.2440, 43.7719], [11.2420, 43.7726], [11.2390, 43.7734],
  [11.2360, 43.7741], [11.2320, 43.7752], [11.2280, 43.7762], [11.2230, 43.7775], [11.2180, 43.7790],
]

/** Costruisce un poligono "fiume" attorno alla linea centrale, con mezza larghezza in gradi di latitudine. */
function riverPolygon(center: LngLat[], halfWidth = 0.00045): LngLat[] {
  const up = center.map(([lng, lat]) => [lng, lat + halfWidth] as LngLat)
  const down = center.map(([lng, lat]) => [lng, lat - halfWidth] as LngLat).reverse()
  return [...up, ...down, up[0]]
}

const PARKS: Array<{ name: string; ring: LngLat[] }> = [
  { name: 'Giardino di Boboli', ring: [[11.2470, 43.7600], [11.2555, 43.7605], [11.2560, 43.7655], [11.2520, 43.7668], [11.2470, 43.7650], [11.2455, 43.7620], [11.2470, 43.7600]] },
  { name: 'Parco delle Cascine', ring: [[11.2150, 43.7745], [11.2385, 43.7738], [11.2385, 43.7790], [11.2300, 43.7805], [11.2150, 43.7810], [11.2150, 43.7745]] },
  { name: 'Fortezza da Basso', ring: [[11.2460, 43.7800], [11.2530, 43.7800], [11.2535, 43.7845], [11.2465, 43.7845], [11.2460, 43.7800]] },
  { name: 'Giardino della Gherardesca', ring: [[11.2660, 43.7760], [11.2700, 43.7760], [11.2705, 43.7790], [11.2660, 43.7790], [11.2660, 43.7760]] },
]

type RoadClass = 'viale' | 'main' | 'street' | 'rail'
const ROADS: Array<{ cls: RoadClass; name?: string; pts: LngLat[] }> = [
  // Viali di circonvallazione (riva destra)
  { cls: 'viale', name: 'Viale Lavagnini', pts: [[11.2598, 43.7836], [11.2540, 43.7832], [11.2500, 43.7822]] },
  { cls: 'viale', name: 'Viale Strozzi', pts: [[11.2500, 43.7822], [11.2455, 43.7795], [11.2420, 43.7760]] },
  { cls: 'viale', name: 'Viale F.lli Rosselli', pts: [[11.2420, 43.7760], [11.2385, 43.7748], [11.2360, 43.7741]] },
  { cls: 'viale', name: 'Viale Matteotti', pts: [[11.2598, 43.7836], [11.2635, 43.7820], [11.2660, 43.7800]] },
  { cls: 'viale', name: 'Viale Gramsci', pts: [[11.2660, 43.7800], [11.2700, 43.7750], [11.2720, 43.7697]] },
  { cls: 'viale', name: 'Viale Giovine Italia', pts: [[11.2720, 43.7697], [11.2710, 43.7665], [11.2700, 43.7640]] },
  // Viali Oltrarno e dei Colli
  { cls: 'viale', name: 'Viale Petrarca', pts: [[11.2390, 43.7700], [11.2400, 43.7660], [11.2420, 43.7607]] },
  { cls: 'viale', name: 'Viale Machiavelli', pts: [[11.2420, 43.7607], [11.2480, 43.7580], [11.2560, 43.7585], [11.2650, 43.7629]] },
  { cls: 'viale', name: 'Viale Michelangelo', pts: [[11.2650, 43.7629], [11.2665, 43.7640], [11.2660, 43.7641]] },
  // Strade principali del centro
  { cls: 'main', name: 'Via Cavour', pts: [[11.2560, 43.7735], [11.2589, 43.7779], [11.2598, 43.7836]] },
  { cls: 'main', name: 'Via Panzani', pts: [[11.2560, 43.7735], [11.2520, 43.7748], [11.2478, 43.7764]] },
  { cls: 'main', name: 'Via Calzaiuoli', pts: [[11.2560, 43.7728], [11.2558, 43.7696]] },
  { cls: 'main', name: 'Via Tornabuoni', pts: [[11.2512, 43.7735], [11.2512, 43.7700], [11.2500, 43.7696]] },
  { cls: 'main', name: 'Via Ghibellina', pts: [[11.2565, 43.7700], [11.2622, 43.7703], [11.2680, 43.7703], [11.2720, 43.7697]] },
  { cls: 'main', name: 'Via Pietrapiana', pts: [[11.2600, 43.7720], [11.2680, 43.7708]] },
  { cls: 'main', name: 'Por Santa Maria', pts: [[11.2540, 43.7715], [11.2535, 43.7695], [11.2531, 43.7681]] },
  { cls: 'main', name: 'Via de\' Serragli', pts: [[11.2470, 43.7710], [11.2455, 43.7680], [11.2435, 43.7625]] },
  { cls: 'main', name: 'Via Romana', pts: [[11.2500, 43.7651], [11.2470, 43.7635], [11.2420, 43.7607]] },
  { cls: 'main', name: 'Via Maggio', pts: [[11.2500, 43.7696], [11.2495, 43.7670], [11.2500, 43.7651]] },
  { cls: 'main', name: 'Borgo San Frediano', pts: [[11.2470, 43.7700], [11.2420, 43.7690], [11.2390, 43.7700]] },
  { cls: 'main', name: 'Via San Niccolò', pts: [[11.2585, 43.7660], [11.2612, 43.7643], [11.2660, 43.7641]] },
  { cls: 'main', name: 'Via Nazionale', pts: [[11.2478, 43.7764], [11.2510, 43.7780], [11.2540, 43.7800]] },
  { cls: 'main', name: 'Via della Scala', pts: [[11.2478, 43.7764], [11.2460, 43.7745], [11.2440, 43.7730]] },
  { cls: 'main', name: 'Lungarno', pts: [[11.2360, 43.7749], [11.2420, 43.7733], [11.2470, 43.7718], [11.2500, 43.7704], [11.2531, 43.7689], [11.2585, 43.7675], [11.2615, 43.7666], [11.2660, 43.7649], [11.2700, 43.7633]] },
  { cls: 'main', name: 'Lungarno (sud)', pts: [[11.2360, 43.7733], [11.2420, 43.7718], [11.2470, 43.7702], [11.2500, 43.7688], [11.2531, 43.7673], [11.2585, 43.7659], [11.2615, 43.7650], [11.2660, 43.7633]] },
  // Strade secondarie
  { cls: 'street', pts: [[11.2535, 43.7762], [11.2560, 43.7748], [11.2590, 43.7740]] },
  { cls: 'street', pts: [[11.2520, 43.7700], [11.2540, 43.7695], [11.2572, 43.7684], [11.2609, 43.7686]] },
  { cls: 'street', pts: [[11.2473, 43.7665], [11.2500, 43.7660]] },
  { cls: 'street', pts: [[11.2589, 43.7779], [11.2608, 43.7766], [11.2660, 43.7760]] },
  { cls: 'street', pts: [[11.2540, 43.7715], [11.2525, 43.7725], [11.2512, 43.7735]] },
  { cls: 'street', pts: [[11.2626, 43.7686], [11.2650, 43.7700], [11.2680, 43.7703]] },
  { cls: 'street', pts: [[11.2600, 43.7720], [11.2560, 43.7735]] },
  // Ferrovia
  { cls: 'rail', pts: [[11.2478, 43.7764], [11.2440, 43.7780], [11.2400, 43.7800], [11.2300, 43.7830], [11.2200, 43.7850]] },
  { cls: 'rail', pts: [[11.2478, 43.7764], [11.2500, 43.7790], [11.2530, 43.7820], [11.2560, 43.7860]] },
]

const PLACES: Array<{ name: string; lng: number; lat: number; big?: boolean }> = [
  { name: 'Duomo', lng: 11.2560, lat: 43.7731, big: true },
  { name: 'Piazza della Signoria', lng: 11.2558, lat: 43.7696 },
  { name: 'Ponte Vecchio', lng: 11.2531, lat: 43.7681 },
  { name: 'Santa Croce', lng: 11.2626, lat: 43.7686 },
  { name: 'Santo Spirito', lng: 11.2473, lat: 43.7665 },
  { name: 'Palazzo Pitti', lng: 11.2500, lat: 43.7651 },
  { name: 'Stazione S.M. Novella', lng: 11.2478, lat: 43.7764, big: true },
  { name: 'Mercato Centrale', lng: 11.2535, lat: 43.7762 },
  { name: 'San Marco', lng: 11.2589, lat: 43.7779 },
  { name: 'Piazzale Michelangelo', lng: 11.2650, lat: 43.7629 },
  { name: 'Fortezza da Basso', lng: 11.2498, lat: 43.7822 },
  { name: 'Piazza Beccaria', lng: 11.2720, lat: 43.7697 },
  { name: 'Porta Romana', lng: 11.2420, lat: 43.7607 },
  { name: 'Piazza della Libertà', lng: 11.2598, lat: 43.7836 },
  { name: "Sant'Ambrogio", lng: 11.2680, lat: 43.7703 },
  { name: 'Le Cascine', lng: 11.2270, lat: 43.7775 },
  { name: 'Boboli', lng: 11.2510, lat: 43.7628 },
  { name: 'Arno', lng: 11.2440, lat: 43.7716 },
]

const toLatLngs = (pts: LngLat[]) => pts.map(([lng, lat]) => [lat, lng] as [number, number])

/** Costruisce il layer schematico (solo vettori: nessuna richiesta di rete). */
export function schematicLayer(): L.LayerGroup {
  const g = L.layerGroup()
  for (const p of PARKS) {
    L.polygon(toLatLngs(p.ring), { color: 'var(--st-resolved)', weight: 1, opacity: 0.35, fillColor: 'var(--st-resolved)', fillOpacity: 0.16, interactive: false }).addTo(g)
  }
  L.polygon(toLatLngs(riverPolygon(ARNO_CENTER)), { color: 'var(--accent)', weight: 1, opacity: 0.4, fillColor: 'var(--accent)', fillOpacity: 0.22, interactive: false }).addTo(g)
  for (const r of ROADS) {
    const style: L.PolylineOptions =
      r.cls === 'viale'
        ? { color: 'var(--fg-muted)', weight: 4, opacity: 0.45, interactive: false }
        : r.cls === 'main'
          ? { color: 'var(--fg-muted)', weight: 2.5, opacity: 0.45, interactive: false }
          : r.cls === 'rail'
            ? { color: 'var(--fg-muted)', weight: 2, opacity: 0.35, dashArray: '6 6', interactive: false }
            : { color: 'var(--fg-muted)', weight: 1.5, opacity: 0.35, interactive: false }
    L.polyline(toLatLngs(r.pts), style).addTo(g)
  }
  for (const p of PLACES) {
    L.marker([p.lat, p.lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'basemap-label',
        html: `<span style="font:${p.big ? '600 12px' : '500 11px'} var(--font-ui);color:var(--fg-muted);background:color-mix(in srgb, var(--bg) 70%, transparent);padding:1px 4px;border-radius:4px;white-space:nowrap">${p.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [-4, 6],
      }),
    }).addTo(g)
  }
  return g
}

export interface BasemapHandle {
  mode: BasemapMode
  onChange(cb: (mode: BasemapMode) => void): () => void
  remove(): void
}

/**
 * Aggiunge alla mappa i tile OpenStreetMap e, se non arrivano, la schematica.
 * Ripiego quando: 3 errori di tile prima di un caricamento riuscito, oppure nessun tile caricato entro `timeoutMs`.
 */
export function createBasemap(map: L.Map, opts: { timeoutMs?: number } = {}): BasemapHandle {
  const listeners = new Set<(m: BasemapMode) => void>()
  let mode: BasemapMode = 'tiles'
  let loaded = 0
  let errors = 0
  let schematic: L.LayerGroup | null = null

  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    crossOrigin: true,
  })

  const switchToSchematic = () => {
    if (mode === 'schematic') return
    mode = 'schematic'
    try {
      map.removeLayer(tiles)
    } catch {
      /* già rimosso */
    }
    schematic = schematicLayer().addTo(map)
    map.attributionControl?.addAttribution('Mappa schematica (demo), coordinate approssimate')
    for (const cb of listeners) cb(mode)
  }

  tiles.on('tileload', () => {
    loaded++
  })
  tiles.on('tileerror', () => {
    errors++
    if (loaded === 0 && errors >= 3) switchToSchematic()
  })
  tiles.addTo(map)

  const timer = window.setTimeout(() => {
    if (loaded === 0) switchToSchematic()
  }, opts.timeoutMs ?? 5000)

  return {
    get mode() {
      return mode
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    remove() {
      window.clearTimeout(timer)
      listeners.clear()
      try {
        map.removeLayer(tiles)
        if (schematic) map.removeLayer(schematic)
      } catch {
        /* mappa già distrutta */
      }
    },
  }
}
