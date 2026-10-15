# Mappa dell'Igiene

App web (PWA) per Firenze: lo stato igienico di bar e ristoranti a partire da **segnalazioni verificate con foto** e dai
**comunicati pubblici dei NAS**. Il locale risponde dentro l'app e, se risolve, lo dimostra con il certificato di una
ditta. Le ditte di disinfestazione e pulizie pagano i contatti dei locali segnalati.

Questo repository è l'implementazione del piano "Mappa dell'Igiene – Piano Firenze": stesse regole, stessi numeri.

## Le quattro regole (nei termini d'uso e nel codice)

1. Mai una lista nera: l'app pubblica "segnalazioni degli utenti" con prova, mai un giudizio proprio sul locale.
2. Una segnalazione vale solo con foto scattata dentro l'app, posizione GPS, ora e utente verificato (SPID/CIE o telefono).
3. Il locale ha sempre il diritto di replica, visibile accanto alla segnalazione, e 7 giorni per rispondere.
4. Nessun inserzionista tocca le segnalazioni, nemmeno la ditta del fondatore: niente "paga e sparisce", mai.

Dove stanno nel codice: `src/domain/rules.ts` (i numeri), `src/domain/stateMachine.ts` (le regole come funzioni pure,
con test), `docs/ARCHITETTURA.md` (come ogni regola è applicata).

## Avvio rapido (modalità demo, nessun server)

```bash
npm install
npm run dev        # http://localhost:5173
```

Senza variabili d'ambiente l'app usa dati dimostrativi inventati (locali, persone, segnalazioni) salvati nel browser.
Dalla pagina **Accedi** si entra con un profilo demo: cliente, titolare di locale, ditta partner, moderazione.

Nella demo pubblicata come pagina web la fotocamera e il GPS non sono disponibili: la segnalazione accetta una foto
caricata (marcata come tale) e usa la posizione del locale. Nell'app installata su telefono si usano fotocamera e GPS veri.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | server di sviluppo |
| `npm run build` | typecheck + build di produzione in `dist/` |
| `npm run preview` | serve la build su http://localhost:4173 |
| `npm test` | test unitari del dominio (Vitest) |
| `npm run e2e` | test end-to-end sulla build (Playwright, Chromium) |
| `npm run typecheck` | solo controllo dei tipi |

## Produzione (Supabase)

1. Crea un progetto Supabase (regione UE) e applica `supabase/migrations` e `supabase/seed.sql`.
2. Copia `.env.example` in `.env.local` e inserisci `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Distribuisci le Edge Functions in `supabase/functions` e imposta i segreti (filtro foto con Claude, Stripe, SMS).
4. Pubblica la build su Vercel o Netlify.

Guida passo passo: `docs/DEPLOY.md`. Cosa deve rivedere l'avvocato prima del lancio: `docs/LEGALE_CHECKLIST.md`.

## Struttura

```
src/domain      tipi, regole, macchina a stati (nessuna dipendenza da React o dal browser; condivisa con il backend)
src/data        interfaccia DataStore, store demo (LocalStore), store Supabase, hook React
src/pages       una pagina per rotta (mappa, scheda locale, segnalazione, accesso, profilo, ditte, moderazione, trasparenza, NAS, legale)
src/components  guscio dell'app e componenti per modulo
src/i18n        testi in italiano e inglese
supabase        schema SQL con Row Level Security, Edge Functions, seed
docs            architettura, deploy, checklist legale
e2e             test Playwright
```

## Stato del progetto

Beta funzionante in modalità demo. Prima del lancio reale servono: parere legale (termini, privacy/DPIA, DSA), un progetto
Supabase configurato, un provider SMS, Stripe per i pagamenti, e le prime 5 ditte firmate (Cancello 1 del piano).
