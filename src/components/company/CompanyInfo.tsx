/** Scheda "La mia ditta": dati in sola lettura; nella beta le modifiche passano dal supporto. */
import type { Company } from '../../domain/types'
import { useT } from '../../i18n'
import { KeyValue, Notice } from '../ui'

export function CompanyInfo({ company }: { company: Company }) {
  const t = useT()
  return (
    <section className="card card-pad grid gap-3">
      <h2 className="text-lg font-bold">{t('company.me_title')}</h2>
      <KeyValue
        items={[
          [t('company.me_name'), <strong key="n">{company.name}</strong>],
          [t('company.me_vat'), <span key="v" className="tnum font-data text-xs">{company.vat}</span>],
          [t('company.me_phone'), <span key="p" className="tnum">{company.phone ?? '—'}</span>],
          [t('company.me_email'), <span key="e" className="break-all">{company.email ?? '—'}</span>],
          [t('company.zones'), company.zones.join(' · ')],
          [
            t('company.services'),
            <div key="s" className="flex flex-wrap gap-1">
              {company.services.map((s) => (
                <span key={s} className="chip chip-neutral bg-muted text-fg">
                  {t(`category.${s}`)}
                </span>
              ))}
            </div>,
          ],
          [t('company.me_ack'), company.sameConditionsAck ? t('company.me_ack_yes') : t('company.me_ack_no')],
        ]}
      />
      {company.isFounderCompany && <span className="chip chip-neutral bg-muted text-fg-muted justify-self-start">{t('company.founder_tag')}</span>}
      <Notice tone="info">{t('company.me_edit_note')}</Notice>
    </section>
  )
}
