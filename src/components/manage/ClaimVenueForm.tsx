/**
 * Rivendicazione del locale: partita IVA (11 cifre) e telefono dell'attività.
 * La richiesta resta "in verifica" (demo e produzione allo stesso modo): la moderazione controlla i dati e la approva
 * dalla scheda "Rivendicazioni"; solo allora si attiva la gestione. Qui si mostra, nell'ordine: l'esito dell'invio,
 * la richiesta già in verifica, oppure il modulo (con l'eventuale motivo dell'ultimo rifiuto).
 */
import { useState, type FormEvent } from 'react'
import type { Venue, VenueClaim } from '../../domain/types'
import { errorKeys, useStore, useStoreData, type StoreDataState } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { ErrorBox, Notice, Spinner } from '../ui'

export interface ClaimState {
  /** Richiesta in verifica di questo utente per questo locale, se c'è */
  pending: VenueClaim | null
  /** Ultima richiesta decisa (approvata o rifiutata) di questo utente per questo locale */
  lastDecided: VenueClaim | null
}

/** Richieste dell'utente per il locale; si ricarica da sola quando lo store cambia (invio, decisione della moderazione). */
export function useClaimState(venueId: string, userId: string): StoreDataState<ClaimState> {
  return useStoreData(
    async (s) => {
      const mine = (await s.listVenueClaims({ userId })).filter((c) => c.venueId === venueId)
      return {
        pending: mine.find((c) => c.status === 'in_verifica') ?? null,
        lastDecided: mine.filter((c) => c.status !== 'in_verifica').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))[0] ?? null,
      }
    },
    [venueId, userId],
  )
}

/** Stato "richiesta in verifica": al posto del modulo, finché la moderazione non decide. */
export function ClaimPendingNotice({ venue, claim }: { venue: Venue; claim: VenueClaim }) {
  const t = useT()
  const { lang } = useLang()
  return (
    <Notice tone="info" testId="claim-pending">
      <strong className="block">{t('manage.claim_pending_title')}</strong>
      <p className="mt-1">{t('manage.claim_pending_body', { name: venue.name, date: fmtDate(claim.requestedAt, lang), vat: claim.vat })}</p>
    </Notice>
  )
}

export function ClaimVenueForm({ venue, userId }: { venue: Venue; userId: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const state = useClaimState(venue.id, userId)
  const [vat, setVat] = useState('')
  const [phone, setPhone] = useState('+39 ')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<VenueClaim | null>(null)
  const [err, setErr] = useState<string[] | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const { claim } = await store.claimVenue(venue.id, userId, { vat: vat.trim(), phone: phone.trim() })
      setSent(claim)
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Notice tone="ok" live testId="claim-sent">
        <strong className="block">{t('manage.claim_sent')}</strong>
        <p className="mt-1">{t('manage.claim_sent_body')}</p>
      </Notice>
    )
  }
  if (state.loading && !state.data) return <Spinner />
  if (state.data?.pending) return <ClaimPendingNotice venue={venue} claim={state.data.pending} />

  const rejected = state.data?.lastDecided?.status === 'rifiutata' ? state.data.lastDecided : null

  return (
    <form className="card card-pad grid gap-3" onSubmit={submit}>
      <h2 className="text-lg font-bold">{t('manage.claim_title')}</h2>
      <p className="text-sm text-fg-muted">{t('manage.claim_intro', { name: venue.name })}</p>

      {rejected && (
        <Notice tone="warn" testId="claim-rejected">
          <p>{t('manage.claim_rejected', { date: fmtDate(rejected.decidedAt, lang) })}</p>
          {rejected.note && <p className="mt-1">{t('manage.claim_rejected_note', { note: rejected.note })}</p>}
        </Notice>
      )}

      <div className="field">
        <label htmlFor="claim-vat">{t('manage.claim_vat')}</label>
        <input
          id="claim-vat"
          className="input tnum"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={13}
          value={vat}
          onChange={(e) => setVat(e.target.value.toUpperCase().replace(/[^0-9IT]/g, ''))}
          required
        />
        <p className="text-xs text-fg-muted">{t('manage.claim_vat_hint')}</p>
      </div>

      <div className="field">
        <label htmlFor="claim-phone">{t('manage.claim_phone')}</label>
        <input id="claim-phone" className="input tnum" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>

      <Notice tone="info">{t('manage.claim_rights')}</Notice>
      {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? t('manage.claim_busy') : t('manage.claim_submit')}
      </button>
    </form>
  )
}
