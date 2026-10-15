export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * HOUR_MS).toISOString()
}
export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString()
}
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}
export function hoursBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / HOUR_MS
}
export function isSameMonth(aIso: string, bIso: string): boolean {
  const a = new Date(aIso)
  const b = new Date(bIso)
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}
export function isPast(iso: string | undefined, nowIso: string): boolean {
  return !!iso && new Date(iso).getTime() <= new Date(nowIso).getTime()
}
