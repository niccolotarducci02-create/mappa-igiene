/**
 * Guscio dell'app: barra superiore (logo, lingua, notifiche, profilo), contenuto, barra inferiore a schede.
 * La barra inferiore cambia con il ruolo: cliente, titolare, ditta, moderazione.
 */
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { useSession, useStore, useStoreData } from '../data/StoreContext'

function Logo() {
  return (
    <svg viewBox="0 0 128 128" width="28" height="28" aria-hidden="true">
      <rect width="128" height="128" rx="28" fill="var(--accent)" />
      <path d="M64 22c-17 0-30 13-30 30 0 22 30 54 30 54s30-32 30-54c0-17-13-30-30-30z" fill="var(--accent-fg)" />
      <circle cx="64" cy="52" r="13" fill="var(--accent)" />
      <path d="M57 52l5 5 10-11" fill="none" stroke="var(--accent-fg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Pulsanti della barra superiore: 44×44 px (ARCHITETTURA), solo token. Non usano .btn-sm (34 px, non sovrascrivibile dalle utility).
const headerBtn = 'inline-flex items-center justify-center min-h-11 min-w-11 px-2 rounded-app border border-line text-fg text-sm font-semibold hover:bg-muted'

export function Layout() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { profile } = useSession()
  const store = useStore()
  const loc = useLocation()
  const nav = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const notifications = useStoreData((s) => (profile ? s.listNotifications(profile.id) : Promise.resolve([])), [profile?.id])
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0
  const isMap = loc.pathname === '/'

  useEffect(() => {
    setMenuOpen(false)
    setBellOpen(false)
  }, [loc.pathname])

  const tabs: Array<{ to: string; label: string; icon: string }> = [
    { to: '/', label: t('nav.map'), icon: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' },
    { to: '/segnala', label: t('nav.report'), icon: 'M4 7h3l2-3h6l2 3h3v12H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  ]
  // Un titolare senza locale rivendicato non ha una pagina di gestione: niente scheda (rivendica dalla scheda pubblica)
  if (profile?.role === 'locale' && profile.venueIds?.[0]) tabs.push({ to: `/locale/${profile.venueIds[0]}/gestisci`, label: t('nav.my_venue'), icon: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z' })
  if (profile?.role === 'ditta') tabs.push({ to: '/ditte', label: t('nav.companies'), icon: 'M3 21V8l9-5 9 5v13h-6v-6H9v6z' })
  if (profile?.role === 'moderatore' || profile?.role === 'admin') tabs.push({ to: '/moderazione', label: t('nav.moderation'), icon: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z M9 12l2 2 4-4' })
  tabs.push({ to: profile ? '/profilo' : '/accedi', label: profile ? t('nav.profile') : t('nav.login'), icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0z' })

  const more: Array<{ to: string; label: string }> = [
    { to: '/come-funziona', label: t('nav.how') },
    { to: '/regole', label: t('nav.rules') },
    { to: '/trasparenza', label: t('nav.transparency') },
    { to: '/nas', label: t('nav.nas') },
    { to: '/ditte', label: t('nav.companies') },
    { to: '/termini', label: t('nav.terms') },
    { to: '/privacy', label: t('nav.privacy') },
    { to: '/dsa', label: t('nav.dsa') },
  ]

  return (
    <div className="h-full flex flex-col" style={{ minHeight: '100%' }}>
      <header className="sticky z-[1000] bg-elev/95 backdrop-blur border-b border-line" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="gutter h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-base min-w-0" aria-label={t('app.name')}>
            <Logo />
            <span className="truncate">{t('app.name')}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={headerBtn}
              data-testid="lang-toggle"
              onClick={() => setLang(lang === 'it' ? 'en' : 'it')}
              aria-label={lang === 'it' ? t('lang.en') : t('lang.it')}
              title={lang === 'it' ? t('lang.en') : t('lang.it')}
            >
              {lang === 'it' ? 'EN' : 'IT'}
            </button>
            {profile && (
              <div>
                <button type="button" className={`${headerBtn} relative`} aria-label={t('nav.notifications')} aria-expanded={bellOpen} onClick={() => setBellOpen((o) => !o)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" /></svg>
                  {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-st-confirmed text-st-confirmed-soft text-xs font-bold grid place-items-center tnum">{unread}</span>}
                </button>
                {bellOpen && (
                  <div className="absolute top-[calc(3.5rem+4px)] right-[max(16px,env(safe-area-inset-right,0px))] w-[min(calc(100vw-32px),360px)] card shadow-app max-h-[60vh] overflow-auto z-[1001]">
                    <div className="px-3 py-2 border-b border-line font-semibold text-sm">{t('nav.notifications')}</div>
                    {!notifications.data?.length && <div className="p-3 text-sm text-fg-muted">{t('common.empty')}</div>}
                    {notifications.data?.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 border-b border-line last:border-0 hover:bg-muted ${n.read ? 'opacity-70' : ''}`}
                        onClick={async () => {
                          await store.markNotificationRead(n.id)
                          setBellOpen(false)
                          if (n.link) nav(n.link)
                        }}
                      >
                        <div className="text-sm font-semibold">{n.title}</div>
                        <div className="text-xs text-fg-muted">{n.body}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className={headerBtn} aria-label={t('nav.menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="gutter pb-3 border-t border-line bg-elev" aria-label={t('nav.more')}>
            <ul className="grid grid-cols-2 gap-1 pt-2 text-sm">
              {more.map((m) => (
                <li key={m.to}>
                  <NavLink to={m.to} className={({ isActive }) => `flex items-center min-h-11 px-3 py-2 rounded-[var(--radius)] hover:bg-muted ${isActive ? 'bg-accent-soft font-semibold' : ''}`}>
                    {m.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <NavLink to="/accedi" className="flex items-center min-h-11 px-3 py-2 rounded-[var(--radius)] hover:bg-muted">
                  {profile ? `${t('demo.enter_as')}… / ${t('nav.logout')}` : t('nav.login')}
                </NavLink>
              </li>
            </ul>
            {profile && (
              <div className="mt-2 text-xs text-fg-muted">
                {t('demo.persona')}: <strong className="text-fg">{profile.displayName}</strong> · {t(`role.${profile.role}`)}
              </div>
            )}
          </nav>
        )}
      </header>

      {store.mode === 'demo' && !isMap && (
        <div className="gutter py-1.5 text-xs bg-st-verifying-soft text-st-verifying text-center">{t('app.demo_banner')}</div>
      )}

      <main className={`flex-1 min-w-0 ${isMap ? 'flex flex-col' : 'pb-24'}`}>
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-[1000] bg-elev border-t border-line" aria-label={t('nav.menu')} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <ul className="gutter flex justify-around items-stretch h-16">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1 min-w-0">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) => `h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-fg-muted'}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={tab.icon} /></svg>
                <span className="truncate max-w-full">{tab.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
