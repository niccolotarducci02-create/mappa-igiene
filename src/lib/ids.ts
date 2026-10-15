/** Identificatori brevi e leggibili per lo store demo. In produzione li genera Postgres (uuid). */
export function newId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${rnd}`
}

/** Hash sincrono non crittografico (FNV-1a) usato per il confronto rapido delle foto nella demo. */
export function quickHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
