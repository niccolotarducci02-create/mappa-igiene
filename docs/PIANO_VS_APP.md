# Dal piano all'app: dove sta ogni requisito

Riferimento: documento "Mappa dell'Igiene – Piano Firenze". Per ogni riga del piano, cosa fa l'app e dove.

## Il prodotto

| Piano | App | Dove |
| --- | --- | --- |
| Mappa di Firenze con stato per ogni bar e ristorante: nessuna segnalazione, in verifica, confermata, risolta | Mappa Leaflet con pin colorati per stato, filtri, ricerca, elenco, legenda | `src/pages/MapPage.tsx`, `src/components/map/` |
| Lo stato nasce da segnalazioni con foto e dai comunicati NAS | Stato derivato dalle segnalazioni (`deriveVenueStatus`); comunicati NAS importati e collegati dalla moderazione diventano segnalazioni con fonte "NAS" | `src/domain/stateMachine.ts`, `src/pages/NasPage.tsx`, scheda "Comunicati NAS" in moderazione |
| Il locale risponde dentro l'app e dimostra la risoluzione con il certificato di una ditta | Replica accanto alla segnalazione; caricamento certificato; verifica della moderazione; stato "risolta" | `src/pages/VenueManagePage.tsx`, `src/components/manage/` |
| Le ditte pagano per ricevere i contatti | Portale ditte: contatti anonimizzati, acquisto (30 €), dettagli del locale dopo l'acquisto, preventivi | `src/pages/CompanyPage.tsx`, `src/components/company/` |

## Le quattro regole

| Regola | Come la applica il codice |
| --- | --- |
| 1. Mai una lista nera | Si pubblicano solo "segnalazioni degli utenti" con prova; le segnalazioni scartate o archiviate non compaiono mai (`isPubliclyVisible`); i testi spiegano che lo stato è la segnalazione di chi l'ha inviata, non un giudizio dell'app |
| 2. Foto in app, GPS, ora, utente verificato | `canSubmitReport`: utente verificato (OTP/SPID), consenso, massimo 3 al mese, foto dalla fotocamera in app (in produzione), scatto entro 30 minuti, distanza ≤ 150 m; in demo l'upload è accettato ma marcato "file_demo" |
| 3. Diritto di replica, 7 giorni | `moderate()` fissa `replyDeadlineAt`; la replica compare accanto alla segnalazione; dopo 7 giorni lo stato resta "confermata" e diventa definitivo (`isDefinitive`) |
| 4. Nessun inserzionista tocca le segnalazioni | Nessuna API di rimozione per ditte o locali; motivi di rimozione chiusi (`REMOVAL_REASONS`, senza "pagamento"); prezzo identico per tutte le ditte (`priceForCompany`); la ditta del fondatore non ha mai priorità (`sortQuotesForVenue`); registro pubblico delle rimozioni |

## Flusso di una segnalazione (11 passi, 2 decisioni)

| Passo del piano | Nell'app |
| --- | --- |
| Il cliente scatta la foto in app | Passo 2 del flusso di segnalazione: fotocamera (`getUserMedia`), ripiego con caricamento in demo |
| Foto coerente? (filtro automatico) | Demo: euristica locale marcata "simulato"; produzione: Edge Function `ai-photo-check` con modello di visione |
| Scartata, avviso al cliente | Stato `scartata` + notifica all'utente |
| Verifica umana entro 24 ore | Coda di moderazione con indicatore SLA 24 h |
| Confermata? | Pulsanti "Conferma e pubblica" / "Archivia" (con nota) |
| Pubblicata, avviso al locale | Stato `pubblicata`, notifica ai titolari, scadenza replica a 7 giorni |
| Il locale replica entro 7 giorni | Riquadro di replica con conto alla rovescia |
| Chiede preventivi | "Chiedi preventivi": crea un contatto (30 €, massimo 3 ditte) |
| 3 ditte partner: contatto 30 € | Portale ditte: acquisto simulato in demo, Stripe in produzione |
| Certificato | Caricamento del certificato dal titolare (o dalla ditta), verifica in moderazione |
| Stato: risolta | `resolveWithCertificate` |

## Chi paga cosa

| Piano | App |
| --- | --- |
| Utenti: niente | Nessun pagamento lato utente |
| Locali: Premium 20 €/mese | Scheda Premium nella gestione del locale (avviso immediato, certificati in evidenza); dichiarato che non tocca le segnalazioni |
| Ditte: 30 € a contatto, oppure 10% su interventi 150-500 € | `LEAD_PRICE_CENTS`, `COMMISSION_PCT`, `COMMISSION_MIN/MAX_CENTS` mostrati nella tabella prezzi; in demo solo la tariffa fissa |
| Ditte, visibilità: 100 €/mese | Sponsorizzazione: scheda in evidenza nella città e primo posto nella lista dei preventivi (mai per la ditta del fondatore) |

## Rischi e contromisure

| Rischio | Contromisura nell'app |
| --- | --- |
| Causa per diffamazione | Solo foto in app e stato "confermata"; replica sempre visibile; rimozione entro 48 ore (coda DSA con SLA); registro pubblico |
| Segnalazioni false | Utente verificato, foto non dalla galleria (produzione), 3 al mese, blocco di utente e dispositivo, foto duplicate rifiutate |
| Accusa di "racket" | Regola 4 nei termini, nessun percorso di rimozione a pagamento, registro delle rimozioni consultabile |
| GDPR: volti e dati | Sfocatura obbligatoria prima della pubblicazione (`rule.blur_required`), identità dell'autore mai pubblica, informativa privacy, conservazione limitata |
| Digital Services Act | Modulo di segnalazione, punto di contatto, decisione entro 48 ore, rapporto di trasparenza |
| Pochi utenti | Comunicati NAS in mappa dal giorno 1, adesivo con QR per ogni locale, versione in inglese |
| Conflitto d'interesse con la ditta del fondatore | Ditta del fondatore presente nei dati demo con le stesse condizioni: stesso prezzo, nessuna priorità, nessun accesso alle segnalazioni |

## Cosa resta fuori dall'app (per scelta del piano)

* Parere legale, lettere d'intenti con le ditte, interviste ai ristoratori: attività del fondatore (Cancello 1).
* Login SPID/CIE: previsto in produzione tramite provider; in demo c'è solo il telefono.
* Pagamenti reali: Stripe è pronto nelle Edge Functions; nella demo i pagamenti sono simulati e dichiarati tali.
* Rilevamento automatico dei volti: in demo la sfocatura è manuale; in produzione la propone la Edge Function.
