/**
 * Pagine legali: le 4 regole (/regole), Termini d'uso (/termini), Informativa privacy (/privacy)
 * e modulo DSA (/dsa, /dsa/:reportId). I testi vivono in src/i18n/modules/legal.ts; i numeri del piano
 * arrivano da src/domain/rules.ts tramite useLegalVars, mai scritti a mano nei testi.
 */
import { Link, useParams } from 'react-router-dom'
import { FOUR_RULES } from '../domain/rules'
import { useLang, useT } from '../i18n'
import { Notice, PageHeader, Section } from '../components/ui'
import { ContactAddress, LegalDocument, LegalLinks } from '../components/legal/LegalDoc'
import { DsaForm } from '../components/legal/DsaForm'
import { DSA_CONTACT_EMAIL, useLegalVars } from '../components/legal/vars'

/* ------------------------------------------------------------------ */
/* /regole                                                             */
/* ------------------------------------------------------------------ */

export function RulesPage() {
  const t = useT()
  const { lang } = useLang()
  const vars = useLegalVars()

  return (
    <>
      <PageHeader eyebrow={t('rules.eyebrow')} title={t('rules.title')} subtitle={t('rules.subtitle')} />

      <Section>
        <ol className="grid gap-3">
          {FOUR_RULES.map((rule) => (
            <li key={rule.id} className="card card-pad">
              <div className="flex gap-3">
                <span className="w-9 h-9 shrink-0 rounded-full bg-accent text-accent-fg grid place-items-center font-bold text-lg tnum" aria-hidden="true">
                  {rule.id}
                </span>
                <div className="min-w-0">
                  <div className="eyebrow">{t('rules.rule_label', { n: rule.id })}</div>
                  <p className="font-semibold leading-snug mt-0.5">{rule[lang]}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-line">
                <h2 className="text-sm font-bold text-fg-muted mb-1">{t('rules.how_label')}</h2>
                <p className="prose text-sm">{t(`rules.how.${rule.id}`, vars)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <Notice tone="info">
          <p>{t('rules.footer')}</p>
          <Link to="/termini" className="underline font-semibold inline-flex items-center min-h-[44px]">
            {t('legal.see_terms')} ›
          </Link>
        </Notice>
      </Section>

      <Section>
        <LegalLinks current="/regole" />
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* /termini                                                            */
/* ------------------------------------------------------------------ */

const TERMS_SECTIONS = 10

export function TermsPage() {
  const t = useT()
  const vars = useLegalVars()
  return (
    <>
      <PageHeader eyebrow={t('terms.eyebrow')} title={t('terms.title')} subtitle={t('terms.subtitle')} />
      <Section>
        <LegalDocument prefix="terms" sections={TERMS_SECTIONS} vars={vars} />
      </Section>
      <Section>
        <LegalLinks current="/termini" />
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* /privacy                                                            */
/* ------------------------------------------------------------------ */

const PRIVACY_SECTIONS = 10

export function PrivacyPage() {
  const t = useT()
  const vars = useLegalVars()
  return (
    <>
      <PageHeader eyebrow={t('privacy.eyebrow')} title={t('privacy.title')} subtitle={t('privacy.subtitle')} />
      <Section>
        <LegalDocument prefix="privacy" sections={PRIVACY_SECTIONS} vars={vars} />
      </Section>
      <Section>
        <LegalLinks current="/privacy" />
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* /dsa e /dsa/:reportId                                               */
/* ------------------------------------------------------------------ */

export function DsaPage() {
  const t = useT()
  const vars = useLegalVars()
  const { reportId } = useParams<{ reportId: string }>()

  return (
    <>
      <PageHeader eyebrow={t('dsa.eyebrow')} title={t('dsa.title')} subtitle={t('dsa.subtitle')} />

      <Section>
        <div className="grid gap-3">
          <div className="card card-pad">
            <h2 className="font-bold">{t('dsa.who_title')}</h2>
            <p className="prose mt-1">{t('dsa.who_body')}</p>
          </div>
          <div className="card card-pad">
            <h2 className="font-bold mb-2">{t('dsa.what_title')}</h2>
            <ol className="prose list-decimal">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>{t(`dsa.what.${n}`, vars)}</li>
              ))}
            </ol>
          </div>
          <Notice tone="info">
            <strong className="block">{t('dsa.specific_title')}</strong>
            <span className="block mt-0.5">{t('dsa.specific_body')}</span>
          </Notice>
        </div>
      </Section>

      <Section title={t('dsa.form_title')}>
        <div className="card card-pad">
          {/* key: cambiando il parametro della rotta il modulo riparte precompilato */}
          <DsaForm key={reportId ?? ''} initialReportId={reportId} />
        </div>
      </Section>

      <Section title={t('dsa.contact_title')}>
        <div className="card card-pad grid gap-2">
          <p className="prose">{t('dsa.contact_body')}</p>
          <ContactAddress address={DSA_CONTACT_EMAIL} />
          <p className="text-xs text-fg-muted">{t('dsa.contact_placeholder_note')}</p>
        </div>
      </Section>

      <Section>
        <LegalLinks current="/dsa" />
      </Section>
    </>
  )
}
