/**
 * Stripe senza SDK: le due cose che servono si fanno con fetch e Web Crypto.
 *  - verifyStripeSignature(): verifica l'intestazione Stripe-Signature (HMAC-SHA256 su "t.payload").
 *  - createCheckoutSession(): POST https://api.stripe.com/v1/checkout/sessions (form-urlencoded).
 * Documentazione: https://docs.stripe.com/webhooks#verify-manually e https://docs.stripe.com/api/checkout/sessions/create
 */
import { HttpError } from './cors.ts'

const STRIPE_API = 'https://api.stripe.com/v1'
/** Tolleranza sul timestamp della firma (secondi), come l'SDK ufficiale. */
const SIGNATURE_TOLERANCE_S = 300

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifica la firma del webhook. `rawBody` deve essere il corpo ESATTO della richiesta (req.text()),
 * non un JSON ri-serializzato. Lancia HttpError 400 se la firma non è valida o è troppo vecchia.
 */
export async function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string, nowS = Math.floor(Date.now() / 1000)): Promise<void> {
  if (!signatureHeader) throw new HttpError(400, 'payment.bad_signature', 'Stripe-Signature mancante')
  const parts = new Map<string, string[]>()
  for (const kv of signatureHeader.split(',')) {
    const [k, v] = kv.split('=', 2).map((s) => s.trim())
    if (!k || !v) continue
    parts.set(k, [...(parts.get(k) ?? []), v])
  }
  const t = parts.get('t')?.[0]
  const v1s = parts.get('v1') ?? []
  if (!t || !/^\d+$/.test(t) || v1s.length === 0) throw new HttpError(400, 'payment.bad_signature', 'intestazione malformata')
  if (Math.abs(nowS - Number(t)) > SIGNATURE_TOLERANCE_S) throw new HttpError(400, 'payment.bad_signature', 'timestamp fuori tolleranza')
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`)
  if (!v1s.some((v) => constantTimeEqual(v, expected))) throw new HttpError(400, 'payment.bad_signature', 'firma non valida')
}

/* ------------------------------------------------------------------------------------ */
/* Checkout                                                                               */
/* ------------------------------------------------------------------------------------ */

export type StripeProduct = 'lead' | 'sponsor' | 'premium'

export interface CheckoutInput {
  product: StripeProduct
  /** Prezzo unitario in centesimi (IVA inclusa, prezzo al pubblico). */
  unitAmountCents: number
  quantity: number
  name: string
  description?: string
  successUrl: string
  cancelUrl: string
  /** Riferimento interno (id utente) mostrato in Stripe. */
  clientReferenceId: string
  /** Letto dal webhook per sapere cosa attivare. Solo stringhe. */
  metadata: Record<string, string>
  customerEmail?: string
}

export interface CheckoutSession {
  id: string
  url: string
  amount_total: number | null
  expires_at: number | null
}

/** Serializza un oggetto annidato nel formato form di Stripe (a[b][c]=v). */
export function toStripeForm(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) toStripeForm(item as Record<string, unknown>, `${name}[${i}]`, out)
        else out.append(`${name}[${i}]`, String(item))
      })
    } else if (typeof value === 'object') {
      toStripeForm(value as Record<string, unknown>, name, out)
    } else {
      out.append(name, String(value))
    }
  }
  return out
}

export async function createCheckoutSession(secretKey: string, input: CheckoutInput, idempotencyKey?: string): Promise<CheckoutSession> {
  const body = toStripeForm({
    mode: 'payment',
    client_reference_id: input.clientReferenceId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    locale: 'it',
    // Una ricevuta Stripe costa niente ed è la prova del pagamento per la ditta/il locale.
    invoice_creation: { enabled: true },
    line_items: [
      {
        quantity: input.quantity,
        price_data: {
          currency: 'eur',
          unit_amount: input.unitAmountCents,
          product_data: { name: input.name, description: input.description },
        },
      },
    ],
    metadata: { ...input.metadata, product: input.product },
    payment_intent_data: { metadata: { ...input.metadata, product: input.product } },
  })

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-06-20',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, { method: 'POST', headers, body })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = (data.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`
    console.error('[stripe] checkout.sessions.create fallita:', err)
    throw new HttpError(502, 'payment.provider_error', err)
  }
  return {
    id: String(data.id),
    url: String(data.url),
    amount_total: typeof data.amount_total === 'number' ? data.amount_total : null,
    expires_at: typeof data.expires_at === 'number' ? data.expires_at : null,
  }
}

/* ------------------------------------------------------------------------------------ */
/* Eventi                                                                                 */
/* ------------------------------------------------------------------------------------ */

/** Il sottoinsieme dell'evento Stripe che il webhook usa. */
export interface StripeEvent {
  id: string
  type: string
  created: number
  livemode: boolean
  data: {
    object: {
      id: string
      object: string
      payment_status?: string
      status?: string
      amount_total?: number | null
      currency?: string
      client_reference_id?: string | null
      customer_details?: { email?: string | null } | null
      payment_intent?: string | null
      metadata?: Record<string, string> | null
    }
  }
}

export function parseStripeEvent(rawBody: string): StripeEvent {
  let ev: unknown
  try {
    ev = JSON.parse(rawBody)
  } catch {
    throw new HttpError(400, 'error.invalid_json')
  }
  const e = ev as Partial<StripeEvent>
  if (!e || typeof e.id !== 'string' || typeof e.type !== 'string' || !e.data?.object) {
    throw new HttpError(400, 'payment.bad_event')
  }
  return e as StripeEvent
}
