/**
 * Scheda "Rivendicazioni": richieste di gestione di un locale (partita IVA e telefono dell'attività), dalla più vecchia.
 * "Approva" rende l'utente titolare (claimedBy, locali gestiti, ruolo 'locale'); "Rifiuta" richiede un motivo, che
 * l'utente riceve come avviso. Regola 3: il diritto di replica spetta al locale, non a chiunque lo rivendichi.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { VenueClaim } from '../../domain/types'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtRelative } from '../../lib/format'
import { EmptyState, ErrorBox, KeyValue, Notice } from '../ui'
import { shortId, type TabProps } from './types'
import { useAsyncAction } from './useAsyncAction'

export function ClaimsTab({ data, profile, nowIso }: TabProps) {
  const t = useT()
  // in attesa prima, dalla più vecchia; poi le decise dalla più recente
  const pending = data.claims.filter((c) => c.status === 'in_verifica').sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
  const decided = data.claims.filter((c) => c.status !== 'in_verifica').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))

  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <p className="text-sm text-fg-muted">{t('mod.claims.intro')}</p>
        <h3 className="font-bold">
          {t('mod.claims.pending_title')} <span className="text-fg-muted font-normal tnum">({pending.length})</span>
        </h3>
        {pending.length === 0 ? (
          <EmptyState title={t('mod.claims.empty')} body={t('mod.claims.empty_body')} />
        ) : (
          <ul className="grid gap-4">
            {pending.map((c) => (
              <ClaimCard key={c.id} claim={c} data={data} moderatorId={profile.id} nowIso={nowIso} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-bold">
          {t('mod.claims.decided_title')} <span className="text-fg-muted font-normal tnum">({decided.length})</span>
        </h3>
        <DecidedTable claims={decided} data={data} />
      </section>
    </div>
  )
}

/** Nome del richiedente se lo conosciamo (profili demo), altrimenti l'identificativo accorciato. */
function requesterName(data: TabProps['data'], userId: string, t: ReturnType<typeof useT>): string {
  return data.personas.find((p) => p.id === userId)?.displayName ?? t('mod.claims.requester_unknown', { id: shortId(userId, 10) })
}

function ClaimCard({ claim, data, moderatorId, nowIso }: { claim: VenueClaim; data: TabProps['data']; moderatorId: string; nowIso: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const { run, busy, error, clearError } = useAsyncAction()

  const venue = data.venueById.get(claim.venueId)
  // un altro titolare è già registrato: approvare fallirebbe (rule.venue_already_claimed), meglio dirlo prima
  const otherOwner = !!venue?.claimedBy && venue.claimedBy !== claim.userId
  const noteId = `claim-note-${claim.id}`

  const approve = () => run(() => store.decideVenueClaim(claim.id, true, moderatorId))
  const reject = () => run(() => store.decideVenueClaim(claim.id, false, moderatorId, note.trim()))

  return (
    <li className="card card-pad grid gap-3" data-testid="claim-card" data-claim-id={claim.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold leading-tight">
          {venue ? (
            <Link to={`/locale/${venue.id}`} className="underline">
              {venue.name}
            </Link>
          ) : (
            t('mod.common.venue_unknown')
          )}
        </div>
        <span className="text-xs text-fg-muted tnum">{t('mod.claims.requested', { when: fmtRelative(claim.requestedAt, lang, nowIso) })}</span>
      </div>

      <KeyValue
        items={[
          [t('mod.claims.requester'), requesterName(data, claim.userId, t)],
          [t('mod.claims.vat'), <span key="vat" className="tnum font-data">{claim.vat}</span>],
          [t('mod.claims.phone'), claim.phone ? <span key="phone" className="tnum">{claim.phone}</span> : <span key="phone" className="text-fg-muted">{t('mod.claims.phone_missing')}</span>],
        ]}
      />

      {otherOwner && <Notice tone="warn">{t('mod.claims.other_owner')}</Notice>}

      {!rejecting ? (
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-ok" disabled={busy || otherOwner} onClick={approve}>
              {t('mod.claims.approve')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setRejecting(true)}>
              {t('mod.claims.reject')}
            </button>
          </div>
          <p className="text-xs text-fg-muted">{t('mod.claims.approve_hint')}</p>
        </div>
      ) : (
        <div className="grid gap-2 border-t border-line pt-3">
          <div className="field">
            <label htmlFor={noteId}>{t('mod.claims.reject_note')}</label>
            <textarea id={noteId} className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mod.claims.reject_note_placeholder')} />
            <span className="text-xs text-fg-muted">{t('mod.claims.reject_note_hint')}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-danger" disabled={!note.trim() || busy} onClick={reject}>
              {t('mod.claims.reject_confirm')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <ErrorBox keys={error} onClose={clearError} />
    </li>
  )
}

/** Richieste già decise, in forma compatta: date, locale e richiedente, decisione con nota. */
function DecidedTable({ claims, data }: { claims: VenueClaim[]; data: TabProps['data'] }) {
  const t = useT()
  const { lang } = useLang()
  if (!claims.length) return <p className="text-sm text-fg-muted">{t('mod.claims.no_decided')}</p>
  return (
    <table className="w-full table-fixed text-xs card" data-testid="claims-decided">
      <thead className="text-left text-fg-muted">
        <tr>
          <th scope="col" className="p-2 w-[28%] font-semibold">{t('mod.claims.col_dates')}</th>
          <th scope="col" className="p-2 w-[36%] font-semibold">{t('mod.claims.col_venue')}</th>
          <th scope="col" className="p-2 font-semibold">{t('mod.claims.col_decision')}</th>
        </tr>
      </thead>
      <tbody>
        {claims.map((c) => {
          const venue = data.venueById.get(c.venueId)
          const approved = c.status === 'approvata'
          return (
            <tr key={c.id} className="border-t border-line align-top" data-claim-id={c.id}>
              <td className="p-2 tnum break-words">
                <div>{fmtDate(c.requestedAt, lang)}</div>
                <div className="text-fg-muted">→ {fmtDate(c.decidedAt, lang)}</div>
              </td>
              <td className="p-2 break-words">
                <div className="font-semibold">{venue?.name ?? t('mod.common.venue_unknown')}</div>
                <div className="text-fg-muted">{requesterName(data, c.userId, t)}</div>
                <div className="text-fg-muted tnum">{c.vat}</div>
              </td>
              <td className="p-2 break-words">
                <span className={`chip ${approved ? 'chip-risolta' : 'chip-nessuna'}`}>{t(`mod.claims.status.${c.status}`)}</span>
                {c.note && <div className="text-fg-muted mt-1">{c.note}</div>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
