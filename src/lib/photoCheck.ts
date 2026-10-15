/**
 * Filtro automatico sulle foto, versione DEMO (euristica locale, nessun modello).
 * In produzione la stessa interfaccia è servita dalla Edge Function `ai-photo-check` (Claude, visione).
 * Il verdetto demo è sempre marcato `simulated: true` e lo si vede nell'interfaccia.
 */
import type { AiCheck } from '../domain/types'

export interface PhotoFeatures {
  width: number
  height: number
  meanLuma: number
  lumaStdDev: number
  colorfulness: number
}

export function featuresToCheck(f: PhotoFeatures, nowIso: string): AiCheck {
  const reasons: string[] = []
  let score = 0.7

  if (f.width < 240 || f.height < 240) {
    reasons.push('photo.too_small')
    score -= 0.35
  }
  if (f.meanLuma < 28) {
    reasons.push('photo.too_dark')
    score -= 0.4
  } else if (f.meanLuma > 235) {
    reasons.push('photo.too_bright')
    score -= 0.3
  }
  if (f.lumaStdDev < 10) {
    reasons.push('photo.uniform')
    score -= 0.4
  }
  if (f.colorfulness < 6) {
    reasons.push('photo.low_detail')
    score -= 0.1
  }
  score = Math.max(0, Math.min(1, score))

  let verdict: AiCheck['verdict'] = 'coerente'
  if (score < 0.35) verdict = 'non_coerente'
  else if (score < 0.6) verdict = 'incerta'
  if (!reasons.length) reasons.push('photo.ok')

  return { verdict, score: Math.round(score * 100) / 100, reasons, simulated: true, checkedAt: nowIso }
}

/** Calcola le caratteristiche dell'immagine da un data URL usando un canvas (solo browser). */
export async function analyzePhoto(dataUrl: string): Promise<PhotoFeatures> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return { width: w, height: h, meanLuma: 128, lumaStdDev: 40, colorfulness: 20 }
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  let sum = 0
  let sumSq = 0
  let colorSum = 0
  const n = size * size
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += l
    sumSq += l * l
    colorSum += Math.max(r, g, b) - Math.min(r, g, b)
  }
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  return { width: w, height: h, meanLuma: mean, lumaStdDev: Math.sqrt(variance), colorfulness: colorSum / n }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
}

/** Riduce la foto a una larghezza massima e la ricomprime (JPEG) per restare leggeri nello store. */
export async function downscalePhoto(dataUrl: string, maxWidth = 1024, quality = 0.82): Promise<string> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const scale = Math.min(1, maxWidth / w)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Sfocatura a mosaico di una regione (x,y,w,h in frazioni 0..1). Nella demo le regioni le indica il moderatore;
 * in produzione le propone il rilevatore di volti della Edge Function e il moderatore conferma.
 */
export async function pixelateRegions(
  dataUrl: string,
  regions: Array<{ x: number; y: number; w: number; h: number }>,
  block = 14,
): Promise<string> {
  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  for (const r of regions) {
    const sx = Math.round(r.x * canvas.width), sy = Math.round(r.y * canvas.height)
    const sw = Math.round(r.w * canvas.width), sh = Math.round(r.h * canvas.height)
    if (sw <= 0 || sh <= 0) continue
    const tmp = document.createElement('canvas')
    tmp.width = Math.max(1, Math.round(sw / block))
    tmp.height = Math.max(1, Math.round(sh / block))
    const tctx = tmp.getContext('2d')
    if (!tctx) continue
    tctx.imageSmoothingEnabled = true
    tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, sx, sy, sw, sh)
  }
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Immagine segnaposto per le segnalazioni di esempio (SVG inline). */
export function placeholderPhoto(label: string, hue = 30): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 25% 38%)"/><stop offset="1" stop-color="hsl(${hue} 20% 18%)"/></linearGradient></defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <g fill="none" stroke="hsl(${hue} 30% 55%)" stroke-width="2" opacity=".5"><path d="M0 400 L640 360"/><path d="M0 440 L640 420"/><rect x="60" y="80" width="520" height="260" rx="6"/></g>
  <text x="320" y="225" font-family="system-ui, sans-serif" font-size="26" fill="#fff" text-anchor="middle" opacity=".92">${escapeXml(label)}</text>
  <text x="320" y="262" font-family="system-ui, sans-serif" font-size="16" fill="#fff" text-anchor="middle" opacity=".7">foto dimostrativa · demo photo</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string)
}
