/**
 * Un contatto visto dalla ditta: anonimizzato (categoria, zona, quante ditte su 3, prezzo) finché non lo acquista;
 * dopo l'acquisto compaiono nome, indirizzo, telefono del locale e la foto, più il modulo del preventivo.
 * Il prezzo è lo stesso per tutte le ditte (priceForCompany): nessuno sconto, nemmeno al fondatore.
 */
import { useRef, useState } from 'react'
import type { Company, LeadView, Quote } from '../../domain/types'
import { canBuyLead } from '../../domain/stateMachine'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtMoney, fmtRelative } from '../../lib/format'
import { ErrorBox, KeyValue } from '../ui'
import { SimulatedPayment } from '../manage/SimulatedPayment'
import { QuoteForm } from './QuoteForm'

interface Props {
  lead: LeadView
  company: Company
  myQuotes: Quote[]
  nowIso: string
}

const STATUS_CHIP: Record<LeadView['status'], string> = {
  aperto: 'chip-risolta',
  completo: 'chip-in_verifica',
  chiuso: 'chip-nessuna',
}

export function LeadCard({ lead, company, myQuotes, nowIso }: Props) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [paying, setPaying] = useState(false)
  const check = canBuyLead(lead, company)
  const canBuy = !lead.purchasedByMe && lead.status === 'aperto'
  const category = t(`category.${lead.category}`)

  return (
    <article className="card overflow-hidden" data-testid="lead-card" data-lead-id={lead.id}>
      <div className="p-3 grid gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip chip-neutral bg-muted text-fg">{category}</span>
          <span className={`chip ${STATUS_CHIP[lead.status]}`}>{t(`company.lead_status.${lead.status}`)}</span>
          {lead.purchasedByMe && <span className="chip chip-neutral bg-accent-soft text-fg">{t('company.lead_bought')}</span>}
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
          <span>{t('company.lead_zone', { zone: lead.zone })}</span>
          <span className="text-fg-muted">{t('company.lead_created', { when: fmtRelative(lead.createdAt, lang, nowIso) })}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm tnum">
          <span>{t('company.lead_n_of_m', { n: lead.purchases.length, m: lead.maxBuyers })}</span>
          <span>
            <span className="text-fg-muted">{t('company.lead_price')}:</span> <strong data-testid="lead-price">{fmtMoney(lead.priceCents, lang)}</strong>
          </span>
        </div>
      </div>

      {canBuy && (
        <div className="p-3 border-t border-line grid gap-2">
          <p className="text-xs text-fg-muted">{t('company.lead_anon_note')}</p>
          {!check.ok && <ErrorBox keys={check.reasons} />}
          {paying ? (
            <SimulatedPayment
              label={t('company.pay_lead_label', { category, zone: lead.zone })}
              amountCents={lead.priceCents}
              onConfirm={async () => {
                await store.buyLead(lead.id, company.id)
                setPaying(false)
              }}
              onCancel={() => setPaying(false)}
            />
          ) : (
            <button type="button" className="btn btn-primary" disabled={!check.ok} onClick={() => setPaying(true)}>
              {t('company.lead_buy', { price: fmtMoney(lead.priceCents, lang) })}
            </button>
          )}
        </div>
      )}

      {!lead.purchasedByMe && lead.status !== 'aperto' && <div className="p-3 border-t border-line text-sm text-fg-muted">{t('company.lead_unavailable')}</div>}

      {lead.purchasedByMe && (
        <>
          <div className="p-3 border-t border-line grid gap-3">
            <KeyValue
              items={[
                [t('company.lead_venue'), <strong key="v">{lead.venueName ?? '—'}</strong>],
                [t('company.lead_address'), lead.venueAddress ?? '—'],
                [t('company.lead_phone'), <PhoneCopy key="p" phone={lead.venuePhone} />],
              ]}
            />
            {lead.photo && (
              <img src={lead.photo} alt={t('company.lead_photo_alt', { category })} className="w-full max-h-[60vw] object-cover rounded-[var(--radius)] bg-muted" loading="lazy" />
            )}
          </div>
          <div className="p-3 border-t border-line">
            <QuoteForm lead={lead} company={company} myQuotes={myQuotes} />
          </div>
        </>
      )}
    </article>
  )
}

/** Numero di telefono con pulsante Copia; senza permesso per gli appunti seleziona il testo. */
function PhoneCopy({ phone }: { phone?: string }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'ok' | 'fallback'>('idle')
  const ref = useRef<HTMLInputElement>(null)
  if (!phone) return <span className="text-fg-muted">{t('company.lead_phone_missing')}</span>

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone)
      setState('ok')
    } catch {
      ref.current?.focus()
      ref.current?.select()
      setState('fallback')
    }
  }

  return (
    <div className="grid gap-1">
      <div className="flex gap-2 items-center">
        <input ref={ref} type="text" readOnly value={phone} className="input flex-1 min-w-0 tnum" onFocus={(e) => e.currentTarget.select()} aria-label={t('company.lead_phone')} />
        <button type="button" className="btn btn-outline shrink-0" onClick={copy}>
          {state === 'ok' ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      {state === 'fallback' && <p className="text-xs text-fg-muted">{t('company.copy_fallback')}</p>}
    </div>
  )
}
