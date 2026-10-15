/**
 * Tabella prezzi riusabile (/come-funziona e "Chi paga cosa" in /trasparenza).
 * I valori arrivano già formattati dal chiamante: i numeri vengono da src/domain/rules.ts via useLegalVars.
 */
export interface PriceRow {
  label: string
  value: string
  note?: string
  tone?: 'danger' | 'ok'
}

export function PricingTable({ rows }: { rows: PriceRow[] }) {
  return (
    <div className="card divide-y divide-line">
      {rows.map((row) => (
        <div key={row.label} className="p-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <div className="min-w-0 flex-1 basis-40">
            <div className="font-semibold">{row.label}</div>
            {row.note && <div className="text-xs text-fg-muted">{row.note}</div>}
          </div>
          <div className={`font-bold tnum text-right ${row.tone === 'danger' ? 'text-st-confirmed' : row.tone === 'ok' ? 'text-st-resolved' : ''}`}>{row.value}</div>
        </div>
      ))}
    </div>
  )
}
