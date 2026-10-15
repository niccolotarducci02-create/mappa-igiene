/**
 * Passo 4: posizione. GPS se disponibile; in demo, senza GPS, si usano le coordinate del locale
 * (dichiarato come simulato). Fuori dalla demo, senza GPS, non si può procedere.
 */
import { useEffect } from 'react'
import type { Venue } from '../../domain/types'
import { MAX_DISTANCE_M } from '../../domain/rules'
import { useT } from '../../i18n'
import { fmtDistance } from '../../lib/format'
import { EmptyState, KeyValue, Notice } from '../ui'
import type { ReportPosition } from './types'
import type { Geolocation } from './useGeolocation'

interface Props {
  venue: Venue
  geo: Geolocation
  position: ReportPosition | null
  distanceM: number | null
  /** Solo demo: quando il GPS reale è lontano dal locale, permette di usare le coordinate del locale. */
  onUseSimulated?: () => void
}

export function StepPosition({ venue, geo, position, distanceM, onUseSimulated }: Props) {
  const t = useT()

  // Entrando nel passo riproviamo il GPS se non abbiamo ancora una posizione valida
  useEffect(() => {
    if (geo.status === 'idle' || geo.status === 'error') geo.locate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const within = distanceM !== null && distanceM <= MAX_DISTANCE_M

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-bold">{t('report.position.title')}</h2>
        <p className="text-sm text-fg-muted mt-1">{t('report.position.help', { m: MAX_DISTANCE_M })}</p>
      </div>

      {geo.status === 'locating' && (
        <div className="card card-pad text-sm text-fg-muted" role="status">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-line border-t-accent animate-spin align-middle mr-2" />
          {t('report.position.locating')}
        </div>
      )}

      {geo.status !== 'locating' && position && distanceM !== null && (
        <>
          <div className="card card-pad grid gap-3">
            <div className="font-semibold">{venue.name}</div>
            <KeyValue
              items={[
                [t('report.position.distance_label'), <span key="d" className="tnum font-semibold">{fmtDistance(distanceM)}</span>],
                [
                  t('report.position.source'),
                  <span key="s">
                    {t(`report.position.source.${position.source}`)}
                    {position.accuracyM !== undefined && <span className="text-fg-muted tnum"> · {t('report.position.accuracy', { m: position.accuracyM })}</span>}
                  </span>,
                ],
              ]}
            />
            <Notice tone={within ? 'ok' : 'danger'}>
              {within ? t('report.position.within', { m: MAX_DISTANCE_M }) : t('report.position.too_far', { m: MAX_DISTANCE_M })}
            </Notice>
          </div>
          {position.source === 'simulated' && <Notice tone="warn">{t('report.position.simulated', { m: MAX_DISTANCE_M })}</Notice>}
          <div className="grid gap-2">
            {onUseSimulated && (
              <button type="button" className="btn btn-primary" onClick={onUseSimulated}>
                {t('report.position.use_simulated')}
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={geo.locate}>
              {t('report.position.retry')}
            </button>
          </div>
        </>
      )}

      {geo.status === 'error' && !position && (
        <EmptyState
          title={t('report.position.unavailable_title')}
          body={t('report.position.unavailable_body')}
          action={
            <button type="button" className="btn btn-primary" onClick={geo.locate}>
              {t('report.position.retry')}
            </button>
          }
        />
      )}
    </div>
  )
}
