/**
 * Scheda "Comunicati NAS": importa un comunicato pubblico (nome del locale come scritto, indirizzo, link alla fonte,
 * data, riassunto) e collegalo a un locale: nasce una segnalazione pubblicata con fonte "comunicato pubblico" e il
 * locale ha i suoi 7 giorni di replica.
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { NasNotice, Venue } from '../../domain/types'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtRelative } from '../../lib/format'
import { EmptyState, ErrorBox, Notice } from '../ui'
import { VenueSearchSelect } from './VenueSearchSelect'
import type { TabProps } from './types'
import { useAsyncAction } from './useAsyncAction'

/** Giorno di oggi nel calendario locale (non UTC), nel formato dell'input type=date */
const todayInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const emptyForm = () => ({ venueNameRaw: '', addressRaw: '', sourceUrl: '', publishedAt: todayInput(), summary: '' })

export function NasTab({ data, profile, nowIso }: TabProps) {
  const t = useT()
  return (
    <div className="grid gap-5">
      <p className="text-sm text-fg-muted">{t('mod.nas.intro')}</p>
      <ImportForm moderatorId={profile.id} />
      <section className="grid gap-2">
        <h3 className="font-bold">
          {t('mod.nas.list_title')} <span className="text-fg-muted font-normal tnum">({data.nasNotices.length})</span>
        </h3>
        {data.nasNotices.length === 0 ? (
          <EmptyState title={t('mod.nas.empty')} />
        ) : (
          <ul className="grid gap-3">
            {data.nasNotices.map((n) => (
              <NasNoticeRow key={n.id} notice={n} venues={data.venues} venueById={data.venueById} moderatorId={profile.id} nowIso={nowIso} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ImportForm({ moderatorId }: { moderatorId: string }) {
  const t = useT()
  const store = useStore()
  const [form, setForm] = useState(emptyForm)
  const [imported, setImported] = useState(false)
  const { run, busy, error, clearError } = useAsyncAction()
  const set = (k: keyof ReturnType<typeof emptyForm>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const complete = form.venueNameRaw.trim() && form.sourceUrl.trim() && form.publishedAt && form.summary.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setImported(false)
    const ok = await run(() =>
      store.importNasNotice({
        venueNameRaw: form.venueNameRaw.trim(),
        addressRaw: form.addressRaw.trim() || undefined,
        sourceUrl: form.sourceUrl.trim(),
        // la data del comunicato è un giorno: la fissiamo alle 9 locali
        publishedAt: new Date(`${form.publishedAt}T09:00:00`).toISOString(),
        summary: form.summary.trim(),
        importedBy: moderatorId,
      }),
    )
    if (ok) {
      setForm(emptyForm())
      setImported(true)
    }
  }

  return (
    <form className="card card-pad grid gap-3" onSubmit={submit}>
      <h3 className="font-bold">{t('mod.nas.form_title')}</h3>
      <div className="field">
        <label htmlFor="nas-name">{t('mod.nas.venue_name')}</label>
        <input id="nas-name" className="input" value={form.venueNameRaw} onChange={set('venueNameRaw')} required />
      </div>
      <div className="field">
        <label htmlFor="nas-address">
          {t('mod.nas.address')} <span className="font-normal">({t('common.optional')})</span>
        </label>
        <input id="nas-address" className="input" value={form.addressRaw} onChange={set('addressRaw')} />
      </div>
      <div className="field">
        <label htmlFor="nas-url">{t('mod.nas.source_url')}</label>
        <input id="nas-url" className="input" type="url" inputMode="url" placeholder="https://" value={form.sourceUrl} onChange={set('sourceUrl')} required />
      </div>
      <div className="field">
        <label htmlFor="nas-date">{t('mod.nas.published_at')}</label>
        <input id="nas-date" className="input" type="date" value={form.publishedAt} max={todayInput()} onChange={set('publishedAt')} required />
      </div>
      <div className="field">
        <label htmlFor="nas-summary">{t('mod.nas.summary')}</label>
        <textarea id="nas-summary" className="textarea" rows={3} value={form.summary} onChange={set('summary')} placeholder={t('mod.nas.summary_placeholder')} required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!complete || busy}>
        {t('mod.nas.import')}
      </button>
      {imported && (
        <Notice tone="ok" live>
          {t('mod.nas.imported')}
        </Notice>
      )}
      <ErrorBox keys={error} onClose={clearError} />
    </form>
  )
}

interface RowProps {
  notice: NasNotice
  venues: Venue[]
  venueById: Map<string, Venue>
  moderatorId: string
  nowIso: string
}

function NasNoticeRow({ notice, venues, venueById, moderatorId, nowIso }: RowProps) {
  const t = useT()
  const { lang } = useLang()
  const venue = notice.venueId ? venueById.get(notice.venueId) : undefined
  const linked = !!notice.linkedReportId
  return (
    <li className="card card-pad grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-muted tnum">{t('mod.nas.published_on', { date: fmtDate(notice.publishedAt, lang) })}</span>
        {linked ? <span className="chip chip-neutral bg-accent-soft text-fg">{t('mod.nas.linked')}</span> : <span className="chip chip-in_verifica">{t('mod.nas.unlinked')}</span>}
      </div>
      <div className="font-semibold leading-tight break-words">{notice.venueNameRaw}</div>
      {notice.addressRaw && <div className="text-sm text-fg-muted">{notice.addressRaw}</div>}
      <p className="text-sm break-words">{notice.summary}</p>
      <div className="flex flex-wrap items-center gap-x-3 text-xs text-fg-muted">
        <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all inline-flex items-center min-h-[44px]">
          {t('mod.nas.source')}
        </a>
        <span className="tnum">{t('mod.nas.imported_on', { when: fmtRelative(notice.importedAt, lang, nowIso) })}</span>
      </div>
      {linked ? (
        venue ? (
          <Link to={`/locale/${venue.id}`} className="btn btn-outline justify-self-start">
            {t('mod.nas.linked_to', { venue: venue.name })} ›
          </Link>
        ) : (
          <p className="text-sm text-fg-muted">{t('mod.common.venue_unknown')}</p>
        )
      ) : (
        <LinkToVenue notice={notice} venues={venues} moderatorId={moderatorId} />
      )}
    </li>
  )
}

function LinkToVenue({ notice, venues, moderatorId }: { notice: NasNotice; venues: Venue[]; moderatorId: string }) {
  const t = useT()
  const store = useStore()
  const [selected, setSelected] = useState<Venue | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { run, busy, error, clearError } = useAsyncAction()
  const link = () => selected && run(() => store.linkNasNotice(notice.id, selected.id, moderatorId))

  return (
    <div className="grid gap-2 border-t border-line pt-3">
      <div className="text-sm font-semibold">{t('mod.nas.link_label')}</div>
      <VenueSearchSelect
        id={`venue-${notice.id}`}
        venues={venues}
        selected={selected}
        onSelect={(v) => {
          setSelected(v)
          setConfirming(false)
        }}
      />
      {selected && !confirming && (
        <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
          {t('mod.nas.link_action', { venue: selected.name })}
        </button>
      )}
      {selected && confirming && (
        <Notice tone="info">
          <p>{t('mod.nas.link_hint', { venue: selected.name })}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={link}>
              {t('mod.nas.link_confirm')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Notice>
      )}
      <ErrorBox keys={error} onClose={clearError} />
    </div>
  )
}
