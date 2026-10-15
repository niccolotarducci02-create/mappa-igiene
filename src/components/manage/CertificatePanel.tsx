/**
 * Certificati di intervento di una segnalazione: quelli già caricati (in verifica, verificati, non accettati)
 * e, per le segnalazioni pubblicate, il modulo di caricamento (PDF o immagine -> data URL, massimo 1,5 MB).
 * Una volta verificato dalla moderazione, la segnalazione passa a "risolta".
 */
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Certificate, Company, Report } from '../../domain/types'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate } from '../../lib/format'
import { ErrorBox, Notice } from '../ui'

const MAX_BYTES = Math.round(1.5 * 1024 * 1024)

interface Props {
  report: Report
  certificates: Certificate[]
  companies: Company[]
  /** Ditta preselezionata: quella del preventivo accettato, se c'è. */
  defaultCompanyId?: string
  uploaderId: string
}

export function CertificatePanel({ report, certificates, companies, defaultCompanyId, uploaderId }: Props) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? '')
  const [type, setType] = useState('')
  const [fileData, setFileData] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileErr, setFileErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)
  /** Id del certificato appena caricato: l'avviso resta finché la moderazione non lo verifica o lo rifiuta. */
  const [uploadedId, setUploadedId] = useState<string | null>(null)

  // Se dopo il montaggio viene accettato un preventivo, la ditta preselezionata segue quella del preventivo.
  useEffect(() => {
    if (defaultCompanyId) setCompanyId(defaultCompanyId)
  }, [defaultCompanyId])

  const pending = certificates.some((c) => !c.verifiedAt && !c.rejectedAt)
  const uploaded = uploadedId ? certificates.find((c) => c.id === uploadedId) : undefined
  const showUploaded = uploadedId !== null && (!uploaded || (!uploaded.verifiedAt && !uploaded.rejectedAt))
  const canUpload = report.state === 'pubblicata' && !pending
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? t('manage.company_unknown')

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFileErr(null)
    setFileData(null)
    setFileName('')
    if (!f) return
    if (!(f.type === 'application/pdf' || f.type.startsWith('image/'))) {
      setFileErr('manage.cert_file_invalid')
      return
    }
    if (f.size > MAX_BYTES) {
      setFileErr('manage.cert_file_too_big')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setFileData(String(reader.result))
      setFileName(f.name)
    }
    reader.onerror = () => setFileErr('manage.cert_file_read_error')
    reader.readAsDataURL(f)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fileData) {
      setFileErr('manage.cert_file_required')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const cert = await store.uploadCertificate(report.id, companyId, fileData, type, uploaderId)
      setType('')
      setFileData(null)
      setFileName('')
      setUploadedId(cert.id)
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-bold">{t('manage.cert_title')}</h4>

      {certificates.map((c) => {
        const tone = c.verifiedAt ? 'ok' : c.rejectedAt ? 'danger' : 'info'
        const title = c.verifiedAt
          ? t('manage.cert_verified', { date: fmtDate(c.verifiedAt, lang) })
          : c.rejectedAt
            ? t('manage.cert_rejected', { date: fmtDate(c.rejectedAt, lang) })
            : t('manage.cert_pending')
        return (
          <Notice key={c.id} tone={tone}>
            <strong className="block">{title}</strong>
            <span className="block mt-0.5">{t('manage.cert_line', { intervention: c.interventionType, company: companyName(c.companyId), date: fmtDate(c.issuedAt, lang) })}</span>
            {c.rejectionNote && <span className="block mt-0.5">{c.rejectionNote}</span>}
            {c.file.startsWith('data:image') && <img src={c.file} alt={t('manage.cert_image_alt')} className="mt-2 max-h-40 rounded-[var(--radius)] bg-muted" loading="lazy" />}
            {c.file && !c.file.startsWith('data:image') && (
              <a href={c.file} download="certificato" className="inline-flex items-center min-h-[44px] underline font-semibold">
                {t('manage.cert_download')}
              </a>
            )}
          </Notice>
        )
      })}

      {showUploaded && (
        <Notice tone="ok" live>
          {t('manage.cert_uploaded')}
        </Notice>
      )}

      {canUpload && (
        <form className="grid gap-3" onSubmit={submit}>
          <p className="text-sm text-fg-muted">{t('manage.cert_intro')}</p>

          <div className="field">
            <label htmlFor={`cert-company-${report.id}`}>{t('manage.cert_company')}</label>
            <select id={`cert-company-${report.id}`} className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`cert-type-${report.id}`}>{t('manage.cert_type')}</label>
            <input
              id={`cert-type-${report.id}`}
              className="input"
              type="text"
              maxLength={120}
              placeholder={t('manage.cert_type_placeholder')}
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor={`cert-file-${report.id}`}>{t('manage.cert_file')}</label>
            <input id={`cert-file-${report.id}`} className="input" type="file" accept="application/pdf,image/*" onChange={onFile} />
            {fileName && <p className="text-xs text-fg-muted break-all">{t('manage.cert_file_ready', { name: fileName })}</p>}
          </div>

          {fileErr && <ErrorBox keys={[fileErr]} onClose={() => setFileErr(null)} />}
          {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}

          <button type="submit" className="btn btn-primary" disabled={busy || !fileData || !type.trim() || !companyId}>
            {busy ? t('manage.cert_busy') : t('manage.cert_submit')}
          </button>
        </form>
      )}
    </div>
  )
}
