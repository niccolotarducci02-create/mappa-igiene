/** Componenti condivisi e piccoli. Le pagine li usano per restare coerenti. */
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { ReportState, VenueStatus } from '../domain/types'
import { useT } from '../i18n'
import { useSession } from '../data/StoreContext'

export function StatusChip({ status, short = false }: { status: VenueStatus; short?: boolean }) {
  const t = useT()
  return <span className={`chip chip-${status}`}>{t(short ? `status.short.${status}` : `status.${status}`)}</span>
}

const REPORT_STATE_TO_STATUS: Record<ReportState, VenueStatus> = {
  in_verifica: 'in_verifica',
  scartata: 'nessuna',
  archiviata: 'nessuna',
  pubblicata: 'confermata',
  risolta: 'risolta',
  rimossa: 'nessuna',
}

export function ReportStateChip({ state }: { state: ReportState }) {
  const t = useT()
  return <span className={`chip chip-${REPORT_STATE_TO_STATUS[state]}`}>{t(`report_state.${state}`)}</span>
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="gutter pt-5 pb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-fg-muted mt-1 max-w-[65ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Section({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="gutter py-3">
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 mb-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card card-pad text-center text-fg-muted">
      <p className="font-semibold text-fg">{title}</p>
      {body && <p className="mt-1 text-sm">{body}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="gutter py-8 text-center text-fg-muted" role="status" aria-live="polite">
      <span className="inline-block w-5 h-5 rounded-full border-2 border-line border-t-accent animate-spin align-middle mr-2" />
      {label ?? t('common.loading')}
    </div>
  )
}

export function ErrorBox({ keys, onClose }: { keys: string[] | string | null; onClose?: () => void }) {
  const t = useT()
  if (!keys || (Array.isArray(keys) && !keys.length)) return null
  const list = Array.isArray(keys) ? keys : [keys]
  return (
    <div role="alert" className="rounded-[var(--radius)] border border-st-confirmed/40 bg-st-confirmed-soft text-st-confirmed p-3 text-sm flex items-start gap-3">
      <ul className="flex-1 list-disc pl-4">
        {list.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
      {onClose && (
        <button type="button" className="font-semibold" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      )}
    </div>
  )
}

// `live`: annuncia il contenuto agli screen reader come regione di stato (role="status", aria-live="polite").
// Di default è attivo per tone="ok", perché le notifiche verdi sono quasi sempre esiti di un'azione
// inseriti dinamicamente (certificato caricato, import NAS, reset demo, segnalazione DSA inviata).
export function Notice({
  tone = 'info',
  children,
  testId,
  live = tone === 'ok',
}: {
  tone?: 'info' | 'ok' | 'warn' | 'danger'
  children: ReactNode
  testId?: string
  live?: boolean
}) {
  const cls = {
    info: 'bg-accent-soft text-fg border-accent/30',
    ok: 'bg-st-resolved-soft text-st-resolved border-st-resolved/30',
    warn: 'bg-st-verifying-soft text-st-verifying border-st-verifying/30',
    danger: 'bg-st-confirmed-soft text-st-confirmed border-st-confirmed/30',
  }[tone]
  const liveProps = live ? { role: 'status', 'aria-live': 'polite' as const } : {}
  return (
    <div className={`rounded-[var(--radius)] border p-3 text-sm ${cls}`} data-testid={testId} {...liveProps}>
      {children}
    </div>
  )
}

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  // Nota: usa useSession, importato qui per evitare dipendenze circolari nei moduli pagina
  return <RequireAuthInner roles={roles}>{children}</RequireAuthInner>
}

function RequireAuthInner({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const t = useT()
  const { profile } = useSession()
  if (!profile) {
    return (
      <div className="gutter py-8">
        <EmptyState title={t('common.login_required')} action={<Link className="btn btn-primary" to="/accedi">{t('nav.login')}</Link>} />
      </div>
    )
  }
  if (roles && !roles.includes(profile.role) && profile.role !== 'admin') {
    return (
      <div className="gutter py-8">
        <EmptyState title={t('common.role_required')} body={`${t('demo.persona')}: ${profile.displayName}`} action={<Link className="btn" to="/accedi">{t('demo.enter_as')}…</Link>} />
      </div>
    )
  }
  return <>{children}</>
}

export function KeyValue({ items }: { items: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
