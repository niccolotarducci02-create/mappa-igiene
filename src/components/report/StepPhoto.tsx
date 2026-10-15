/**
 * Passo 2: la foto. Prima la fotocamera in app (getUserMedia); se non disponibile o rifiutata,
 * ripiego su <input type="file"> marcato come 'file_demo' solo in demo (regola 2); con lo store
 * reale il ripiego non viene offerto: si spiega subito che serve la fotocamera, invece di rifiutare al passo 5.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { downscalePhoto } from '../../lib/photoCheck'
import { Notice } from '../ui'
import type { PhotoCapture } from './types'

type CameraState = 'starting' | 'live' | 'unavailable'

interface Props {
  photo: PhotoCapture | null
  onCapture: (p: PhotoCapture) => void
  onClear: () => void
}

export function StepPhoto({ photo, onCapture, onClear }: Props) {
  const t = useT()
  const { lang } = useLang()
  const allowFileFallback = useStore().mode === 'demo'
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [cameraSupported] = useState(() => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function')
  const [cam, setCam] = useState<CameraState>(cameraSupported ? 'starting' : 'unavailable')
  const [busy, setBusy] = useState(false)
  const [readError, setReadError] = useState(false)
  const hasPhoto = !!photo

  // Avvia la fotocamera quando non c'è una foto; ferma tutte le tracce quando si lascia il passo o si scatta
  useEffect(() => {
    if (hasPhoto || !cameraSupported) return
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.play().catch(() => {
            /* autoplay bloccato: il frame compare al primo tocco */
          })
        }
        setCam('live')
      })
      .catch(() => {
        if (!cancelled) setCam('unavailable')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
  }, [hasPhoto, cameraSupported])

  const shoot = async () => {
    const v = videoRef.current
    if (!v || !v.videoWidth || !v.videoHeight) return
    setBusy(true)
    setReadError(false)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      ctx.drawImage(v, 0, 0)
      const raw = canvas.toDataURL('image/jpeg', 0.9)
      const dataUrl = await downscalePhoto(raw)
      onCapture({ dataUrl, captureMode: 'fotocamera', capturedAt: new Date().toISOString() })
    } catch {
      setReadError(true)
    } finally {
      setBusy(false)
    }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setReadError(false)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const dataUrl = await downscalePhoto(String(reader.result))
        onCapture({ dataUrl, captureMode: 'file_demo', capturedAt: new Date().toISOString() })
      } catch {
        setReadError(true)
      } finally {
        setBusy(false)
      }
    }
    reader.onerror = () => {
      setReadError(true)
      setBusy(false)
    }
    reader.readAsDataURL(file)
  }

  if (photo) {
    const time = new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(photo.capturedAt))
    return (
      <div className="grid gap-3">
        <div className="card overflow-hidden">
          <img src={photo.dataUrl} alt={t('report.photo.preview_alt')} className="block w-full max-h-[60vh] object-contain bg-muted" />
          <div className="px-4 py-2 text-sm text-fg-muted flex flex-wrap justify-between gap-2">
            <span>{t(`report.photo.mode.${photo.captureMode}`)}</span>
            <span className="tnum">{t(photo.captureMode === 'file_demo' ? 'report.photo.uploaded_at' : 'report.photo.taken_at', { time })}</span>
          </div>
        </div>
        {photo.captureMode === 'file_demo' && <Notice tone="warn">{t('report.photo.fallback_notice')}</Notice>}
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setCam(cameraSupported ? 'starting' : 'unavailable')
            onClear()
          }}
        >
          {t('report.photo.retake')}
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-bold">{t('report.photo.title')}</h2>
        <p className="text-sm text-fg-muted mt-1">{t('report.photo.help')}</p>
      </div>

      {cam !== 'unavailable' && (
        <div className="card overflow-hidden relative bg-muted">
          <video ref={videoRef} playsInline muted autoPlay className="block w-full aspect-[3/4] max-h-[60vh] object-cover" />
          {cam === 'starting' && (
            <div className="absolute inset-0 grid place-items-center text-sm text-fg-muted bg-muted" role="status">
              {t('report.photo.camera_starting')}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-4 flex justify-center">
            <button
              type="button"
              onClick={shoot}
              disabled={cam !== 'live' || busy}
              aria-label={t('report.photo.shoot')}
              className="w-[72px] h-[72px] rounded-full bg-elev border-4 border-accent text-accent font-bold text-sm shadow-app disabled:opacity-50 active:scale-95 transition-transform"
            >
              {busy ? '…' : t('report.photo.shoot')}
            </button>
          </div>
        </div>
      )}

      {cam === 'unavailable' && !allowFileFallback && <Notice tone="danger">{t('report.photo.camera_required')}</Notice>}

      {cam === 'unavailable' && allowFileFallback && (
        <>
          <Notice tone="warn">{t('report.photo.fallback_notice')}</Notice>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-hidden="true" tabIndex={-1} />
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? t('report.photo.processing') : t('report.photo.pick')}
          </button>
        </>
      )}

      {readError && <Notice tone="danger">{t('report.photo.read_error')}</Notice>}
    </div>
  )
}
