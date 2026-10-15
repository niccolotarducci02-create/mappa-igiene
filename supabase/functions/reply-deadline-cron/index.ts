/**
 * Edge Function `reply-deadline-cron` — lavori periodici (una volta al giorno, via pg_cron + pg_net;
 * vedi supabase/scripts/cron_and_webhooks.sql e docs/DEPLOY.md).
 *
 * Non cambia MAI lo stato di una segnalazione: dopo 7 giorni senza replica lo stato resta "confermata"
 * e diventa definitivo (regola 3, isDefinitive in src/domain/stateMachine.ts). Qui si avvisa soltanto:
 *  1. giorno 5 dalla pubblicazione, nessuna replica -> promemoria ai titolari ("mancano 2 giorni");
 *  2. giorno 7 (reply_deadline_at superata)           -> notifica ai titolari "stato definitivo";
 *     se intanto hanno replicato, la notifica lo dice e ricorda che possono ancora caricare il certificato.
 *  3. retention: le foto delle segnalazioni scartate/archiviate da più di 90 giorni vengono cancellate
 *     dallo Storage (minimizzazione GDPR); la riga resta, con photo_path = null e photo_deleted_at.
 *  4. i contatti (leads) più vecchi di 60 giorni non ancora chiusi passano a 'chiuso'.
 *
 * Le colonne reply_reminder_sent_at, reply_final_notice_sent_at, photo_deleted_at (0005_edge_support.sql)
 * rendono ogni passo idempotente: rilanciare la funzione non manda due volte lo stesso avviso.
 *
 * Chi: solo chiamate di sistema (service_role o CRON_SECRET). Input opzionale: { dryRun?: boolean }.
 */
import { REPLY_WINDOW_DAYS } from '../../../src/domain/rules.ts'
import { handleError, handleOptions, json, readJson } from '../_shared/cors.ts'
import { createAdminClient, insertNotifications, venueOwnerIds, writeAudit, type AdminClient } from '../_shared/supabaseAdmin.ts'
import { requireService } from '../_shared/auth.ts'

/** Giorno del promemoria (5 = mancano 2 giorni sui 7). */
const REMINDER_DAY = REPLY_WINDOW_DAYS - 2
/** Conservazione delle foto non pubblicate (scartate/archiviate). */
const PHOTO_RETENTION_DAYS = 90
/** Un contatto non venduto dopo 60 giorni non ha più senso: si chiude. */
const LEAD_EXPIRY_DAYS = 60
/** Dimensione dei lotti per non superare il tempo massimo della funzione. */
const BATCH = 200

const DAY_MS = 86_400_000

interface Summary {
  dryRun: boolean
  remindersSent: number
  finalNoticesSent: number
  photosDeleted: number
  photosFailed: number
  leadsClosed: number
  errors: string[]
}

interface ReportLite {
  id: string
  venue_id: string
  user_id: string
  category: string
  published_at: string | null
  reply_deadline_at: string | null
  photo_path: string | null
}

async function venueName(admin: AdminClient, venueId: string): Promise<string> {
  const { data } = await admin.from('venues').select('name').eq('id', venueId).maybeSingle()
  return (data as { name?: string } | null)?.name ?? 'il tuo locale'
}

async function hasReply(admin: AdminClient, reportId: string): Promise<boolean> {
  const { count, error } = await admin.from('replies').select('id', { count: 'exact', head: true }).eq('report_id', reportId)
  if (error) throw new Error(`replies: ${error.message}`)
  return (count ?? 0) > 0
}

/* 1. Promemoria al giorno 5 ------------------------------------------------------------- */
async function sendReminders(admin: AdminClient, now: Date, s: Summary): Promise<void> {
  const cutoff = new Date(now.getTime() - REMINDER_DAY * DAY_MS).toISOString()
  const { data, error } = await admin
    .from('reports')
    .select('id, venue_id, user_id, category, published_at, reply_deadline_at, photo_path')
    .eq('state', 'pubblicata')
    .lte('published_at', cutoff)
    .gt('reply_deadline_at', now.toISOString())
    .is('reply_reminder_sent_at', null)
    .limit(BATCH)
  if (error) throw new Error(`reports (reminder): ${error.message}`)

  for (const r of (data ?? []) as ReportLite[]) {
    try {
      if (await hasReply(admin, r.id)) {
        // ha già replicato: niente promemoria, ma si segna per non ricontrollare ogni giorno
        if (!s.dryRun) await admin.from('reports').update({ reply_reminder_sent_at: now.toISOString() }).eq('id', r.id)
        continue
      }
      const owners = await venueOwnerIds(admin, r.venue_id)
      const name = await venueName(admin, r.venue_id)
      const hoursLeft = r.reply_deadline_at ? Math.max(0, Math.round((new Date(r.reply_deadline_at).getTime() - now.getTime()) / 3_600_000)) : 48
      if (!s.dryRun) {
        await insertNotifications(
          admin,
          owners.map((id) => ({
            toUserId: id,
            kind: 'nuova_segnalazione_locale' as const,
            title: 'Mancano circa 2 giorni per replicare',
            body: `Su ${name} c'è una segnalazione (${r.category}) pubblicata da ${REMINDER_DAY} giorni senza replica. Hai ancora ${hoursLeft} ore: dopo lo stato resta confermato in modo definitivo. Puoi anche chiedere preventivi e caricare un certificato.`,
            link: `/locale/${r.venue_id}/gestisci`,
          })),
        )
        await admin.from('reports').update({ reply_reminder_sent_at: now.toISOString() }).eq('id', r.id)
        await writeAudit(admin, 'cron_reply_reminder', 'report', r.id, `titolari avvisati: ${owners.length}`)
      }
      s.remindersSent += owners.length
    } catch (e) {
      s.errors.push(`reminder ${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/* 2. Avviso al giorno 7: stato definitivo ----------------------------------------------- */
async function sendFinalNotices(admin: AdminClient, now: Date, s: Summary): Promise<void> {
  const { data, error } = await admin
    .from('reports')
    .select('id, venue_id, user_id, category, published_at, reply_deadline_at, photo_path')
    .eq('state', 'pubblicata')
    .lte('reply_deadline_at', now.toISOString())
    .is('reply_final_notice_sent_at', null)
    .limit(BATCH)
  if (error) throw new Error(`reports (final): ${error.message}`)

  for (const r of (data ?? []) as ReportLite[]) {
    try {
      const replied = await hasReply(admin, r.id)
      const owners = await venueOwnerIds(admin, r.venue_id)
      const name = await venueName(admin, r.venue_id)
      const body = replied
        ? `I ${REPLY_WINDOW_DAYS} giorni per la replica su ${name} sono passati: la tua replica resta visibile accanto alla segnalazione e lo stato "confermata" è ora definitivo. Per passare a "risolta" carica il certificato di intervento.`
        : `Nessuna replica entro ${REPLY_WINDOW_DAYS} giorni: lo stato "confermata" di ${name} è ora definitivo. Puoi ancora replicare e, con un certificato di intervento verificato, passare a "risolta".`
      if (!s.dryRun) {
        await insertNotifications(
          admin,
          owners.map((id) => ({
            toUserId: id,
            kind: 'generico' as const,
            title: 'Stato definitivo: confermata',
            body,
            link: `/locale/${r.venue_id}/gestisci`,
          })),
        )
        await admin.from('reports').update({ reply_final_notice_sent_at: now.toISOString() }).eq('id', r.id)
        await writeAudit(admin, 'cron_reply_deadline', 'report', r.id, replied ? 'con replica' : 'senza replica')
      }
      s.finalNoticesSent += owners.length
    } catch (e) {
      s.errors.push(`final ${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/* 3. Retention foto (scartate/archiviate > 90 giorni) ----------------------------------- */
async function purgeOldPhotos(admin: AdminClient, now: Date, s: Summary): Promise<void> {
  const cutoff = new Date(now.getTime() - PHOTO_RETENTION_DAYS * DAY_MS).toISOString()
  const { data, error } = await admin
    .from('reports')
    .select('id, venue_id, user_id, category, published_at, reply_deadline_at, photo_path')
    .in('state', ['scartata', 'archiviata'])
    .not('photo_path', 'is', null)
    .is('photo_deleted_at', null)
    .lte('submitted_at', cutoff)
    .limit(BATCH)
  if (error) throw new Error(`reports (retention): ${error.message}`)

  for (const r of (data ?? []) as ReportLite[]) {
    if (!r.photo_path) continue
    if (s.dryRun) {
      s.photosDeleted++
      continue
    }
    const { error: rmErr } = await admin.storage.from('report-photos').remove([r.photo_path])
    if (rmErr) {
      s.photosFailed++
      s.errors.push(`storage ${r.id}: ${rmErr.message}`)
      continue
    }
    const { error: upErr } = await admin
      .from('reports')
      .update({ photo_path: null, photo_deleted_at: now.toISOString() })
      .eq('id', r.id)
    if (upErr) {
      s.photosFailed++
      s.errors.push(`reports ${r.id}: ${upErr.message}`)
      continue
    }
    await writeAudit(admin, 'cron_photo_retention', 'report', r.id, `foto cancellata dopo ${PHOTO_RETENTION_DAYS} giorni`)
    s.photosDeleted++
  }
}

/* 4. Contatti scaduti (> 60 giorni) ------------------------------------------------------ */
async function expireLeads(admin: AdminClient, now: Date, s: Summary): Promise<void> {
  const cutoff = new Date(now.getTime() - LEAD_EXPIRY_DAYS * DAY_MS).toISOString()
  const { data, error } = await admin
    .from('leads')
    .select('id')
    .neq('status', 'chiuso')
    .lte('created_at', cutoff)
    .limit(BATCH)
  if (error) throw new Error(`leads: ${error.message}`)
  const ids = (data ?? []).map((l) => l.id as string)
  if (!ids.length) return
  if (!s.dryRun) {
    // Solo lo stato cambia: price_cents e max_buyers restano immutabili (trigger a_leads_guard_price).
    const { error: upErr } = await admin.from('leads').update({ status: 'chiuso' }).in('id', ids)
    if (upErr) throw new Error(`leads update: ${upErr.message}`)
    for (const id of ids) await writeAudit(admin, 'cron_lead_expired', 'lead', id, `chiuso dopo ${LEAD_EXPIRY_DAYS} giorni`)
  }
  s.leadsClosed += ids.length
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)

  try {
    requireService(req, 'CRON_SECRET')
    const admin = createAdminClient()
    const body = req.method === 'POST' ? await readJson<{ dryRun?: unknown }>(req) : {}
    const now = new Date()
    const summary: Summary = {
      dryRun: body.dryRun === true,
      remindersSent: 0,
      finalNoticesSent: 0,
      photosDeleted: 0,
      photosFailed: 0,
      leadsClosed: 0,
      errors: [],
    }

    // Ogni passo è indipendente: un errore in uno non blocca gli altri.
    for (const step of [sendReminders, sendFinalNotices, purgeOldPhotos, expireLeads]) {
      try {
        await step(admin, now, summary)
      } catch (e) {
        summary.errors.push(`${step.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (!summary.dryRun) {
      await writeAudit(admin, 'cron_run', 'system', 'reply-deadline-cron', JSON.stringify({ ...summary, errors: summary.errors.length }))
    }
    return json({ ranAt: now.toISOString(), ...summary })
  } catch (e) {
    return handleError(e)
  }
})
