/**
 * Accesso allo store dalle pagine:
 *   const store = useStore()
 *   const { profile, refresh } = useSession()
 *   const { data, loading, error, reload } = useStoreData(s => s.listVenues(), [])
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type DependencyList, type ReactNode } from 'react'
import type { DataStore } from './store'
import type { Profile } from '../domain/types'
import { storePromise } from './index'
import { RuleViolation } from '../domain/stateMachine'

interface StoreContextValue {
  store: DataStore
  profile: Profile | null
  refreshSession: () => Promise<void>
  /** incrementa a ogni cambiamento dei dati: usalo come dipendenza per ricaricare */
  version: number
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [store, setStore] = useState<DataStore | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    // L'effetto può essere smontato (StrictMode, unmount) prima che la promise si risolva:
    // senza il flag `cancelled` la sottoscrizione creata dopo il cleanup non verrebbe mai rimossa.
    let cancelled = false
    let unsub = () => {}
    storePromise.then(async (s) => {
      if (cancelled) return
      setStore(s)
      const session = await s.getSession()
      if (cancelled) return
      setProfile(session)
      unsub = s.subscribe(() => {
        setVersion((v) => v + 1)
        s.getSession().then((p) => {
          if (!cancelled) setProfile(p)
        })
      })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const refreshSession = useCallback(async () => {
    if (store) setProfile(await store.getSession())
  }, [store])

  const value = useMemo(() => (store ? { store, profile, refreshSession, version } : null), [store, profile, refreshSession, version])
  if (!value) return <>{fallback ?? null}</>
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): DataStore {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx.store
}

export function useSession(): { profile: Profile | null; refresh: () => Promise<void> } {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useSession must be used inside <StoreProvider>')
  return { profile: ctx.profile, refresh: ctx.refreshSession }
}

export function useStoreVersion(): number {
  const ctx = useContext(StoreContext)
  return ctx?.version ?? 0
}

export interface StoreDataState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** Carica dati dallo store e ricarica automaticamente quando lo store cambia. */
export function useStoreData<T>(fetcher: (store: DataStore) => Promise<T>, deps: DependencyList): StoreDataState<T> {
  const store = useStore()
  const version = useStoreVersion()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetcher(store)
      .then((d) => {
        if (alive) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(errorKey(e))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, tick, ...deps])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}

/** Chiave i18n (o messaggio) da un errore dello store. */
export function errorKey(e: unknown): string {
  if (e instanceof RuleViolation) return e.reasons[0] ?? 'common.error'
  if (e instanceof Error) return e.message || 'common.error'
  return 'common.error'
}

export function errorKeys(e: unknown): string[] {
  if (e instanceof RuleViolation) return e.reasons
  if (e instanceof Error) return [e.message || 'common.error']
  return ['common.error']
}
