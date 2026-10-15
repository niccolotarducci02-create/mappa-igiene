# SupabaseStore — come il client parla con il backend

`src/data/supabaseStore.ts` è l'implementazione di produzione di `DataStore` (`src/data/store.ts`).
Si attiva quando `.env.local` contiene `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (vedi `src/data/index.ts`);
senza quelle variabili l'app usa la demo (`LocalStore`). Le pagine non distinguono le due modalità:
stessa interfaccia, stessi tipi camelCase (`src/domain/types.ts`), stessi errori (`RuleViolation` con chiavi `rule.*`).

Lo schema SQL è in `supabase/migrations`, le Edge Functions in `supabase/functions`. Questo documento
descrive cosa fa il client e cosa deve aspettarsi la UI.

## Principi

1. **Le regole stanno nel database.** 3 segnalazioni al mese (mese UTC), 150 m, foto entro 30 minuti,
   utente verificato, 7 giorni di replica, 30 € a contatto per tutte le ditte (fondatore compreso),
   massimo 3 ditte, rimozione solo dalla moderazione con motivo ammesso: sono trigger e funzioni
   `SECURITY DEFINER`. Il client esegue `canSubmitReport` *prima* di caricare la foto solo per evitare
   un upload inutile; l'autorità è il trigger `b_reports_validate_insert`.
2. **Letture dalle tabelle e dalle viste, scritture dalle RPC.** Ogni metodo che applica una regola chiama
   `supabase.rpc('nome', { p_param })`. Le poche scritture dirette sono quelle innocue
   (`notifications.read`, `profiles.display_name`).
3. **Identificatori:** snake_case nel database, camelCase nel dominio. I mapper (`mapReport`, `mapVenue`, ...)
   sono funzioni pure in testa al file; i `timestamptz` vengono normalizzati in ISO UTC con `new Date(x).toISOString()`
   così il confronto lessicografico delle date usato dalle pagine funziona come nella demo.
4. **Errori:** un'eccezione Postgres il cui messaggio inizia con `rule.` diventa `RuleViolation(keys)`;
   più motivi arrivano uniti da virgola (`'rule.max_reports,rule.too_far'`) e vengono separati.
   Tutto il resto (rete, Storage, Auth, errori SQL imprevisti) finisce in `console.error` e diventa
   `RuleViolation(['common.error'])`. Le pagine continuano a usare `errorKeys(e)` / `<ErrorBox>`.

## Sessione

| Metodo | Supabase |
| --- | --- |
| `requestOtp(phone)` | `auth.signInWithOtp({ phone })`. Il numero è normalizzato in E.164: senza `+` si assume `+39` (app per Firenze). Nessun `demoCode`. |
| `verifyOtp(phone, code, displayName?)` | `auth.verifyOtp({ phone, token, type: 'sms' })`. Il profilo nasce dal trigger `on_auth_user_created`; se `displayName` è indicato e il profilo ha ancora il nome di default (`Utente 1234`) viene aggiornato (`profiles.display_name`, colonna concessa). Errori → `rule.invalid_otp`. |
| `getSession()` | `auth.getSession()` + riga di `profiles` + `venue_owners`/`venues.claimed_by` (→ `venueIds`) + `companies.owner_user_id` (→ `companyId` se `profiles.company_id` è nullo). Il ruolo in `app_metadata.role` del JWT ha la precedenza sulla colonna, come `current_profile_role()` in SQL. Il risultato è in cache finché cambiano auth, profili, locali o ditte. |
| `signOut()` | `auth.signOut()`; svuota la cache del profilo e degli URL firmati. |
| `signInDemo`, `listDemoPersonas`, `resetDemo` | lanciano `RuleViolation(['rule.not_allowed'])`: niente demo in produzione. |

Nota: la UI (`AuthPage`) già nasconde i personaggi demo quando `store.mode === 'supabase'`.

## Tabelle, viste e RPC usate per ogni metodo

| Metodo | Lettura | Scrittura / RPC |
| --- | --- | --- |
| `listVenues(filter)` | `venues` (filtri `status`/`type` lato server, testo lato client) | — |
| `getVenue(id)` | `venues` | — |
| `nearestVenues(lat, lng, limit)` | — | `nearest_venues(p_lat, p_lng, p_limit)` → `distance_m` |
| `claimVenue(venueId, _, {vat, phone})` | `venue_claims` (rilettura della richiesta appena creata) | `claim_venue(p_venue_id, p_vat, p_phone)`: crea una richiesta `in_verifica` e avvisa la moderazione; **non** rende titolare. Seconda richiesta in attesa → `rule.claim_pending`. Restituisce `{ venue, claim }` |
| `listVenueClaims({status?, userId?})` | `venue_claims` (RLS: le proprie righe; tutte per la moderazione; anon → `[]`) | — |
| `decideVenueClaim(claimId, accept, _, note)` | — | `decide_venue_claim(p_claim_id, p_accept, p_note)`: approvata → `venues.claimed_by`, riga in `venue_owners`, ruolo `utente` → `locale`, avviso al richiedente; rifiutata → nota come motivo nell'avviso. `rule.already_decided` se già decisa |
| `setVenuePremium(venueId, months)` | — | `set_venue_premium(p_venue_id, p_months)` (beta: pagamento simulato, audit lo dice) |
| `listReportsForVenue(venueId, {includeHidden})` | vista `public_reports`; con `includeHidden` anche tabella `reports` (la RLS dà le proprie righe, tutte alla moderazione) | — |
| `listReportsByUser(userId)` | `reports` (proprie o moderazione) | — |
| `listAllReports()` | `reports` ∪ `public_reports` | — |
| `getReport(id)` | `reports`, poi `public_reports` | — |
| `countReportsThisMonth(userId)` | — | `count_reports_this_month(p_user_id)` |
| `submitReport(input)` | `venues`, conteggio mese | upload in `report-photos/<uid>/<file>` → `submit_report(p_*)` → Edge Function `ai-photo-check` `{ reportId }` → rilettura della riga |
| `listModerationQueue()` | `reports` where `state = in_verifica` (solo moderazione) | — |
| `setReportPhotoBlurred(reportId, photo)` | — | data URL: upload in `report-photos/blurred/<reportId>/<file>`; URL firmato ("nessun volto"): copia del file originale in `blurred/<reportId>/` → `set_report_blurred(p_report_id, p_new_photo_path)` (rifiuta percorsi nella cartella `<user_id>/`: comparirebbero nella vista pubblica) |
| `moderateReport(reportId, decision, _, note)` | — | `moderate_report(p_report_id, p_decision, p_note)` |
| `removeReport(reportId, reason, requestedBy, _)` | — | `remove_report(p_report_id, p_reason, p_requested_by)` (scrive anche `removals`) |
| `blockUser(userId, _)` | — | `block_user(p_user_id)` |
| `unblockUser(userId, _)` | — | `unblock_user(p_user_id)` (0007) |
| `listReplies(reportId)` | `replies` | — |
| `addReply(reportId, _, text)` | — | `add_reply(p_report_id, p_text)` |
| `listCompanies()` | vista `companies_public` ∪ tabella `companies` (righe complete per membri/moderazione) | — |
| `getCompany(id)` | `companies`, poi `companies_public` | — |
| `acceptSameConditions(companyId)` | — | `accept_same_conditions(p_company_id)` |
| `sponsorCompany(companyId, months)` | — | `sponsor_company(p_company_id, p_months)` |
| `requestQuotes(reportId, _)` | `lead_purchases` | `request_quotes(p_report_id)` (idempotente) |
| `getLeadForReport(reportId)` | `leads`, `lead_purchases` | — |
| `listLeads(_)` | vista `leads_anonymised`; per i contatti acquistati: `leads`, `lead_purchases`, RPC `lead_details(p_lead_id)` + URL firmato della foto | — |
| `buyLead(leadId, _)` | `lead_purchases` | `buy_lead(p_lead_id)` (prezzo = `leads.price_cents`, uguale per tutti) |
| `submitQuote(leadId, _, amountCents, text)` | — | `submit_quote(p_lead_id, p_amount_cents, p_text)` |
| `listQuotesForLead(leadId)` | — | `quotes_for_lead(p_lead_id)` (ordine deciso dal server: sponsor attivi prima, mai la ditta del fondatore) |
| `acceptQuote(quoteId, _)` | — | `accept_quote(p_quote_id)` |
| `uploadCertificate(reportId, companyId, file, type, _)` | `reports`/`public_reports` (per `venue_id`) | upload in `certificates/<venue_id>/<file>` → `upload_certificate(p_report_id, p_company_id, p_file_path, p_intervention_type)` |
| `listCertificatesForVenue(venueId)` | `certificates` (pubblici se verificati) | — |
| `listPendingCertificates()` | `certificates` where non verificati né rifiutati | — |
| `verifyCertificate(id, _, accept, note)` | — | `verify_certificate(p_certificate_id, p_accept, p_note)` |
| `listNasNotices()` | `nas_notices` | — |
| `importNasNotice(input)` | — | `import_nas_notice(p_venue_name_raw, p_address_raw, p_source_url, p_published_at, p_summary)` |
| `linkNasNotice(noticeId, venueId, _)` | — | `link_nas_notice(p_notice_id, p_venue_id)` → segnalazione `source = nas` |
| `listRemovals()` | `removals` | — |
| `submitDsaNotice(reportId, contact, reason)` | — | `submit_dsa_notice(p_report_id, p_contact, p_reason)` (anche anonimi) |
| `listDsaNotices()` | moderazione: `dsa_notices`; altri: vista `dsa_notices_public` (senza contatto e motivo) | — |
| `decideDsaNotice(noticeId, decision, note, _)` | — | `decide_dsa_notice(p_notice_id, p_decision, p_note)` |
| `getStats()` | — | `get_stats()` (JSON già camelCase; il client riempie i contatori mancanti con 0) |
| `listNotifications(userId)` | `notifications` (solo le proprie) | — |
| `markNotificationRead(id)` | — | `update notifications set read = true` (colonna concessa) |
| `listAudit(limit)` | — | `list_audit(p_limit)` (solo moderazione) |

I parametri "attore" dell'interfaccia (`moderatorId`, `actorId`, `requesterId`, `uploaderId`, `companyId` in
`buyLead`/`submitQuote`) sono ignorati in produzione: il server usa sempre `auth.uid()` e il ruolo del JWT.
Nessun client può dichiararsi moderatore o un'altra ditta.

## Foto e certificati: URL firmati

I bucket `report-photos` e `certificates` sono **privati**. La UI usa `Report.photo`, `LeadView.photo` e
`Certificate.file` come `src` di `<img>`/link, quindi lo store, in ogni lettura, risolve i percorsi in
**URL firmati validi 1 ora** (`storage.createSignedUrls`, una sola chiamata per elenco, cache fino a 55 minuti).

Cosa deve aspettarsi la UI:

- `photo`/`file` è un URL `https://.../storage/v1/object/sign/...?token=...` oppure `''` quando non c'è
  file (segnalazioni NAS, certificato senza allegato) **o quando il chiamante non può leggerlo**
  (RLS dello Storage: le foto sono leggibili dal pubblico solo se la segnalazione è pubblicata/risolta,
  dall'autore, dalla ditta che ha acquistato il contatto e dalla moderazione). Le pagine già nascondono
  l'immagine quando `photo` è vuoto.
- Gli URL scadono: una pagina lasciata aperta più di un'ora deve ricaricare i dati (basta il refresh
  automatico di `useStoreData` quando arriva un evento) per avere URL freschi. Non salvare questi URL.
- In **scrittura** le pagine passano data URL come nella demo (`photo.dataUrl` della fotocamera,
  file del certificato letto con `FileReader`). Lo store converte il data URL in `Blob`, lo carica
  in `report-photos/<auth.uid()>/<ts>-<rnd>.<ext>` (o `certificates/<venue_id>/...`,
  `report-photos/blurred/<reportId>/...` per la versione sfocata dalla moderazione) e passa il percorso alla RPC.
  MIME ammessi: `image/jpeg`, `image/png`, `image/webp` per le foto; in più `application/pdf` per i certificati.
  Un data URL malformato lancia `RuleViolation(['photo.unreadable'])`.
- `photoHash` è lo SHA-256 dei byte della foto (fallback FNV-1a come la demo): il trigger rifiuta la stessa
  foto inviata due volte dallo stesso utente (`rule.duplicate_photo`).
- Se l'upload riesce ma la RPC `submit_report` fallisce (es. `rule.max_reports`), il file resta nel bucket
  nella cartella dell'utente (gli utenti non possono cancellare): un cron di pulizia può rimuovere gli
  oggetti non referenziati da `reports.photo_path`.

## Invio di una segnalazione e filtro automatico

1. `getSession()` → `rule.login_required` se assente.
2. `canSubmitReport` locale con `enforceCamera: true` (produzione: solo fotocamera in-app; `file_demo` è
   rifiutato sia qui sia dal trigger con `rule.camera_only`). Serve a non caricare una foto destinata a
   essere rifiutata; non sostituisce il server.
3. Upload della foto, poi `submit_report`. Le violazioni del trigger arrivano insieme
   (`rule.max_reports,rule.too_far`) e la UI le mostra tutte.
4. `functions.invoke('ai-photo-check', { body: { reportId } })` con il JWT dell'utente (la funzione accetta
   l'autore della segnalazione, oltre a service_role e moderazione): la Edge Function legge la foto con il
   service role, interroga il modello e chiama `apply_ai_check` (→ `scartata` solo se `non_coerente`
   sotto soglia, altrimenti resta `in_verifica`). Il client poi rilegge la riga e costruisce `aiCheck`
   dalle colonne `ai_*`.
5. Se la funzione non risponde, la segnalazione resta `in_verifica` (decide un umano) e
   `SubmitReportResult.aiCheck` è `{ verdict: 'incerta', score: 0.5, reasons: ['ai.verdict.incerta'], simulated: false }`.

## Contatti per le ditte (`listLeads`)

La vista `leads_anonymised` espone zona, categoria, prezzo, `purchases_count` e `purchased_by_me`, mai il
locale. Per mantenere `Lead.purchases.length` esatto senza rivelare le altre ditte, gli acquisti altrui
compaiono come `{ companyId: '', paidCents, createdAt }`: la UI deve trattare `companyId === ''` come
"un'altra ditta". Per i contatti acquistati `reportId`/`venueId` arrivano dalla tabella `leads` (visibile
all'acquirente) e `venueName`, `venueAddress`, `venuePhone`, `photo` dalla RPC `lead_details`. Per quelli
non acquistati `reportId` e `venueId` sono `''`.

## Aggiornamenti in tempo reale (`subscribe`)

- Alla prima iscrizione lo store apre il canale `db-changes` con
  `on('postgres_changes', { event: '*', schema: 'public' })` e si registra a `auth.onAuthStateChange`;
  alla rimozione dell'ultimo ascoltatore chiude entrambi. Gli eventi sono raggruppati (150 ms) e poi
  notificati: `StoreProvider` incrementa `version`, `useStoreData` ricarica, `getSession()` viene riletto.
- Dopo ogni azione locale (invio, replica, acquisto, moderazione...) lo store notifica subito, senza
  aspettare Realtime: la UI si aggiorna anche se il canale non è disponibile.
- Realtime consegna solo le tabelle della pubblicazione `supabase_realtime` (migrazioni
  `0006_realtime.sql` e `0008_venue_claims_client.sql`) e solo le righe che il chiamante potrebbe leggere con una SELECT (RLS). In pratica:
  il pubblico anonimo riceve `venues` (lo stato del locale cambia a ogni pubblicazione), `replies`,
  `certificates`, `removals`, `nas_notices`; l'autore riceve le proprie `reports`, `notifications` e `venue_claims`; la
  moderazione tutto (compresa ogni nuova rivendicazione). Le viste non emettono eventi.
- `INITIAL_SESSION` e `TOKEN_REFRESHED` non provocano ricaricamenti; `SIGNED_IN`, `SIGNED_OUT`,
  `USER_UPDATED` sì (e invalidano il profilo in cache).

## Cosa cambia per chi usa lo store rispetto alla demo

| Aspetto | Demo (`LocalStore`) | Produzione (`SupabaseStore`) |
| --- | --- | --- |
| id | `r_abc123` | uuid; un id non uuid (`getVenue('v_1')`) restituisce `null`, non un errore |
| `Report.userId` | sempre presente | `''` nelle righe lette dalla vista pubblica (identità del segnalante protetta) |
| `Company.ownerUserId` | sempre presente | `''` nelle righe della vista pubblica; completo per membri e moderazione |
| `DsaNotice.contact`/`reason` | sempre presenti | `''` per chi non è moderatore (vista `dsa_notices_public`) |
| Titolare e segnalazioni nascoste | `includeHidden` mostra tutto | il titolare vede solo quelle pubbliche (nessuna policy sulla tabella per i titolari: proteggerebbe male `user_id`) |
| `captureMode: 'file_demo'` | accettato | rifiutato (`rule.camera_only`) |
| Foto | data URL | URL firmato 1 h o `''` |
| Pagamenti (Premium, sponsor) | immediati | RPC chiamabili dal titolare/ditta nella beta ("pagamento simulato" nell'audit); con pagamenti reali solo il webhook (service role) |
| Rivendicazione del locale | coda `in_verifica` in memoria, approvata da Chiara (scheda "Rivendicazioni") | stessa coda in `venue_claims`; `decide_venue_claim` scrive `claimed_by`, `venue_owners` e il ruolo |
| Codice OTP | mostrato in pagina | arriva via SMS; in locale `config.toml` ha numeri di prova con codice fisso |

## Verifica

```sh
npm run typecheck     # tsc -p tsconfig.app.json --noEmit
npx oxlint src/data/supabaseStore.ts
supabase start && supabase db reset   # applica 0001..0008 e seed.sql
```

Con `.env.local` puntato all'istanza locale (`supabase status` mostra URL e anon key) l'app parte in modalità
`supabase`: accesso con uno dei numeri di prova in `config.toml`, poi i flussi di `docs/ARCHITETTURA.md`.
