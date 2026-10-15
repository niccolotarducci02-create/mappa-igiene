# Nitido — checklist per la revisione legale

Documento di lavoro per l'avvocato che deve dare l'**ok legale del Gate 1** (il piano prevede: nessun lancio
pubblico senza parere legale e 5 ditte firmate). Per ogni tema: cosa va verificato, quale rischio copre e
**dove l'app già implementa l'obbligo**, con riferimento a rotte, tabelle e funzioni, così che la revisione
possa essere puntuale e non teorica.

Il prodotto in una riga: un'app per Firenze dove utenti verificati pubblicano **segnalazioni fotografiche**
su problemi igienici di bar e ristoranti; un filtro automatico e poi un **moderatore umano** verificano prima
della pubblicazione; il locale ha **diritto di replica** per 7 giorni e può dimostrare la risoluzione con un
certificato; **ditte di disinfestazione** pagano i contatti (30 €, massimo 3 ditte, stesso prezzo per tutte,
inclusa la ditta del fondatore). Le quattro regole non negoziabili sono in `src/domain/rules.ts` (`FOUR_RULES`)
e nella rotta `/regole`.

Non è un parere legale: è l'elenco dei punti da far verificare, con i riferimenti normativi che il team
ritiene pertinenti e che l'avvocato deve confermare o correggere.

---

## 0. Inquadramento preliminare (da decidere per primo)

| Domanda | Perché conta | Cosa c'è nell'app |
| --- | --- | --- |
| Il servizio è un **hosting provider** (art. 6 DSA, ex art. 16 d.lgs. 70/2003) o un **editore**? La moderazione preventiva umana rende il servizio "attivo": l'esenzione di responsabilità regge? | Decide chi risponde del contenuto diffamatorio: solo l'utente o anche la piattaforma. | Il copy pubblica sempre "segnalazione di un utente" con prova, mai un giudizio della piattaforma (regola 1, `isPubliclyVisible`, testi i18n in `src/i18n/modules/venue.ts`). La decisione di pubblicazione è registrata (`reports.moderator_id`, `audit_log`). |
| Siamo **piattaforma online** ai sensi del DSA (diffondiamo al pubblico contenuti degli utenti) e rientriamo nell'esenzione **micro/piccola impresa** (art. 19 DSA) per alcuni obblighi? | Determina quali articoli DSA sono obbligatori (artt. 11-18 per tutti gli hosting; artt. 20-28 solo piattaforme non micro/piccole). | Il team ha implementato comunque gli obblighi di trasparenza principali (vedi §3) per scelta di prodotto. |
| Forma giuridica e **conflitto d'interesse** del fondatore (titolare di una ditta che compra contatti). | Concorrenza sleale (art. 2598 c.c.), pratiche commerciali scorrette verso i locali (artt. 20-26 cod. consumo, se applicabili), trasparenza. | `companies.is_founder_company`, prezzo identico (`priceForCompany`, trigger `a_lead_purchases_before_insert` che impone `paid_cents = price_cents`), nessuna priorità nei preventivi (`sortQuotesForVenue`, `quotes_for_lead`), dichiarazione in `/come-funziona` e `/ditte`. |

---

## 1. Diffamazione e tutela della reputazione dei locali

Riferimenti da verificare: art. 595 c.p. (diffamazione, aggravante del mezzo), art. 21 Cost. e diritto di
critica/cronaca (verità, pertinenza, continenza), art. 2043 c.c., art. 2598 c.c. (denigrazione), Cass. su
recensioni online e responsabilità del gestore; art. 6 e 16 DSA.

| Da verificare | Rischio | Implementazione nell'app |
| --- | --- | --- |
| I testi dell'app non esprimono mai un giudizio proprio sul locale; "stato igienico" è presentato come **derivato dalle segnalazioni** verificate, non come certificazione. Rivedere ogni etichetta ("confermata", "risolta", "in verifica") e la legenda della mappa. | Qualificazione come editore; diffamazione diretta. | Stati e legenda in `src/domain/types.ts` (`VenueStatus`) e `MapPage`; derivazione automatica `deriveVenueStatus` / trigger `recompute_venue_status`. Copy in `src/i18n/modules/map.ts`, `venue.ts`. |
| Requisiti di **verità e prova**: foto scattata in app, GPS entro 150 m, ora entro 30 min, utente verificato. Sono sufficienti come "diligenza" della piattaforma? | Pubblicazione di contenuti falsi. | `canSubmitReport` e trigger `b_reports_validate_insert` (`rule.too_far`, `rule.capture_too_old`, `rule.camera_only`, `rule.verified_user_required`, `rule.duplicate_photo`). |
| **Continenza**: la descrizione dell'utente deve essere fattuale; la moderazione può archiviare testi offensivi. Serve un filtro automatico sul testo? | Insulti pubblicati. | Avviso all'utente `report.what.facts_reminder`; la moderazione archivia (`moderate_report` → `archiviata`) con nota. Nessun filtro automatico sul testo: da valutare. |
| **Diritto di replica** del locale, visibile accanto alla segnalazione, con 7 giorni prima che lo stato sia definitivo; avviso al locale alla pubblicazione, al giorno 5 e al giorno 7. | Mancato contraddittorio. | `add_reply`, `reports.reply_deadline_at` (+7 giorni, trigger `c_reports_set_dates`), notifiche `nuova_segnalazione_locale`, cron `reply-deadline-cron`. |
| **Rimozione**: solo la moderazione, solo per motivi elencati, entro 48 ore dalla contestazione; il motivo "pagamento" non esiste. Registro pubblico delle rimozioni. | Accuse di "paga e sparisce"; opacità. | `REMOVAL_REASONS`, `remove_report`, trigger `a_reports_guard_removal`, tabella `removals`, rotta `/trasparenza`. |
| **Procedura di contestazione** per il locale (oltre al DSA): chi, come, in quanto tempo risponde. | Richieste di risarcimento. | Modulo `/dsa/:reportId` (`submit_dsa_notice`), decisione entro 48 h (`decide_dsa_notice`), replica in app. Da scrivere nei termini. |
| Conservazione della **prova** (foto originale, hash, GPS, ora, identità del segnalante) per difendersi in giudizio e per rispondere all'autorità. | Impossibilità di difesa. | `reports.photo_hash`, `captured_at`, `lat/lng`, `distance_m`, `user_id`, `audit_log` append-only; la foto originale resta nel bucket privato finché la segnalazione è pubblica (la retention a 90 giorni riguarda solo scartate/archiviate). Verificare la durata di conservazione per le segnalazioni pubblicate/rimosse. |
| Comunicati **NAS**: ripubblicazione di atti pubblici con link alla fonte; rischio di collegare il comunicato al locale sbagliato. | Diffamazione per errore di persona. | `nas_notices` con `source_url`, collegamento manuale da un moderatore (`link_nas_notice`), descrizione "Comunicato NAS: …", stesso diritto di replica. |

---

## 2. Protezione dei dati personali (GDPR, d.lgs. 196/2003)

| Da verificare | Riferimento | Implementazione nell'app |
| --- | --- | --- |
| **Titolare**, contatti, eventuale **DPO** (probabilmente non obbligatorio: valutare art. 37). | artt. 13, 37 | Segnaposto nei testi di `/privacy` (`src/i18n/modules/legal.ts`). |
| **Basi giuridiche** per ciascun trattamento: account (contratto), segnalazioni e loro pubblicazione (interesse legittimo / interesse pubblico alla salute, art. 6.1.f ed e), geolocalizzazione (consenso o contratto), volti di terzi (minimizzazione + sfocatura), marketing (consenso). | art. 6 | `reports.consent_accepted` registrato a ogni invio; nessun marketing. |
| **DPIA** obbligatoria: trattamento su larga scala di immagini e posizione, possibile effetto reputazionale su terzi, uso di un sistema automatizzato (filtro IA) come supporto alla decisione. | art. 35; elenco Garante dei trattamenti soggetti a DPIA | Il filtro non decide da solo la pubblicazione: solo l'esclusione di foto palesemente non coerenti; ogni pubblicazione è umana (`moderate_report`). Documentare nella DPIA. |
| **Decisioni automatizzate** (art. 22): la foto "scartata" dal filtro è una decisione automatizzata con effetti sull'utente? Serve il riesame umano. | art. 22 | L'utente scartato riceve notifica e può reinviare; prevedere nei termini la richiesta di riesame da un moderatore (`ai-photo-check` con `force` dal moderatore; coda `/moderazione`). |
| **Minimizzazione**: il pubblico non vede chi ha segnalato; le ditte vedono solo zona e categoria finché non acquistano; dopo l'acquisto vedono dati del locale (non dell'utente). | art. 5.1.c | Vista `public_reports` senza `user_id`; `leads_anonymised`; `lead_details` solo dopo acquisto; `zone_for` anonimizza la posizione. |
| **Volti e terzi**: sfocatura obbligatoria prima della pubblicazione; il filtro IA segnala i volti. | artt. 5, 9 (eventuali dati sensibili in foto) | `rule.blur_required` in `moderate_report`; `reports.ai_faces_detected`, `ai_face_boxes` (0004); nelle regole di invio si chiede di non fotografare persone. |
| **Conservazione**: periodi definiti e applicati. Foto non pubblicate: 90 giorni. Segnalazioni pubblicate: finché il locale esiste? Rimosse: registro pubblico senza dati personali; foto? Audit: ? Notifiche: ? | art. 5.1.e | Cron `reply-deadline-cron` (90 giorni per scartate/archiviate, `photo_deleted_at`). Gli altri periodi vanno **decisi** e poi implementati (segnalare al team). |
| **Diritti degli interessati**: accesso, cancellazione, opposizione; procedura e tempi (30 giorni). Cosa succede alle segnalazioni pubblicate di un utente che cancella l'account. | artt. 15-22 | Cancellazione via `auth.admin.deleteUser` (cascata su `profiles`, `notifications`; `reports.user_id` ha `on delete restrict`: serve una procedura di anonimizzazione, da definire). Indirizzo `privacy@` da attivare. |
| **Responsabili del trattamento** e trasferimenti extra-UE: Supabase (DB e storage in UE, Frankfurt), Anthropic (API, USA — DPA, no training sui dati API, verificare retention), Stripe (DPA, USA/IE), Twilio (USA/IE), Resend (USA), Vercel/Netlify (CDN globale). Clausole standard / Data Privacy Framework. | artt. 28, 44-46 | Elenco da inserire in `/privacy`; DPA da firmare (docs/DEPLOY.md §13). |
| **Registro dei trattamenti**, misure di sicurezza (RLS, bucket privati, link firmati, chiavi segrete, audit). | artt. 30, 32 | `supabase/migrations/0002_policies.sql` (RLS su ogni tabella), bucket privati con policy, `audit_log` append-only, segreti in Supabase Vault. |
| **Data breach**: procedura 72 ore. | artt. 33-34 | Da scrivere; Supabase notifica incidenti all'owner. |
| **Minori**: l'uso richiede 18 anni? OTP non verifica l'età. | art. 8 | Clausola nei termini; da valutare autodichiarazione. |
| **Cookie/local storage**: solo tecnici (sessione, preferenze, tile cache). | art. 122 cod. privacy, Linee guida Garante 2021 | Nessun tracciamento né analytics di terzi nella PWA; banner non necessario se resta così (confermare). |
| **SMS OTP**: numero di telefono come dato identificativo; informativa al momento della raccolta. | art. 13 | Schermata `/accedi` (`AuthPage`) con rinvio a `/privacy`. |

---

## 3. Digital Services Act (Reg. UE 2022/2065) e normativa italiana di raccordo

L'avvocato deve confermare la qualifica (hosting / piattaforma online; micro-piccola impresa) e quali articoli
si applicano **per legge** e quali il team adempie **volontariamente** (il piano li considera parte del prodotto).

| Obbligo | Articolo | Implementazione nell'app |
| --- | --- | --- |
| **Punto di contatto per le autorità** e **per i destinatari del servizio**, pubblico e facilmente accessibile. | artt. 11, 12 | Rotta `/trasparenza` (`TransparencyPage`): email del punto di contatto (segnaposto da compilare), lingua di comunicazione. |
| **Termini e condizioni** chiari, con le regole di moderazione, le restrizioni e le procedure di reclamo. | art. 14 | `/termini`, `/regole` (le 4 regole), descrizione del flusso in `/come-funziona`. |
| **Rapporto di trasparenza** (frequenza almeno annuale; per micro/piccole imprese esente ma volontario). | art. 15 | Statistiche pubbliche in tempo reale in `/trasparenza` (`get_stats`): segnalazioni per stato, mediana dei tempi di moderazione, rimozioni, richieste DSA. Da affiancare un PDF annuale. |
| **Notice and action**: meccanismo per segnalare contenuti illeciti, con conferma di ricezione e decisione motivata, in tempi rapidi. | art. 16 | Modulo `/dsa/:reportId` (anche anonimo con contatto), tabella `dsa_notices`, notifica alla moderazione, decisione entro 48 h (`decide_dsa_notice`: "rimossa" → `remove_report` con motivo `richiesta_dsa_accolta`). Manca l'**email automatica** di conferma al segnalante DSA: da aggiungere (il contatto è salvato in `dsa_notices.contact`). |
| **Motivazione** della decisione all'utente il cui contenuto è rimosso. | art. 17 | Notifica `segnalazione_rimossa` con motivo; `removals.reason` pubblico; nota in `audit_log`. Verificare completezza (fatti, base giuridica/contrattuale, mezzi di ricorso). |
| **Segnalazione di reati** alle autorità (contenuti che fanno sospettare reati contro la vita/sicurezza). | art. 18 | Procedura interna da scrivere (chi, a chi: Polizia Postale / ASL per rischi sanitari). |
| **Sistema interno di gestione dei reclami** (piattaforme non micro/piccole). | art. 20 | Oggi: replica in app + modulo DSA + email. Se non esenti, serve un flusso di reclamo formale con esito entro un termine. |
| **Misure contro gli abusi** (sospensione di chi segnala in modo manifestamente infondato). | art. 23 | Limite 3 segnalazioni/mese (`MAX_REPORTS_PER_MONTH`), blocco utente e dispositivo (`block_user`, `blocked_devices`), foto duplicate rifiutate. Criteri e preavviso da scrivere nei termini. |
| **Trasparenza della pubblicità**: la scheda sponsorizzata della ditta deve essere riconoscibile come tale. | art. 26 | `companies.sponsor_until`; etichetta "sponsor" da verificare nella UI dei preventivi (`VenueManagePage`) e in `/ditte`. |
| **Coordinatore nazionale** (AGCOM) e iscrizione/registrazioni eventuali. | art. 49 ss.; d.lgs. 15 marzo 2024 n. 50 | Da verificare se dovuta. |

---

## 4. Termini d'uso e contratti

| Documento | Contenuti da verificare | Dove |
| --- | --- | --- |
| **Termini d'uso per gli utenti** | età minima, le 4 regole, cosa succede a una segnalazione (stati), limite 3/mese, blocco per abuso, licenza sulle foto (non esclusiva, per pubblicazione e prova), responsabilità dell'utente per falsità, foro, legge applicabile, recesso. | `/termini`, `/regole` (`src/i18n/modules/legal.ts`) |
| **Condizioni per i locali** (rivendica, replica, Premium 20 €/mese) | la rivendicazione è **moderata**: la richiesta (P.IVA + telefono dell'attività) resta `in_verifica` e nessuno replica "come il locale" finché la moderazione non la approva (`decide_venue_claim`); da fissare nei termini quali controlli si fanno (visura camerale, telefonata al locale) e in quanto tempo, e che il rifiuto è motivato. Poi: diritto di replica, Premium come servizio di notifica **senza** alcun effetto sulle segnalazioni, recesso e rimborsi, B2B. | `venue_claims`, `claim_venue` (`rule.invalid_vat`, `rule.claim_pending`), `decide_venue_claim`, scheda "Rivendicazioni" in `/moderazione`, `set_venue_premium`, `/locale/:id/gestisci` |
| **Contratto con le ditte** (contatti 30 €, sponsor 100 €/mese) | condizioni uguali per tutti (accettazione esplicita), max 3 ditte per contatto, nessun rimborso se il locale non risponde?, divieto di contatto molesto, uso dei dati del locale limitato al preventivo (sono dati personali del titolare: nomina a responsabile o titolare autonomo?), dichiarazione del conflitto d'interesse del fondatore. | `accept_same_conditions` (`same_conditions_ack`), `buy_lead` / `buy_lead_paid`, `lead_details`, `/ditte` |
| **Pagamenti e fiscalità** | Stripe come intermediario; fatturazione elettronica B2B (SDI) obbligatoria in Italia; IVA; ricevuta Stripe; politica rimborsi (es. contatto già completo: `payments.status = error` → rimborso manuale). | `payments-webhook`, `create-checkout-session`, tabella `payments` |
| **Informativa privacy** | vedi §2; una per gli utenti, una per i titolari dei locali (anche non iscritti: la loro attività è citata), una per le ditte. | `/privacy` |

---

## 5. Assicurazione

| Polizza | Perché | Nota per il broker |
| --- | --- | --- |
| **RC professionale / RC verso terzi** con estensione a **diffamazione e lesione della reputazione** (media liability). | Richieste di risarcimento dei locali. | Attività: piattaforma di segnalazioni con moderazione umana; volumi stimati (150 segnalazioni/mese). |
| **Cyber** (violazione dati, interruzione, spese legali e notifiche GDPR). | Foto, numeri di telefono, posizioni. | Misure in essere: RLS, bucket privati, MFA sull'account Supabase/Stripe, backup giornalieri. |
| **Tutela legale**. | Costi di difesa anche in caso di ragione. | |
| D&O se società di capitali. | | |

---

## 6. Altri punti

- **Marchio** "Nitido": deposito e verifica di anteriorità; dominio.
- **Comunicati NAS / ASL**: diritto di riutilizzo dei testi pubblici (d.lgs. 36/2006 e licenze dei siti
  istituzionali), citazione della fonte (`nas_notices.source_url`).
- **Mappe**: attribuzione OpenStreetMap (ODbL) obbligatoria nella mappa (verificare che compaia in `MapPage`).
- **Intelligenza artificiale** (AI Act, Reg. UE 2024/1689): il filtro foto è un sistema a **rischio limitato /
  minimo** come supporto alla moderazione; obbligo di trasparenza verso l'utente (l'app dice che la foto è
  valutata da un filtro automatico e poi da una persona: `/come-funziona`, schermata esito in `ReportPage`).
  Non è riconoscimento biometrico: i riquadri dei volti servono solo a sfocare, non identificano.
- **Accessibilità** (direttiva 2019/882, l. 4/2004 se applicabile): non obbligatoria per una micro impresa,
  ma la PWA segue contrasto e dimensioni minime.
- **Comunicazioni commerciali** (SMS/email): solo notifiche di servizio; nessun marketing senza consenso
  (art. 130 cod. privacy). Le funzioni `notify` inviano solo avvisi legati a un'azione dell'utente.

---

## 7. Cosa deve consegnare l'avvocato (output del Gate 1)

1. Parere scritto sulla qualificazione del servizio (hosting/piattaforma, micro impresa) e sul rischio
   diffamazione, con eventuali modifiche richieste ai testi e ai flussi.
2. Testi definitivi di: termini d'uso, condizioni locali, contratto ditte, informativa privacy (3 destinatari),
   pagina trasparenza DSA (punto di contatto), nota AI Act.
3. DPIA firmata, registro dei trattamenti, elenco responsabili con DPA, procedura data breach, procedura
   diritti degli interessati, politica di conservazione con i periodi mancanti (§2).
4. Procedura interna di moderazione: criteri di conferma/archiviazione, motivazioni standard, escalation
   (art. 18 DSA), tempi (24 h verifica, 48 h rimozione/DSA), registro.
5. Indicazioni per l'assicurazione (massimali) e per il commercialista (fatturazione elettronica).

Il team svilupperà le modifiche richieste prima dell'apertura al pubblico; le voci già marcate "da aggiungere"
in questo documento sono: email automatica di conferma al segnalante DSA, anonimizzazione delle segnalazioni
alla cancellazione dell'account, periodi di conservazione per audit/notifiche/segnalazioni pubblicate,
etichetta "sponsor" nella lista dei preventivi, eventuale filtro automatico sul testo delle descrizioni.
