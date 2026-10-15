/**
 * Mattoni dei documenti legali: paragrafi raccolti dal dizionario per prefisso (`terms.s1.p1`, `terms.s1.p2`, …),
 * sezioni numerate, indice, avviso "bozza", evidenziazione dei segnaposto tra parentesi quadre,
 * indirizzo di contatto selezionabile (nessun mailto) e collegamenti tra le pagine legali.
 */
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { dictionaries, useT } from '../../i18n'
import { Notice } from '../ui'
import type { LegalVars } from './vars'

/** Chiavi `${prefix}.${kind}1`, `${prefix}.${kind}2`, … finché esistono nel dizionario italiano (lingua primaria). */
export function keyList(prefix: string, kind: 'p' | 'l', max = 30): string[] {
  const out: string[] = []
  for (let n = 1; n <= max; n++) {
    const k = `${prefix}.${kind}${n}`
    if (!(k in dictionaries.it)) break
    out.push(k)
  }
  return out
}

/** Un segnaposto da compilare prima del lancio, es. "[Ragione sociale]" o "dsa@[dominio]". */
export function Placeholder({ children }: { children: ReactNode }) {
  const t = useT()
  return (
    <mark className="rounded px-1 bg-st-verifying-soft text-st-verifying font-semibold" title={t('legal.placeholder')}>
      {children}
    </mark>
  )
}

const PLACEHOLDER_RE = /(\S*\[[^\]]+\])/g

/** Evidenzia i segnaposto tra parentesi quadre dentro un testo. */
export function withPlaceholders(text: string): ReactNode {
  const parts = text.split(PLACEHOLDER_RE)
  if (parts.length === 1) return text
  return parts.map((part, i) => (i % 2 === 1 ? <Placeholder key={i}>{part}</Placeholder> : <Fragment key={i}>{part}</Fragment>))
}

/** Paragrafi (`.p1…`) ed eventuale elenco (`.l1…`) di una sezione, con interpolazione delle variabili. */
export function SectionBody({ prefix, vars }: { prefix: string; vars: LegalVars }) {
  const t = useT()
  const paragraphs = keyList(prefix, 'p')
  const items = keyList(prefix, 'l')
  return (
    <div className="prose">
      {paragraphs.map((k) => (
        <p key={k}>{withPlaceholders(t(k, vars))}</p>
      ))}
      {items.length > 0 && (
        <ul className={`list-disc ${paragraphs.length ? 'mt-2' : ''}`}>
          {items.map((k) => (
            <li key={k}>{withPlaceholders(t(k, vars))}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function sectionId(prefix: string, n: number): string {
  return `${prefix}-s${n}`
}

export function LegalSection({ prefix, n, vars }: { prefix: string; n: number; vars: LegalVars }) {
  const t = useT()
  return (
    <section id={sectionId(prefix, n)} className="card card-pad scroll-mt-24">
      <h2 className="text-lg font-bold leading-tight mb-2 flex gap-2">
        <span className="tnum text-fg-muted shrink-0">{n}.</span>
        <span>{t(`${prefix}.s${n}.title`)}</span>
      </h2>
      <SectionBody prefix={`${prefix}.s${n}`} vars={vars} />
    </section>
  )
}

/** Indice richiudibile: scorre alla sezione senza cambiare l'hash (siamo in HashRouter). */
export function Toc({ prefix, count }: { prefix: string; count: number }) {
  const t = useT()
  const go = (n: number) => document.getElementById(sectionId(prefix, n))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <details className="card">
      <summary className="card-pad cursor-pointer font-semibold min-h-[44px] flex items-center">{t('legal.toc')}</summary>
      <ol className="px-2 pb-2 grid">
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <button type="button" className="w-full text-left min-h-[44px] px-2 py-2 rounded-[var(--radius)] hover:bg-muted text-sm flex gap-2" onClick={() => go(n)}>
              <span className="tnum text-fg-muted shrink-0 w-5">{n}.</span>
              <span>{t(`${prefix}.s${n}.title`)}</span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** Documento completo: avviso bozza, indice, sezioni numerate. */
export function LegalDocument({ prefix, sections, vars }: { prefix: string; sections: number; vars: LegalVars }) {
  return (
    <div className="grid gap-3">
      <DraftNotice legend />
      <Toc prefix={prefix} count={sections} />
      {Array.from({ length: sections }, (_, i) => i + 1).map((n) => (
        <LegalSection key={n} prefix={prefix} n={n} vars={vars} />
      ))}
    </div>
  )
}

export function DraftNotice({ legend = false }: { legend?: boolean }) {
  const t = useT()
  return (
    <Notice tone="warn">
      <strong className="block">{t('legal.draft')}</strong>
      {legend && <span className="block mt-0.5 text-xs">{t('legal.placeholder_legend')}</span>}
      <span className="block mt-0.5 text-xs">{t('legal.version')}</span>
    </Notice>
  )
}

/** Indirizzo mostrato come testo selezionabile, senza mailto; il segnaposto "[dominio]" resta evidenziato. */
export function ContactAddress({ address }: { address: string }) {
  const t = useT()
  return (
    <div className="grid gap-1">
      <code className="font-data text-base select-all break-all bg-muted rounded-[var(--radius)] px-3 py-2 inline-block w-fit max-w-full">
        {withPlaceholders(address)}
      </code>
      <span className="text-xs text-fg-muted">{t('legal.contact_select_hint')}</span>
    </div>
  )
}

const LEGAL_LINKS: Array<{ to: string; key: string }> = [
  { to: '/regole', key: 'legal.see_rules' },
  { to: '/termini', key: 'legal.see_terms' },
  { to: '/privacy', key: 'legal.see_privacy' },
  { to: '/trasparenza', key: 'legal.see_transparency' },
  { to: '/dsa', key: 'legal.see_dsa' },
]

/** Collegamenti alle altre pagine legali, escludendo quella corrente. */
export function LegalLinks({ current }: { current: string }) {
  const t = useT()
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('nav.more')}>
      {LEGAL_LINKS.filter((l) => l.to !== current).map((l) => (
        <Link key={l.to} to={l.to} className="btn btn-outline">
          {t(l.key)}
        </Link>
      ))}
    </nav>
  )
}
