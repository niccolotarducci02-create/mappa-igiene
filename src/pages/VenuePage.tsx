/**
 * Scheda pubblica del locale: stato e spiegazione, segnalazioni pubblicate con la replica accanto,
 * certificati, pulsanti Segnala / Gestisci, adesivo con QR e come si calcola lo stato.
 */
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { useStoreData } from '../data/StoreContext'
import { EmptyState, ErrorBox, Notice, Section, Spinner } from '../components/ui'
import { fmtDate } from '../lib/format'
import { isPremiumActive } from '../domain/stateMachine'
import { VenueHeader } from '../components/venue/VenueHeader'
import { ReportCard } from '../components/venue/ReportCard'
import { QrSticker } from '../components/venue/QrSticker'
import { StatusSource } from '../components/venue/StatusSource'

export default function VenuePage() {
  const { id = '' } = useParams()
  const t = useT()
  const { lang } = useLang()

  const venueQ = useStoreData((s) => s.getVenue(id), [id])
  // Segnalazioni pubbliche con repliche, certificati, ditte e comunicati NAS in un solo caricamento
  const bundle = useStoreData(
    async (s) => {
      const [reports, certificates, companies, notices] = await Promise.all([
        s.listReportsForVenue(id),
        s.listCertificatesForVenue(id),
        s.listCompanies(),
        s.listNasNotices(),
      ])
      // Una sola query per le repliche del locale, poi raggruppate per segnalazione
      const allReplies = await s.listRepliesForVenue(id)
      const replies = reports.map((r) => allReplies.filter((x) => x.reportId === r.id))
      return { reports, replies, certificates, companies, notices }
    },
    [id],
  )
  const nowIso = useMemo(() => new Date().toISOString(), [bundle.data])

  if (venueQ.loading && !venueQ.data) return <Spinner />
  if (venueQ.error) {
    return (
      <div className="gutter py-6">
        <ErrorBox keys={[venueQ.error]} />
      </div>
    )
  }
  const venue = venueQ.data
  if (!venue) {
    return (
      <div className="gutter py-8">
        <EmptyState
          title={t('venue.not_found')}
          body={t('venue.not_found_body')}
          action={
            <Link className="btn btn-primary" to="/">
              {t('venue.back_to_map')}
            </Link>
          }
        />
      </div>
    )
  }

  const data = bundle.data
  const count = data?.reports.length ?? 0
  const premium = isPremiumActive(venue, nowIso)
  // Premium (20 €/mese) compra solo l'avviso immediato e i certificati in evidenza: questa scheda
  // mostra i certificati verificati dalla moderazione e non tocca le segnalazioni (regola 4).
  const verifiedCerts = premium && data ? data.certificates.filter((c) => c.verifiedAt) : []
  const companyName = (cid: string) => data?.companies.find((c) => c.id === cid)?.name ?? t('venue.company_unknown')

  return (
    <>
      <VenueHeader venue={venue} premium={premium} />

      <Section>
        <p className="text-sm text-fg-muted max-w-[65ch]">{t(`venue.status_explain.${venue.status}`)}</p>
      </Section>

      {verifiedCerts.length > 0 && (
        <Section title={t('venue.certificates_title')}>
          <Notice tone="ok" testId="venue-certificates">
            <p className="text-fg-muted mb-2">{t('venue.certificates_intro')}</p>
            <ul className="grid gap-2">
              {verifiedCerts.map((c) => (
                <li key={c.id} className="grid gap-0.5" data-certificate-id={c.id}>
                  <strong>{c.interventionType}</strong>
                  <span className="text-xs tnum">
                    {t('venue.certificate_meta', {
                      company: companyName(c.companyId),
                      issued: fmtDate(c.issuedAt, lang),
                      verified: fmtDate(c.verifiedAt, lang),
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted mt-2">{t('venue.certificates_disclaimer')}</p>
          </Notice>
        </Section>
      )}

      <Section
        title={t('venue.reports_title')}
        aside={data ? <span className="text-sm text-fg-muted tnum">{count === 1 ? t('venue.one_report') : t('venue.n_reports', { n: count })}</span> : undefined}
      >
        {bundle.error && <ErrorBox keys={[bundle.error]} />}
        {bundle.loading && !data && <Spinner />}
        {data &&
          (data.reports.length === 0 ? (
            <EmptyState title={t('venue.reports_empty')} body={t('venue.reports_empty_body')} />
          ) : (
            <ul className="grid gap-3">
              {data.reports.map((r, i) => (
                <li key={r.id}>
                  <ReportCard
                    report={r}
                    replies={data.replies[i] ?? []}
                    certificates={data.certificates.filter((c) => c.reportId === r.id)}
                    companies={data.companies}
                    notice={r.nasNoticeId ? data.notices.find((n) => n.id === r.nasNoticeId) : undefined}
                    nowIso={nowIso}
                  />
                </li>
              ))}
            </ul>
          ))}
      </Section>

      <Section>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link className="btn btn-primary" to={`/segnala/${venue.id}`}>
            {t('venue.cta_report')}
          </Link>
          <Link className="btn btn-outline" to={`/locale/${venue.id}/gestisci`}>
            {t('venue.cta_manage')}
          </Link>
        </div>
      </Section>

      <Section title={t('venue.qr_title')}>
        <QrSticker venueId={venue.id} venueName={venue.name} />
      </Section>

      <Section title={t('venue.source_title')}>
        <StatusSource />
      </Section>
    </>
  )
}
