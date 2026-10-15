/**
 * Barra dei controlli sopra la mappa: ricerca, filtro per stato (con conteggi), tipo di locale,
 * e il passaggio mappa/elenco. Tutti i bersagli sono alti almeno 44 px.
 * I filtri vanno a capo invece di scorrere in orizzontale: a 400 px nessun chip resta nascosto.
 */
import type { VenueStatus, VenueType } from '../../domain/types'
import { VENUE_TYPES } from '../../domain/rules'
import { useT } from '../../i18n'

export type StatusFilter = VenueStatus | 'all'
export type TypeFilter = VenueType | 'all'
export type MapView = 'map' | 'list'

export const STATUS_ORDER: VenueStatus[] = ['confermata', 'in_verifica', 'risolta', 'nessuna']

/** Colori dei filtri attivi: gli stessi token dei chip di stato. */
const ACTIVE_CLASS: Record<StatusFilter, string> = {
  all: 'bg-accent text-accent-fg border-accent',
  nessuna: 'bg-st-none-soft text-st-none border-st-none/40',
  in_verifica: 'bg-st-verifying-soft text-st-verifying border-st-verifying/40',
  confermata: 'bg-st-confirmed-soft text-st-confirmed border-st-confirmed/40',
  risolta: 'bg-st-resolved-soft text-st-resolved border-st-resolved/40',
}
const DOT_CLASS: Record<VenueStatus, string> = {
  nessuna: 'bg-st-none',
  in_verifica: 'bg-st-verifying',
  confermata: 'bg-st-confirmed',
  risolta: 'bg-st-resolved',
}

interface Props {
  q: string
  onQ: (q: string) => void
  status: StatusFilter
  onStatus: (s: StatusFilter) => void
  counts: Record<VenueStatus, number>
  total: number
  type: TypeFilter
  onType: (t: TypeFilter) => void
  view: MapView
  onView: (v: MapView) => void
}

export function MapControls({ q, onQ, status, onStatus, counts, total, type, onType, view, onView }: Props) {
  const t = useT()
  const filters: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: 'all', label: t('common.all'), count: total },
    ...STATUS_ORDER.map((s) => ({ value: s, label: t(`status.short.${s}`), count: counts[s] })),
  ]

  return (
    <div className="gutter py-2 bg-elev border-b border-line flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="search"
          className="input flex-1 min-w-0"
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={t('map.search_placeholder')}
          aria-label={t('map.search_label')}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button
          type="button"
          className="btn btn-outline shrink-0"
          onClick={() => onView(view === 'map' ? 'list' : 'map')}
          aria-pressed={view === 'list'}
        >
          {view === 'map' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" /></svg>
          )}
          <span>{view === 'map' ? t('map.view_list') : t('map.view_map')}</span>
        </button>
      </div>

      <div role="group" aria-label={t('map.filter_status')} className="flex flex-wrap gap-1.5 items-center py-0.5">
        {filters.map((f) => {
          const active = status === f.value
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => onStatus(f.value)}
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border text-sm font-semibold whitespace-nowrap shrink-0 ${
                active ? ACTIVE_CLASS[f.value] : 'bg-elev border-line text-fg'
              }`}
            >
              {f.value !== 'all' && <span className={`w-2 h-2 rounded-full ${DOT_CLASS[f.value]}`} aria-hidden="true" />}
              <span>{f.label}</span>
              <span className={`tnum text-xs ${active ? 'opacity-80' : 'text-fg-muted'}`}>{f.count}</span>
            </button>
          )
        })}
        <div className="w-[7.5rem] shrink-0 ml-auto">
          <select className="select" value={type} onChange={(e) => onType(e.target.value as TypeFilter)} aria-label={t('map.filter_type')}>
            <option value="all">{t('map.all_types')}</option>
            {VENUE_TYPES.map((vt) => (
              <option key={vt} value={vt}>
                {t(`venue_type.${vt}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
