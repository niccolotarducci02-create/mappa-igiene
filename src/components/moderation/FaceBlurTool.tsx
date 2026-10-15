/**
 * Strumento di sfocatura dei volti prima della pubblicazione (privacy, regola 2 e GDPR).
 * Il moderatore tocca la foto sul volto: si aggiunge un riquadro (22% della larghezza/altezza) centrato sul punto.
 * "Applica sfocatura" pixella i riquadri e salva la foto; "Nessun volto visibile" marca la foto come controllata senza toccarla.
 */
import { useState, type MouseEvent } from 'react'
import type { Report } from '../../domain/types'
import { useStore } from '../../data/StoreContext'
import { useT } from '../../i18n'
import { pixelateRegions } from '../../lib/photoCheck'
import { ErrorBox } from '../ui'
import { useAsyncAction } from './useAsyncAction'

interface Region {
  x: number
  y: number
  w: number
  h: number
}

/** Lato del riquadro, in frazione della larghezza/altezza dell'immagine */
const SIZE = 0.22

export function FaceBlurTool({ report, moderatorId }: { report: Report; moderatorId: string }) {
  const t = useT()
  const store = useStore()
  const [regions, setRegions] = useState<Region[]>([])
  const { run, busy, error, clearError } = useAsyncAction()

  const addRegion = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // Attivazione da tastiera (detail = 0): riquadro al centro dell'immagine
    const fx = e.detail === 0 || !rect.width ? 0.5 : (e.clientX - rect.left) / rect.width
    const fy = e.detail === 0 || !rect.height ? 0.5 : (e.clientY - rect.top) / rect.height
    const clamp = (v: number) => Math.min(1 - SIZE, Math.max(0, v - SIZE / 2))
    setRegions((rs) => [...rs, { x: clamp(fx), y: clamp(fy), w: SIZE, h: SIZE }])
  }

  const apply = () =>
    run(async () => {
      const blurred = await pixelateRegions(report.photo, regions)
      await store.setReportPhotoBlurred(report.id, blurred, moderatorId)
      setRegions([])
    })

  const noFaces = () => run(() => store.setReportPhotoBlurred(report.id, report.photo, moderatorId))

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold">{t('mod.queue.blur_title')}</h4>
        {report.facesBlurred ? (
          <span className="chip chip-risolta">{t('mod.queue.blur_done_chip')}</span>
        ) : (
          <span className="chip chip-in_verifica">{t('mod.queue.blur_todo_chip')}</span>
        )}
      </div>
      <p className="text-xs text-fg-muted">{t('mod.queue.blur_help')}</p>

      <button
        type="button"
        onClick={addRegion}
        className="relative block w-full p-0 border border-line bg-muted rounded-[var(--radius)] overflow-hidden cursor-crosshair"
        aria-label={t('mod.queue.blur_add')}
        title={t('mod.queue.blur_add')}
      >
        <img src={report.photo} alt={t('mod.queue.photo_alt')} className="block w-full h-auto select-none pointer-events-none" draggable={false} />
        {regions.map((r, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute border-2 border-accent bg-accent/30 pointer-events-none rounded-sm"
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          />
        ))}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
        <span className="tnum">{regions.length === 1 ? t('mod.queue.blur_region_one') : t('mod.queue.blur_regions', { n: regions.length })}</span>
        {regions.length > 0 && (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setRegions([])} disabled={busy}>
            {t('mod.queue.blur_clear')}
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn btn-primary" disabled={!regions.length || busy} onClick={apply}>
          {t('mod.queue.blur_apply')}
        </button>
        <button type="button" className="btn btn-outline" disabled={busy || (report.facesBlurred && !regions.length)} onClick={noFaces}>
          {t('mod.queue.blur_none')}
        </button>
      </div>
      {report.facesBlurred && <p className="text-xs text-fg-muted">{t('mod.queue.blur_done')}</p>}
      <ErrorBox keys={error} onClose={clearError} />
    </div>
  )
}
