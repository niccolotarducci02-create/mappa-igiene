/**
 * Gestione del locale da parte del titolare (/locale/:id/gestisci).
 * Non titolare -> richiesta di gestione (rivendicazione), che resta "in verifica" finché la moderazione non la approva;
 * richiesta in verifica -> avviso di attesa; rivendicato da altri -> avviso. Titolare -> cruscotto:
 * segnalazioni con replica, preventivi, certificati; Premium; rimando all'adesivo QR della scheda pubblica.
 */
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Certificate, Company, Lead, Quote, Reply, Report, Venue } from '../domain/types'
import { useLang, useT } from '../i18n'
import { useSession, useStoreData } from '../data/StoreContext'
import { EmptyState, ErrorBox, PageHeader, RequireAuth, Section, Spinner, StatusChip } from '../components/ui'
import { fmtDate } from '../lib/format'
import { ClaimVenueForm, useClaimState } from '../components/manage/ClaimVenueForm'
import { OwnerReportCard } from '../components/manage/OwnerReportCard'
import { PremiumCard } from '../components/manage/PremiumCard'
import { isPremiumActive } from '../domain/stateMachine'

interface Bundle {
  reports: Report[]
  replies: Reply[][]
  leads: Array<Lead | null>
  quotes: Quote[][]
  certificates: Certificate[]
  companies: Company[]
}

export default function VenueManagePage() {
  return (
    <RequireAuth>
      <ManageInner />
    </RequireAuth>
  )
}

function ManageInner() {
  const { id = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const { profile } = useSession()

  const venueQ = useStoreData((s) => s.getVenue(id), [id])
  const venue = venueQ.data
  const isOwner = !!profile && !!venue && (profile.venueIds?.includes(id) === true || venue.claimedBy === profile.id)

  // Tutto il cruscotto in un solo caricamento; si ricarica da solo a ogni scrittura nello store.
  const bundle = useStoreData<Bundle | null>(
    async (s) => {
      if (!isOwner) return null
      const [reports, companies, certificates] = await Promise.all([s.listReportsForVenue(id), s.listCompanies(), s.listCertificatesForVenue(id)])
      const [replies, leads] = await Promise.all([
        Promise.all(reports.map((r) => s.listReplies(r.id))),
        Promise.all(reports.map((r) => s.getLeadForReport(r.id))),
      ])
      const quotes = await Promise.all(leads.map((l) => (l ? s.listQuotesForLead(l.id) : Promise.resolve([] as Quote[]))))
      return { reports, replies, leads, quotes, certificates, companies }
    },
    [id, isOwner],
  )
  const nowIso = useMemo(() => new Date().toISOString(), [bundle.data, venue])

  if (venueQ.loading && !venue) return <Spinner />
  if (venueQ.error) {
    return (
      <div className="gutter py-6">
        <ErrorBox keys={[venueQ.error]} />
      </div>
    )
  }
  if (!venue || !profile) {
    return (
      <div className="gutter py-8">
        <EmptyState
          title={t('manage.not_found')}
          body={t('manage.not_found_body')}
          action={
            <Link className="btn btn-primary" to="/">
              {t('manage.back_map')}
            </Link>
          }
        />
      </div>
    )
  }

  if (!isOwner) return <NotOwner venue={venue} userId={profile.id} />

  const data = bundle.data
  const premium = isPremiumActive(venue, nowIso)
  const count = data?.reports.length ?? 0

  return (
    <>
      <PageHeader
        eyebrow={t('manage.eyebrow')}
        title={venue.name}
        subtitle={`${t(`venue_type.${venue.type}`)} · ${venue.address}`}
        actions={
          <Link className="btn btn-outline" to={`/locale/${venue.id}`}>
            {t('manage.back_public')}
          </Link>
        }
      />

      <Section>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusChip status={venue.status} />
          <span className={`chip ${premium ? 'chip-risolta' : 'chip-nessuna'}`}>{t('manage.premium_label')}</span>
          <span className="text-fg-muted tnum">{premium ? t('manage.premium_active', { date: fmtDate(venue.premiumUntil, lang) }) : t('manage.premium_inactive')}</span>
        </div>
      </Section>

      <Section title={t('manage.reports_title')} aside={data ? <span className="text-sm text-fg-muted tnum">{count}</span> : undefined}>
        {bundle.error && <ErrorBox keys={[bundle.error]} />}
        {bundle.loading && !data && <Spinner />}
        {data &&
          (data.reports.length === 0 ? (
            // Lo stato pubblico "in verifica" deriva da una segnalazione non ancora pubblicata (la lista è quella pubblica):
            // spieghiamo il perché senza mostrare il contenuto.
            venue.status === 'in_verifica' ? (
              <EmptyState title={t('manage.reports_pending')} body={t('manage.reports_pending_body')} />
            ) : (
              <EmptyState title={t('manage.reports_empty')} body={t('manage.reports_empty_body')} />
            )
          ) : (
            <ul className="grid gap-3">
              {data.reports.map((r, i) => (
                <li key={r.id}>
                  <OwnerReportCard
                    report={r}
                    replies={data.replies[i] ?? []}
                    lead={data.leads[i] ?? null}
                    quotes={data.quotes[i] ?? []}
                    certificates={data.certificates.filter((c) => c.reportId === r.id)}
                    companies={data.companies}
                    ownerId={profile.id}
                    nowIso={nowIso}
                  />
                </li>
              ))}
            </ul>
          ))}
      </Section>

      <Section>
        <PremiumCard venue={venue} nowIso={nowIso} />
      </Section>

      <Section title={t('manage.qr_title')}>
        <div className="card card-pad grid gap-3">
          <p className="text-sm text-fg-muted">{t('manage.qr_body')}</p>
          <Link className="btn btn-outline" to={`/locale/${venue.id}`}>
            {t('manage.qr_link')}
          </Link>
        </div>
      </Section>
    </>
  )
}

/**
 * Non titolare: richiesta in verifica -> stato di attesa (prevale anche su "altro titolare"); locale di un altro
 * titolare -> avviso; locale libero -> modulo di rivendicazione. Il modulo (ClaimVenueForm) mostra da sé l'esito
 * dell'invio e lo stato di attesa, quindi resta montato anche quando la richiesta è appena partita.
 */
function NotOwner({ venue, userId }: { venue: Venue; userId: string }) {
  const t = useT()
  const claims = useClaimState(venue.id, userId)
  const pending = claims.data?.pending ?? null
  return (
    <>
      <PageHeader eyebrow={t('manage.eyebrow')} title={venue.name} subtitle={`${t(`venue_type.${venue.type}`)} · ${venue.address}`} />
      <Section>
        {claims.loading && !claims.data ? (
          <Spinner />
        ) : pending || !venue.claimedBy ? (
          <ClaimVenueForm key="claim" venue={venue} userId={userId} />
        ) : (
          <EmptyState
            title={t('manage.other_owner_title')}
            body={t('manage.other_owner_body')}
            action={
              <Link className="btn btn-outline" to={`/locale/${venue.id}`}>
                {t('manage.back_public')}
              </Link>
            }
          />
        )}
      </Section>
    </>
  )
}
