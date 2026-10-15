/** Indicatore dello SLA: ore trascorse rispetto al limite (24 h moderazione, 48 h richieste DSA). */
import { hoursBetween } from '../../domain/time'
import { useT } from '../../i18n'

export type SlaLevel = 'ok' | 'warn' | 'danger'

export function slaLevel(sinceIso: string, nowIso: string, maxHours: number): { level: SlaLevel; hours: number } {
  const hours = Math.max(0, hoursBetween(sinceIso, nowIso))
  // verde sotto la metà del limite, ambra fino al limite, rosso oltre
  const level: SlaLevel = hours > maxHours ? 'danger' : hours >= maxHours / 2 ? 'warn' : 'ok'
  return { level, hours }
}

const CLASS: Record<SlaLevel, string> = {
  ok: 'chip-risolta',
  warn: 'chip-in_verifica',
  danger: 'chip-confermata',
}

export function SlaChip({ sinceIso, nowIso, maxHours }: { sinceIso: string; nowIso: string; maxHours: number }) {
  const t = useT()
  const { level, hours } = slaLevel(sinceIso, nowIso, maxHours)
  const h = hours < 1 ? '<1' : String(Math.floor(hours))
  return <span className={`chip tnum ${CLASS[level]}`}>{t(`mod.sla.${level}`, { h, max: maxHours })}</span>
}
