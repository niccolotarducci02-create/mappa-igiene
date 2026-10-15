/**
 * Cancello di accettazione delle condizioni uguali per tutti (regola 4): finché la ditta non accetta,
 * lo store rifiuta l'acquisto dei contatti (rule.same_conditions_ack).
 */
import { useState } from 'react'
import type { Company } from '../../domain/types'
import { LEAD_PRICE_CENTS } from '../../domain/rules'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtMoney } from '../../lib/format'
import { ErrorBox } from '../ui'

export function SameConditionsGate({ company }: { company: Company }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)

  const accept = async () => {
    setBusy(true)
    setErr(null)
    try {
      await store.acceptSameConditions(company.id)
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card card-pad grid gap-3">
      <h2 className="text-lg font-bold">{t('company.gate_title')}</h2>
      <p className="text-sm">{t('company.gate_body', { price: fmtMoney(LEAD_PRICE_CENTS, lang) })}</p>
      {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={accept}>
        {busy ? t('company.gate_busy') : t('company.gate_accept')}
      </button>
    </div>
  )
}
