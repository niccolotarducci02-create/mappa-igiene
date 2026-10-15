/** Scheda "Registro attività": le ultime azioni registrate dallo store, dalla più recente. */
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { EmptyState } from '../ui'
import { shortId, type TabProps } from './types'

export function AuditTab({ data }: TabProps) {
  const t = useT()
  const { lang } = useLang()
  if (!data.audit.length) return <EmptyState title={t('mod.audit.empty')} />

  // Etichetta leggibile se la conosciamo, altrimenti il nome grezzo dell'azione
  const actionLabel = (action: string) => {
    const key = `mod.audit.action.${action}`
    const label = t(key)
    return label === key ? action : label
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-fg-muted tnum">{t('mod.audit.intro', { n: data.audit.length })}</p>
      <table className="w-full table-fixed text-xs card">
        <thead className="text-left text-fg-muted">
          <tr>
            <th scope="col" className="p-2 w-[27%] font-semibold">{t('mod.audit.col_when')}</th>
            <th scope="col" className="p-2 w-[36%] font-semibold">{t('mod.audit.col_action')}</th>
            <th scope="col" className="p-2 font-semibold">{t('mod.audit.col_target')}</th>
          </tr>
        </thead>
        <tbody>
          {data.audit.map((a) => (
            <tr key={a.id} className="border-t border-line align-top">
              <td className="p-2 break-words">
                <div className="tnum">{fmtDate(a.at, lang, true)}</div>
                <div className="text-fg-muted">
                  {t('mod.audit.col_actor')}: <span className="font-data">{shortId(a.actorId, 10)}</span>
                </div>
              </td>
              <td className="p-2 break-words">
                <div className="font-semibold">{actionLabel(a.action)}</div>
                <div className="text-fg-muted font-data">{a.action}</div>
              </td>
              <td className="p-2 break-words">
                <div>
                  {a.targetType} · <span className="font-data">{shortId(a.targetId, 14)}</span>
                </div>
                {a.note && <div className="text-fg-muted mt-0.5">{a.note}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
