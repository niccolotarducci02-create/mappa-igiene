/**
 * Client Supabase per le Edge Functions.
 *
 *  - createAdminClient(): usa la chiave service_role, salta la RLS. Da usare SOLO dopo aver
 *    verificato chi chiama (vedi auth.ts). Con questa chiave `public.is_service_role()` è vero,
 *    quindi le RPC come apply_ai_check, set_venue_premium, sponsor_company, buy_lead_paid
 *    riconoscono la chiamata come "di sistema" (pagamento confermato, non simulato).
 *  - createUserClient(authHeader): usa la chiave anon + il JWT dell'utente; rispetta la RLS e
 *    serve quando si vuole agire "come" l'utente (es. controlli di titolarità via RPC).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv, supabaseUrl } from './env.ts'

export type AdminClient = SupabaseClient

let cachedAdmin: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin
  cachedAdmin = createClient(supabaseUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'mappa-igiene-edge' } },
  })
  return cachedAdmin
}

export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(supabaseUrl(), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authHeader } },
  })
}

/* ------------------------------------------------------------------------------------ */
/* Helper di dominio usati da più funzioni (sempre con il client admin)                  */
/* ------------------------------------------------------------------------------------ */

export type NotificationKind =
  | 'segnalazione_scartata'
  | 'segnalazione_archiviata'
  | 'segnalazione_pubblicata'
  | 'nuova_segnalazione_locale'
  | 'replica_ricevuta'
  | 'nuovo_contatto'
  | 'preventivo_ricevuto'
  | 'certificato_verificato'
  | 'segnalazione_rimossa'
  | 'generico'

export interface NotificationInput {
  toUserId: string
  kind: NotificationKind
  title: string
  body: string
  link?: string
}

/** Inserisce notifiche in-app (la consegna via SMS/email è compito della funzione `notify`). */
export async function insertNotifications(admin: SupabaseClient, items: NotificationInput[]): Promise<number> {
  const rows = items
    .filter((n) => n.toUserId)
    .map((n) => ({ to_user_id: n.toUserId, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null }))
  if (!rows.length) return 0
  const { error } = await admin.from('notifications').insert(rows)
  if (error) throw new Error(`notifications insert: ${error.message}`)
  return rows.length
}

/** Titolari di un locale: righe di venue_owners + venues.claimed_by (come venue_owner_ids in SQL). */
export async function venueOwnerIds(admin: SupabaseClient, venueId: string): Promise<string[]> {
  const [owners, venue] = await Promise.all([
    admin.from('venue_owners').select('user_id').eq('venue_id', venueId),
    admin.from('venues').select('claimed_by').eq('id', venueId).maybeSingle(),
  ])
  if (owners.error) throw new Error(`venue_owners: ${owners.error.message}`)
  if (venue.error) throw new Error(`venues: ${venue.error.message}`)
  const ids = new Set<string>()
  for (const row of owners.data ?? []) if (row.user_id) ids.add(row.user_id as string)
  if (venue.data?.claimed_by) ids.add(venue.data.claimed_by as string)
  return [...ids]
}

/** Id dei moderatori attivi (ruolo moderatore o admin, non bloccati). */
export async function moderatorIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['moderatore', 'admin'])
    .eq('blocked', false)
  if (error) throw new Error(`profiles: ${error.message}`)
  return (data ?? []).map((p) => p.id as string)
}

/** Riga nel registro di audit (actor null = sistema). */
export async function writeAudit(
  admin: SupabaseClient,
  action: string,
  targetType: string,
  targetId: string,
  note?: string,
  actorId: string | null = null,
): Promise<void> {
  const { error } = await admin
    .from('audit_log')
    .insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, note: note ?? null })
  if (error) console.error('[audit] insert fallita:', error.message)
}
