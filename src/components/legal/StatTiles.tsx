/**
 * Riquadri del rapporto di trasparenza, letti da store.getStats(): locali per stato (con chip), segnalazioni per stato,
 * repliche, contatti venduti, rimozioni, richieste DSA, tempo mediano di verifica. Cifre in .tnum.
 */
import type { ReactNode } from 'react'
import type { ReportState, Stats, VenueStatus } from '../../domain/types'
import { MODERATION_SLA_HOURS } from '../../domain/rules'
import { useT } from '../../i18n'
import { ReportStateChip, StatusChip } from '../ui'

const VENUE_STATUSES: VenueStatus[] = ['confermata', 'in_verifica', 'risolta', 'nessuna']
const REPORT_STATES: ReportState[] = ['in_verifica', 'pubblicata', 'risolta', 'scartata', 'archiviata', 'rimossa']

function Tile({ label, value, children, wide = false }: { label: string; value: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <div className={`card card-pad grid gap-1 content-start ${wide ? 'col-span-2' : ''}`}>
      <div className="text-xs text-fg-muted leading-tight">{label}</div>
      <div className="text-2xl font-bold tnum leading-none">{value}</div>
      {children}
    </div>
  )
}

export function StatTiles({ stats }: { stats: Stats }) {
  const t = useT()
  const median = stats.medianModerationHours

  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile label={t('transparency.tile.venues')} value={stats.venues} wide>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {VENUE_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-sm">
              <StatusChip status={s} short />
              <span className="tnum font-semibold">{stats.venuesByStatus[s]}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile label={t('transparency.tile.reports')} value={stats.reportsTotal} wide>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {REPORT_STATES.map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-sm">
              <ReportStateChip state={s} />
              <span className="tnum font-semibold">{stats.reportsByState[s]}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile label={t('transparency.tile.replies')} value={stats.repliesTotal} />
      <Tile label={t('transparency.tile.leads')} value={stats.leadsSold} />
      <Tile label={t('transparency.tile.removals')} value={stats.removals} />
      <Tile label={t('transparency.tile.dsa')} value={stats.dsaNotices} />

      <Tile
        label={t('transparency.tile.median')}
        value={
          median === null ? (
            <span className="text-base font-semibold text-fg-muted">{t('transparency.tile.median_none')}</span>
          ) : (
            <>
              {median < 10 ? median.toFixed(1) : Math.round(median)} <span className="text-base font-semibold text-fg-muted">{t('transparency.tile.median_unit')}</span>
            </>
          )
        }
        wide
      >
        <div className="text-xs text-fg-muted">{t('transparency.tile.median_target', { hours: MODERATION_SLA_HOURS })}</div>
      </Tile>
    </div>
  )
}
