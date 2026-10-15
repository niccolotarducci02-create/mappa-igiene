/**
 * Barra delle schede della console: pulsanti con conteggio, scorrevole in orizzontale su schermi stretti.
 * Pattern "tabs" WAI-ARIA: un solo tab nel giro del Tab (quello selezionato), frecce sinistra/destra tra le schede;
 * aria-controls solo sulla scheda selezionata, perché la pagina rende un solo pannello alla volta.
 */
import type { KeyboardEvent } from 'react'

export interface TabDef<K extends string> {
  id: K
  label: string
  count: number | null
}

interface Props<K extends string> {
  tabs: TabDef<K>[]
  selected: K
  onSelect: (id: K) => void
  label: string
}

export function TabBar<K extends string>({ tabs, selected, onSelect, label }: Props<K>) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = tabs.findIndex((tab) => tab.id === selected)
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    if (!next) return
    onSelect(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto pb-2" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const active = tab.id === selected
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={active ? `panel-${tab.id}` : undefined}
            tabIndex={active ? 0 : -1}
            className={`btn shrink-0 ${active ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            {tab.count !== null && (
              <span className={`tnum text-xs rounded-full px-1.5 py-0.5 leading-none ${active ? 'bg-accent-fg/20' : 'bg-muted'}`}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
