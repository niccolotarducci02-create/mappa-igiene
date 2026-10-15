/** Tipi condivisi tra i passi del flusso di segnalazione. */
import type { CaptureMode } from '../../domain/types'

/** Foto acquisita nel passo 2: data URL già ridotta, modalità e ora dello scatto. */
export interface PhotoCapture {
  dataUrl: string
  captureMode: CaptureMode
  capturedAt: string
}

/** Posizione usata per l'invio: dal GPS oppure simulata (solo demo, coordinate del locale). */
export interface ReportPosition {
  lat: number
  lng: number
  source: 'gps' | 'simulated'
  accuracyM?: number
}

export const REPORT_STEPS = 5
export const DESCRIPTION_MAX = 300
