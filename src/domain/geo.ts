/** Distanza in metri tra due coordinate (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

/** Zona approssimativa di Firenze a partire dalle coordinate (per anonimizzare i contatti). */
export function zoneFor(lat: number, lng: number): string {
  if (lat < 43.765) return 'Oltrarno'
  if (lng < 11.245) return 'Porta al Prato / Cascine'
  if (lng > 11.27) return 'Campo di Marte / Sant\'Ambrogio'
  if (lat > 43.78) return 'San Marco / Statuto'
  return 'Centro storico'
}
