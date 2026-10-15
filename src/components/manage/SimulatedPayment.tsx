/**
 * Passaggio di pagamento SIMULATO (demo): mostra cosa si compra e l'importo, chiede una conferma esplicita
 * e solo allora chiama lo store. Nessun addebito reale; in produzione qui c'è il fornitore di pagamenti.
 * Usato sia dal titolare (Premium) sia dalle ditte (contatti, sponsorizzazione).
 * Fuori dalla demo (store Supabase) il fornitore di pagamenti non è ancora integrato: il passaggio
 * lo dice e non offre la conferma, così nessun servizio a pagamento viene attivato senza pagamento.
 */
import { useState } from 'react'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtMoney } from '../../lib/format'
import { ErrorBox, Notice } from '../ui'

interface Props {
  /** Cosa si sta pagando, già tradotto (es. "Locale Premium · 3 mesi"). */
  label: string
  amountCents: number
  /** Chiamata allo store; se lancia RuleViolation l'errore viene mostrato qui. */
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function SimulatedPayment({ label, amountCents, onConfirm, onCancel }: Props) {
  const t = useT()
  const { lang } = useLang()
  const demo = useStore().mode === 'demo'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)

  const confirm = async () => {
    setBusy(true)
    setErr(null)
    try {
      await onConfirm()
    } catch (e) {
      setErr(errorKeys(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="group"
      aria-label={t(demo ? 'manage.pay.title' : 'manage.pay.title_unavailable')}
      className="rounded-[var(--radius)] border border-st-verifying/40 bg-st-verifying-soft p-3 grid gap-2 text-sm text-fg"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{t(demo ? 'manage.pay.title' : 'manage.pay.title_unavailable')}</span>
        {demo && <span className="chip chip-neutral bg-elev text-fg-muted">{t('common.simulated')}</span>}
      </div>
      <p className="font-semibold">{label}</p>
      {demo ? <p className="text-fg-muted">{t('manage.pay.body')}</p> : <Notice tone="warn">{t('manage.pay.unavailable')}</Notice>}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-fg-muted">{t('manage.pay.amount')}</span>
        <span className="text-xl font-bold tnum">{fmtMoney(amountCents, lang)}</span>
      </div>
      {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
      <div className="grid gap-2 sm:grid-cols-2">
        {demo && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
            {busy ? t('manage.pay.busy') : t('manage.pay.confirm')}
          </button>
        )}
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
