/**
 * Modulo DSA (notice-and-action, art. 16 Reg. UE 2022/2065): codice della segnalazione (precompilato dal link),
 * recapito, motivazione (minimo 20 caratteri), dichiarazione di buona fede. Chiama store.submitDsaNotice.
 * La segnalazione indicata viene cercata nello store e mostrata come contesto (locale, categoria, data).
 * Regola 1: una segnalazione non pubblica (in verifica, archiviata, scartata) non viene mai rivelata a chi non è
 * moderazione o autore: per tutti gli altri il codice è trattato come "non trovato".
 */
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DsaNotice, Report, Venue } from '../../domain/types'
import { REMOVAL_SLA_HOURS } from '../../domain/rules'
import { isPubliclyVisible } from '../../domain/stateMachine'
import { errorKeys, useStore, useStoreData } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { ErrorBox, Notice, ReportStateChip, Spinner } from '../ui'

export const DSA_REASON_MIN = 20

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s().-]{8,}$/

interface ReportContext {
  report: Report | null
  venue: Venue | null
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

export function DsaForm({ initialReportId = '' }: { initialReportId?: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const ids = { report: useId(), contact: useId(), reason: useId(), faith: useId() }

  const [reportId, setReportId] = useState(initialReportId)
  const [contact, setContact] = useState('')
  const [reason, setReason] = useState('')
  const [goodFaith, setGoodFaith] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [storeError, setStoreError] = useState<string[] | null>(null)
  const [result, setResult] = useState<DsaNotice | null>(null)

  const lookupId = useDebounced(reportId.trim(), 350)
  const ctx = useStoreData<ReportContext | null>(
    async (s) => {
      if (!lookupId) return null
      const report = await s.getReport(lookupId)
      if (!report) return { report: null, venue: null }
      if (!isPubliclyVisible(report)) {
        const viewer = await s.getSession()
        const mayView = !!viewer && (viewer.role === 'moderatore' || viewer.role === 'admin' || viewer.id === report.userId)
        if (!mayView) return { report: null, venue: null }
      }
      const venue = await s.getVenue(report.venueId)
      return { report, venue }
    },
    [lookupId],
  )

  /* validazione locale: chiavi i18n per campo, mostrate dopo il primo tentativo */
  const fieldErrors = {
    report: !reportId.trim() ? 'dsa.form.report_required' : ctx.data && !ctx.data.report && lookupId === reportId.trim() ? 'dsa.form.not_found' : null,
    contact: EMAIL_RE.test(contact.trim()) || PHONE_RE.test(contact.trim()) ? null : 'dsa.form.contact_invalid',
    reason: reason.trim().length < DSA_REASON_MIN ? 'dsa.form.reason_short' : null,
    faith: goodFaith ? null : 'dsa.form.good_faith_required',
  }
  const hasErrors = Object.values(fieldErrors).some(Boolean)
  const show = (k: keyof typeof fieldErrors) => (attempted && fieldErrors[k] ? fieldErrors[k] : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    setStoreError(null)
    if (hasErrors) return
    setSubmitting(true)
    try {
      const n = await store.submitDsaNotice(reportId.trim(), contact.trim(), reason.trim())
      setResult(n)
    } catch (err) {
      setStoreError(errorKeys(err))
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setReportId('')
    setContact('')
    setReason('')
    setGoodFaith(false)
    setAttempted(false)
    setResult(null)
    setStoreError(null)
  }

  if (result) {
    return (
      <div className="grid gap-3">
        <Notice tone="ok" live>
          <strong className="block">{t('dsa.success_title')}</strong>
          <p className="mt-1">{t('dsa.success_body', { id: result.id, hours: REMOVAL_SLA_HOURS, contact: result.contact })}</p>
          <code className="font-data select-all inline-block mt-2 bg-elev text-fg rounded px-2 py-1 border border-line break-all">{result.id}</code>
          <p className="mt-2 text-xs">{t('dsa.success_registry')}</p>
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Link to="/trasparenza" className="btn btn-outline">
            {t('legal.see_transparency')}
          </Link>
          <button type="button" className="btn" onClick={reset}>
            {t('dsa.success_another')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={ids.report}>{t('dsa.form.report_id')}</label>
        <input
          id={ids.report}
          className="input font-data"
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!show('report')}
          aria-describedby={`${ids.report}-help`}
        />
        <FieldHint id={`${ids.report}-help`} error={show('report')} help={t('dsa.form.report_id_help')} />
      </div>

      {lookupId && ctx.loading && !ctx.data && <Spinner />}
      {ctx.data?.report && <ReportContextCard report={ctx.data.report} venue={ctx.data.venue} lang={lang} />}

      <div className="field">
        <label htmlFor={ids.contact}>{t('dsa.form.contact')}</label>
        <input
          id={ids.contact}
          className="input"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoComplete="email"
          inputMode="email"
          aria-invalid={!!show('contact')}
          aria-describedby={`${ids.contact}-help`}
        />
        <FieldHint id={`${ids.contact}-help`} error={show('contact')} help={t('dsa.form.contact_help')} />
      </div>

      <div className="field">
        <label htmlFor={ids.reason}>{t('dsa.form.reason')}</label>
        <textarea
          id={ids.reason}
          className="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={5}
          aria-invalid={!!show('reason')}
          aria-describedby={`${ids.reason}-help`}
        />
        <FieldHint id={`${ids.reason}-help`} error={show('reason')} help={t('dsa.form.reason_help', { min: DSA_REASON_MIN })} />
        <span className="text-xs text-fg-muted tnum" aria-live="polite">
          {t('dsa.form.reason_count', { n: reason.trim().length, min: DSA_REASON_MIN })}
        </span>
      </div>

      <div className="grid gap-1">
        <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
          <input
            id={ids.faith}
            type="checkbox"
            className="mt-1 w-5 h-5 shrink-0 accent-[var(--accent)]"
            checked={goodFaith}
            onChange={(e) => setGoodFaith(e.target.checked)}
            aria-invalid={!!show('faith')}
          />
          <span className="text-sm">{t('dsa.form.good_faith')}</span>
        </label>
        {show('faith') && (
          <p className="text-sm text-st-confirmed" role="alert">
            {t(show('faith')!)}
          </p>
        )}
      </div>

      {storeError && <ErrorBox keys={storeError} onClose={() => setStoreError(null)} />}

      <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
        {submitting ? t('dsa.form.sending') : t('dsa.form.submit')}
      </button>
      <p className="text-xs text-fg-muted">{t('dsa.privacy_note')}</p>
    </form>
  )
}

function FieldHint({ id, error, help }: { id: string; error: string | null; help: string }) {
  const t = useT()
  if (error) {
    return (
      <p id={id} className="text-sm text-st-confirmed" role="alert">
        {t(error, { min: DSA_REASON_MIN })}
      </p>
    )
  }
  return (
    <p id={id} className="text-xs text-fg-muted">
      {help}
    </p>
  )
}

function ReportContextCard({ report, venue, lang }: { report: Report; venue: Venue | null; lang: 'it' | 'en' }) {
  const t = useT()
  return (
    <div className="card card-pad grid gap-1">
      <div className="eyebrow">{t('dsa.form.context')}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {venue ? (
          <Link to={`/locale/${venue.id}`} className="font-semibold underline min-h-[44px] inline-flex items-center">
            {venue.name}
          </Link>
        ) : (
          <span className="font-semibold">{report.venueId}</span>
        )}
        <ReportStateChip state={report.state} />
      </div>
      <div className="text-sm text-fg-muted">
        {venue && <span>{t(`venue_type.${venue.type}`)} · </span>}
        <span>{t(`category.${report.category}`)}</span>
      </div>
      <div className="text-sm text-fg-muted tnum">
        {report.publishedAt ? `${t('dsa.report_date')} ${fmtDate(report.publishedAt, lang, true)}` : `${t('dsa.report_submitted')} ${fmtDate(report.submittedAt, lang, true)}`}
      </div>
    </div>
  )
}
