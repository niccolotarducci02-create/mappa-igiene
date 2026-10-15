/**
 * Elenco pubblico delle ditte partner, in ordine alfabetico: nome, interventi, zone, badge Sponsor se attivo.
 * La ditta del fondatore ha un'etichetta neutra "stesse condizioni": nessuna evidenza in più.
 * Regola 4: il badge Sponsor non compare mai per la ditta del fondatore, come nella lista dei preventivi
 * (QuotesPanel): nessun vantaggio, nemmeno visivo.
 */
import type { Company } from '../../domain/types'
import { isSponsorActive } from '../../domain/stateMachine'
import { useT } from '../../i18n'
import { EmptyState } from '../ui'

export function PartnerDirectory({ companies, nowIso }: { companies: Company[]; nowIso: string }) {
  const t = useT()
  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name))
  if (!sorted.length) return <EmptyState title={t('company.directory_empty')} />

  return (
    <ul className="grid gap-2">
      {sorted.map((c) => (
        <li key={c.id} className="card card-pad grid gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold">{c.name}</h3>
            {!c.isFounderCompany && isSponsorActive(c, nowIso) && <span className="chip chip-neutral bg-accent-soft text-fg">{t('company.sponsor_badge')}</span>}
            {c.isFounderCompany && <span className="chip chip-neutral bg-muted text-fg-muted">{t('company.founder_tag')}</span>}
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-fg-muted">{t('company.services')}</div>
            <div className="flex flex-wrap gap-1">
              {c.services.map((s) => (
                <span key={s} className="chip chip-neutral bg-muted text-fg">
                  {t(`category.${s}`)}
                </span>
              ))}
            </div>
          </div>
          <div className="text-xs text-fg-muted">
            {t('company.zones')}: <span className="text-fg">{c.zones.join(' · ')}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
