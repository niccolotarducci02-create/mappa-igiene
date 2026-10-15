# Nitido — architettura e convenzioni

App web (PWA) per Firenze che mostra lo stato igienico di bar e ristoranti a partire da segnalazioni
verificate con foto e dai comunicati pubblici dei NAS. I locali replicano in app e dimostrano la
risoluzione con un certificato. Le ditte di disinfestazione e pulizie pagano i contatti.

Fonte dei requisiti: il documento "Mappa dell'Igiene – Piano Firenze" (stesso autore). Le quattro
regole non negoziabili sono in `src/domain/rules.ts` (`FOUR_RULES`) e vanno rispettate dal codice,
non solo citate nei testi.

## Stack

| Livello | Scelta | Perché |
| --- | --- | --- |
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind 4 | PWA installabile su iPhone/Android senza passare dagli store per la beta; stessa base avvolgibile con Capacitor per gli store. |
| Mappa | Leaflet 1.9 + tile OpenStreetMap | Leggero, gratuito, funziona anche offline-first con cache del browser. |
| Routing | react-router 7 con `HashRouter` | Funziona ovunque senza configurare il server (anche dalla demo pubblicata e dai QR). |
| Backend | Supabase (Postgres + Auth OTP via SMS + Storage + Edge Functions) | Nel piano c'è già Supabase; Row Level Security per locali, ditte, moderazione. |
| Filtro foto | Edge Function `ai-photo-check` con Claude (visione) | Prima della moderazione umana. In demo: euristica locale, sempre marcata "simulato". |
| Test | Vitest (dominio), Playwright (flussi end-to-end sulla build) | Chromium preinstallato. |

## Due modalità, stessa logica

* **demo** (`LocalStore`, `src/data/localStore.ts`): nessun server, dati in memoria + `localStorage`,
  personaggi demo con cui entrare (cliente, titolare, ditta, moderazione). È ciò che viene pubblicato
  come demo cliccabile. La fotocamera e il GPS non sono disponibili nella pagina pubblicata: si usa
  l'upload di una foto (`captureMode: 'file_demo'`) e una posizione simulata (quella del locale).
* **supabase** (`createSupabaseStore`, `src/data/supabaseStore.ts`): si attiva con
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Le regole girano nelle Edge Functions
  importando lo stesso `src/domain/`.

`src/domain/` **non deve dipendere da React né dal browser**: è condiviso con `supabase/functions`.

## Struttura

```
src/
  domain/        tipi, regole (numeri del piano), macchina a stati (funzioni pure, testate)
  data/          interfaccia DataStore, LocalStore (demo), SupabaseStore (produzione), StoreContext (hook React)
  i18n/          dizionari IT/EN per modulo; useT(), useLang()
  lib/           utilità browser: foto (analisi, riduzione, sfocatura), formattazione, id, dispositivo
  components/    Layout (guscio), ui.tsx (chip di stato, header, errori, RequireAuth…)
  pages/         una pagina per rotta (vedi src/App.tsx)
supabase/
  migrations/    schema SQL + RLS
  functions/     Edge Functions (Deno)
  seed.sql       dati di partenza
docs/            questo file, guide di deploy e legale
e2e/             test Playwright
```

## Rotte

| Rotta | Pagina | Chi | Cosa fa |
| --- | --- | --- | --- |
| `/` | MapPage | tutti | Mappa di Firenze, pin colorati per stato, filtri, ricerca, elenco, legenda |
| `/locale/:id` | VenuePage | tutti | Scheda del locale: stato, segnalazioni pubblicate con foto e replica accanto, certificati, pulsante Segnala, QR |
| `/locale/:id/gestisci` | VenueManagePage | titolare | Chiede di gestire il locale (rivendicazione con P.IVA e telefono: resta "in verifica" finché la moderazione non la approva, stato di attesa in pagina), poi vede le segnalazioni, replica (conto alla rovescia 7 giorni), chiede preventivi, accetta un preventivo, carica il certificato, Premium 20 €/mese |
| `/segnala/:venueId?` | ReportPage | cliente verificato | Flusso: locale → foto in app → categoria e descrizione → posizione → regole e consenso → esito del filtro |
| `/accedi` | AuthPage | tutti | OTP telefono (demo: codice mostrato), oppure "entra come" personaggio demo; spiegazione SPID/CIE |
| `/profilo` | ProfilePage | loggato | Le mie segnalazioni e il loro stato, contatore 3/mese, notifiche, esci |
| `/ditte` | CompanyPage | pubblico + ditta | Pubblico: come funziona per le ditte, prezzi. Ditta: contatti anonimizzati, acquisto 30 €, preventivi, sponsor 100 €/mese, accettazione condizioni uguali |
| `/moderazione` | ModerationPage | moderazione | Coda con SLA 24 h, filtro IA, sfocatura volti, conferma/archivia, certificati da verificare, rivendicazioni dei locali (approva → titolare / rifiuta con motivo), richieste DSA (48 h), rimozioni, blocco utenti, import NAS, audit |
| `/trasparenza` | TransparencyPage | tutti | Statistiche, registro pubblico delle rimozioni, punto di contatto DSA, rapporto di trasparenza |
| `/nas` | NasPage | tutti | Comunicati NAS importati, collegati o da collegare |
| `/come-funziona` | HowItWorksPage | tutti | Per clienti, locali, ditte; prezzi; il flusso in 11 passi |
| `/regole`, `/termini`, `/privacy`, `/dsa/:reportId?` | LegalPages | tutti | Le 4 regole, termini, privacy (GDPR, volti, dati minimi), modulo di segnalazione DSA |

## Convenzioni di codice

* Tutte le stringhe visibili passano da `useT()`; le chiavi di un modulo vivono in
  `src/i18n/modules/<modulo>.ts` (sia `it` sia `en`). Chiavi comuni in `core.ts`.
* Dati solo tramite `useStore()` / `useStoreData()` (`src/data/StoreContext.tsx`). Mai importare
  `seed.ts` da una pagina.
* Errori: lo store lancia `RuleViolation` con chiavi i18n (`rule.*`); mostrarle con `<ErrorBox keys={errorKeys(e)} />`.
* Stile: classi Tailwind + token CSS di `src/index.css` (`.btn`, `.card`, `.chip-<stato>`, `.gutter`).
  Niente colori letterali: usare i token. Tema chiaro e scuro devono entrambi leggersi.
* Mobile first (400 px), nessuno scroll orizzontale, pulsanti ≥ 44 px, `tnum` per le cifre.
* Nessun `alert`/`confirm`/`prompt`, nessun `window.open`: le conferme sono nell'interfaccia.
* Le immagini sono data URL (demo) o path di storage (produzione): la pagina non deve distinguere.
* Date in ISO nello store; formattazione con `src/lib/format.ts`.

## Le quattro regole nel codice

1. Mai una lista nera → la mappa mostra "segnalazioni degli utenti" con prova; il copy non emette giudizi; le segnalazioni scartate/archiviate non compaiono mai (`isPubliclyVisible`).
2. Solo foto in app, GPS, ora, utente verificato → `canSubmitReport` (`enforceCamera` true in produzione), `MAX_DISTANCE_M`, `MAX_CAPTURE_AGE_MIN`, OTP/SPID.
3. Diritto di replica, 7 giorni → `moderate()` imposta `replyDeadlineAt`; la replica è mostrata accanto alla segnalazione; `isDefinitive`. Replica solo il titolare: la rivendicazione (`claimVenue`) crea una richiesta `in_verifica` e la titolarità nasce solo da `decideVenueClaim` della moderazione (stessa coda in demo e in produzione: tabella `venue_claims`).
4. Nessun inserzionista tocca le segnalazioni → nessuna API di rimozione per le ditte; `REMOVAL_REASONS` senza "pagamento"; `priceForCompany` identico per tutti; preventivi ordinati per arrivo; registro pubblico delle rimozioni.
