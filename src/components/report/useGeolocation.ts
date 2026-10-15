/**
 * Hook per la geolocalizzazione del browser con timeout: un solo tentativo per chiamata a locate().
 * Il timeout nativo parte solo dopo la risposta al permesso, quindi c'è un orologio di sicurezza nostro:
 * se dopo timeoutMs non è arrivato nulla, lo stato diventa 'error' (un fix arrivato in ritardo viene comunque usato).
 */
import { useCallback, useRef, useState } from 'react'

export interface GeoFix {
  lat: number
  lng: number
  accuracyM: number
  at: string
}

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'error'

export interface Geolocation {
  fix: GeoFix | null
  status: GeoStatus
  locate: () => void
}

export function useGeolocation(timeoutMs = 6000): Geolocation {
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [status, setStatus] = useState<GeoStatus>('idle')
  const inFlight = useRef(false)
  const seq = useRef(0)

  const locate = useCallback(() => {
    if (inFlight.current) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
      return
    }
    const reqId = ++seq.current
    inFlight.current = true
    setStatus('locating')
    const watchdog = window.setTimeout(() => {
      if (seq.current !== reqId || !inFlight.current) return
      inFlight.current = false
      setStatus('error')
    }, timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (seq.current !== reqId) return
        window.clearTimeout(watchdog)
        inFlight.current = false
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy), at: new Date().toISOString() })
        setStatus('ok')
      },
      () => {
        if (seq.current !== reqId) return
        window.clearTimeout(watchdog)
        inFlight.current = false
        setStatus('error')
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  }, [timeoutMs])

  return { fix, status, locate }
}
