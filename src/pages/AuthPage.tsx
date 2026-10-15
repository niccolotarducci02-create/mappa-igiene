/**
 * Accesso: telefono + codice OTP (in demo il codice è mostrato), SPID/CIE solo in produzione,
 * e in demo "Entra come" con i personaggi. Da qui si cambia profilo e si ripristinano i dati demo.
 */
import { Link, useNavigate } from 'react-router-dom'
import { useSession, useStore } from '../data/StoreContext'
import { useT } from '../i18n'
import { PageHeader } from '../components/ui'
import { PhoneLogin } from '../components/auth/PhoneLogin'
import { PersonaGrid } from '../components/auth/PersonaGrid'
import { ResetDemo } from '../components/auth/ResetDemo'
import { VerificationBadges } from '../components/auth/VerificationBadges'

export default function AuthPage() {
  const t = useT()
  const store = useStore()
  const nav = useNavigate()
  const { profile } = useSession()
  const demo = store.mode === 'demo'

  const signOut = async () => {
    await store.signOut()
    nav('/')
  }

  return (
    <>
      <PageHeader title={t('auth.title')} subtitle={t('auth.subtitle')} />
      <div className={`gutter grid gap-4 ${demo ? 'md:grid-cols-2 md:items-start' : 'max-w-[520px]'}`}>
        <div className="grid gap-4 min-w-0">
          {profile ? (
            <section className="card card-pad grid gap-3">
              <div className="eyebrow">{t('auth.current.title')}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{profile.displayName}</span>
                <span className="chip chip-neutral bg-muted text-fg-muted">{t(`role.${profile.role}`)}</span>
              </div>
              <VerificationBadges profile={profile} />
              <div className="flex flex-wrap gap-2">
                <Link to="/profilo" className="btn btn-primary">
                  {t('auth.current.go_profile')}
                </Link>
                <button type="button" className="btn btn-outline" onClick={signOut}>
                  {t('auth.current.logout')}
                </button>
              </div>
              {demo && <p className="text-xs text-fg-muted">{t('auth.current.switch_hint')}</p>}
            </section>
          ) : (
            <PhoneLogin />
          )}

          <section className="card card-pad grid gap-2">
            <h2 className="font-semibold">{t('auth.why.title')}</h2>
            <p className="text-sm text-fg-muted">{t('auth.why.body')}</p>
            <Link to="/regole" className="text-sm font-semibold text-accent">
              {t('nav.rules')} ›
            </Link>
          </section>
        </div>

        {demo && (
          /* Senza profilo attivo, su mobile i personaggi demo vengono prima del modulo OTP */
          <div className={`grid gap-4 min-w-0 ${profile ? '' : 'order-first md:order-none'}`}>
            <PersonaGrid current={profile} />
            <ResetDemo />
          </div>
        )}
      </div>
    </>
  )
}
