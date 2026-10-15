/**
 * Verifica di chi chiama una Edge Function.
 *
 * Tre tipi di chiamante:
 *  1. service_role: il Bearer token è la chiave SUPABASE_SERVICE_ROLE_KEY (Database Webhook, pg_cron,
 *     chiamate tra funzioni). Nessun utente: azione "di sistema".
 *  2. utente: Bearer = JWT di Supabase Auth; viene validato con auth.getUser(token) e si legge il
 *     profilo (ruolo, ditta, blocco).
 *  3. segreto condiviso: header x-webhook-secret / x-cron-secret uguale a WEBHOOK_SECRET / CRON_SECRET
 *     (alternativa alla chiave service_role quando non si vuole copiarla nel pannello dei webhook).
 *
 * Nota: il gateway di Supabase verifica già il JWT quando `verify_jwt = true` in config.toml; qui si
 * ripete il controllo perché per alcune funzioni (Stripe, cron) il gateway è disattivato.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './cors.ts'
import { optionalEnv, requireEnv } from './env.ts'

export type Role = 'utente' | 'locale' | 'ditta' | 'moderatore' | 'admin'

export interface CallerProfile {
  id: string
  display_name: string
  role: Role
  phone: string | null
  email: string | null
  phone_verified: boolean
  spid_verified: boolean
  company_id: string | null
  blocked: boolean
}

export type Caller =
  | { kind: 'service' }
  | { kind: 'user'; userId: string; profile: CallerProfile; token: string }

/** Confronto a tempo costante tra due stringhe (evita timing attack sui segreti). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : null
}

/** Vero se la richiesta porta la chiave service_role oppure il segreto condiviso indicato. */
export function isServiceCall(req: Request, secretEnvName?: 'WEBHOOK_SECRET' | 'CRON_SECRET'): boolean {
  const token = bearerToken(req)
  const serviceKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (token && serviceKey && safeEqual(token, serviceKey)) return true
  if (secretEnvName) {
    const secret = optionalEnv(secretEnvName)
    const headerName = secretEnvName === 'CRON_SECRET' ? 'x-cron-secret' : 'x-webhook-secret'
    const given = req.headers.get(headerName)
    if (secret && given && safeEqual(given, secret)) return true
  }
  return false
}

/** Risolve il chiamante; null se non autenticato. */
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  if (isServiceCall(req, 'WEBHOOK_SECRET') || isServiceCall(req, 'CRON_SECRET')) return { kind: 'service' }
  const token = bearerToken(req)
  if (!token) return null
  // Il JWT anon non identifica nessuno
  if (safeEqual(token, requireEnv('SUPABASE_ANON_KEY'))) return null

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('id, display_name, role, phone, email, phone_verified, spid_verified, company_id, blocked')
    .eq('id', data.user.id)
    .maybeSingle()
  if (pErr) throw new Error(`profiles: ${pErr.message}`)
  if (!profile) return null
  return { kind: 'user', userId: data.user.id, profile: profile as CallerProfile, token }
}

export async function requireCaller(req: Request, admin: SupabaseClient): Promise<Caller> {
  const caller = await getCaller(req, admin)
  if (!caller) throw new HttpError(401, 'rule.login_required')
  return caller
}

export async function requireUser(req: Request, admin: SupabaseClient): Promise<Extract<Caller, { kind: 'user' }>> {
  const caller = await requireCaller(req, admin)
  if (caller.kind !== 'user') throw new HttpError(401, 'rule.login_required')
  if (caller.profile.blocked) throw new HttpError(403, 'rule.user_blocked')
  return caller
}

/** Solo chiamate di sistema (webhook, cron): rifiuta gli utenti, anche moderatori. */
export function requireService(req: Request, secretEnvName?: 'WEBHOOK_SECRET' | 'CRON_SECRET'): void {
  if (!isServiceCall(req, secretEnvName)) throw new HttpError(401, 'rule.not_allowed')
}

/** Sistema oppure moderatore/admin. */
export async function requireModeratorOrService(req: Request, admin: SupabaseClient): Promise<Caller> {
  const caller = await requireCaller(req, admin)
  if (caller.kind === 'service') return caller
  if (caller.profile.blocked) throw new HttpError(403, 'rule.user_blocked')
  if (caller.profile.role !== 'moderatore' && caller.profile.role !== 'admin') {
    throw new HttpError(403, 'rule.moderator_only')
  }
  return caller
}

export function isModerator(caller: Caller): boolean {
  return caller.kind === 'user' && (caller.profile.role === 'moderatore' || caller.profile.role === 'admin')
}
