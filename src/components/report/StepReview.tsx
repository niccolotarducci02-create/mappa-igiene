/** Passo 5: riepilogo, le quattro regole, consenso esplicito, cosa succede dopo, invio. */
import type { Profile, ReportCategory, Venue } from '../../domain/types'
import { FOUR_RULES } from '../../domain/rules'
import { useLang, useT } from '../../i18n'
import { fmtDistance } from '../../lib/format'
import { ErrorBox, KeyValue, Notice } from '../ui'
import type { PhotoCapture, ReportPosition } from './types'

interface Props {
  profile: Profile
  venue: Venue
  category: ReportCategory
  description: string
  photo: PhotoCapture
  position: ReportPosition
  distanceM: number
  consent: boolean
  onConsent: (v: boolean) => void
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
  errorKeys: string[] | null
}

export function StepReview({ profile, venue, category, description, photo, position, distanceM, consent, onConsent, onSubmit, onBack, submitting, errorKeys }: Props) {
  const t = useT()
  const { lang } = useLang()
  const how = profile.spidVerified ? t('report.review.identity.spid') : t('report.review.identity.phone')

  return (
    <div className="grid gap-4">
      <section className="card card-pad grid gap-3">
        <h2 className="text-base font-bold">{t('report.review.recap')}</h2>
        <div className="flex gap-3 items-start">
          <img src={photo.dataUrl} alt={t('venue.photo_alt', { category: t(`category.${category}`) })} className="w-20 h-20 rounded-[var(--radius)] object-cover bg-muted shrink-0" />
          <div className="min-w-0 flex-1">
            <KeyValue
              items={[
                [t('report.step.venue'), <span key="v" className="font-semibold">{venue.name}</span>],
                [t('report.what.category'), t(`category.${category}`)],
                [t('report.step.photo'), t(`report.photo.mode.${photo.captureMode}`)],
                [t('report.step.position'), <span key="p" className="tnum">{fmtDistance(distanceM)} · {t(`report.position.source.${position.source}`)}</span>],
              ]}
            />
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{description}</p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-base font-bold">{t('report.review.rules')}</h2>
        <ol className="grid gap-2">
          {FOUR_RULES.map((r) => (
            <li key={r.id} className="card px-3 py-2 text-sm flex gap-3">
              <span className="font-bold text-accent tnum shrink-0">{r.id}</span>
              <span className="leading-snug">{r[lang]}</span>
            </li>
          ))}
        </ol>
      </section>

      <label className="card card-pad flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5 shrink-0 accent-[var(--accent)]" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
        <span className="text-sm font-semibold leading-snug">{t('report.review.consent')}</span>
      </label>

      <Notice tone="info">{t('report.review.identity', { how })}</Notice>

      <section className="grid gap-1">
        <h2 className="text-base font-bold">{t('report.review.next')}</h2>
        <ol className="text-sm text-fg-muted grid gap-1 list-decimal pl-5">
          <li>{t('report.review.next.1')}</li>
          <li>{t('report.review.next.2')}</li>
          <li>{t('report.review.next.3')}</li>
          <li>{t('report.review.next.4')}</li>
        </ol>
      </section>

      {errorKeys && errorKeys.length > 0 && (
        <div className="grid gap-2">
          <ErrorBox keys={errorKeys} />
          <button type="button" className="btn btn-outline" onClick={onBack}>
            {t('report.review.fix')}
          </button>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-block" disabled={!consent || submitting} onClick={onSubmit}>
        {submitting ? t('report.review.submitting') : t('report.review.submit')}
      </button>
    </div>
  )
}
