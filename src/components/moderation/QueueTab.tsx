/** Scheda "Coda": segnalazioni in verifica, dalla più vecchia, da decidere entro 24 ore. */
import { useT } from '../../i18n'
import { EmptyState } from '../ui'
import { QueueItem } from './QueueItem'
import type { TabProps } from './types'

export function QueueTab({ data, profile, nowIso }: TabProps) {
  const t = useT()
  if (!data.queue.length) return <EmptyState title={t('mod.queue.empty')} body={t('mod.queue.empty_body')} />
  return (
    <div className="grid gap-3">
      <p className="text-sm text-fg-muted">{t('mod.queue.intro')}</p>
      <ul className="grid gap-4">
        {data.queue.map((r) => (
          <QueueItem
            key={r.id}
            report={r}
            venue={data.venueById.get(r.venueId)}
            reporterCount={data.queueReporterCounts[r.userId] ?? 0}
            moderatorId={profile.id}
            nowIso={nowIso}
          />
        ))}
      </ul>
    </div>
  )
}
