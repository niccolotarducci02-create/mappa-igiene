/**
 * Pagina pubblica dei comunicati NAS: che cosa sono, come l'app li collega ai locali (stessa replica di 7 giorni),
 * l'avvertenza che nella demo sono esempi inventati, e l'elenco dei comunicati importati, collegati o da collegare.
 */
import { Link } from 'react-router-dom'
import { useSession, useStoreData } from '../data/StoreContext'
import { useLang, useT } from '../i18n'
import { fmtDate } from '../lib/format'
import { EmptyState, ErrorBox, Notice, PageHeader, Section, Spinner } from '../components/ui'

export default function NasPage() {
  const t = useT()
  const { lang } = useLang()
  const { profile } = useSession()
  const isModerator = profile?.role === 'moderatore' || profile?.role === 'admin'

  const bundle = useStoreData(async (s) => {
    const [notices, venues] = await Promise.all([s.listNasNotices(), s.listVenues()])
    return { notices, venueById: new Map(venues.map((v) => [v.id, v])) }
  }, [])
  const data = bundle.data

  return (
    <>
      <PageHeader
        eyebrow={t('nas.eyebrow')}
        title={t('nas.title')}
        actions={
          isModerator ? (
            <Link to="/moderazione" className="btn btn-outline">
              {t('nas.moderation_link')} ›
            </Link>
          ) : undefined
        }
      />

      <Section>
        <div className="prose text-sm grid gap-3">
          <p>{t('nas.intro_1')}</p>
          <p>{t('nas.intro_2')}</p>
          <Notice tone="warn">{t('nas.disclaimer')}</Notice>
        </div>
      </Section>

      <Section title={t('nas.list_title')} aside={data ? <span className="text-sm text-fg-muted tnum">{data.notices.length}</span> : undefined}>
        {bundle.error && <ErrorBox keys={[bundle.error]} />}
        {bundle.loading && !data && <Spinner />}
        {data &&
          (data.notices.length === 0 ? (
            <EmptyState title={t('nas.empty')} body={t('nas.empty_body')} />
          ) : (
            <ul className="grid gap-3">
              {data.notices.map((n) => {
                const venue = n.venueId ? data.venueById.get(n.venueId) : undefined
                const linked = !!n.linkedReportId && !!venue
                return (
                  <li key={n.id} className="card card-pad grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-fg-muted tnum">{t('nas.published_on', { date: fmtDate(n.publishedAt, lang) })}</span>
                      {linked ? <span className="chip chip-neutral bg-accent-soft text-fg">{t('nas.status.linked')}</span> : <span className="chip chip-in_verifica">{t('nas.status.unlinked')}</span>}
                    </div>
                    <h3 className="font-semibold leading-tight break-words">{n.venueNameRaw}</h3>
                    <div className="text-sm text-fg-muted">{n.addressRaw || t('nas.address_unknown')}</div>
                    <p className="text-sm break-words">{n.summary}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all inline-flex items-center min-h-[44px]">
                        {t('nas.source_link')}
                      </a>
                      {linked && venue && (
                        <Link to={`/locale/${venue.id}`} className="underline font-semibold inline-flex items-center min-h-[44px]">
                          {t('nas.open_venue', { venue: venue.name })} ›
                        </Link>
                      )}
                    </div>
                    <div className="text-xs text-fg-muted tnum">{t('nas.imported_on', { date: fmtDate(n.importedAt, lang) })}</div>
                  </li>
                )
              })}
            </ul>
          ))}
      </Section>
    </>
  )
}
