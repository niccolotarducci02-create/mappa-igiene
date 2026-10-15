/** Scheda "Certificati": certificati di intervento caricati dai locali, da verificare (→ risolta) o rifiutare con nota. */
import { useState } from 'react'
import type { Certificate } from '../../domain/types'
import { useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { EmptyState, ErrorBox, KeyValue } from '../ui'
import { ReportSummary } from './ReportSummary'
import type { TabProps } from './types'
import { useAsyncAction } from './useAsyncAction'

export function CertificatesTab({ data, profile }: TabProps) {
  const t = useT()
  if (!data.certificates.length) return <EmptyState title={t('mod.cert.empty')} body={t('mod.cert.empty_body')} />
  return (
    <div className="grid gap-3">
      <p className="text-sm text-fg-muted">{t('mod.cert.intro')}</p>
      <ul className="grid gap-4">
        {data.certificates.map((c) => (
          <CertificateCard key={c.id} cert={c} data={data} moderatorId={profile.id} />
        ))}
      </ul>
    </div>
  )
}

function CertificateCard({ cert, data, moderatorId }: { cert: Certificate; data: TabProps['data']; moderatorId: string }) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const { run, busy, error, clearError } = useAsyncAction()

  const report = data.reports.find((r) => r.id === cert.reportId)
  const venue = data.venueById.get(cert.venueId)
  const company = data.companies.find((c) => c.id === cert.companyId)
  const isImage = cert.file.startsWith('data:image/')
  const noteId = `cert-note-${cert.id}`

  const verify = () => run(() => store.verifyCertificate(cert.id, moderatorId, true))
  const reject = () => run(() => store.verifyCertificate(cert.id, moderatorId, false, note.trim()))

  return (
    <li className="card card-pad grid gap-3" data-testid="cert-card" data-certificate-id={cert.id}>
      {report ? <ReportSummary report={report} venue={venue} replies={data.repliesByReport.get(report.id) ?? []} /> : <p className="text-sm text-fg-muted">{t('mod.cert.unknown_report')}</p>}

      <KeyValue
        items={[
          [t('mod.cert.company'), company?.name ?? t('mod.cert.unknown_company')],
          [t('mod.cert.intervention'), cert.interventionType],
          [t('mod.cert.issued'), <span className="tnum">{fmtDate(cert.issuedAt, lang, true)}</span>],
        ]}
      />

      {isImage ? (
        <img src={cert.file} alt={t('mod.cert.preview_alt')} className="w-full max-h-[70vw] object-contain rounded-[var(--radius)] bg-muted border border-line" loading="lazy" />
      ) : (
        <div className="rounded-[var(--radius)] border border-line bg-muted p-4 text-center">
          <div className="font-semibold">{t('mod.cert.pdf')}</div>
          <div className="text-xs text-fg-muted mt-1">{t('mod.cert.pdf_hint')}</div>
        </div>
      )}

      {!rejecting ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-ok" disabled={busy} onClick={verify}>
            {t('mod.cert.verify')}
          </button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setRejecting(true)}>
            {t('mod.cert.reject')}
          </button>
        </div>
      ) : (
        <div className="grid gap-2 border-t border-line pt-3">
          <div className="field">
            <label htmlFor={noteId}>{t('mod.cert.reject_note')}</label>
            <textarea id={noteId} className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mod.cert.reject_note_placeholder')} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-danger" disabled={!note.trim() || busy} onClick={reject}>
              {t('mod.cert.reject_confirm')}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <ErrorBox keys={error} onClose={clearError} />
    </li>
  )
}
