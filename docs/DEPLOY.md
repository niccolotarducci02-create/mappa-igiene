# Mappa dell'Igiene — guida alla messa in produzione

Questa guida è scritta per il fondatore (non sviluppatore) con l'aiuto di un amico sviluppatore.
I passi marcati **[sviluppatore]** richiedono il terminale; gli altri si fanno dal browser.
Tempo stimato la prima volta: mezza giornata in due. Costo fisso di partenza: ~25 $/mese (Supabase Pro).

Indice

1. Cosa serve prima di iniziare
2. Progetto Supabase (regione UE)
3. Database: migrazioni, bucket, dati di prova
4. Accesso con SMS (Phone Auth) e costi
5. Segreti (chiavi) delle Edge Functions
6. Pubblicare le Edge Functions
7. Collegare database e funzioni: webhook e pg_cron
8. Stripe (pagamenti)
9. Il primo moderatore
10. Pubblicare la PWA (Vercel o Netlify) e il dominio
11. Installare l'app su iPhone e Android
12. Stima dei costi mensili
13. Note GDPR
14. Checklist di go-live (Gate 1 del piano)
15. Comandi utili e problemi frequenti

---

## 1. Cosa serve prima di iniziare

| Cosa | Dove | Note |
| --- | --- | --- |
| Account Supabase | supabase.com | con carta per il piano Pro |
| Account Anthropic (API) | console.anthropic.com | chiave API per il filtro foto; carica 20 $ di credito |
| Account Stripe | stripe.com | attivazione con dati aziendali e IBAN; si parte in modalità test |
| Account Twilio (o MessageBird) | twilio.com | per gli SMS dell'OTP e degli avvisi |
| Account Resend | resend.com | email degli avvisi (gratis fino a 3.000/mese), serve un dominio |
| Account Vercel o Netlify | vercel.com / netlify.com | hosting della PWA, piano gratuito |
| Dominio | es. mappadelligiene.it | registrar a scelta (~10 €/anno) |
| Repository git del progetto | GitHub | Vercel/Netlify pubblicano da lì |
| **[sviluppatore]** Node 22, `npm`, Supabase CLI | `npm i -g supabase` oppure `brew install supabase/tap/supabase` | |

Convenzione: tutte le chiavi che iniziano con `sb_secret_`, `service_role`, `sk_live_`, `whsec_`, `SK...` sono **segrete**: mai nel codice, mai in chat, mai nel client. Le chiavi `anon`/`publishable` e `pk_live_` invece possono stare nella PWA.

---

## 2. Progetto Supabase (regione UE)

1. supabase.com → **New project**.
2. Organizzazione: creane una con il nome dell'attività. Piano **Pro** (25 $/mese): serve per i backup giornalieri, per non avere la pausa automatica dopo 7 giorni di inattività e per il supporto email.
3. Nome progetto `mappa-igiene`, **Region: `eu-central-1` (Frankfurt)** — è il punto GDPR più importante di tutta la guida: i dati restano nell'Unione Europea. Non scegliere regioni USA.
4. Password del database: generala e salvala nel gestore di password (serve raramente, ma serve).
5. Attendi ~2 minuti. Poi in **Settings → API** annota:
   - `Project URL` (es. `https://abcdefghijklmnop.supabase.co`) — il pezzo `abcdefghijklmnop` è il **project ref**;
   - chiave **anon / publishable** (pubblica, va nella PWA);
   - chiave **service_role / secret** (segreta, serve solo ai passi 7 e 9).

---

## 3. Database: migrazioni, bucket, dati di prova

**[sviluppatore]** Dalla cartella del progetto:

```bash
supabase login                         # apre il browser
supabase link --project-ref <PROJECT_REF>
supabase db push                       # applica supabase/migrations/0001..0006 nell'ordine
```

`db push` crea tabelle, Row Level Security, funzioni RPC, trigger con le regole del piano (3 segnalazioni al mese,
150 m, 7 giorni di replica, 30 € a contatto per tutte le ditte, ecc.) e i due bucket privati dello Storage
(`report-photos`, `certificates`) con le loro policy. Verifica in **Storage** che i due bucket esistano e siano
**Private** (lucchetto). Se mancassero (versioni vecchie della CLI), creali a mano con quei nomi esatti, privati,
limite 8 MB / 10 MB, MIME `image/jpeg, image/png, image/webp` (il secondo anche `application/pdf`).

Dati di prova: `supabase/seed.sql` è pensato per il database **locale** (`supabase start`, `supabase db reset`),
perché inserisce utenti finti direttamente in `auth.users`. **Non eseguirlo in produzione.** Per avere i 40
locali di Firenze in produzione, esegui nell'**SQL Editor** solo la sezione dei `venues` del seed (sezione 3),
oppure importa un CSV in Table Editor → `venues` (colonne `name, type, address, lat, lng`).

Controllo rapido in SQL Editor:

```sql
select count(*) from public.venues;                       -- i locali
select proname from pg_proc where proname = 'submit_report'; -- le RPC ci sono
select id, public from storage.buckets;                     -- entrambi false
```

---

## 4. Accesso con SMS (Phone Auth) e costi

L'app non usa password: l'utente riceve un codice via SMS (regola 2: utente verificato con numero di telefono).

1. **Authentication → Providers → Phone**: attiva. Disattiva **Email** se non la usi.
2. Scegli il provider SMS:
   - **Twilio** (consigliato): crea un account, compra un numero italiano o, meglio, un **Messaging Service**
     con Sender ID alfanumerico "MappaIgiene" (in Italia è ammesso senza registrazione per il traffico
     transazionale; Twilio potrebbe chiedere la verifica dell'azienda). In Supabase inserisci `Account SID`,
     `Auth Token`, `Message Service SID`.
   - **MessageBird**: alternativa europea (Paesi Bassi), prezzi simili, inserisci `Access Key` e `Originator`.
3. Template del messaggio: `Il tuo codice Mappa dell'Igiene è {{ .Code }}` (massimo ~70 caratteri per stare
   in un solo SMS).
4. **Rate limits** (Authentication → Rate Limits): SMS per ora = 30 all'inizio; alza con la crescita.
   Protegge dal "SMS pumping" (truffa che svuota il credito con richieste di OTP verso numeri a tariffa speciale).
   In Twilio attiva anche **Verify Fraud Guard** o limita i prefissi al +39.
5. **Numeri di prova** (Authentication → Providers → Phone → Test OTPs): aggiungi il tuo numero con un codice
   fisso, così i test non costano SMS.
6. In **Authentication → URL Configuration** imposta `Site URL` = l'indirizzo pubblico della PWA
   (es. `https://mappadelligiene.it`) e aggiungi anche `http://localhost:5173` ai redirect per lo sviluppo.

Costi: un SMS verso un numero italiano costa circa **0,07–0,08 €** (Twilio) IVA esclusa; un utente nuovo
costa 1 SMS di OTP; un utente che torna ogni mese costa ~1 SMS/mese (la sessione resta valida per settimane).
Con 300 utenti attivi al mese: ~25 €/mese. Gli avvisi SMS ai locali (funzione `notify`) si sommano:
sono limitati ai tipi urgenti (vedi §6) proprio per contenere questa voce.

Nota SPID/CIE: il piano prevede anche SPID. Non è incluso nella beta (serve un aggregatore convenzionato,
~500–1.500 €/anno): il campo `profiles.spid_verified` è già previsto per quando arriverà.

---

## 5. Segreti (chiavi) delle Edge Functions

**[sviluppatore]** I segreti si caricano una volta e restano nel progetto (Edge Functions → Secrets):

```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  ANTHROPIC_MODEL=claude-opus-5-5 \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM=MG...  \
  RESEND_API_KEY=re_... \
  "RESEND_FROM=Mappa dell'Igiene <avvisi@mappadelligiene.it>" \
  APP_BASE_URL=https://mappadelligiene.it \
  WEBHOOK_SECRET=$(openssl rand -hex 24) \
  CRON_SECRET=$(openssl rand -hex 24)
```

| Variabile | Usata da | Obbligatoria? | Se manca |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | ai-photo-check | sì | ogni foto resta "incerta" e va in coda alla moderazione |
| `ANTHROPIC_MODEL` | ai-photo-check | no (default `claude-opus-5-5`) | |
| `ANTHROPIC_FALLBACKS` | ai-photo-check | no (`default`; `off` per disattivare) | |
| `STRIPE_SECRET_KEY` | create-checkout-session | per i pagamenti | la funzione risponde 503 `payment.unavailable`; nella beta l'app usa il "pagamento simulato" |
| `STRIPE_WEBHOOK_SECRET` | payments-webhook | per i pagamenti | il webhook rifiuta tutto |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | notify | no | SMS in modalità **dry-run** (solo log) |
| `RESEND_API_KEY`, `RESEND_FROM` | notify | no | email in modalità **dry-run** |
| `APP_BASE_URL` | notify, checkout | sì in produzione | i link nelle notifiche puntano a localhost |
| `WEBHOOK_SECRET`, `CRON_SECRET` | on-report-submitted, notify, cron | no | si usa la chiave service_role nei webhook |
| `NOTIFY_SMS_KINDS` | notify | no | default: `nuova_segnalazione_locale,nuovo_contatto,preventivo_ricevuto,certificato_verificato,segnalazione_rimossa`; `none` = niente SMS |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sono iniettate automaticamente da Supabase:
non vanno impostate.

---

## 6. Pubblicare le Edge Functions

**[sviluppatore]**

```bash
supabase functions deploy            # pubblica tutte le cartelle in supabase/functions
# oppure una sola:
supabase functions deploy ai-photo-check
```

Le impostazioni `verify_jwt` per funzione sono in `supabase/config.toml` e vengono applicate dal deploy.
Le funzioni importano le costanti del piano con un percorso relativo (`../../../src/domain/rules.ts`):
la CLI include quei file nel bundle, quindi i prezzi (30 €, 100 €/mese, 20 €/mese) e le soglie hanno
**una sola fonte** per app, demo e server. Le dipendenze `npm:` sono dichiarate in `supabase/functions/deno.json`.

| Funzione | Chi la chiama | Cosa fa |
| --- | --- | --- |
| `ai-photo-check` | `on-report-submitted`, la PWA subito dopo l'invio (solo per la propria segnalazione) o un moderatore dalla coda | scarica la foto, chiede a Claude se è coerente con la categoria, salva verdetto/punteggio/motivi e i riquadri dei volti; sotto soglia e non coerente → `scartata` con avviso all'utente; altrimenti resta `in_verifica`. Non pubblica mai. |
| `on-report-submitted` | webhook del database (INSERT su `reports`) | avvisa la moderazione (SLA 24 h) e avvia `ai-photo-check` |
| `reply-deadline-cron` | pg_cron ogni giorno | promemoria al giorno 5, avviso "stato definitivo" al giorno 7 (lo stato NON cambia), cancella le foto di segnalazioni scartate/archiviate dopo 90 giorni, chiude i contatti dopo 60 giorni |
| `payments-webhook` | Stripe | verifica la firma e attiva contatto / sponsor / Premium dopo il pagamento |
| `create-checkout-session` | la PWA (utente loggato) | crea la pagina di pagamento Stripe con i prezzi di `rules.ts` |
| `notify` | webhook del database (INSERT su `notifications`) + pg_cron ogni 15 min | invia SMS (Twilio) e/o email (Resend); dry-run senza chiavi |

Prova subito dal terminale (sostituisci URL e chiave service_role):

```bash
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/reply-deadline-cron" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" -d '{"dryRun":true}'
# atteso: {"ranAt":"...","dryRun":true,"remindersSent":0,...}
```

I log si leggono in **Edge Functions → nome funzione → Logs**.

---

## 7. Collegare database e funzioni: webhook e pg_cron

Serve che il database "avvisi" le funzioni. Due strade equivalenti; la A è più rapida.

### A. Script SQL (consigliato)

1. Apri `supabase/scripts/cron_and_webhooks.sql`, sostituisci `<PROJECT_REF>` e `<SERVICE_ROLE_KEY>`.
2. Incolla tutto nell'**SQL Editor** e **Run**. Lo script:
   - attiva `pg_net` e `pg_cron`;
   - salva URL e chiave nel **Vault** (cifrato);
   - crea i trigger `zz_webhook_reports_insert` → `on-report-submitted` e `zz_webhook_notifications_insert` → `notify`;
   - programma `reply-deadline-cron` alle 06:15 UTC e `notify` ogni 15 minuti.
3. Cancella il file modificato con la chiave dentro (o non salvarlo): la chiave deve restare solo nel Vault.

### B. Dal pannello

- **Database → Webhooks → Create a new hook**: nome `on_report_submitted`, tabella `reports`, evento `Insert`,
  tipo **Supabase Edge Functions**, funzione `on-report-submitted`, HTTP header `Authorization` =
  `Bearer <SERVICE_ROLE_KEY>` (oppure `x-webhook-secret` = il valore di `WEBHOOK_SECRET`). Timeout 5000 ms.
- Stesso procedimento per `notifications` → `notify`.
- **Integrations → Cron** (o `Database → Extensions → pg_cron`): nuovo job `reply-deadline-cron`, schedule
  `15 6 * * *`, tipo *Supabase Edge Function*, funzione `reply-deadline-cron`, header `Authorization` come sopra.
  Secondo job `notify-pending`, `*/15 * * * *`, funzione `notify`.

Verifica: invia una segnalazione di prova dall'app; entro un minuto in **Table Editor → reports** la riga
deve avere `ai_checked_at` compilato e in `notifications` devono comparire gli avvisi alla moderazione.
Se no: `select * from net._http_response order by id desc limit 5;` mostra la risposta della funzione.

---

## 8. Stripe (pagamenti)

I tre prodotti (contatto 30 €, scheda sponsorizzata 100 €/mese, Premium 20 €/mese) non vanno creati nel
catalogo Stripe: la funzione `create-checkout-session` passa prezzo e descrizione a ogni acquisto, leggendoli
da `src/domain/rules.ts`. Così il prezzo è identico per tutti, anche per la ditta del fondatore (regola 4).

1. Stripe → attiva l'account (dati società, IBAN). Resta in **Test mode** finché non sei pronto.
2. **Developers → API keys**: copia la `Secret key` (`sk_test_...`) → `STRIPE_SECRET_KEY` (§5).
3. **Developers → Webhooks → Add endpoint**: URL `https://<PROJECT_REF>.supabase.co/functions/v1/payments-webhook`,
   eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Copia il **Signing secret**
   (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`, poi `supabase secrets set` di nuovo e `supabase functions deploy payments-webhook`.
4. Prova con la carta di test `4242 4242 4242 4242`: in **Table Editor → payments** compare l'evento con
   `status = processed` e il contatto/sponsor/Premium risulta attivo. Se `status = error`, la colonna
   `error` dice perché (es. `rule.lead_full`: il contatto era già completo → rimborso manuale da Stripe).
5. Go-live: ripeti 2 e 3 con le chiavi **live** (`sk_live_`, nuovo endpoint, nuovo `whsec_`).

Fatturazione: Stripe emette la ricevuta (`invoice_creation` attivo). In Italia le vendite a ditte e locali
sono B2B e richiedono **fattura elettronica via SDI**: parlane col commercialista (Stripe Tax/Invoicing o un
gestionale collegato). Fino ad allora, fattura a mano dal gestionale a fine mese usando `payments`.

Beta senza Stripe: le RPC `set_venue_premium` e `sponsor_company` restano chiamabili dall'app con audit
"pagamento simulato". Prima dei pagamenti veri, **revoca** quella possibilità (SQL Editor):

```sql
revoke execute on function public.set_venue_premium(uuid, integer) from authenticated;
revoke execute on function public.sponsor_company(uuid, integer) from authenticated;
```

---

## 9. Il primo moderatore

Il moderatore (tu, all'inizio) decide entro 24 ore cosa pubblicare. Il ruolo vive in `profiles.role` e,
per velocità, anche nel token (`app_metadata.role`).

1. Entra nell'app con il tuo numero di telefono (OTP): nasce il profilo con ruolo `utente`.
2. **SQL Editor**:

```sql
-- sostituisci il numero (formato internazionale senza spazi, come salvato da Supabase: 39333...)
update public.profiles set role = 'moderatore', display_name = 'Moderazione'
 where phone like '%3331234567';
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"moderatore"}'::jsonb
 where phone like '%3331234567';
```

3. Esci e rientra nell'app: compare la voce **Moderazione** (`/moderazione`).
4. Per un secondo moderatore ripeti; per toglierlo, rimetti `'utente'` in entrambe le tabelle.

Consiglio: due persone con il ruolo, così la SLA di 24 ore regge anche in vacanza. Il ruolo `admin` è
equivalente ma riservato a chi gestisce il progetto.

---

## 10. Pubblicare la PWA (Vercel o Netlify) e il dominio

**[sviluppatore]** La PWA legge due variabili alla build; con quelle passa dalla demo al backend vero.

### Vercel

1. vercel.com → **Add New Project** → importa il repository GitHub.
2. Framework: Vite (riconosciuto). Build `npm run build`, output `dist`.
3. **Environment Variables**:
   - `VITE_SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = chiave anon/publishable
4. Deploy. L'app usa `HashRouter` (`/#/locale/...`): non servono regole di rewrite.
5. **Settings → Domains**: aggiungi `mappadelligiene.it` e `www`. Vercel mostra i record DNS (A `76.76.21.21`
   e CNAME `cname.vercel-dns.com`) da inserire nel pannello del registrar. HTTPS è automatico.

### Netlify

Stesso procedimento: **Add new site → Import**, build `npm run build`, publish `dist`, variabili in
**Site configuration → Environment variables**, dominio in **Domain management** (CNAME verso
`<sito>.netlify.app`). Nessun `_redirects` necessario.

Dopo il deploy: in Supabase **Authentication → URL Configuration** metti il dominio finale come `Site URL`;
imposta `APP_BASE_URL` (§5) allo stesso valore e ridistribuisci `notify` e `create-checkout-session`.

Ogni `git push` sul ramo principale ripubblica l'app. Le migrazioni del database e le funzioni invece si
pubblicano a mano (`supabase db push`, `supabase functions deploy`): fallo **prima** del push dell'app quando
una modifica richiede entrambe.

---

## 11. Installare l'app su iPhone e Android

L'app è una PWA: si installa dal browser, senza App Store / Play Store (che arriveranno con Capacitor).

**iPhone / iPad (Safari, obbligatorio: Chrome su iOS non installa PWA)**
1. Apri `https://mappadelligiene.it` in Safari.
2. Tocca **Condividi** (quadrato con la freccia) → **Aggiungi alla schermata Home** → **Aggiungi**.
3. L'icona compare come un'app. La fotocamera e il GPS chiedono il permesso al primo uso.

**Android (Chrome)**
1. Apri il sito in Chrome. Compare il banner **Installa app** (o menu ⋮ → **Installa app** / **Aggiungi a
   schermata Home**).
2. Conferma. L'app si apre a schermo intero.

Suggerimento per i locali: stampa il QR del locale (scheda `/locale/:id`, pulsante QR) e mettilo vicino alla
cassa con la scritta "Hai visto qualcosa? Segnala con foto" — porta direttamente alla pagina giusta.

---

## 12. Stima dei costi mensili

Scenario beta Firenze: 300 utenti attivi, 150 segnalazioni/mese, 40 locali, 10 ditte.

| Voce | Prezzo | Stima/mese | Note |
| --- | --- | --- | --- |
| Supabase Pro | 25 $ fissi | ~24 € | include 8 GB DB, 100 GB storage, 2 M chiamate alle funzioni, backup 7 giorni |
| SMS OTP + avvisi (Twilio) | ~0,07 €/SMS | 25–40 € | 300 OTP + ~150 avvisi ai locali |
| Claude vision (filtro foto) | ~0,01–0,03 €/foto | 2–5 € | 150 foto; una foto ~1.500 token in ingresso + risposta breve |
| Stripe | 1,5 % + 0,25 € per transazione (carte UE) | ~2–6 € | su ~10 contatti (300 €) + qualche abbonamento; trattenuto dagli incassi |
| Resend (email) | gratis fino a 3.000 email | 0 € | poi 20 $/mese |
| Vercel/Netlify | piano gratuito | 0 € | sufficiente per il traffico della beta |
| Mappe (tile OpenStreetMap) | gratis con uso ragionevole | 0 € | sopra ~qualche migliaio di utenti passare a un provider (MapTiler ~ 25 $) |
| Dominio | ~10 €/anno | ~1 € | |
| **Totale** | | **~55–80 €/mese** | contro ricavi attesi: 10 contatti × 30 € + sponsor/Premium |

Ricavi del piano: un contatto venduto a 3 ditte vale 90 €; 10 contatti/mese coprono tutta l'infrastruttura.

---

## 13. Note GDPR

Dettaglio completo per l'avvocato in `docs/LEGALE_CHECKLIST.md`. Il minimo per il go-live:

- **Dati in UE**: progetto Supabase a Frankfurt (§2). Stripe, Twilio, Resend e Anthropic sono fornitori USA
  con sedi UE / clausole contrattuali standard: vanno elencati come **responsabili del trattamento** nell'informativa
  e serve firmare il loro **DPA** (Data Processing Agreement, si accetta online nei rispettivi pannelli).
  Per Anthropic: i dati inviati via API non sono usati per addestrare i modelli; chiedi l'opzione di
  **zero data retention** se disponibile per il tuo account.
- **DPIA** (valutazione d'impatto): obbligatoria perché si trattano **immagini** (possibili volti), **posizione
  GPS** e dati che possono incidere sulla reputazione di terzi. Da redigere prima del lancio con l'avvocato;
  l'elenco delle misure tecniche è nella checklist legale.
- **Minimizzazione** già nel codice: la mappa pubblica non mostra chi ha segnalato (`public_reports` senza
  `user_id`); le ditte vedono solo la zona finché non acquistano; i volti vanno sfocati prima della pubblicazione
  (l'app rifiuta la pubblicazione altrimenti); le foto sono in bucket privati con link firmati.
- **Conservazione**: foto di segnalazioni scartate/archiviate cancellate dopo 90 giorni (cron); notifiche e
  log leggibili solo dall'interessato o dalla moderazione; il registro delle rimozioni resta (trasparenza DSA)
  ma senza dati del segnalante.
- **Diritti**: cancellazione account = `auth.admin.deleteUser` (cascata su profilo e notifiche); le segnalazioni
  pubblicate restano come "segnalazione di un utente" anonima (base giuridica: interesse legittimo / interesse
  pubblico, da motivare nella DPIA). Prevedi un indirizzo `privacy@` e il modulo in `/privacy`.
- **Informativa e consenso**: ogni segnalazione registra `consent_accepted` (regole + privacy) e l'ora; i testi
  sono nelle rotte `/privacy`, `/termini`, `/regole`.

---

## 14. Checklist di go-live (Gate 1 del piano)

Il piano prevede il **Gate 1**: si apre al pubblico solo con l'ok legale e 5 ditte firmate. Spunta tutto:

**Legale**
- [ ] Parere scritto dell'avvocato su `docs/LEGALE_CHECKLIST.md` (diffamazione, GDPR, DSA, termini).
- [ ] Informativa privacy, termini d'uso, le 4 regole pubblicati nelle rotte `/privacy`, `/termini`, `/regole`
      con i testi approvati (sostituire i segnaposto di ragione sociale, P.IVA, indirizzo, email).
- [ ] DPIA firmata e archiviata; registro dei trattamenti; DPA firmati con Supabase, Stripe, Twilio, Resend, Anthropic, Vercel/Netlify.
- [ ] Punto di contatto DSA (`/trasparenza`) con email funzionante e presidiata; modulo `/dsa/:reportId` testato.
- [ ] Assicurazione RC + cyber attiva (vedi checklist legale).
- [ ] Commercialista: fatturazione elettronica dei contatti venduti e degli abbonamenti.

**Commerciale**
- [ ] **5 ditte** con contratto firmato e condizioni uguali per tutte accettate nell'app (`same_conditions_ack` = true).
- [ ] La ditta del fondatore è marcata `is_founder_company = true` e lo si dichiara in `/come-funziona` e `/ditte`.
- [ ] 40 locali inseriti con coordinate verificate (campo `address`, `lat`, `lng`).
- [ ] QR stampati per i primi 10 locali pilota.

**Tecnico**
- [ ] Progetto Supabase in UE, piano Pro, backup attivi (Database → Backups).
- [ ] `supabase db push` senza errori; `select count(*) from venues` > 0.
- [ ] Phone Auth con provider SMS live e rate limit; OTP ricevuto su un numero reale.
- [ ] Tutti i secret impostati (§5); `supabase secrets list` li elenca.
- [ ] Funzioni pubblicate; `reply-deadline-cron` in `dryRun` risponde 200.
- [ ] Webhook e cron configurati (§7): segnalazione di prova → `ai_checked_at` compilato, avviso in `notifications`.
- [ ] Foto di prova con un volto → `ai_faces_detected = true`; la pubblicazione senza sfocatura viene rifiutata (`rule.blur_required`).
- [ ] Stripe in **live**, webhook con firma, pagamento reale di 30 € eseguito e rimborsato; `payments.status = processed`.
- [ ] RPC `set_venue_premium` / `sponsor_company` revocate ad `authenticated` (§8).
- [ ] Moderatore creato (§9), SLA 24 h coperta da due persone; notifiche SMS ai moderatori verificate.
- [ ] PWA pubblicata sul dominio finale con HTTPS, `Site URL` e `APP_BASE_URL` aggiornati; installata su un iPhone e un Android.
- [ ] Flusso completo provato in produzione: segnalazione → filtro → moderazione → pubblicazione → replica del
      locale → richiesta preventivi → acquisto contatto → preventivo → certificato → verifica → stato "risolta".
- [ ] Rimozione di prova con motivo ammesso → compare nel registro pubblico `/trasparenza`.
- [ ] Monitoraggio: alert Supabase (Settings → Alerts), controllo settimanale di `cron.job_run_details` e dei log delle funzioni.

---

## 15. Comandi utili e problemi frequenti

```bash
supabase status                      # locale: URL e chiavi del progetto di sviluppo
supabase start && supabase db reset  # locale: ricrea tutto con seed.sql
supabase functions serve --env-file supabase/.env.local   # locale: funzioni con hot reload
supabase db push                     # produzione: nuove migrazioni
supabase functions deploy <nome>     # produzione: una funzione
supabase secrets list                # elenco (senza valori) dei secret
supabase functions logs <nome>       # ultimi log (oppure dal pannello)
```

| Sintomo | Causa probabile | Rimedio |
| --- | --- | --- |
| La segnalazione viene rifiutata con `rule.camera_only` | la foto non viene dalla fotocamera in-app | in produzione è voluto (regola 2); sul desktop usa un telefono |
| `rule.too_far` anche se sei nel locale | GPS impreciso al chiuso o coordinate del locale sbagliate | correggi `lat`/`lng` del locale; 150 m è la tolleranza |
| `ai_checked_at` resta vuoto | webhook non configurato o chiave sbagliata | §7; guarda `net._http_response` e i log di `on-report-submitted` |
| Tutte le foto "incerta" con `photo.model_error` | `ANTHROPIC_API_KEY` mancante o senza credito | §5; log di `ai-photo-check` |
| `payment.bad_signature` | `STRIPE_WEBHOOK_SECRET` di un altro endpoint (test vs live) | ricopia il signing secret e ridistribuisci |
| Pagamento riuscito ma contatto non attivo | `payments.error` = `rule.lead_full` o `rule.service_mismatch` | rimborsa da Stripe; il client dovrebbe aver bloccato prima |
| SMS non arrivano | provider non configurato, rate limit, numero senza +39 | Authentication → Logs; Twilio → Monitor |
| Notifiche con `sent_via = {in_app,dry_run:sms}` | chiavi Twilio/Resend assenti | normale in beta; §5 per attivare |
| Il moderatore non vede la coda | ruolo solo in `profiles` ma token vecchio | esci e rientra (il token si rinnova) |
| Errore `rule.not_allowed` chiamando una RPC "di sistema" dall'app | la RPC è riservata al service_role | è una protezione: va chiamata dalle Edge Functions |
