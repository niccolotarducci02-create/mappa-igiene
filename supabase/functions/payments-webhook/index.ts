/**
 * Edge Function `payments-webhook` — webhook Stripe per i tre prodotti a pagamento.
 *
 * Stripe chiama POST /functions/v1/payments-webhook con l'evento firmato (header Stripe-Signature).
 * In config.toml la funzione ha verify_jwt = false (Stripe non ha un JWT Supabase): la sicurezza è la
 * verifica della firma con STRIPE_WEBHOOK_SECRET.
 *
 * Eventi gestiti:
 *   checkout.session.completed / checkout.session.async_payment_succeeded (payment_status = 'paid')
 *     metadata.product = 'lead'    -> rpc buy_lead_paid(leadId, companyId, ...) [0005_edge_support.sql]
 *                      = 'sponsor' -> rpc sponsor_company(companyId, months)
 *                      = 'premium' -> rpc set_venue_premium(venueId, months)
 *   checkout.session.expired / async_payment_failed -> solo registrazione in payments.
 *
 * Idempotenza: ogni evento è inserito in public.payments (event_id unique) PRIMA di agire: se Stripe
 * ripete l'evento, la seconda consegna trova la riga e risponde 200 senza rifare nulla.
 *
 * Regola 4: il pagamento attiva un servizio (contatto, scheda sponsorizzata, Premium). Nessun pagamento
 * tocca una segnalazione: qui non esiste alcun percorso che modifichi public.reports.
 */
import { LEAD_PRICE_CENTS, PREMIUM_PRICE_CENTS_MONTH, SPONSOR_PRICE_CENTS_MONTH } from '../../../src/domain/rules.ts'
import { corsHeaders, handleError, handleOptions, HttpError, isUuid, json } from '../_shared/cors.ts'
import { requireEnv } from '../_shared/env.ts'
import { createAdminClient, insertNotifications, writeAudit, type AdminClient } from '../_shared/supabaseAdmin.ts'
import { parseStripeEvent, verifyStripeSignature, type StripeEvent, type StripeProduct } from '../_shared/stripe.ts'

const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])
const FAILED_EVENTS = new Set(['checkout.session.expired', 'checkout.session.async_payment_failed'])

interface PaymentRow {
  event_id: string
  session_id: string | null
  payment_intent: string | null
  product: StripeProduct | null
  status: 'received' | 'processed' | 'ignored' | 'failed' | 'error'
  amount_cents: number | null
  currency: string | null
  livemode: boolean
  user_id: string | null
  company_id: string | null
  venue_id: string | null
  lead_id: string | null
  months: number | null
  metadata: Record<string, unknown>
  error: string | null
  processed_at: string | null
}

function parseMonths(x: string | undefined): number | null {
  const n = Number(x)
  return Number.isInteger(n) && n >= 1 && n <= 36 ? n : null
}

function paymentRowFromEvent(ev: StripeEvent): PaymentRow {
  const o = ev.data.object
  const md = o.metadata ?? {}
  const product = md.product === 'lead' || md.product === 'sponsor' || md.product === 'premium' ? (md.product as StripeProduct) : null
  return {
    event_id: ev.id,
    session_id: o.object === 'checkout.session' ? o.id : null,
    payment_intent: typeof o.payment_intent === 'string' ? o.payment_intent : null,
    product,
    status: 'received',
    amount_cents: typeof o.amount_total === 'number' ? o.amount_total : null,
    currency: o.currency ?? null,
    livemode: ev.livemode,
    user_id: isUuid(md.userId) ? md.userId : isUuid(o.client_reference_id) ? o.client_reference_id! : null,
    company_id: isUuid(md.companyId) ? md.companyId : null,
    venue_id: isUuid(md.venueId) ? md.venueId : null,
    lead_id: isUuid(md.leadId) ? md.leadId : null,
    months: parseMonths(md.months),
    metadata: { type: ev.type, created: ev.created, ...md },
    error: null,
    processed_at: null,
  }
}

/** Importo atteso dalle costanti del piano: un importo diverso non attiva nulla (si indaga a mano). */
function expectedAmount(row: PaymentRow): number | null {
  switch (row.product) {
    case 'lead':
      return LEAD_PRICE_CENTS
    case 'sponsor':
      return row.months ? row.months * SPONSOR_PRICE_CENTS_MONTH : null
    case 'premium':
      return row.months ? row.months * PREMIUM_PRICE_CENTS_MONTH : null
    default:
      return null
  }
}

async function fulfil(admin: AdminClient, row: PaymentRow, ev: StripeEvent): Promise<void> {
  const ref = `stripe ${row.session_id ?? row.event_id}`
  switch (row.product) {
    case 'lead': {
      if (!row.lead_id || !row.company_id) throw new Error('metadata leadId/companyId mancanti')
      // Stessa logica di buy_lead (canBuyLead) ma chiamabile dal sistema: prezzo identico per tutte le ditte,
      // massimo 3, una volta sola, servizi compatibili. Il trigger su lead_purchases ribadisce i limiti.
      const { error } = await admin.rpc('buy_lead_paid', {
        p_lead_id: row.lead_id,
        p_company_id: row.company_id,
        p_payment_ref: ref,
        p_paid_cents: row.amount_cents ?? LEAD_PRICE_CENTS,
      })
      if (error) throw new Error(error.message)
      const { data: company } = await admin.from('companies').select('owner_user_id, name').eq('id', row.company_id).maybeSingle()
      const owner = (company as { owner_user_id?: string | null } | null)?.owner_user_id
      if (owner) {
        await insertNotifications(admin, [{
          toUserId: owner,
          kind: 'nuovo_contatto',
          title: 'Contatto acquistato',
          body: 'Il pagamento è confermato: i dati del locale sono visibili nella tua area ditte. Invia il preventivo entro 48 ore per avere più possibilità.',
          link: '/ditte',
        }])
      }
      break
    }
    case 'sponsor': {
      if (!row.company_id || !row.months) throw new Error('metadata companyId/months mancanti')
      const { error } = await admin.rpc('sponsor_company', { p_company_id: row.company_id, p_months: row.months })
      if (error) throw new Error(error.message)
      const { data: company } = await admin.from('companies').select('owner_user_id').eq('id', row.company_id).maybeSingle()
      const owner = (company as { owner_user_id?: string | null } | null)?.owner_user_id
      if (owner) {
        await insertNotifications(admin, [{
          toUserId: owner,
          kind: 'generico',
          title: 'Scheda sponsorizzata attiva',
          body: `Pagamento confermato per ${row.months} mesi. Ricorda: la sponsorizzazione non dà alcun potere sulle segnalazioni (regola 4).`,
          link: '/ditte',
        }])
      }
      break
    }
    case 'premium': {
      if (!row.venue_id || !row.months) throw new Error('metadata venueId/months mancanti')
      const { error } = await admin.rpc('set_venue_premium', { p_venue_id: row.venue_id, p_months: row.months })
      if (error) throw new Error(error.message)
      if (row.user_id) {
        await insertNotifications(admin, [{
          toUserId: row.user_id,
          kind: 'generico',
          title: 'Premium attivo',
          body: `Pagamento confermato per ${row.months} mesi: avvisi immediati e certificati in evidenza.`,
          link: `/locale/${row.venue_id}/gestisci`,
        }])
      }
      break
    }
    default:
      throw new Error(`prodotto sconosciuto (${String(ev.data.object.metadata?.product)})`)
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405, headers: corsHeaders })

  try {
    // 1. Corpo grezzo + firma: la verifica deve avvenire sul testo esatto inviato da Stripe.
    const rawBody = await req.text()
    await verifyStripeSignature(rawBody, req.headers.get('stripe-signature'), requireEnv('STRIPE_WEBHOOK_SECRET'))
    const ev = parseStripeEvent(rawBody)

    if (!PAID_EVENTS.has(ev.type) && !FAILED_EVENTS.has(ev.type)) {
      return json({ received: true, ignored: ev.type })
    }

    const admin = createAdminClient()
    const row = paymentRowFromEvent(ev)

    // 2. Idempotenza: la riga dell'evento si inserisce prima di agire (event_id unique).
    const { data: inserted, error: insErr } = await admin
      .from('payments')
      .insert(row)
      .select('event_id')
      .maybeSingle()
    if (insErr) {
      if (insErr.code === '23505') return json({ received: true, duplicate: true }) // già processato
      throw new Error(`payments insert: ${insErr.message}`)
    }
    if (!inserted) return json({ received: true, duplicate: true })

    const finish = async (status: PaymentRow['status'], error?: string) => {
      await admin
        .from('payments')
        .update({ status, error: error ?? null, processed_at: new Date().toISOString() })
        .eq('event_id', ev.id)
    }

    // 3. Pagamento fallito/scaduto: si annota e basta (il contatto resta disponibile per altri).
    if (FAILED_EVENTS.has(ev.type)) {
      await finish('failed')
      await writeAudit(admin, 'payment_failed', 'payment', ev.id, `${row.product ?? '?'} ${ev.type}`, row.user_id)
      return json({ received: true, status: 'failed' })
    }

    // 4. Pagato: controlli e attivazione.
    const paid = ev.data.object.payment_status === 'paid'
    if (!paid) {
      // completed con pagamento differito (bonifico): arriverà async_payment_succeeded
      await finish('ignored', `payment_status=${ev.data.object.payment_status ?? 'n/d'}`)
      return json({ received: true, status: 'pending' })
    }
    const expected = expectedAmount(row)
    if (expected === null || row.amount_cents === null || row.amount_cents !== expected || (row.currency ?? 'eur') !== 'eur') {
      const msg = `importo inatteso: ricevuti ${row.amount_cents} ${row.currency ?? ''}, attesi ${expected} eur`
      await finish('error', msg)
      await writeAudit(admin, 'payment_mismatch', 'payment', ev.id, msg, row.user_id)
      // 200: Stripe non deve ripetere l'evento; il caso si gestisce a mano dal pannello.
      return json({ received: true, status: 'error', detail: msg })
    }

    try {
      await fulfil(admin, row, ev)
      await finish('processed')
      await writeAudit(
        admin,
        `payment_${row.product}`,
        'payment',
        ev.id,
        `${(row.amount_cents / 100).toFixed(2)} € · ${row.product}${row.months ? ` ${row.months} mesi` : ''} · ${row.session_id ?? ''}`,
        row.user_id,
      )
      return json({ received: true, status: 'processed', product: row.product })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await finish('error', msg)
      await writeAudit(admin, 'payment_error', 'payment', ev.id, msg, row.user_id)
      // Regole di dominio violate (es. contatto già completo): è un errore "nostro", non di Stripe.
      // Si risponde 200 per fermare i retry; il rimborso si fa a mano dal pannello Stripe.
      if (/^rule\./.test(msg)) return json({ received: true, status: 'error', keys: msg.split(',') })
      throw new HttpError(500, 'payment.fulfilment_failed', msg)
    }
  } catch (e) {
    return handleError(e)
  }
})
