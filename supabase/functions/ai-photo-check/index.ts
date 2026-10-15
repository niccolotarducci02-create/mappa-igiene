/**
 * Edge Function `ai-photo-check` — filtro automatico sulla foto di una segnalazione (Claude, visione).
 *
 * Input  : POST { reportId: uuid, force?: boolean }
 * Chi    : service_role (chiamata da on-report-submitted / webhook), un moderatore (ri-esecuzione dalla coda, unico
 *          che può passare force) oppure l'autore della segnalazione (supabaseStore.submitReport la invoca subito
 *          dopo submit_report per mostrare l'esito; è idempotente: una seconda chiamata trova ai_checked_at e salta).
 * Effetto: legge la segnalazione, scarica la foto dal bucket privato report-photos, chiede al modello se la
 *          foto è plausibilmente scattata in un locale alimentare e mostra un problema igienico della
 *          categoria dichiarata; salva ai_verdict/ai_score/ai_reasons/ai_simulated=false/ai_checked_at e i
 *          riquadri dei volti (ai_faces_detected, ai_face_boxes) e applica la stessa regola di applyAiCheck
 *          (src/domain/stateMachine.ts) tramite la RPC apply_ai_check:
 *            non_coerente con punteggio < AI_CHECK_MIN_SCORE -> 'scartata' (+ notifica all'utente)
 *            altrimenti                                       -> resta 'in_verifica' (decide un umano)
 *          Non pubblica MAI nulla: la pubblicazione è solo della moderazione umana (moderate_report).
 *          Se il modello rifiuta, va in errore o risponde in modo non valido -> verdetto 'incerta'.
 *
 * Variabili: ANTHROPIC_API_KEY (obbligatoria), ANTHROPIC_MODEL (default claude-opus-5-5),
 *            ANTHROPIC_FALLBACKS ('default' | 'off').
 */
import Anthropic from 'npm:@anthropic-ai/sdk'
import { AI_CHECK_MIN_SCORE, REPORT_CATEGORIES } from '../../../src/domain/rules.ts'
import { handleError, handleOptions, HttpError, json, readJson, requireUuid } from '../_shared/cors.ts'
import { optionalEnv, requireEnv } from '../_shared/env.ts'
import { createAdminClient, writeAudit } from '../_shared/supabaseAdmin.ts'
import { isModerator, requireCaller } from '../_shared/auth.ts'

type Verdict = 'coerente' | 'non_coerente' | 'incerta'

interface FaceBox {
  x: number
  y: number
  w: number
  h: number
}

interface PhotoCheckResult {
  verdict: Verdict
  score: number
  reasons: string[]
  facesDetected: boolean
  faceBoxes: FaceBox[]
  /** Modello che ha prodotto il verdetto (null se non è stato chiamato). */
  model: string | null
}

interface ReportRow {
  id: string
  venue_id: string
  user_id: string
  source: 'utente' | 'nas'
  category: (typeof REPORT_CATEGORIES)[number]
  description: string
  photo_path: string | null
  state: string
  ai_checked_at: string | null
  ai_verdict: Verdict | null
  ai_score: number | null
  ai_reasons: string[] | null
}

/** Motivi che il modello può restituire (chiavi i18n brevi, tradotte dal client). */
const MODEL_REASON_KEYS = [
  'photo.ok',
  'photo.too_dark',
  'photo.blurry',
  'photo.not_food_venue',
  'photo.no_problem_visible',
  'photo.category_mismatch',
  'photo.screenshot_or_reproduction',
  'photo.people_prominent',
  'photo.possibly_staged',
  'photo.other',
] as const

/** Motivi aggiunti dal sistema quando il modello non viene interrogato o non risponde. */
const SYSTEM_REASON = {
  tooLarge: 'photo.too_large',
  unsupported: 'photo.unsupported_format',
  refused: 'photo.model_refused',
  error: 'photo.model_error',
  invalid: 'photo.model_invalid_output',
} as const

/** Limite dell'API Claude per una singola immagine (5 MB di dati). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type MediaType = (typeof ALLOWED_MEDIA)[number]

const DEFAULT_MODEL = 'claude-opus-5-5'

/** Schema JSON dell'output strutturato: il modello deve rispondere esattamente in questa forma. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'score', 'reasons', 'facesDetected', 'faceBoxes'],
  properties: {
    verdict: { type: 'string', enum: ['coerente', 'non_coerente', 'incerta'] },
    score: { type: 'number', description: 'Confidenza 0..1 che la foto mostri un problema igienico reale della categoria indicata, in un locale alimentare.' },
    reasons: { type: 'array', items: { type: 'string', enum: [...MODEL_REASON_KEYS] } },
    facesDetected: { type: 'boolean' },
    faceBoxes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y', 'w', 'h'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number' },
          h: { type: 'number' },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `Sei il filtro automatico di "Nitido", un'app che raccoglie segnalazioni fotografiche
di problemi igienici in bar e ristoranti di Firenze. Il tuo compito NON è giudicare il locale: è solo dire se la foto
è una prova plausibile per la categoria dichiarata, così che un moderatore umano decida con più informazioni.

Valuta e rispondi SOLO con il JSON richiesto:
- verdict: "coerente" se la foto è plausibilmente scattata dentro o all'esterno immediato di un locale alimentare
  (sala, bancone, cucina, bagno, vetrina, magazzino alimenti...) e mostra un problema igienico compatibile con la
  categoria; "non_coerente" se chiaramente non è un locale alimentare, non c'è nessun problema visibile, oppure è
  uno screenshot, una foto di uno schermo/stampa, un'immagine generata o palesemente ricostruita; "incerta" in tutti
  i casi dubbi (foto scura, sfocata, inquadratura ambigua, categoria plausibile ma non certa).
- score: la tua confidenza 0..1 che si tratti di un problema igienico reale della categoria indicata in un locale
  alimentare. Sotto 0.55 la segnalazione viene esclusa SOLO se verdict è "non_coerente": nel dubbio usa "incerta".
- reasons: una o più chiavi tra quelle ammesse ("photo.ok" solo se non ci sono riserve).
- facesDetected / faceBoxes: segnala ogni volto umano riconoscibile (clienti, personale, passanti) con un riquadro
  in frazioni dell'immagine (x, y angolo in alto a sinistra; w, h larghezza e altezza; tutti 0..1). I volti verranno
  sfocati prima della pubblicazione: meglio un riquadro in più che uno in meno. Se nessun volto, faceBoxes = [].

Categorie: blatte (scarafaggi, insetti striscianti), roditori (topi, escrementi, rosicchiature), formiche, mosche
(mosche o altri insetti volanti su alimenti/superfici), sporcizia (sporco evidente, grasso, rifiuti, stoviglie sporche),
muffa (muffe su pareti, alimenti, frigoriferi), alimenti (alimenti scaduti, mal conservati, scongelati, non protetti),
altro (altro problema igienico evidente).

Sii prudente: una foto scattata male da un cliente reale è normale; non confondere il disordine con la sporcizia e non
inventare problemi che non vedi.`

/* ------------------------------------------------------------------------------------ */
/* Utilità                                                                                */
/* ------------------------------------------------------------------------------------ */

function clamp01(n: unknown): number {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0.5
  return Math.min(1, Math.max(0, x))
}

function mediaTypeFor(blob: Blob, path: string): MediaType | null {
  const t = (blob.type || '').toLowerCase().split(';')[0].trim()
  if ((ALLOWED_MEDIA as readonly string[]).includes(t)) return t as MediaType
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return null
}

/** Base64 a blocchi: evita lo stack overflow di String.fromCharCode(...bytes) su immagini grandi. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function uncertain(reason: string, model: string | null = null): PhotoCheckResult {
  return { verdict: 'incerta', score: 0.5, reasons: [reason], facesDetected: false, faceBoxes: [], model }
}

/** Valida e normalizza il JSON del modello; qualunque cosa fuori schema diventa 'incerta'. */
function normaliseModelOutput(raw: unknown, model: string): PhotoCheckResult {
  if (!raw || typeof raw !== 'object') return uncertain(SYSTEM_REASON.invalid, model)
  const o = raw as Record<string, unknown>
  const verdict: Verdict = o.verdict === 'coerente' || o.verdict === 'non_coerente' || o.verdict === 'incerta' ? o.verdict : 'incerta'
  const reasons = Array.isArray(o.reasons)
    ? o.reasons.filter((r): r is string => typeof r === 'string' && (MODEL_REASON_KEYS as readonly string[]).includes(r))
    : []
  const boxes: FaceBox[] = Array.isArray(o.faceBoxes)
    ? o.faceBoxes
        .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
        .map((b) => ({ x: clamp01(b.x), y: clamp01(b.y), w: clamp01(b.w), h: clamp01(b.h) }))
        .filter((b) => b.w > 0 && b.h > 0)
        .slice(0, 50)
    : []
  const facesDetected = o.facesDetected === true || boxes.length > 0
  if (reasons.length === 0) reasons.push(verdict === 'coerente' ? 'photo.ok' : 'photo.other')
  return { verdict, score: clamp01(o.score), reasons, facesDetected, faceBoxes: boxes, model }
}

/* ------------------------------------------------------------------------------------ */
/* Chiamata al modello                                                                    */
/* ------------------------------------------------------------------------------------ */

async function askClaude(imageBase64: string, mediaType: MediaType, category: string, description: string): Promise<PhotoCheckResult> {
  const model = optionalEnv('ANTHROPIC_MODEL') ?? DEFAULT_MODEL
  const useFallbacks = (optionalEnv('ANTHROPIC_FALLBACKS') ?? 'default') !== 'off'
  const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY'), maxRetries: 2, timeout: 90_000 })

  const userText = `Categoria dichiarata dall'utente: "${category}".
Descrizione dell'utente (può essere vuota o imprecisa, non fidarti ciecamente): "${(description || '').slice(0, 500)}".
Analizza la foto e rispondi con il JSON richiesto.`

  try {
    // Thinking adattivo è il default del modello: non si passa `thinking`.
    // `fallbacks: 'default'` (beta server-side-fallback-2026-07-01): se i classificatori di sicurezza rifiutano
    // la richiesta, l'API la ripete su un modello alternativo nella stessa chiamata.
    const response = await client.beta.messages.create({
      model,
      max_tokens: 2048,
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: userText },
          ],
        },
      ],
    })

    const servedBy: string = typeof response.model === 'string' ? response.model : model

    // Un rifiuto (classificatore o modello) è un HTTP 200 con stop_reason 'refusal' e content vuoto o parziale:
    // non si legge content, decide un umano.
    if (response.stop_reason === 'refusal') {
      console.warn('[ai-photo-check] rifiuto del modello', response.stop_details ?? null)
      return uncertain(SYSTEM_REASON.refused, servedBy)
    }
    if (response.stop_reason === 'max_tokens') {
      console.warn('[ai-photo-check] risposta troncata (max_tokens)')
      return uncertain(SYSTEM_REASON.invalid, servedBy)
    }

    const text = (response.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()
    if (!text) return uncertain(SYSTEM_REASON.invalid, servedBy)

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return uncertain(SYSTEM_REASON.invalid, servedBy)
    }
    return normaliseModelOutput(parsed, servedBy)
  } catch (e) {
    // Errori tipizzati dell'SDK: nessun retry qui (l'SDK ne fa già 2); l'esito è comunque "decide un umano".
    const err = e as { status?: unknown; message?: unknown }
    if (e instanceof Anthropic.APIError) {
      console.error(`[ai-photo-check] errore API ${String(err.status)}: ${String(err.message)}`)
    } else {
      console.error('[ai-photo-check] errore inatteso:', e instanceof Error ? e.message : String(e))
    }
    return uncertain(SYSTEM_REASON.error, model)
  }
}

/* ------------------------------------------------------------------------------------ */
/* Handler                                                                                */
/* ------------------------------------------------------------------------------------ */

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const admin = createAdminClient()
    const caller = await requireCaller(req, admin)
    if (caller.kind === 'user' && caller.profile.blocked) throw new HttpError(403, 'rule.user_blocked')
    const moderator = isModerator(caller)
    const body = await readJson<{ reportId?: unknown; force?: unknown }>(req)
    const reportId = requireUuid(body.reportId, 'error.report_id_required')
    const force = body.force === true && moderator // solo un moderatore può forzare una nuova analisi

    const { data: report, error } = await admin
      .from('reports')
      .select('id, venue_id, user_id, source, category, description, photo_path, state, ai_checked_at, ai_verdict, ai_score, ai_reasons')
      .eq('id', reportId)
      .maybeSingle()
    if (error) throw new Error(`reports: ${error.message}`)
    // Un utente qualunque può chiedere il controllo solo per la PROPRIA segnalazione; a lui una segnalazione
    // altrui o inesistente risulta ugualmente "non consentita" (niente enumerazione degli id).
    if (caller.kind === 'user' && !moderator && (!report || (report as ReportRow).user_id !== caller.userId)) {
      throw new HttpError(403, 'rule.not_allowed')
    }
    if (!report) throw new HttpError(404, 'rule.unknown_report')
    const r = report as ReportRow

    // Il filtro ha senso solo per le segnalazioni utente ancora in verifica e con una foto.
    if (r.source !== 'utente' || !r.photo_path) {
      return json({ reportId, skipped: 'no_photo', state: r.state })
    }
    if (r.state !== 'in_verifica') {
      return json({ reportId, skipped: 'not_in_verification', state: r.state })
    }
    if (r.ai_checked_at && !force) {
      return json({ reportId, skipped: 'already_checked', state: r.state, verdict: r.ai_verdict, score: r.ai_score, reasons: r.ai_reasons ?? [] })
    }

    // 1. Foto dal bucket privato (il client service_role legge qualunque percorso).
    let result: PhotoCheckResult
    const { data: blob, error: dlErr } = await admin.storage.from('report-photos').download(r.photo_path)
    if (dlErr || !blob) {
      console.error('[ai-photo-check] download fallito:', dlErr?.message ?? 'blob vuoto')
      result = uncertain(SYSTEM_REASON.error)
    } else {
      const mediaType = mediaTypeFor(blob, r.photo_path)
      if (!mediaType) result = uncertain(SYSTEM_REASON.unsupported)
      else if (blob.size > MAX_IMAGE_BYTES) result = uncertain(SYSTEM_REASON.tooLarge)
      else {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        result = await askClaude(toBase64(bytes), mediaType, r.category, r.description)
      }
    }

    // 2. Esito nel database con la stessa regola di applyAiCheck (la RPC calcola lo stato e notifica l'utente
    //    se scartata). ai_simulated = false: è il modello, non l'euristica della demo.
    const { data: updated, error: rpcErr } = await admin.rpc('apply_ai_check', {
      p_report_id: reportId,
      p_verdict: result.verdict,
      p_score: result.score,
      p_reasons: result.reasons,
      p_simulated: false,
    })
    if (rpcErr) {
      // 'rule.not_in_verification': nel frattempo un moderatore ha già deciso -> niente da fare.
      if (/rule\.not_in_verification/.test(rpcErr.message)) {
        return json({ reportId, skipped: 'not_in_verification' })
      }
      throw new Error(`apply_ai_check: ${rpcErr.message}`)
    }

    // 3. Riquadri dei volti (colonne di 0004_ai_faces.sql), per lo strumento di sfocatura della moderazione.
    const { error: facesErr } = await admin
      .from('reports')
      .update({ ai_faces_detected: result.facesDetected, ai_face_boxes: result.faceBoxes, ai_model: result.model })
      .eq('id', reportId)
    if (facesErr) console.error('[ai-photo-check] salvataggio volti fallito:', facesErr.message)

    const state = (updated as { state?: string } | null)?.state ?? null
    await writeAudit(
      admin,
      'ai_photo_check',
      'report',
      reportId,
      `${result.verdict} ${result.score.toFixed(2)} ${result.reasons.join(',')}${result.facesDetected ? ` volti:${result.faceBoxes.length}` : ''}${result.model ? ` [${result.model}]` : ''}`,
      caller.kind === 'user' ? caller.userId : null,
    )

    return json({
      reportId,
      state,
      verdict: result.verdict,
      score: result.score,
      reasons: result.reasons,
      facesDetected: result.facesDetected,
      faceBoxes: result.faceBoxes,
      threshold: AI_CHECK_MIN_SCORE,
      model: result.model,
    })
  } catch (e) {
    return handleError(e)
  }
})
