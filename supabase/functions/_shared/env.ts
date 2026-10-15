/**
 * Lettura delle variabili d'ambiente (secret) delle Edge Functions.
 *
 * Supabase inietta automaticamente in ogni funzione:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
 * Le altre si impostano con `supabase secrets set NOME=valore` (vedi docs/DEPLOY.md):
 *   ANTHROPIC_API_KEY        chiave Claude (ai-photo-check)
 *   ANTHROPIC_MODEL          opzionale, default 'claude-opus-5-5'
 *   ANTHROPIC_FALLBACKS      opzionale, 'default' (predefinito) oppure 'off'
 *   STRIPE_SECRET_KEY        chiave segreta Stripe (create-checkout-session)
 *   STRIPE_WEBHOOK_SECRET    firma del webhook Stripe (payments-webhook)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (numero o Messaging Service SID)  SMS (notify)
 *   RESEND_API_KEY, RESEND_FROM                                                        email (notify)
 *   APP_BASE_URL             URL pubblico della PWA, es. https://nitido.example (link nelle notifiche e in Stripe)
 *   WEBHOOK_SECRET           segreto condiviso con i Database Webhook (header x-webhook-secret), opzionale
 *   CRON_SECRET              segreto condiviso con pg_cron (header x-cron-secret), opzionale
 *   NOTIFY_SMS_KINDS         tipi di notifica da inviare anche via SMS, separati da virgola (notify)
 */

export function optionalEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.trim() !== '' ? v.trim() : undefined
}

export function requireEnv(name: string): string {
  const v = optionalEnv(name)
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}`)
  return v
}

/** URL del progetto Supabase (es. https://xyz.supabase.co). */
export function supabaseUrl(): string {
  return requireEnv('SUPABASE_URL').replace(/\/+$/, '')
}

/** URL base delle Edge Functions del progetto. */
export function functionsBaseUrl(): string {
  // In locale (`supabase start`) le funzioni rispondono su http://127.0.0.1:54321/functions/v1
  return optionalEnv('SUPABASE_FUNCTIONS_URL') ?? `${supabaseUrl()}/functions/v1`
}

/** URL pubblico della PWA, senza slash finale. */
export function appBaseUrl(): string {
  return (optionalEnv('APP_BASE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '')
}

/** Link assoluto a una rotta dell'app: la PWA usa HashRouter, quindi '/profilo' -> '<base>/#/profilo'. */
export function appLink(route: string | null | undefined): string {
  if (!route) return appBaseUrl()
  return `${appBaseUrl()}/#${route.startsWith('/') ? route : `/${route}`}`
}
