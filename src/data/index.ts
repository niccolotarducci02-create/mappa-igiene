import type { DataStore } from './store'
import { LocalStore } from './localStore'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

async function build(): Promise<DataStore> {
  if (url && anon) {
    const mod = await import('./supabaseStore')
    return mod.createSupabaseStore(mod.createSupabaseClient(url, anon))
  }
  return new LocalStore()
}

/** Istanza unica dello store, scelta in base all'ambiente. */
export const storePromise: Promise<DataStore> = build()
