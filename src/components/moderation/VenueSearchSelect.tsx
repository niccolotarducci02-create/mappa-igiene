/** Selettore di locale con ricerca: campo di filtro per nome o via e lista di risultati toccabili. */
import { useMemo, useState } from 'react'
import type { Venue } from '../../domain/types'
import { useT } from '../../i18n'

interface Props {
  id: string
  venues: Venue[]
  selected: Venue | null
  onSelect: (v: Venue) => void
}

const MAX_RESULTS = 8

export function VenueSearchSelect({ id, venues, selected, onSelect }: Props) {
  const t = useT()
  const [q, setQ] = useState('')

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sorted = [...venues].sort((a, b) => a.name.localeCompare(b.name))
    const list = needle ? sorted.filter((v) => v.name.toLowerCase().includes(needle) || v.address.toLowerCase().includes(needle)) : sorted
    return { list: list.slice(0, MAX_RESULTS), total: list.length }
  }, [venues, q])

  return (
    <div className="grid gap-2">
      <div className="field">
        <label htmlFor={id}>{t('mod.nas.link_search')}</label>
        <input id={id} type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mod.nas.link_search_placeholder')} autoComplete="off" />
      </div>
      {matches.total === 0 ? (
        <p className="text-sm text-fg-muted">{t('mod.nas.link_none')}</p>
      ) : (
        <ul className="card divide-y divide-line" role="listbox" aria-label={t('mod.nas.link_search')}>
          {matches.list.map((v) => {
            const active = selected?.id === v.id
            return (
              <li key={v.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`w-full text-left px-3 py-2 min-h-[44px] hover:bg-muted ${active ? 'bg-accent-soft font-semibold' : ''}`}
                  onClick={() => onSelect(v)}
                >
                  <div className="leading-tight">{v.name}</div>
                  <div className="text-xs text-fg-muted">
                    {v.address} · {t(`venue_type.${v.type}`)}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {matches.total > MAX_RESULTS && <p className="text-xs text-fg-muted tnum">{t('mod.nas.link_more', { n: matches.total - MAX_RESULTS })}</p>}
    </div>
  )
}
