/**
 * /ditte, due facce: pubblica (come funziona, tariffe, regola 4, elenco ditte, diventa partner)
 * e area riservata della ditta partner (contatti, sponsorizzazione, dati). L'amministrazione può
 * scegliere una ditta e vedere la pagina come la vede lei.
 */
import { useMemo, useState } from 'react'
import { useSession, useStoreData } from '../data/StoreContext'
import { useT } from '../i18n'
import { ErrorBox, Spinner } from '../components/ui'
import { CompanyPublic } from '../components/company/CompanyPublic'
import { CompanyDashboard } from '../components/company/CompanyDashboard'

export default function CompanyPage() {
  const t = useT()
  const { profile } = useSession()
  const [adminPick, setAdminPick] = useState('')
  const companiesQ = useStoreData((s) => s.listCompanies(), [])
  const nowIso = useMemo(() => new Date().toISOString(), [companiesQ.data])

  const isAdmin = profile?.role === 'admin'
  const companyId = profile?.role === 'ditta' ? profile.companyId : isAdmin && adminPick ? adminPick : undefined

  return (
    <>
      {isAdmin && (
        <div className="gutter pt-4">
          <div className="field">
            <label htmlFor="admin-company">{t('company.admin_pick')}</label>
            <select id="admin-company" className="select" value={adminPick} onChange={(e) => setAdminPick(e.target.value)}>
              <option value="">{t('company.admin_pick_none')}</option>
              {companiesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {companyId ? (
        <CompanyDashboard companyId={companyId} />
      ) : companiesQ.loading && !companiesQ.data ? (
        <Spinner />
      ) : companiesQ.error ? (
        <div className="gutter py-6">
          <ErrorBox keys={[companiesQ.error]} />
        </div>
      ) : (
        <CompanyPublic companies={companiesQ.data ?? []} nowIso={nowIso} />
      )}
    </>
  )
}
