/**
 * Flusso di segnalazione in 5 passi: locale → foto in app → cosa hai visto → posizione → regole e invio.
 * Le regole (foto ora, GPS entro 150 m, 3 al mese, consenso) sono applicate dallo store; qui si guida l'utente.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Profile, ReportCategory, Venue } from '../domain/types'
import { MAX_DISTANCE_M, MAX_REPORTS_PER_MONTH } from '../domain/rules'
import { distanceMeters } from '../domain/geo'
import type { SubmitReportResult } from '../data/store'
import { errorKeys, useSession, useStore, useStoreData } from '../data/StoreContext'
import { useT } from '../i18n'
import { deviceHash } from '../lib/device'
import { EmptyState, Notice, PageHeader, RequireAuth, Spinner } from '../components/ui'
import { Stepper } from '../components/report/Stepper'
import { StepVenue } from '../components/report/StepVenue'
import { StepPhoto } from '../components/report/StepPhoto'
import { StepDetails } from '../components/report/StepDetails'
import { StepPosition } from '../components/report/StepPosition'
import { StepReview } from '../components/report/StepReview'
import { ReportResult } from '../components/report/ReportResult'
import { useGeolocation } from '../components/report/useGeolocation'
import { REPORT_STEPS, type PhotoCapture, type ReportPosition } from '../components/report/types'

export default function ReportPage() {
  return (
    <RequireAuth>
      <ReportFlow />
    </RequireAuth>
  )
}

function ReportFlow() {
  const { profile } = useSession()
  if (!profile) return null
  return <ReportFlowInner key={profile.id} profile={profile} />
}

function ReportFlowInner({ profile }: { profile: Profile }) {
  const t = useT()
  const store = useStore()
  const { venueId } = useParams()
  const geo = useGeolocation(6000)

  const monthly = useStoreData((s) => s.countReportsThisMonth(profile.id), [profile.id])
  const preset = useStoreData((s) => (venueId ? s.getVenue(venueId) : Promise.resolve(null)), [venueId])

  const [step, setStep] = useState(1)
  const [venue, setVenue] = useState<Venue | null>(null)
  const [photo, setPhoto] = useState<PhotoCapture | null>(null)
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [description, setDescription] = useState('')
  const [consent, setConsent] = useState(false)
  const [useSimulated, setUseSimulated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errKeys, setErrKeys] = useState<string[] | null>(null)
  const [result, setResult] = useState<SubmitReportResult | null>(null)

  // Il locale arrivato dalla rotta viene applicato una sola volta; poi l'utente può cambiarlo
  const presetApplied = useRef(false)
  useEffect(() => {
    if (preset.data && !presetApplied.current) {
      presetApplied.current = true
      setVenue(preset.data)
    }
  }, [preset.data])

  // Al cambio di passo: torna in cima e porta il focus sull'intestazione del passo (non al primo render),
  // così lo screen reader annuncia "Passo n di 5 · nome" invece di restare sul pulsante Avanti/Indietro
  const stepHeadRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    stepHeadRef.current?.focus({ preventScroll: true })
  }, [step, result])

  // Posizione per l'invio: GPS reale; altrimenti, solo in demo, le coordinate del locale (dichiarate simulate)
  const position = useMemo<ReportPosition | null>(() => {
    if (geo.fix && !useSimulated) return { lat: geo.fix.lat, lng: geo.fix.lng, source: 'gps', accuracyM: geo.fix.accuracyM }
    if (store.mode === 'demo' && venue && (geo.status === 'error' || useSimulated)) return { lat: venue.lat, lng: venue.lng, source: 'simulated' }
    return null
  }, [geo.fix, geo.status, store.mode, venue, useSimulated])
  const distanceM = position && venue ? distanceMeters(position.lat, position.lng, venue.lat, venue.lng) : null

  const canNext = (() => {
    switch (step) {
      case 1:
        return !!venue
      case 2:
        return !!photo
      case 3:
        return !!category && description.trim().length > 0
      case 4:
        return !!position && distanceM !== null && distanceM <= MAX_DISTANCE_M
      default:
        return false
    }
  })()

  const submit = async () => {
    if (!venue || !photo || !category || !position) return
    setSubmitting(true)
    setErrKeys(null)
    try {
      const res = await store.submitReport({
        venueId: venue.id,
        userId: profile.id,
        category,
        description: description.trim(),
        photo: photo.dataUrl,
        captureMode: photo.captureMode,
        capturedAt: photo.capturedAt,
        lat: position.lat,
        lng: position.lng,
        consentAccepted: consent,
        deviceHash: deviceHash(),
      })
      setResult(res)
    } catch (e) {
      setErrKeys(errorKeys(e))
    } finally {
      setSubmitting(false)
    }
  }

  const retry = () => {
    setResult(null)
    setPhoto(null)
    setConsent(false)
    setErrKeys(null)
    setStep(2)
  }

  if (monthly.loading && monthly.data === null) return <Spinner />
  const used = monthly.data ?? 0

  if (result) {
    return (
      <>
        <PageHeader title={t('report.title')} />
        <ReportResult result={result} onRetry={retry} />
      </>
    )
  }

  if (used >= MAX_REPORTS_PER_MONTH) {
    return (
      <>
        <PageHeader title={t('report.title')} subtitle={t('report.monthly_counter', { n: used, m: MAX_REPORTS_PER_MONTH })} />
        <div className="gutter">
          <EmptyState
            title={t('report.blocked_title')}
            body={`${t('rule.max_reports')} ${t('report.blocked_body', { m: MAX_REPORTS_PER_MONTH })}`}
            action={
              <Link to="/profilo" className="btn btn-primary">
                {t('report.result.my_reports')}
              </Link>
            }
          />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('report.title')} subtitle={t('report.subtitle')} />
      <div className="gutter pb-3 grid gap-2">
        <p className="text-sm text-fg-muted tnum">{t('report.monthly_counter', { n: used, m: MAX_REPORTS_PER_MONTH })}</p>
        {profile.role !== 'utente' && <Notice tone="info">{t('report.role_note', { role: t(`role.${profile.role}`) })}</Notice>}
      </div>

      <div ref={stepHeadRef} tabIndex={-1} className="outline-none">
        <Stepper step={step} />
      </div>

      <div className="gutter grid gap-4">
        {step === 1 && <StepVenue selected={venue} preselected={!!venueId && venue?.id === venueId} onSelect={setVenue} geo={geo} />}
        {step === 2 && <StepPhoto photo={photo} onCapture={setPhoto} onClear={() => setPhoto(null)} />}
        {step === 3 && <StepDetails category={category} description={description} onCategory={setCategory} onDescription={setDescription} />}
        {step === 4 && venue && (
          <StepPosition
            venue={venue}
            geo={geo}
            position={position}
            distanceM={distanceM}
            onUseSimulated={store.mode === 'demo' && position?.source === 'gps' && distanceM !== null && distanceM > MAX_DISTANCE_M ? () => setUseSimulated(true) : undefined}
          />
        )}
        {step === 5 && venue && photo && category && position && distanceM !== null && (
          <StepReview
            profile={profile}
            venue={venue}
            category={category}
            description={description}
            photo={photo}
            position={position}
            distanceM={distanceM}
            consent={consent}
            onConsent={setConsent}
            onSubmit={submit}
            onBack={() => setStep(1)}
            submitting={submitting}
            errorKeys={errKeys}
          />
        )}

        <div className="flex gap-2 pt-1">
          {step > 1 && (
            <button type="button" className="btn btn-outline flex-1" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={submitting}>
              {t('common.back')}
            </button>
          )}
          {step < REPORT_STEPS && (
            <button type="button" className="btn btn-primary flex-1" onClick={() => setStep((s) => Math.min(REPORT_STEPS, s + 1))} disabled={!canNext}>
              {t('common.next')}
            </button>
          )}
        </div>
        {step === 2 && !photo && <p className="text-xs text-fg-muted text-center">{t('report.photo.required')}</p>}
        {step === 3 && (!category || !description.trim()) && <p className="text-xs text-fg-muted text-center">{t('report.what.description_required')}</p>}
      </div>
    </>
  )
}
