/**
 * Carica in un solo passaggio tutto ciò che serve alla console di moderazione.
 * useStoreData ricarica da solo a ogni cambiamento dello store, quindi dopo una scrittura non serve altro.
 */
import type { AuditEntry, Certificate, Company, DsaNotice, NasNotice, Profile, Removal, Reply, Report, Venue, VenueClaim } from '../../domain/types'
import { useStoreData, type StoreDataState } from '../../data/StoreContext'

export interface ModerationBundle {
  /** Segnalazioni in verifica, dalla più vecchia */
  queue: Report[]
  /** Quante segnalazioni ha inviato in tutto ciascun autore presente in coda */
  queueReporterCounts: Record<string, number>
  reports: Report[]
  venues: Venue[]
  venueById: Map<string, Venue>
  certificates: Certificate[]
  /** Richieste di gestione dei locali (tutte: in verifica e decise) */
  claims: VenueClaim[]
  companies: Company[]
  dsa: DsaNotice[]
  nasNotices: NasNotice[]
  removals: Removal[]
  /** Profili demo: solo in modalità demo; in produzione è vuoto (serve solo ad arricchire la scheda utenti) */
  personas: Profile[]
  audit: AuditEntry[]
  /** Repliche dei locali alle segnalazioni pubblicate/risolte o contestate (DSA, certificati): mostrate accanto alla segnalazione */
  repliesByReport: Map<string, Reply[]>
}

export function useModerationData(): StoreDataState<ModerationBundle> {
  return useStoreData(async (s) => {
    const [queue, reports, venues, certificates, claims, companies, dsa, nasNotices, removals, personas, audit] = await Promise.all([
      s.listModerationQueue(),
      s.listAllReports(),
      s.listVenues(),
      s.listPendingCertificates(),
      s.listVenueClaims(),
      s.listCompanies(),
      s.listDsaNotices(),
      s.listNasNotices(),
      s.listRemovals(),
      // API solo demo: lo store di produzione la rifiuta, e la console deve caricarsi lo stesso
      s.listDemoPersonas().catch(() => [] as Profile[]),
      s.listAudit(100),
    ])
    const userIds = [...new Set(queue.map((r) => r.userId))]
    const perUser = await Promise.all(userIds.map((id) => s.listReportsByUser(id)))
    const queueReporterCounts: Record<string, number> = {}
    userIds.forEach((id, i) => {
      queueReporterCounts[id] = perUser[i].length
    })

    // Repliche: una chiamata per locale che ha segnalazioni con diritto di replica (pubblicate/risolte) o contestate
    const reportById = new Map(reports.map((r) => [r.id, r]))
    const contested = new Set<string>()
    for (const r of reports) if (r.state === 'pubblicata' || r.state === 'risolta') contested.add(r.id)
    for (const n of dsa) contested.add(n.reportId)
    for (const c of certificates) contested.add(c.reportId)
    const venueIds = [...new Set([...contested].map((id) => reportById.get(id)?.venueId).filter((v): v is string => !!v))]
    const perVenue = await Promise.all(venueIds.map((id) => s.listRepliesForVenue(id)))
    const repliesByReport = new Map<string, Reply[]>()
    for (const reply of perVenue.flat()) {
      const list = repliesByReport.get(reply.reportId) ?? []
      list.push(reply)
      repliesByReport.set(reply.reportId, list)
    }

    return {
      queue,
      queueReporterCounts,
      reports,
      venues,
      venueById: new Map(venues.map((v) => [v.id, v])),
      certificates,
      claims,
      companies,
      dsa,
      nasNotices,
      removals,
      personas,
      audit,
      repliesByReport,
    }
  }, [])
}
