import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { LangProvider } from './i18n'
import { StoreProvider } from './data/StoreContext'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import MapPage from './pages/MapPage'
import VenuePage from './pages/VenuePage'
import VenueManagePage from './pages/VenueManagePage'
import ReportPage from './pages/ReportPage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import CompanyPage from './pages/CompanyPage'
import ModerationPage from './pages/ModerationPage'
import TransparencyPage from './pages/TransparencyPage'
import NasPage from './pages/NasPage'
import HowItWorksPage from './pages/HowItWorksPage'
import { RulesPage, TermsPage, PrivacyPage, DsaPage } from './pages/LegalPages'
import NotFoundPage from './pages/NotFoundPage'

/**
 * I link profondi da QR o da una pagina pubblicata arrivano come "#locale-v_giglio": li traduciamo nelle rotte
 * interne ("#/locale/v_giglio"). L'id può contenere caratteri non ASCII (es. "v_bar_libertà"), che il browser espone
 * nell'hash grezzi o percent-encoded: accettiamo entrambe le forme e decodifichiamo prima di navigare.
 */
function decodeId(id: string): string {
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}
function DeepLinkNormalizer() {
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    const m = /^\/?(locale|segnala|ditte|moderazione|trasparenza|regole|termini|privacy|nas|profilo|accedi)(?:-([^/]+))?$/.exec(loc.pathname.replace(/^\//, ''))
    if (m && loc.pathname.includes('-') && !loc.pathname.includes('/', 1)) {
      nav(m[2] ? `/${m[1]}/${decodeId(m[2])}` : `/${m[1]}`, { replace: true })
    }
  }, [loc.pathname, nav])
  return null
}

export default function App() {
  return (
    <LangProvider>
      <StoreProvider fallback={<Spinner />}>
        <HashRouter>
          <DeepLinkNormalizer />
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<MapPage />} />
              <Route path="mappa" element={<Navigate to="/" replace />} />
              <Route path="locale/:id" element={<VenuePage />} />
              <Route path="locale/:id/gestisci" element={<VenueManagePage />} />
              <Route path="segnala" element={<ReportPage />} />
              <Route path="segnala/:venueId" element={<ReportPage />} />
              <Route path="accedi" element={<AuthPage />} />
              <Route path="profilo" element={<ProfilePage />} />
              <Route path="ditte" element={<CompanyPage />} />
              <Route path="moderazione" element={<ModerationPage />} />
              <Route path="trasparenza" element={<TransparencyPage />} />
              <Route path="nas" element={<NasPage />} />
              <Route path="come-funziona" element={<HowItWorksPage />} />
              <Route path="regole" element={<RulesPage />} />
              <Route path="termini" element={<TermsPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="dsa" element={<DsaPage />} />
              <Route path="dsa/:reportId" element={<DsaPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </StoreProvider>
    </LangProvider>
  )
}
