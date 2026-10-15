/**
 * Edge Function `notify` — consegna delle notifiche in-app anche via SMS (Twilio) e/o email (Resend).
 *
 * Due modi di chiamata (entrambi solo di sistema: service_role o WEBHOOK_SECRET):
 *  a) Database Webhook "INSERT su public.notifications": payload { type:'INSERT', record:{...} } -> consegna quella riga;
 *  b) manuale / pg_cron: POST {} (o { limit }) -> consegna le righe con sent_at null degli ultimi 7 giorni.
 *
 * Canali:
 *  - email: a tutte le notifiche se il profilo ha un indirizzo (profiles.email, 0005_edge_support.sql);
 *  - SMS: solo ai tipi in NOTIFY_SMS_KINDS (default: quelli che riguardano i titolari e le ditte, dove il
 *    tempo conta: nuova_segnalazione_locale, nuovo_contatto, preventivo_ricevuto, certificato_verificato,
 *    segnalazione_rimossa) e solo se il profilo ha un telefono verificato. Un SMS costa ~0,07 €.
 *  - SMS solo Premium: per i tipi in PREMIUM_SMS_KINDS (nuova_segnalazione_locale: nuova segnalazione,
 *    comunicato NAS collegato, promemoria replica) l'SMS è "l'avviso immediato" che il locale Premium
 *    (20 €/mese) compra. Il locale si ricava dal link della notifica (/locale/<id>/...): se
 *    venues.premium_until è nel futuro parte anche l'SMS, altrimenti il titolare riceve solo in-app + email.
 *    Premium non cambia nulla della moderazione: solo il canale dell'avviso.
 *  - In-app: la riga esiste già; qui si aggiornano sent_at / sent_via / send_error.
 *
 * Dry-run: senza TWILIO_* o RESEND_API_KEY il canale corrispondente viene solo registrato nel log
 * (sent_via contiene 'dry_run:sms' / 'dry_run:email'), così tutto funziona anche in locale e nella beta.
 *
 * Variabili: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (numero E.164 o Messaging Service SID "MG..."),
 *            RESEND_API_KEY, RESEND_FROM (es. "Nitido <avvisi@nitido.example>"), APP_BASE_URL,
 *            NOTIFY_SMS_KINDS (lista separata da virgola; 'none' per disattivare gli SMS).
 */
import { handleError, handleOptions, isUuid, json, readJson } from '../_shared/cors.ts'
import { appLink, optionalEnv } from '../_shared/env.ts'
import { createAdminClient, type AdminClient, type NotificationKind } from '../_shared/supabaseAdmin.ts'
import { requireService } from '../_shared/auth.ts'

const DEFAULT_SMS_KINDS: NotificationKind[] = [
  'nuova_segnalazione_locale',
  'nuovo_contatto',
  'preventivo_ricevuto',
  'certificato_verificato',
  'segnalazione_rimossa',
]
/** Tipi per cui l'SMS è riservato ai locali Premium (gli altri titolari ricevono in-app + email). */
const PREMIUM_SMS_KINDS: NotificationKind[] = ['nuova_segnalazione_locale']
const PENDING_WINDOW_DAYS = 7
const DEFAULT_LIMIT = 100
const SMS_MAX_CHARS = 300

interface NotificationRow {
  id: string
  to_user_id: string
  kind: NotificationKind
  title: string
  body: string
  link: string | null
  created_at: string
  sent_at: string | null
}

interface Recipient {
  id: string
  display_name: string
  phone: string | null
  phone_verified: boolean
  email: string | null
  blocked: boolean
}

interface DeliveryOutcome {
  via: string[]
  error: string | null
}

function smsKinds(): Set<string> {
  const raw = optionalEnv('NOTIFY_SMS_KINDS')
  if (!raw) return new Set(DEFAULT_SMS_KINDS)
  if (raw.toLowerCase() === 'none') return new Set()
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
}

/** Id del locale da un link di notifica come '/locale/<uuid>' o '/locale/<uuid>/gestisci'. */
function venueIdFromLink(link: string | null): string | null {
  const m = /^\/locale\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i.exec(link ?? '')
  return m ? m[1] : null
}

/** Premium attivo = venues.premium_until nel futuro (stessa regola di isPremiumActive nell'app). */
async function isVenuePremium(admin: AdminClient, venueId: string): Promise<boolean> {
  const { data, error } = await admin.from('venues').select('premium_until').eq('id', venueId).maybeSingle()
  if (error) throw new Error(`venues: ${error.message}`)
  const until = (data as { premium_until: string | null } | null)?.premium_until
  return !!until && new Date(until).getTime() > Date.now()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------------------------ */
/* Canali                                                                                 */
/* ------------------------------------------------------------------------------------ */

async function sendSms(to: string, text: string): Promise<'sent' | 'dry_run'> {
  const sid = optionalEnv('TWILIO_ACCOUNT_SID')
  const token = optionalEnv('TWILIO_AUTH_TOKEN')
  const from = optionalEnv('TWILIO_FROM')
  if (!sid || !token || !from) {
    console.log(`[notify] DRY-RUN SMS a ${to}: ${text}`)
    return 'dry_run'
  }
  const form = new URLSearchParams({ To: to, Body: text })
  // Un Messaging Service SID inizia con "MG"; altrimenti è un numero mittente.
  if (from.startsWith('MG')) form.set('MessagingServiceSid', from)
  else form.set('From', from)
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`twilio ${res.status}: ${detail}`)
  }
  return 'sent'
}

async function sendEmail(to: string, subject: string, text: string, link: string): Promise<'sent' | 'dry_run'> {
  const key = optionalEnv('RESEND_API_KEY')
  const from = optionalEnv('RESEND_FROM') ?? "Nitido <onboarding@resend.dev>"
  if (!key) {
    console.log(`[notify] DRY-RUN email a ${to}: ${subject}`)
    return 'dry_run'
  }
  const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>
<p><a href="${escapeHtml(link)}">Apri Nitido</a></p>
<p style="color:#666;font-size:12px">Ricevi questa email perché hai un account su Nitido. Le notifiche si gestiscono dal profilo nell'app.</p>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: `${text}\n\n${link}`, html }),
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`resend ${res.status}: ${detail}`)
  }
  return 'sent'
}

/* ------------------------------------------------------------------------------------ */
/* Consegna di una notifica                                                               */
/* ------------------------------------------------------------------------------------ */

async function deliver(admin: AdminClient, n: NotificationRow, smsAllowed: Set<string>): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name, phone, phone_verified, email, blocked')
    .eq('id', n.to_user_id)
    .maybeSingle()
  if (error) throw new Error(`profiles: ${error.message}`)
  const to = data as Recipient | null
  if (!to) return { via: ['in_app'], error: 'profilo inesistente' }
  if (to.blocked) return { via: ['in_app'], error: null }

  const link = appLink(n.link)
  const via: string[] = ['in_app']
  const errors: string[] = []

  let smsWanted = !!to.phone && to.phone_verified && smsAllowed.has(n.kind)
  if (smsWanted && PREMIUM_SMS_KINDS.includes(n.kind)) {
    // L'avviso immediato via SMS è il vantaggio Premium: senza Premium il titolare riceve in-app + email.
    const venueId = venueIdFromLink(n.link)
    try {
      smsWanted = venueId ? await isVenuePremium(admin, venueId) : false
    } catch (e) {
      smsWanted = false
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (!smsWanted) console.log(`[notify] SMS non inviato per ${n.kind} ${n.id}: locale ${venueId ?? 'sconosciuto'} non Premium`)
  }
  if (smsWanted && to.phone) {
    const phone = to.phone.startsWith('+') ? to.phone : `+${to.phone}`
    const text = `Nitido — ${n.title}. ${n.body}`.slice(0, SMS_MAX_CHARS - link.length - 2) + ` ${link}`
    try {
      via.push(`${await sendSms(phone, text) === 'sent' ? '' : 'dry_run:'}sms`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (to.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.email)) {
    try {
      via.push(`${await sendEmail(to.email, `Nitido — ${n.title}`, n.body, link) === 'sent' ? '' : 'dry_run:'}email`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { via, error: errors.length ? errors.join(' | ') : null }
}

async function markSent(admin: AdminClient, id: string, outcome: DeliveryOutcome): Promise<void> {
  const { error } = await admin
    .from('notifications')
    .update({ sent_at: new Date().toISOString(), sent_via: outcome.via, send_error: outcome.error })
    .eq('id', id)
  if (error) console.error('[notify] aggiornamento notifica fallito:', error.message)
}

interface Payload {
  type?: string
  table?: string
  record?: NotificationRow | null
  notificationId?: unknown
  limit?: unknown
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    requireService(req, 'WEBHOOK_SECRET')
    const admin = createAdminClient()
    const payload = await readJson<Payload>(req)
    const allowed = smsKinds()

    // a) una sola riga (webhook o id esplicito)
    let rows: NotificationRow[] = []
    if (payload.record && payload.table === 'notifications' && isUuid(payload.record.id)) {
      if (payload.type && payload.type !== 'INSERT') return json({ skipped: 'not_insert' })
      rows = [payload.record]
    } else if (isUuid(payload.notificationId)) {
      const { data, error } = await admin.from('notifications').select('*').eq('id', payload.notificationId).maybeSingle()
      if (error) throw new Error(`notifications: ${error.message}`)
      if (data) rows = [data as NotificationRow]
    } else {
      // b) tutte quelle in attesa
      const limit = Number.isInteger(payload.limit) && (payload.limit as number) > 0 ? Math.min(payload.limit as number, 500) : DEFAULT_LIMIT
      const since = new Date(Date.now() - PENDING_WINDOW_DAYS * 86_400_000).toISOString()
      const { data, error } = await admin
        .from('notifications')
        .select('*')
        .is('sent_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(limit)
      if (error) throw new Error(`notifications: ${error.message}`)
      rows = (data ?? []) as NotificationRow[]
    }

    const results: Array<{ id: string; via: string[]; error: string | null }> = []
    for (const n of rows) {
      if (n.sent_at) continue
      try {
        const outcome = await deliver(admin, n, allowed)
        await markSent(admin, n.id, outcome)
        results.push({ id: n.id, ...outcome })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await markSent(admin, n.id, { via: ['in_app'], error: msg })
        results.push({ id: n.id, via: ['in_app'], error: msg })
      }
    }
    return json({
      processed: results.length,
      dryRun: { sms: !optionalEnv('TWILIO_ACCOUNT_SID'), email: !optionalEnv('RESEND_API_KEY') },
      results,
    })
  } catch (e) {
    return handleError(e)
  }
})
