/**
 * Console di moderazione: coda con SLA 24 h e sfocatura dei volti, certificati da verificare, rivendicazioni dei locali
 * da approvare, richieste DSA (48 h), rimozioni con registro pubblico, blocco utenti, import dei comunicati NAS e registro attività.
 * La pagina tiene solo le schede; ogni scheda è un componente in src/components/moderation/.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Profile } from '../domain/types'
import { useSession } from '../data/StoreContext'
import { useT } from '../i18n'
import { ErrorBox, PageHeader, RequireAuth, Section, Spinner } from '../components/ui'
import { useModerationData } from '../components/moderation/useModerationData'
import { TabBar, type TabDef } from '../components/moderation/TabBar'
import { QueueTab } from '../components/moderation/QueueTab'
import { CertificatesTab } from '../components/moderation/CertificatesTab'
import { ClaimsTab } from '../components/moderation/ClaimsTab'
import { DsaTab } from '../components/moderation/DsaTab'
import { RemovalsTab } from '../components/moderation/RemovalsTab'
import { UsersTab } from '../components/moderation/UsersTab'
import { NasTab } from '../components/moderation/NasTab'
import { AuditTab } from '../components/moderation/AuditTab'

type TabId = 'queue' | 'certificates' | 'claims' | 'dsa' | 'removals' | 'users' | 'nas' | 'audit'
const TAB_IDS: TabId[] = ['queue', 'certificates', 'claims', 'dsa', 'removals', 'users', 'nas', 'audit']

export default function ModerationPage() {
  return (
    <RequireAuth roles={['moderatore']}>
      <ModerationInner />
    </RequireAuth>
  )
}

function ModerationInner() {
  const { profile } = useSession()
  if (!profile) return null
  return <ModerationConsole key={profile.id} profile={profile} />
}

function ModerationConsole({ profile }: { profile: Profile }) {
  const t = useT()
  const [tab, setTab] = useState<TabId>('queue')
  const bundle = useModerationData()
  const data = bundle.data
  // "adesso" fissato a ogni ricarica dei dati: SLA e tempi relativi coerenti tra le schede
  const nowIso = useMemo(() => new Date().toISOString(), [data])

  const counts = useMemo<Record<TabId, number | null>>(
    () => ({
      queue: data ? data.queue.length : null,
      certificates: data ? data.certificates.length : null,
      claims: data ? data.claims.filter((c) => c.status === 'in_verifica').length : null,
      dsa: data ? data.dsa.filter((n) => !n.decidedAt).length : null,
      // il badge conta le rimozioni nel registro pubblico, non le segnalazioni candidabili alla rimozione
      removals: data ? data.removals.length : null,
      users: data ? new Set(data.reports.map((r) => r.userId)).size : null,
      nas: data ? data.nasNotices.filter((n) => !n.linkedReportId).length : null,
      audit: data ? data.audit.length : null,
    }),
    [data],
  )
  const tabs: TabDef<TabId>[] = TAB_IDS.map((id) => ({ id, label: t(`mod.tab.${id}`), count: counts[id] }))

  // la barra scorre in orizzontale: la scheda attiva deve restare in vista (anche dopo frecce/tap ai bordi)
  useEffect(() => {
    const el = document.getElementById(`tab-${tab}`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [tab])

  return (
    <>
      <PageHeader eyebrow={t('mod.eyebrow')} title={t('mod.title')} subtitle={t('mod.subtitle')} />
      <div className="gutter">
        <TabBar tabs={tabs} selected={tab} onSelect={setTab} label={t('mod.tabs_label')} />
      </div>
      <Section>
        {bundle.error && <ErrorBox keys={[bundle.error]} />}
        {bundle.loading && !data && <Spinner />}
        {data && (
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'queue' && <QueueTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'certificates' && <CertificatesTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'claims' && <ClaimsTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'dsa' && <DsaTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'removals' && <RemovalsTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'users' && <UsersTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'nas' && <NasTab data={data} profile={profile} nowIso={nowIso} />}
            {tab === 'audit' && <AuditTab data={data} profile={profile} nowIso={nowIso} />}
          </div>
        )}
      </Section>
    </>
  )
}
