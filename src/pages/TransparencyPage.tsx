/**
 * /trasparenza: rapporto di trasparenza letto in tempo reale dallo store (getStats), registro pubblico delle
 * rimozioni (listRemovals), decisioni DSA già prese (listDsaNotices, senza dati personali), punto di contatto DSA,
 * la moderazione in 4 passi e "chi paga cosa". Regola 4: nessun pagamento tocca una segnalazione.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStoreData } from '../data/StoreContext'
import { useLang, useT } from '../i18n'
import { fmtDate } from '../lib/format'
import { ErrorBox, Notice, PageHeader, Section, Spinner } from '../components/ui'
import { StatTiles } from '../components/legal/StatTiles'
import { RemovalsTable } from '../components/legal/RemovalsTable'
import { DsaDecisions } from '../components/legal/DsaDecisions'
import { PricingTable, type PriceRow } from '../components/legal/PricingTable'
import { ContactAddress, LegalLinks } from '../components/legal/LegalDoc'
import { DSA_CONTACT_EMAIL, useLegalVars } from '../components/legal/vars'

export default function TransparencyPage() {
  const t = useT()
  const { lang } = useLang()
  const vars = useLegalVars()

  const stats = useStoreData((s) => s.getStats(), [])
  const removals = useStoreData((s) => s.listRemovals(), [])
  const dsa = useStoreData((s) => s.listDsaNotices(), [])
  // Istante dell'ultima lettura delle statistiche, mostrato sotto i riquadri.
  const updatedAt = useMemo(() => new Date().toISOString(), [stats.data])

  const money: PriceRow[] = [
    { label: t('transparency.money.customers'), value: t('transparency.money.customers_value'), tone: 'ok' },
    { label: t('transparency.money.venues'), value: t('transparency.money.venues_value', vars), note: t('transparency.money.venues_note') },
    { label: t('transparency.money.leads'), value: t('transparency.money.leads_value', vars), note: t('transparency.money.leads_note', vars) },
    { label: t('transparency.money.sponsor'), value: t('transparency.money.sponsor_value', vars) },
    { label: t('transparency.money.removal'), value: t('transparency.money.removal_value'), tone: 'danger' },
  ]

  return (
    <>
      <PageHeader eyebrow={t('transparency.eyebrow')} title={t('transparency.title')} subtitle={t('transparency.subtitle')} />

      <Section>
        {stats.loading && !stats.data ? (
          <Spinner />
        ) : stats.error ? (
          <ErrorBox keys={[stats.error]} />
        ) : (
          stats.data && (
            <>
              <StatTiles stats={stats.data} />
              <p className="text-xs text-fg-muted mt-2 tnum">{t('transparency.updated', { when: fmtDate(updatedAt, lang, true) })}</p>
            </>
          )
        )}
        <div className="mt-3">
          <Notice tone="info">{t('transparency.rules_note')}</Notice>
        </div>
      </Section>

      <Section title={t('transparency.removals_title')}>
        <p className="prose text-sm text-fg-muted mb-2">{t('transparency.removals_intro')}</p>
        {removals.loading && !removals.data ? <Spinner /> : removals.error ? <ErrorBox keys={[removals.error]} /> : <RemovalsTable removals={removals.data ?? []} />}
      </Section>

      <Section title={t('transparency.dsa_title')}>
        <p className="prose text-sm text-fg-muted mb-2">{t('transparency.dsa_intro')}</p>
        {dsa.loading && !dsa.data ? <Spinner /> : dsa.error ? <ErrorBox keys={[dsa.error]} /> : <DsaDecisions notices={dsa.data ?? []} />}
      </Section>

      <Section title={t('transparency.contact_title')}>
        <div className="card card-pad grid gap-3">
          <p className="prose">{t('transparency.contact_body')}</p>
          <ContactAddress address={DSA_CONTACT_EMAIL} />
          <Link to="/dsa" className="btn btn-outline w-fit">
            {t('transparency.contact_form')}
          </Link>
        </div>
      </Section>

      <Section title={t('transparency.moderation_title')}>
        <ol className="grid gap-2">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="card card-pad flex gap-3">
              <span className="w-8 h-8 shrink-0 rounded-full bg-accent text-accent-fg grid place-items-center font-bold tnum" aria-hidden="true">
                {n}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold">{t(`transparency.mod.${n}.title`, vars)}</h3>
                <p className="text-sm text-fg-muted mt-0.5">{t(`transparency.mod.${n}.body`, vars)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t('transparency.money_title')}>
        <PricingTable rows={money} />
        <div className="mt-2">
          <Notice tone="info">
            <strong>{t('transparency.money_statement')}</strong>
          </Notice>
        </div>
      </Section>

      <Section>
        <LegalLinks current="/trasparenza" />
      </Section>
    </>
  )
}
