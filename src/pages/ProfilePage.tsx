/**
 * Profilo dell'utente loggato: identità e verifiche, contatore 3/mese, le mie segnalazioni e il loro stato,
 * notifiche, dati conservati (GDPR) e uscita. Collegamenti alle aree del ruolo (locale, ditta, moderazione).
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Profile } from '../domain/types'
import { MAX_REPORTS_PER_MONTH } from '../domain/rules'
import { useSession, useStore, useStoreData } from '../data/StoreContext'
import { useT } from '../i18n'
import { EmptyState, PageHeader, RequireAuth, Section, Spinner, ErrorBox } from '../components/ui'
import { VerificationBadges } from '../components/auth/VerificationBadges'
import { ProfileReportCard } from '../components/auth/ProfileReportCard'
import { NotificationList } from '../components/auth/NotificationList'

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  )
}

function ProfileInner() {
  const { profile } = useSession()
  if (!profile) return null
  return <ProfileView key={profile.id} profile={profile} />
}

function ProfileView({ profile }: { profile: Profile }) {
  const t = useT()
  const store = useStore()
  const nav = useNavigate()

  const monthly = useStoreData((s) => s.countReportsThisMonth(profile.id), [profile.id])
  const reports = useStoreData((s) => s.listReportsByUser(profile.id), [profile.id])
  const venues = useStoreData((s) => s.listVenues(), [])
  const notifications = useStoreData((s) => s.listNotifications(profile.id), [profile.id])
  const venueById = useMemo(() => new Map((venues.data ?? []).map((v) => [v.id, v])), [venues.data])

  const used = monthly.data ?? 0
  const pct = Math.min(100, Math.round((used / MAX_REPORTS_PER_MONTH) * 100))

  const signOut = async () => {
    await store.signOut()
    nav('/')
  }

  return (
    <>
      <PageHeader eyebrow={t(`role.${profile.role}`)} title={profile.displayName} />
      <div className="gutter pb-2">
        <VerificationBadges profile={profile} />
      </div>

      <Section>
        <div className="card card-pad grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">{t('profile.month_counter')}</h2>
            <span className="tnum font-bold">{t('common.n_of_m', { n: used, m: MAX_REPORTS_PER_MONTH })}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_REPORTS_PER_MONTH} aria-valuenow={used} aria-label={t('profile.month_counter')}>
            <div className={`h-full rounded-full ${used >= MAX_REPORTS_PER_MONTH ? 'bg-st-confirmed' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-fg-muted">{t('profile.month_hint', { m: MAX_REPORTS_PER_MONTH })}</p>
        </div>
      </Section>

      {(profile.role === 'locale' || profile.role === 'ditta' || profile.role === 'moderatore' || profile.role === 'admin') && (
        <Section title={t('profile.links.title')}>
          <div className="flex flex-wrap gap-2">
            {profile.role === 'locale' && profile.venueIds?.[0] && (
              <Link to={`/locale/${profile.venueIds[0]}/gestisci`} className="btn btn-outline">
                {t('profile.manage_venue')} ›
              </Link>
            )}
            {profile.role === 'ditta' && (
              <Link to="/ditte" className="btn btn-outline">
                {t('profile.companies')} ›
              </Link>
            )}
            {(profile.role === 'moderatore' || profile.role === 'admin') && (
              <Link to="/moderazione" className="btn btn-outline">
                {t('profile.moderation')} ›
              </Link>
            )}
          </div>
        </Section>
      )}

      <Section
        title={t('profile.my_reports')}
        aside={
          <Link to="/segnala" className="btn btn-primary">
            {t('profile.new_report')}
          </Link>
        }
      >
        {reports.loading && !reports.data && <Spinner />}
        {reports.error && <ErrorBox keys={reports.error} />}
        {reports.data && reports.data.length === 0 && <EmptyState title={t('profile.no_reports')} />}
        {reports.data && reports.data.length > 0 && (
          <ul className="grid gap-3">
            {reports.data.map((r) => (
              <ProfileReportCard key={r.id} report={r} venue={venueById.get(r.venueId)} />
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('profile.notifications')}>
        {notifications.loading && !notifications.data && <Spinner />}
        {notifications.data && <NotificationList items={notifications.data} />}
      </Section>

      <Section title={t('profile.data.title')}>
        <div className="card card-pad grid gap-3">
          <p className="text-sm text-fg-muted">{t('profile.data.body')}</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/privacy" className="btn btn-outline">
              {t('profile.data.privacy_link')}
            </Link>
            <button type="button" className="btn btn-danger" onClick={signOut}>
              {t('profile.data.logout')}
            </button>
          </div>
        </div>
      </Section>
    </>
  )
}
