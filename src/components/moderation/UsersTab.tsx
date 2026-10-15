/**
 * Scheda "Utenti": chi ha inviato almeno una segnalazione, con i conteggi per stato.
 * "Blocca utente e dispositivo" vale per abusi ripetuti e passa da una conferma in linea; finisce nel registro attività.
 */
import { useMemo, useState } from 'react'
import type { Profile, ReportState } from '../../domain/types'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtRelative } from '../../lib/format'
import { EmptyState, ErrorBox, Notice } from '../ui'
import { shortId, type TabProps } from './types'
import { useAsyncAction } from './useAsyncAction'

const STATES: ReportState[] = ['in_verifica', 'pubblicata', 'risolta', 'archiviata', 'scartata', 'rimossa']

interface UserRow {
  id: string
  profile: Profile | undefined
  counts: Record<ReportState, number>
  total: number
  lastAt: string
}

export function UsersTab({ data, profile, nowIso }: TabProps) {
  const t = useT()
  const rows = useMemo(() => {
    const map = new Map<string, UserRow>()
    for (const r of data.reports) {
      let row = map.get(r.userId)
      if (!row) {
        row = {
          id: r.userId,
          profile: data.personas.find((p) => p.id === r.userId),
          counts: { in_verifica: 0, scartata: 0, archiviata: 0, pubblicata: 0, risolta: 0, rimossa: 0 },
          total: 0,
          lastAt: r.submittedAt,
        }
        map.set(r.userId, row)
      }
      row.counts[r.state]++
      row.total++
      if (r.submittedAt > row.lastAt) row.lastAt = r.submittedAt
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
  }, [data.reports, data.personas])

  if (!rows.length) return <EmptyState title={t('mod.users.empty')} />
  return (
    <div className="grid gap-3">
      <p className="text-sm text-fg-muted">{t('mod.users.intro')}</p>
      <ul className="grid gap-3">
        {rows.map((row) => (
          <UserCard key={row.id} row={row} actor={profile} nowIso={nowIso} />
        ))}
      </ul>
    </div>
  )
}

function UserCard({ row, actor, nowIso }: { row: UserRow; actor: Profile; nowIso: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [confirming, setConfirming] = useState(false)
  const { run, busy, error, clearError } = useAsyncAction()

  const blocked = !!row.profile?.blocked
  const role = row.profile?.role
  // Non si blocca sé stessi né un profilo di moderazione (le segnalazioni NAS sono a nome del moderatore)
  const canBlock = !blocked && row.id !== actor.id && role !== 'moderatore' && role !== 'admin'
  const canUnblock = blocked && row.id !== actor.id
  const block = async () => {
    const ok = await run(() => store.blockUser(row.id, actor.id))
    if (ok) setConfirming(false)
  }
  const unblock = async () => {
    const ok = await run(() => store.unblockUser(row.id, actor.id))
    if (ok) setConfirming(false)
  }

  return (
    <li className="card card-pad grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold leading-tight break-words">{row.profile?.displayName ?? t('mod.users.unknown', { id: shortId(row.id) })}</div>
          <div className="text-xs text-fg-muted">
            <span className="font-data">{shortId(row.id, 16)}</span>
            {role && <span> · {t(`role.${role}`)}</span>}
            <span className="tnum"> · {t('mod.users.last', { when: fmtRelative(row.lastAt, lang, nowIso) })}</span>
          </div>
        </div>
        {blocked ? <span className="chip chip-confermata">{t('mod.users.blocked')}</span> : <span className="chip chip-neutral bg-muted text-fg-muted">{t('mod.users.active')}</span>}
      </div>

      <dl className="grid grid-cols-3 gap-1 text-xs">
        {STATES.map((s) => (
          <div key={s} className={`rounded-[var(--radius)] bg-muted px-2 py-1.5 flex flex-col-reverse ${row.counts[s] ? '' : 'opacity-60'}`}>
            <dt className="text-fg-muted mt-0.5">{t(`mod.users.state.${s}`)}</dt>
            <dd className="font-bold tnum text-base leading-none">{row.counts[s]}</dd>
          </div>
        ))}
      </dl>
      <div className="text-sm tnum">{row.total === 1 ? t('mod.users.total_one') : t('mod.users.total', { n: row.total })}</div>

      {canBlock && !confirming && (
        <button type="button" className="btn btn-danger justify-self-start" onClick={() => setConfirming(true)}>
          {t('mod.users.block')}
        </button>
      )}
      {canBlock && confirming && (
        <div className="grid gap-2">
          <Notice tone="danger">
            <p>{t('mod.users.block_hint')}</p>
          </Notice>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={block}>
              {t('mod.users.block_confirm')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {canUnblock && !confirming && (
        <button type="button" className="btn btn-outline justify-self-start" onClick={() => setConfirming(true)}>
          {t('mod.users.unblock')}
        </button>
      )}
      {canUnblock && confirming && (
        <div className="grid gap-2">
          <Notice tone="warn">
            <p>{t('mod.users.unblock_hint')}</p>
          </Notice>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={unblock}>
              {t('mod.users.unblock_confirm')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <ErrorBox keys={error} onClose={clearError} />
    </li>
  )
}
