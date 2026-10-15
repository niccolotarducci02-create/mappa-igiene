/** Identificatore stabile del dispositivo per la demo (blocco di dispositivi che abusano). */
import { quickHash } from './ids'

const KEY = 'mappa-igiene-device'

export function deviceHash(): string {
  try {
    let v = window.localStorage.getItem(KEY)
    if (!v) {
      v = quickHash(`${navigator.userAgent}|${screen.width}x${screen.height}|${Math.random()}`)
      window.localStorage.setItem(KEY, v)
    }
    return v
  } catch {
    return quickHash(typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown')
  }
}
