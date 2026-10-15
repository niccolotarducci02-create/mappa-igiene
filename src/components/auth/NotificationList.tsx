/** Notifiche dell'utente: lette/non lette; al tocco si segna letta e si apre il collegamento. */
import { useNavigate } from 'react-router-dom'
import type { Notification } from '../../domain/types'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtRelative } from '../../lib/format'
import { EmptyState } from '../ui'

export function NotificationList({ items }: { items: Notification[] }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const nav = useNavigate()

  if (!items.length) return <EmptyState title={t('profile.no_notifications')} />

  const open = async (n: Notification) => {
    if (!n.read) await store.markNotificationRead(n.id)
    if (n.link) nav(n.link)
  }

  return (
    <ul className="card divide-y divide-line">
      {items.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => open(n)} className={`w-full text-left px-4 py-3 min-h-[44px] grid gap-0.5 hover:bg-muted ${n.read ? 'opacity-70' : ''}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm leading-tight">{n.title}</span>
              {!n.read && <span className="chip chip-in_verifica">{t('profile.unread')}</span>}
            </span>
            <span className="text-sm text-fg-muted">{n.body}</span>
            <span className="text-xs text-fg-muted tnum">{fmtRelative(n.createdAt, lang)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
