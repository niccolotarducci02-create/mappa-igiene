/**
 * Edge Function `on-report-submitted` — bersaglio del Database Webhook "INSERT su public.reports".
 *
 * Supabase chiama questa funzione con il payload standard dei webhook:
 *   { type: 'INSERT', table: 'reports', schema: 'public', record: {...riga...}, old_record: null }
 * Configurazione (docs/DEPLOY.md, oppure supabase/scripts/cron_and_webhooks.sql):
 *   Dashboard -> Database -> Webhooks -> Create: table reports, events INSERT, type "Supabase Edge Functions",
 *   function on-report-submitted, header Authorization: Bearer <service_role key> (o x-webhook-secret).
 *
 * Effetti:
 *  1. notifica in-app alla moderazione ("nuova segnalazione da verificare entro 24 ore");
 *  2. avvia ai-photo-check per la segnalazione (solo fonte 'utente' con foto). La chiamata al modello dura
 *     anche 10-30 s mentre pg_net aspetta pochi secondi: si risponde subito 202 e si continua in background
 *     con EdgeRuntime.waitUntil (disponibile nel runtime Supabase; in sua assenza si attende).
 *
 * Accetta solo chiamate di sistema (service_role o WEBHOOK_SECRET). Si può anche chiamare a mano con
 * { reportId } per ri-processare una segnalazione.
 */
import { handleError, handleOptions, isUuid, json, readJson } from '../_shared/cors.ts'
import { functionsBaseUrl, requireEnv } from '../_shared/env.ts'
import { createAdminClient, insertNotifications, moderatorIds } from '../_shared/supabaseAdmin.ts'
import { requireService } from '../_shared/auth.ts'

// Il runtime delle Edge Functions espone EdgeRuntime.waitUntil; non è nei tipi di Deno.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

interface WebhookPayload {
  type?: 'INSERT' | 'UPDATE' | 'DELETE'
  table?: string
  schema?: string
  record?: ReportRecord | null
  old_record?: ReportRecord | null
  /** Chiamata manuale */
  reportId?: string
}

interface ReportRecord {
  id: string
  venue_id: string
  user_id: string
  source: 'utente' | 'nas'
  category: string
  photo_path: string | null
  state: string
}

async function invokeAiPhotoCheck(reportId: string): Promise<void> {
  const url = `${functionsBaseUrl()}/ai-photo-check`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ reportId }),
    })
    const text = await res.text()
    if (!res.ok) console.error(`[on-report-submitted] ai-photo-check ${res.status}: ${text.slice(0, 500)}`)
    else console.log(`[on-report-submitted] ai-photo-check ok: ${text.slice(0, 300)}`)
  } catch (e) {
    console.error('[on-report-submitted] ai-photo-check non raggiungibile:', e instanceof Error ? e.message : String(e))
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    requireService(req, 'WEBHOOK_SECRET')
    const admin = createAdminClient()
    const payload = await readJson<WebhookPayload>(req)

    // Riga della segnalazione: dal webhook oppure ricaricata per id (chiamata manuale).
    let record: ReportRecord | null = payload.record ?? null
    if (!record && isUuid(payload.reportId)) {
      const { data, error } = await admin
        .from('reports')
        .select('id, venue_id, user_id, source, category, photo_path, state')
        .eq('id', payload.reportId)
        .maybeSingle()
      if (error) throw new Error(`reports: ${error.message}`)
      record = (data as ReportRecord | null) ?? null
    }
    if (!record || !isUuid(record.id)) return json({ skipped: 'no_record' }, 200)
    if (payload.type && payload.type !== 'INSERT') return json({ skipped: 'not_insert' }, 200)

    // Le segnalazioni create da link_nas_notice nascono già pubblicate da un moderatore: nessun filtro, nessun avviso.
    if (record.source !== 'utente') return json({ reportId: record.id, skipped: 'source_nas' }, 200)

    // 1. Avviso alla moderazione (SLA 24 ore).
    const { data: venue } = await admin.from('venues').select('name').eq('id', record.venue_id).maybeSingle()
    const venueName = (venue as { name?: string } | null)?.name ?? 'locale'
    const mods = await moderatorIds(admin)
    const notified = await insertNotifications(
      admin,
      mods.map((id) => ({
        toUserId: id,
        kind: 'generico' as const,
        title: 'Nuova segnalazione da verificare',
        body: `${venueName} · ${record!.category}. Verifica umana entro 24 ore (SLA).`,
        link: '/moderazione',
      })),
    )

    // 2. Filtro automatico sulla foto, in background.
    let aiStarted = false
    if (record.photo_path && record.state === 'in_verifica') {
      aiStarted = true
      const task = invokeAiPhotoCheck(record.id)
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime && typeof EdgeRuntime.waitUntil === 'function') {
        EdgeRuntime.waitUntil(task)
      } else {
        await task
      }
    }

    return json({ reportId: record.id, moderatorsNotified: notified, aiStarted }, 202)
  } catch (e) {
    return handleError(e)
  }
})
