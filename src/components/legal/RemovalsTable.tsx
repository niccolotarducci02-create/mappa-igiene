/**
 * Registro pubblico delle rimozioni (regola 4): data di rimozione, locale, motivo, chi l'ha chiesta, data di pubblicazione.
 * Tabella scorrevole in orizzontale dentro la scheda; la pagina non scorre mai di lato.
 */
import type { Removal } from '../../domain/types'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { EmptyState } from '../ui'

export function RemovalsTable({ removals }: { removals: Removal[] }) {
  const t = useT()
  const { lang } = useLang()
  if (!removals.length) return <EmptyState title={t('transparency.removals_empty')} />

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-xs text-fg-muted border-b border-line">
            <th scope="col" className="px-3 py-2 font-semibold">{t('transparency.col.removed_at')}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t('transparency.col.venue')}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t('transparency.col.reason')}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t('transparency.col.requested_by')}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t('transparency.col.published_at')}</th>
          </tr>
        </thead>
        <tbody>
          {removals.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 align-top">
              <td className="px-3 py-2 tnum whitespace-nowrap">{fmtDate(r.removedAt, lang)}</td>
              <td className="px-3 py-2 font-semibold">{r.venueName}</td>
              <td className="px-3 py-2">{t(`removal.${r.reason}`)}</td>
              <td className="px-3 py-2">{t(`requester.${r.requestedBy}`)}</td>
              <td className="px-3 py-2 tnum whitespace-nowrap">{fmtDate(r.publishedAt, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
