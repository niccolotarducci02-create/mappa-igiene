/**
 * Intestazione della scheda pubblica: nome, tipo, indirizzo, chip di stato e badge Premium.
 * Il Premium NON riguarda l'igiene: il badge apre una nota che lo spiega (regola 4).
 */
import { useState } from 'react'
import type { Venue } from '../../domain/types'
import { useT } from '../../i18n'
import { Notice, PageHeader, StatusChip } from '../ui'

export function VenueHeader({ venue, premium }: { venue: Venue; premium: boolean }) {
  const t = useT()
  const [showNote, setShowNote] = useState(false)

  return (
    <>
      <PageHeader
        eyebrow={t(`venue_type.${venue.type}`)}
        title={venue.name}
        subtitle={venue.address}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="venue-status"><StatusChip status={venue.status} /></span>
            {premium && (
              <button
                type="button"
                className="chip chip-neutral bg-muted text-fg min-h-[44px]"
                title={t('venue.premium_tooltip')}
                aria-expanded={showNote}
                onClick={() => setShowNote((s) => !s)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
                {t('venue.premium')}
                <span aria-hidden="true" className="text-fg-muted">
                  ⓘ
                </span>
              </button>
            )}
          </div>
        }
      />
      {premium && showNote && (
        <div className="gutter pb-2">
          <Notice tone="info">{t('venue.premium_tooltip')}</Notice>
        </div>
      )}
    </>
  )
}
