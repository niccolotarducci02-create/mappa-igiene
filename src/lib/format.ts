import type { Lang } from '../domain/types'

export function fmtMoney(cents: number, lang: Lang = 'it'): string {
  return new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}

export function fmtDate(iso: string | undefined, lang: Lang = 'it', withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d)
}

export function fmtRelative(iso: string | undefined, lang: Lang = 'it', nowIso = new Date().toISOString()): string {
  if (!iso) return '—'
  const diffMs = new Date(iso).getTime() - new Date(nowIso).getTime()
  const rtf = new Intl.RelativeTimeFormat(lang === 'it' ? 'it' : 'en', { numeric: 'auto' })
  const abs = Math.abs(diffMs)
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour')
  return rtf.format(Math.round(diffMs / 86_400_000), 'day')
}

export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

export function fmtHours(h: number, lang: Lang = 'it'): string {
  if (h < 1) return lang === 'it' ? 'meno di un\'ora' : 'under an hour'
  if (h < 48) return lang === 'it' ? `${Math.floor(h)} ore` : `${Math.floor(h)} hours`
  const days = Math.floor(h / 24)
  return lang === 'it' ? `${days} giorni` : `${days} days`
}
