/**
 * Pannelli di /come-funziona per i tre pubblici: Clienti, Locali, Ditte.
 * Elenchi numerati a schede, i numeri del piano da useLegalVars (mai scritti a mano).
 */
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { Notice } from '../ui'
import { useLegalVars } from './vars'

/** Elenco numerato di passi come schede. */
export function StepList({ items }: { items: string[] }) {
  return (
    <ol className="grid gap-2">
      {items.map((text, i) => (
        <li key={i} className="card card-pad flex gap-3">
          <span className="w-8 h-8 shrink-0 rounded-full bg-accent text-accent-fg grid place-items-center font-bold tnum" aria-hidden="true">
            {i + 1}
          </span>
          <p className="min-w-0 pt-1">{text}</p>
        </li>
      ))}
    </ol>
  )
}

/** Elenco puntato semplice dentro una scheda. */
export function BulletCard({ title, items, children }: { title: string; items: string[]; children?: ReactNode }) {
  return (
    <div className="card card-pad">
      <h3 className="font-bold mb-2">{title}</h3>
      <ul className="prose list-disc">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
      {children}
    </div>
  )
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="font-bold text-base mt-2">{children}</h3>
}

export function CustomersPanel() {
  const t = useT()
  const v = useLegalVars()
  return (
    <div className="grid gap-3">
      <Sub>{t('how.c.steps_title')}</Sub>
      <StepList items={[1, 2, 3, 4, 5].map((n) => t(`how.c.step.${n}`, v))} />
      <BulletCard title={t('how.c.after_title')} items={[1, 2, 3].map((n) => t(`how.c.after.${n}`, v))} />
      <BulletCard title={t('how.c.not_title')} items={[1, 2, 3].map((n) => t(`how.c.not.${n}`, v))} />
    </div>
  )
}

export function VenuesPanel() {
  const t = useT()
  const v = useLegalVars()
  return (
    <div className="grid gap-3">
      <Sub>{t('how.v.steps_title')}</Sub>
      <StepList items={[1, 2, 3, 4].map((n) => t(`how.v.step.${n}`, v))} />
      <BulletCard title={t('how.v.premium_title', v)} items={[1, 2, 3].map((n) => t(`how.v.premium.${n}`, v))}>
        <p className="text-sm text-fg-muted mt-2">{t('how.v.premium_no')}</p>
      </BulletCard>
      <div className="card card-pad">
        <h3 className="font-bold mb-1">{t('how.v.qr_title')}</h3>
        <p className="prose">{t('how.v.qr_body')}</p>
      </div>
      <Notice tone="info">{t('how.v.contest', v)}</Notice>
    </div>
  )
}

export function CompaniesPanel() {
  const t = useT()
  const v = useLegalVars()
  return (
    <div className="grid gap-3">
      <Sub>{t('how.d.steps_title')}</Sub>
      <StepList items={[1, 2, 3, 4].map((n) => t(`how.d.step.${n}`, v))} />
      <div className="card card-pad">
        <h3 className="font-bold mb-1">{t('how.d.sponsor_title', v)}</h3>
        <p className="prose">{t('how.d.sponsor_body')}</p>
      </div>
      <Notice tone="info">
        <strong className="block">{t('how.d.same_title')}</strong>
        <span className="block mt-0.5">{t('how.d.same_body')}</span>
      </Notice>
    </div>
  )
}
