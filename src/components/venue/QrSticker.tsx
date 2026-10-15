/**
 * Adesivo stampabile con il QR della scheda. Il link usa la forma "#locale-<id>" (trattino, niente barra):
 * è quella che il DeepLinkNormalizer dell'app traduce nella rotta interna.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useT } from '../../i18n'

type CopyState = 'idle' | 'ok' | 'fallback'

export function QrSticker({ venueId, venueName }: { venueId: string; venueName: string }) {
  const t = useT()
  const [src, setSrc] = useState<string | null>(null)
  const [copy, setCopy] = useState<CopyState>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const url = useMemo(() => `${window.location.origin}${window.location.pathname}#locale-${venueId}`, [venueId])

  useEffect(() => {
    let alive = true
    setSrc(null)
    setCopy('idle')
    QRCode.toDataURL(url, { margin: 1, width: 220 })
      .then((dataUrl) => alive && setSrc(dataUrl))
      .catch(() => alive && setSrc(''))
    return () => {
      alive = false
    }
  }, [url])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopy('ok')
    } catch {
      // Senza permesso per gli appunti: seleziona il testo così l'utente lo copia a mano
      inputRef.current?.focus()
      inputRef.current?.select()
      setCopy('fallback')
    }
  }

  return (
    <div className="card card-pad grid gap-3">
      <p className="text-sm text-fg-muted">{t('venue.qr_intro')}</p>

      <div className="mx-auto w-full max-w-[300px] rounded-[var(--radius)] border-2 border-line bg-elev p-5 text-center grid gap-3">
        <div className="eyebrow">{t('app.name')}</div>
        <p className="font-bold text-lg leading-snug">{t('venue.qr_claim')}</p>
        {src ? (
          <img src={src} alt={t('venue.qr_alt')} width={220} height={220} className="mx-auto w-[220px] h-[220px] rounded-sm" />
        ) : (
          <div className="mx-auto w-[220px] h-[220px] grid place-items-center bg-muted rounded-sm text-xs text-fg-muted" role="status">
            {t('venue.qr_loading')}
          </div>
        )}
        <p className="text-sm font-semibold">{venueName}</p>
      </div>

      <p className="text-xs text-fg-muted text-center">{t('venue.qr_hint')}</p>

      <div className="field">
        <label htmlFor="venue-link">{t('venue.link_label')}</label>
        <div className="flex gap-2">
          <input
            id="venue-link"
            ref={inputRef}
            type="text"
            readOnly
            value={url}
            className="input flex-1 min-w-0 text-xs font-data"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="btn btn-outline shrink-0" onClick={copyLink}>
            {copy === 'ok' ? t('common.copied') : t('venue.copy_link')}
          </button>
        </div>
        {copy === 'fallback' && <p className="text-xs text-fg-muted">{t('venue.copy_fallback')}</p>}
      </div>
    </div>
  )
}
