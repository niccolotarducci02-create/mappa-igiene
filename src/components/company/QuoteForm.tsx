/**
 * Preventivi della ditta per un contatto acquistato: quelli già inviati (con evidenza se accettato dal locale)
 * e il modulo per inviarne uno nuovo (importo in euro -> centesimi, descrizione).
 */
import { useState, type FormEvent } from 'react'
import type { Company, LeadView, Quote } from '../../domain/types'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtMoney } from '../../lib/format'
import { ErrorBox } from '../ui'

interface Props {
  lead: LeadView
  company: Company
  myQuotes: Quote[]
}

/** "280", "280,50" o "280.50" -> centesimi; NaN se non è un numero. */
function parseEuro(input: string): number {
  const n = Number.parseFloat(input.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN
}

export function QuoteForm({ lead, company, myQuotes }: Props) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [amount, setAmount] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!(cents > 0)) {
      setErr(['rule.invalid_amount'])
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await store.submitQuote(lead.id, company.id, cents, text)
      setAmount('')
      setText('')
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      {myQuotes.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-sm font-bold">{t('company.quotes_mine')}</h4>
          <ul className="grid gap-2">
            {myQuotes.map((q) => (
              <li key={q.id} className={`rounded-[var(--radius)] border p-3 grid gap-1 ${q.accepted ? 'border-st-resolved bg-st-resolved-soft/40' : 'border-line'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`chip ${q.accepted ? 'chip-risolta' : 'chip-nessuna'}`}>{q.accepted ? t('company.quote_accepted') : t('company.quote_pending')}</span>
                  <span className="font-bold tnum">{fmtMoney(q.amountCents, lang)}</span>
                </div>
                {q.text && <p className="text-sm">{q.text}</p>}
                <div className="text-xs text-fg-muted tnum">{t('company.quote_sent_on', { date: fmtDate(q.createdAt, lang, true) })}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="grid gap-3" onSubmit={submit}>
        <h4 className="text-sm font-bold">{t('company.quote_title')}</h4>
        <div className="field">
          <label htmlFor={`quote-amount-${lead.id}`}>{t('company.quote_amount')}</label>
          <input
            id={`quote-amount-${lead.id}`}
            className="input tnum"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`quote-text-${lead.id}`}>{t('company.quote_text')}</label>
          <textarea
            id={`quote-text-${lead.id}`}
            className="textarea"
            placeholder={t('company.quote_text_placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={600}
            required
          />
        </div>
        {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
        <button type="submit" className="btn btn-primary" disabled={busy || !amount.trim() || !text.trim()}>
          {busy ? t('company.quote_busy') : t('company.quote_submit')}
        </button>
      </form>
    </div>
  )
}
