/**
 * Decisioni DSA già prese: data di ricezione e di decisione, esito, motivazione della moderazione.
 * Mai il recapito né il testo del richiedente (possono contenere dati personali).
 */
import type { DsaNotice } from '../../domain/types'
import { REMOVAL_SLA_HOURS } from '../../domain/rules'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { EmptyState } from '../ui'

export function DsaDecisions({ notices }: { notices: DsaNotice[] }) {
  const t = useT()
  const { lang } = useLang()
  const decided = notices.filter((n) => n.decidedAt && n.decision)
  const pending = notices.length - decided.length

  return (
    <div className="grid gap-2">
      {pending > 0 && <p className="text-sm text-fg-muted tnum">{t('transparency.dsa_pending', { n: pending, hours: REMOVAL_SLA_HOURS })}</p>}
      {decided.length === 0 ? (
        <EmptyState title={t('transparency.dsa_empty')} />
      ) : (
        <ul className="grid gap-2">
          {decided.map((n) => (
            <li key={n.id} className="card card-pad grid gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="chip chip-neutral bg-muted text-fg">{t(`transparency.dsa_decision.${n.decision}`)}</span>
                <span className="text-xs text-fg-muted tnum">{t('transparency.dsa_decided', { date: fmtDate(n.decidedAt, lang) })}</span>
              </div>
              <div className="text-xs text-fg-muted tnum">{t('transparency.dsa_received', { date: fmtDate(n.receivedAt, lang) })}</div>
              {n.decisionNote && (
                <p className="text-sm mt-1">
                  <span className="text-fg-muted">{t('transparency.dsa_note_label')}: </span>
                  {n.decisionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
