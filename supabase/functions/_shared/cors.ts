/**
 * Intestazioni CORS e risposte JSON comuni a tutte le Edge Functions.
 * La PWA gira su un dominio diverso da quello di Supabase: senza queste intestazioni il browser
 * rifiuta la risposta. Le funzioni chiamate solo da server (Stripe, pg_cron, webhook del database)
 * le includono comunque: non fanno danni e semplificano i test dal browser.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature, x-webhook-secret, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

/** Risposta alla richiesta preflight del browser (OPTIONS). Restituisce null se non è un preflight. */
export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

/** Risposta JSON con intestazioni CORS. */
export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

/**
 * Errore con le stesse chiavi i18n usate dal dominio ('rule.xxx', 'payment.xxx', 'photo.xxx').
 * Il client le mostra con errorKeys(e) esattamente come gli errori delle RPC.
 */
export function errorResponse(status: number, keys: string | string[], detail?: string): Response {
  const list = Array.isArray(keys) ? keys : [keys]
  return json({ error: list.join(','), keys: list, detail }, status)
}

/** Errore HTTP con stato, lanciato dagli helper e trasformato in risposta da `handleError`. */
export class HttpError extends Error {
  readonly status: number
  readonly keys: string[]
  constructor(status: number, keys: string | string[], detail?: string) {
    const list = Array.isArray(keys) ? keys : [keys]
    super(detail ?? list.join(','))
    this.name = 'HttpError'
    this.status = status
    this.keys = list
  }
}

/** Converte un'eccezione qualsiasi in una risposta JSON, senza far trapelare dettagli interni. */
export function handleError(e: unknown): Response {
  if (e instanceof HttpError) return errorResponse(e.status, e.keys, e.message)
  const message = e instanceof Error ? e.message : String(e)
  console.error('[edge] errore non gestito:', message)
  // Le RPC Postgres lanciano eccezioni con messaggio = chiavi i18n unite da virgola (es. 'rule.max_reports,rule.too_far').
  if (/^rule\.[a-z_,.]+$/.test(message)) return errorResponse(409, message.split(','))
  return errorResponse(500, 'error.internal')
}

/** Legge il corpo JSON della richiesta; corpo vuoto o non valido -> oggetto vuoto. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text()
  if (!text.trim()) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'error.invalid_json')
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID_RE.test(x)
}

export function requireUuid(x: unknown, key: string): string {
  if (!isUuid(x)) throw new HttpError(400, key)
  return x
}
