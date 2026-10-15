/** "Entra come": personaggi demo raggruppati per ruolo. Cliccando si entra e si va alla pagina del ruolo. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Profile, Role } from '../../domain/types'
import { errorKeys, useStore, useStoreData } from '../../data/StoreContext'
import { useT } from '../../i18n'
import { ErrorBox, Spinner } from '../ui'

const ROLE_ORDER: Role[] = ['utente', 'locale', 'ditta', 'moderatore', 'admin']

/** Dove porta l'accesso con un certo profilo. */
function homeFor(p: Profile): string {
  switch (p.role) {
    case 'locale':
      return p.venueIds?.[0] ? `/locale/${p.venueIds[0]}/gestisci` : '/'
    case 'ditta':
      return '/ditte'
    case 'moderatore':
    case 'admin':
      return '/moderazione'
    default:
      return '/'
  }
}

export function PersonaGrid({ current }: { current: Profile | null }) {
  const t = useT()
  const store = useStore()
  const nav = useNavigate()
  const personas = useStoreData((s) => s.listDemoPersonas(), [])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string[] | null>(null)

  const enter = async (p: Profile) => {
    setBusyId(p.id)
    setErr(null)
    try {
      const signed = await store.signInDemo(p.id)
      nav(homeFor(signed))
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusyId(null)
    }
  }

  if (personas.loading && !personas.data) return <Spinner />
  const list = personas.data ?? []

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-bold">{t('auth.personas.title')}</h2>
        <p className="text-sm text-fg-muted">{t('auth.personas.subtitle')}</p>
      </div>
      {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
      {ROLE_ORDER.map((role) => {
        const group = list.filter((p) => p.role === role)
        if (!group.length) return null
        return (
          <div key={role} className="grid gap-2">
            <div className="eyebrow">{t(`role.${role}`)}</div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.map((p) => {
                const isCurrent = current?.id === p.id
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => enter(p)}
                      disabled={busyId !== null}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`card card-pad w-full text-left grid gap-1 min-h-[44px] hover:bg-muted disabled:opacity-60 ${isCurrent ? 'border-accent bg-accent-soft' : ''}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold leading-tight">{p.displayName}</span>
                        {isCurrent && <span className="chip chip-neutral bg-muted text-fg-muted">{t('auth.personas.current')}</span>}
                      </span>
                      <span className="text-xs text-fg-muted leading-snug">{t(`auth.persona.desc.${p.role}`)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
