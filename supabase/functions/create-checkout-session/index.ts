/**
 * Edge Function `create-checkout-session` — crea una sessione Stripe Checkout per i tre prodotti.
 *
 * Input (utente autenticato, Bearer JWT):
 *   { product: 'lead',    leadId: uuid }                               30 € (LEAD_PRICE_CENTS)
 *   { product: 'sponsor', companyId?: uuid, months: 1..12 }            100 €/mese (SPONSOR_PRICE_CENTS_MONTH)
 *   { product: 'premium', venueId: uuid, months: 1..12 }               20 €/mese (PREMIUM_PRICE_CENTS_MONTH)
 *   + opzionali successPath / cancelPath (rotte dell'app, default /ditte o /locale/:id/gestisci)
 * Output: { url, sessionId, amountCents } — il client fa window.location.assign(url).
 *
 * I prezzi vengono SOLO da src/domain/rules.ts (import relativo: Deno segue i percorsi relativi anche
 * fuori dalla cartella functions e `supabase functions deploy` li include nel bundle). Il prezzo del
 * contatto è lo stesso per tutte le ditte, inclusa quella del fondatore (priceForCompany).
 *
 * Qui si anticipano i controlli di canBuyLead (condizioni accettate, contatto aperto, non già comprato,
 * servizi compatibili) per non far pagare un acquisto che poi il database rifiuterebbe; il webhook li
 * ripete comunque in buy_lead_paid.
 *
 * Senza STRIPE_SECRET_KEY la funzione risponde 503 'payment.unavailable': nella beta il client usa le RPC
 * dirette (set_venue_premium / sponsor_company con "pagamento simulato").
 */
import { LEAD_MAX_BUYERS, LEAD_PRICE_CENTS, PREMIUM_PRICE_CENTS_MONTH, SPONSOR_PRICE_CENTS_MONTH } from '../../../src/domain/rules.ts'
import { handleError, handleOptions, HttpError, isUuid, json, readJson, requireUuid } from '../_shared/cors.ts'
import { appLink, optionalEnv } from '../_shared/env.ts'
import { createAdminClient, type AdminClient } from '../_shared/supabaseAdmin.ts'
import { requireUser, type CallerProfile } from '../_shared/auth.ts'
import { createCheckoutSession, type StripeProduct } from '../_shared/stripe.ts'

const MAX_MONTHS = 12

interface Body {
  product?: unknown
  leadId?: unknown
  companyId?: unknown
  venueId?: unknown
  months?: unknown
  successPath?: unknown
  cancelPath?: unknown
}

interface CompanyRow {
  id: string
  name: string
  owner_user_id: string | null
  services: string[]
  same_conditions_ack: boolean
}

function parseMonths(x: unknown): number {
  const n = typeof x === 'string' ? Number(x) : x
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > MAX_MONTHS) throw new HttpError(400, 'rule.invalid_amount')
  return n as number
}

function safePath(x: unknown, fallback: string): string {
  // Solo rotte interne dell'app: niente URL esterni nel redirect di Stripe.
  if (typeof x === 'string' && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(x)) return x
  return fallback
}

/** La ditta del chiamante: profiles.company_id oppure companies.owner_user_id (come current_company_id()). */
async function companyOf(admin: AdminClient, profile: CallerProfile, requested: unknown): Promise<CompanyRow> {
  let id: string | null = profile.company_id
  if (!id) {
    const { data } = await admin.from('companies').select('id').eq('owner_user_id', profile.id).limit(1).maybeSingle()
    id = (data as { id?: string } | null)?.id ?? null
  }
  if (isUuid(requested) && requested !== id) {
    // moderatore/admin può operare per una ditta specifica
    if (profile.role !== 'moderatore' && profile.role !== 'admin') throw new HttpError(403, 'rule.not_allowed')
    id = requested
  }
  if (!id) throw new HttpError(403, 'rule.unknown_company')
  const { data, error } = await admin.from('companies').select('id, name, owner_user_id, services, same_conditions_ack').eq('id', id).maybeSingle()
  if (error) throw new Error(`companies: ${error.message}`)
  if (!data) throw new HttpError(404, 'rule.unknown_company')
  return data as CompanyRow
}

async function isVenueOwner(admin: AdminClient, userId: string, venueId: string): Promise<boolean> {
  const [vo, v] = await Promise.all([
    admin.from('venue_owners').select('venue_id').eq('venue_id', venueId).eq('user_id', userId).maybeSingle(),
    admin.from('venues').select('claimed_by').eq('id', venueId).maybeSingle(),
  ])
  return !!vo.data || (v.data as { claimed_by?: string | null } | null)?.claimed_by === userId
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const admin = createAdminClient()
    const { userId, profile } = await requireUser(req, admin)
    const body = await readJson<Body>(req)
    const product = body.product
    if (product !== 'lead' && product !== 'sponsor' && product !== 'premium') throw new HttpError(400, 'payment.unknown_product')

    const stripeKey = optionalEnv('STRIPE_SECRET_KEY')
    if (!stripeKey) throw new HttpError(503, 'payment.unavailable', 'STRIPE_SECRET_KEY non configurata')

    const metadata: Record<string, string> = { userId }
    let unitAmountCents = 0
    let quantity = 1
    let name = ''
    let description = ''
    let defaultPath = '/'

    if (product === 'lead') {
      const leadId = requireUuid(body.leadId, 'rule.unknown_lead')
      const company = await companyOf(admin, profile, body.companyId)
      const { data: lead, error } = await admin
        .from('leads')
        .select('id, category, zone, status, price_cents, max_buyers')
        .eq('id', leadId)
        .maybeSingle()
      if (error) throw new Error(`leads: ${error.message}`)
      if (!lead) throw new HttpError(404, 'rule.unknown_lead')
      const l = lead as { id: string; category: string; zone: string; status: string; price_cents: number; max_buyers: number }
      const { data: purchases, error: pErr } = await admin.from('lead_purchases').select('company_id').eq('lead_id', leadId)
      if (pErr) throw new Error(`lead_purchases: ${pErr.message}`)
      const bought = (purchases ?? []).map((p) => p.company_id as string)

      // canBuyLead, stesse chiavi
      const reasons: string[] = []
      if (!company.same_conditions_ack) reasons.push('rule.same_conditions_ack')
      if (l.status !== 'aperto') reasons.push('rule.lead_closed')
      if (bought.length >= (l.max_buyers ?? LEAD_MAX_BUYERS)) reasons.push('rule.lead_full')
      if (bought.includes(company.id)) reasons.push('rule.lead_already_bought')
      if (!company.services.includes(l.category) && !company.services.includes('altro')) reasons.push('rule.service_mismatch')
      if (reasons.length) throw new HttpError(409, reasons)

      // Il prezzo è quello del contatto (= LEAD_PRICE_CENTS alla creazione), identico per tutti.
      unitAmountCents = l.price_cents ?? LEAD_PRICE_CENTS
      if (unitAmountCents !== LEAD_PRICE_CENTS) {
        console.warn(`[checkout] lead ${l.id} con prezzo ${unitAmountCents} diverso da LEAD_PRICE_CENTS ${LEAD_PRICE_CENTS}`)
      }
      name = `Contatto Mappa dell'Igiene · ${l.category} · ${l.zone}`
      description = `Dati del locale e della segnalazione. Massimo ${l.max_buyers} ditte per contatto, stesso prezzo per tutte.`
      metadata.leadId = l.id
      metadata.companyId = company.id
      defaultPath = '/ditte'
    } else if (product === 'sponsor') {
      const months = parseMonths(body.months)
      const company = await companyOf(admin, profile, body.companyId)
      unitAmountCents = SPONSOR_PRICE_CENTS_MONTH
      quantity = months
      name = `Scheda sponsorizzata · ${company.name}`
      description = `${months} ${months === 1 ? 'mese' : 'mesi'} di scheda in evidenza nella lista dei preventivi. Non dà alcun potere sulle segnalazioni (regola 4).`
      metadata.companyId = company.id
      metadata.months = String(months)
      defaultPath = '/ditte'
    } else {
      const months = parseMonths(body.months)
      const venueId = requireUuid(body.venueId, 'rule.unknown_venue')
      if (!(await isVenueOwner(admin, userId, venueId)) && profile.role !== 'moderatore' && profile.role !== 'admin') {
        throw new HttpError(403, 'rule.not_venue_owner')
      }
      const { data: venue } = await admin.from('venues').select('name').eq('id', venueId).maybeSingle()
      unitAmountCents = PREMIUM_PRICE_CENTS_MONTH
      quantity = months
      name = `Locale Premium · ${(venue as { name?: string } | null)?.name ?? 'locale'}`
      description = `${months} ${months === 1 ? 'mese' : 'mesi'}: avviso immediato delle segnalazioni e certificati in evidenza.`
      metadata.venueId = venueId
      metadata.months = String(months)
      defaultPath = `/locale/${venueId}/gestisci`
    }

    const successPath = safePath(body.successPath, defaultPath)
    const cancelPath = safePath(body.cancelPath, defaultPath)
    const session = await createCheckoutSession(
      stripeKey,
      {
        product: product as StripeProduct,
        unitAmountCents,
        quantity,
        name,
        description,
        successUrl: `${appLink(successPath)}?pagamento=ok&sessione={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appLink(cancelPath)}?pagamento=annullato`,
        clientReferenceId: userId,
        metadata,
        customerEmail: profile.email ?? undefined,
      },
      // Idempotenza lato Stripe: stesso utente, stesso prodotto, stesso minuto -> stessa sessione.
      `${userId}:${product}:${metadata.leadId ?? metadata.companyId ?? metadata.venueId}:${metadata.months ?? 1}:${Math.floor(Date.now() / 60_000)}`,
    )

    return json({ url: session.url, sessionId: session.id, amountCents: unitAmountCents * quantity })
  } catch (e) {
    return handleError(e)
  }
})
