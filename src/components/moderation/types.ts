/** Tipi e piccole utilità condivise tra le schede della console di moderazione. */
import type { Profile } from '../../domain/types'
import type { ModerationBundle } from './useModerationData'

export interface TabProps {
  data: ModerationBundle
  /** Il moderatore collegato: è l'attore di ogni azione */
  profile: Profile
  /** "Adesso", fissato a ogni ricarica dei dati, per SLA e tempi relativi coerenti */
  nowIso: string
}

/** Accorcia un identificatore per mostrarlo senza occupare tutta la riga. */
export function shortId(id: string, max = 12): string {
  return id.length > max ? `${id.slice(0, max)}…` : id
}
