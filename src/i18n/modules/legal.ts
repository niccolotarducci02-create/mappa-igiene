/**
 * Testi del modulo "legal": le 4 regole (/regole), Termini d'uso (/termini), Informativa privacy (/privacy)
 * e modulo DSA (/dsa). I testi lunghi sono spezzati in paragrafi numerati (`terms.s1.p1`, `terms.s1.p2`, …)
 * ed elenchi (`privacy.s2.l1`, …): le pagine li raccolgono finché la chiave esiste nel dizionario.
 * I segnaposto da compilare prima del lancio sono tra parentesi quadre: la pagina li evidenzia.
 * Le variabili ({distance}, {hours}, {lead}…) vengono dai numeri di src/domain/rules.ts.
 */
export const legal = {
  it: {
    /* comuni */
    'legal.draft': 'Bozza di lavoro da far rivedere a un avvocato prima del lancio.',
    'legal.placeholder_legend': 'I testi tra parentesi quadre sono segnaposto da compilare prima del lancio.',
    'legal.placeholder': 'segnaposto da compilare',
    'legal.toc': 'Indice',
    'legal.version': 'Versione: bozza 0.1',
    'legal.see_rules': 'Le 4 regole',
    'legal.see_terms': "Termini d'uso",
    'legal.see_privacy': 'Informativa privacy',
    'legal.see_transparency': 'Rapporto di trasparenza',
    'legal.see_dsa': 'Segnala un contenuto (DSA)',
    'legal.contact_select_hint': 'Indirizzo selezionabile: copialo nel tuo programma di posta.',

    /* le 4 regole */
    'rules.eyebrow': "Parte integrante dei Termini d'uso",
    'rules.title': 'Le quattro regole',
    'rules.subtitle': 'Non negoziabili. Valgono per il codice dell\'app, per i testi che leggi e per chiunque ci paghi.',
    'rules.rule_label': 'Regola {n}',
    'rules.how_label': 'Come lo applichiamo',
    'rules.how.1':
      'La mappa mostra "segnalazioni degli utenti" con foto, non voti né giudizi dell\'app. Ogni segnalazione passa un filtro automatico sulla foto, poi una verifica umana entro {hours} ore; il locale ha {days} giorni per replicare prima che lo stato diventi definitivo. I comunicati NAS sono riportati come fonte pubblica, con il link all\'originale. Le segnalazioni scartate o archiviate non compaiono mai.',
    'rules.how.2':
      'La foto si scatta solo con la fotocamera dentro l\'app: la galleria non è disponibile. L\'app registra la posizione GPS, che deve trovarsi entro {distance} m dal locale, e l\'ora dello scatto, al massimo {minutes} minuti prima dell\'invio. Si segnala solo con numero di telefono verificato via SMS oppure con SPID/CIE, al massimo {maxReports} volte al mese.',
    'rules.how.3':
      'Alla pubblicazione il locale riceve un avviso. La replica si scrive nell\'app e compare accanto alla segnalazione, nella stessa scheda, con la stessa evidenza e senza modifiche da parte nostra. Dopo {days} giorni lo stato diventa definitivo, ma replicare resta sempre possibile; un certificato di intervento verificato porta la segnalazione a "risolta".',
    'rules.how.4':
      'Nel software non esiste alcun comando con cui una ditta o un inserzionista possa modificare, nascondere o rimuovere una segnalazione. Le rimozioni le fa solo la moderazione, per i motivi elencati nei Termini, entro {removalHours} ore dalla richiesta, e ognuna finisce nel registro pubblico con data, locale e motivo. La ditta del fondatore paga le stesse tariffe di tutte le altre e non ha mai priorità nei preventivi.',
    'rules.footer':
      'Queste quattro regole fanno parte dei Termini d\'uso. Non possono essere modificate senza un avviso a tutti gli utenti, dato nell\'app con almeno 30 giorni di anticipo.',

    /* termini d'uso */
    'terms.eyebrow': 'Documento legale',
    'terms.title': "Termini d'uso",
    'terms.subtitle': 'Che cos\'è Mappa dell\'Igiene, che cosa pubblica e a quali condizioni la si usa.',
    'terms.s1.title': 'Chi siamo e cosa pubblichiamo',
    'terms.s1.p1':
      'Mappa dell\'Igiene è un servizio web gestito da [Ragione sociale], con sede in [indirizzo], Firenze (di seguito "noi" o "il Servizio"). Mostra su una mappa di Firenze bar, ristoranti e altri esercizi di ristorazione e, per ciascuno, le segnalazioni sullo stato igienico inviate dagli utenti e i comunicati pubblici dei NAS (Carabinieri per la tutela della salute).',
    'terms.s1.p2':
      'Pubblichiamo "segnalazioni degli utenti" accompagnate da una prova fotografica, dall\'ora e dalla posizione dello scatto, e dalla replica del locale. Non esprimiamo mai un giudizio nostro sul locale, non assegniamo voti, non compiliamo classifiche e non teniamo alcuna lista nera. Lo stato mostrato in mappa ("in verifica", "confermata", "risolta") descrive solo la fase in cui si trova la segnalazione, non la qualità dell\'esercizio.',
    'terms.s1.p3': 'Le quattro regole pubblicate nella pagina "Le 4 regole" fanno parte integrante di questi Termini.',
    'terms.s2.title': 'Chi può segnalare e come',
    'terms.s2.p1':
      'Può inviare una segnalazione solo chi ha un account verificato tramite numero di telefono (codice via SMS) oppure tramite SPID o CIE. Non sono ammesse segnalazioni anonime.',
    'terms.s2.p2':
      'La foto va scattata con la fotocamera dentro l\'app, nel momento della segnalazione: non si possono caricare immagini dalla galleria o da altre fonti. L\'app registra la posizione GPS, che deve trovarsi entro {distance} m dal locale, e l\'ora dello scatto, che non può precedere l\'invio di più di {minutes} minuti.',
    'terms.s2.p3':
      'Ogni utente può inviare al massimo {maxReports} segnalazioni al mese. Il limite serve a scoraggiare le segnalazioni in serie e non è derogabile.',
    'terms.s2.p4':
      'È vietato inviare contenuti falsi, manipolati, offensivi o diffamatori, che riguardino un locale diverso da quello fotografato o che mostrino persone riconoscibili senza necessità. L\'autore è responsabile di ciò che invia e dichiara che foto e descrizione corrispondono a quanto ha visto di persona. In caso di abuso l\'account e il dispositivo possono essere bloccati e le segnalazioni archiviate.',
    'terms.s3.title': 'Verifica e pubblicazione',
    'terms.s3.p1':
      'Ogni segnalazione passa prima da un filtro automatico che controlla se la foto è leggibile e coerente con un problema igienico in un locale. Se non lo è, la segnalazione viene scartata e l\'autore riceve un avviso con il motivo; nulla viene mostrato in mappa.',
    'terms.s3.p2':
      'Le segnalazioni che superano il filtro vengono esaminate da una persona entro {hours} ore. La moderazione sfoca i volti eventualmente presenti, verifica la coerenza tra foto, categoria, descrizione e locale, e decide se pubblicare ("confermata") o archiviare. Le segnalazioni archiviate non compaiono mai pubblicamente.',
    'terms.s3.p3':
      'Stati possibili di una segnalazione: in verifica, scartata dal filtro, archiviata, pubblicata (confermata), risolta con certificato, rimossa. Solo "pubblicata" e "risolta" sono visibili al pubblico.',
    'terms.s4.title': 'Diritto di replica',
    'terms.s4.p1':
      'Alla pubblicazione il locale riceve un avviso (se ha rivendicato la propria scheda) e ha {days} giorni per replicare dall\'app. La replica compare accanto alla segnalazione, nella stessa scheda e con la stessa evidenza, senza alcuna modifica da parte nostra, salvo contenuti illeciti.',
    'terms.s4.p2': 'Trascorsi {days} giorni lo stato "confermata" diventa definitivo. Replicare resta comunque sempre possibile.',
    'terms.s4.p3':
      'Il locale può dimostrare di avere risolto il problema caricando il certificato di intervento rilasciato da una ditta. Dopo la verifica della moderazione la segnalazione passa allo stato "risolta", che resta visibile insieme alla segnalazione originale e alla data della risoluzione.',
    'terms.s5.title': 'Rimozione',
    'terms.s5.p1':
      'Una segnalazione pubblicata viene rimossa solo per uno di questi motivi: prova insufficiente, foto non pertinente, locale sbagliato, contenuto illecito, richiesta DSA accolta, richiesta dell\'autore. La valutazione spetta esclusivamente alla moderazione.',
    'terms.s5.p2':
      'Le richieste di rimozione vengono decise entro {removalHours} ore. Se la prova non regge, la segnalazione scompare dalla mappa e viene iscritta nel registro pubblico delle rimozioni (pagina Trasparenza) con data, locale, motivo e chi l\'ha richiesta.',
    'terms.s5.p3':
      'Non esiste alcuna rimozione a pagamento. Nessun abbonamento, sponsorizzazione o acquisto di contatti dà il diritto di far modificare o rimuovere una segnalazione, né di vederla prima della pubblicazione.',
    'terms.s6.title': 'Inserzionisti e ditte partner',
    'terms.s6.p1':
      'Le ditte di disinfestazione e pulizie possono acquistare i contatti dei locali che, dopo una segnalazione pubblicata, chiedono preventivi: {lead} per contatto, fino a {maxBuyers} ditte per lo stesso contatto; in alternativa una commissione del {pct}% su interventi da {commMin} a {commMax}. Il contatto è anonimizzato finché non viene acquistato.',
    'terms.s6.p2':
      'Le ditte possono inoltre acquistare una scheda sponsorizzata a {sponsor} al mese, che le mette in evidenza nell\'elenco delle ditte e in testa alla lista dei preventivi. I locali possono sottoscrivere Premium a {premium} al mese, che comprende soltanto: avviso immediato (SMS/email in produzione) quando una segnalazione viene pubblicata, certificati di intervento verificati in evidenza sulla scheda pubblica, contrassegno Premium sul pin della mappa. Premium non cambia mai le segnalazioni né la loro visibilità.',
    'terms.s6.p3':
      'Che cosa non si compra, a nessun prezzo: la rimozione o la modifica di una segnalazione, l\'accesso a segnalazioni prima della pubblicazione, un trattamento diverso in moderazione, il nascondere lo stato del locale sulla mappa.',
    'terms.s6.p4':
      'Le condizioni economiche sono identiche per tutte le ditte, compresa quella del fondatore del Servizio, che paga le stesse tariffe, non riceve priorità nei preventivi e compare in elenco come tale. Ogni ditta accetta esplicitamente queste condizioni prima del primo acquisto.',
    'terms.s7.title': 'Segnalazione di contenuti illeciti (DSA)',
    'terms.s7.p1':
      'Ai sensi del Regolamento (UE) 2022/2065 (Digital Services Act), chiunque, compreso il locale interessato, può segnalarci un contenuto che ritiene illecito o contrario a questi Termini tramite il modulo nella pagina "Segnala un contenuto (DSA)". La richiesta deve riferirsi a una specifica segnalazione pubblicata e spiegarne i motivi.',
    'terms.s7.p2':
      'Decidiamo entro {removalHours} ore e comunichiamo l\'esito per iscritto al recapito indicato, con la motivazione. Se accogliamo la richiesta, la segnalazione viene rimossa e iscritta nel registro pubblico delle rimozioni. Chi non è d\'accordo con la decisione può chiederci un riesame rispondendo alla comunicazione e può rivolgersi all\'autorità competente o al giudice.',
    'terms.s7.p3':
      'Punto di contatto per le autorità e per gli utenti: {email}. Le decisioni, senza dati personali, sono pubblicate nel rapporto di trasparenza.',
    'terms.s8.title': 'Responsabilità e limiti',
    'terms.s8.p1':
      'Il Servizio è una piattaforma che ospita contenuti forniti da terzi (gli utenti) e riporta comunicati pubblici. Non siamo gli autori delle segnalazioni e non garantiamo che ogni segnalazione sia corretta, pur applicando in buona fede le verifiche descritte sopra.',
    'terms.s8.p2':
      'Agiamo con diligenza nella verifica, nella moderazione e nella risposta alle richieste di rimozione, e rimuoviamo tempestivamente i contenuti che risultano illeciti quando ne veniamo a conoscenza.',
    'terms.s8.p3':
      'Il Servizio è coperto da un\'assicurazione di responsabilità civile [compagnia e massimale da indicare]. Nei limiti consentiti dalla legge, la nostra responsabilità per danni derivanti dall\'uso del Servizio è limitata ai casi di dolo o colpa grave.',
    'terms.s8.p4': 'Il Servizio è offerto così com\'è; può essere sospeso per manutenzione o per cause fuori dal nostro controllo.',
    'terms.s9.title': 'Dati personali',
    'terms.s9.p1':
      'Il trattamento dei dati personali è descritto nell\'Informativa privacy, che fa parte di questi Termini. In sintesi: raccogliamo solo i dati necessari a far funzionare il Servizio, non pubblichiamo mai il nome o il numero di telefono di chi segnala e sfochiamo i volti prima della pubblicazione.',
    'terms.s10.title': 'Modifiche e legge applicabile',
    'terms.s10.p1':
      'Possiamo aggiornare questi Termini. Le modifiche sono comunicate nell\'app con almeno 30 giorni di preavviso; le quattro regole possono cambiare solo con lo stesso preavviso e in modo ben visibile. Continuare a usare il Servizio dopo l\'entrata in vigore significa accettare la nuova versione.',
    'terms.s10.p2':
      'Questi Termini sono regolati dalla legge italiana. Per ogni controversia è competente il Foro di Firenze, fatte salve le tutele inderogabili previste per i consumatori dal Codice del consumo.',

    /* privacy */
    'privacy.eyebrow': 'Documento legale',
    'privacy.title': 'Informativa sulla privacy',
    'privacy.subtitle': 'Come trattiamo i dati personali, ai sensi del Regolamento (UE) 2016/679 (GDPR) e del Codice privacy.',
    'privacy.s1.title': 'Titolare del trattamento',
    'privacy.s1.p1': 'Il titolare del trattamento è [Ragione sociale], con sede in [indirizzo], Firenze, partita IVA [numero].',
    'privacy.s1.p2': 'Per qualsiasi richiesta sui dati personali: {privacyEmail}. Responsabile della protezione dei dati (DPO): [nome e recapito, oppure "non nominato"].',
    'privacy.s2.title': 'Dati che trattiamo',
    'privacy.s2.p1': 'Raccogliamo solo i dati necessari a far funzionare il Servizio e a prevenire gli abusi.',
    'privacy.s2.l1': 'Identità e contatto: numero di telefono verificato con codice SMS, oppure identità verificata tramite SPID/CIE (riceviamo solo la conferma e un identificativo, non i documenti). Nome visualizzato scelto da te.',
    'privacy.s2.l2': 'Segnalazioni: foto scattata nell\'app, posizione GPS e ora dello scatto, categoria e descrizione, esito del filtro automatico e della moderazione.',
    'privacy.s2.l3': 'Dispositivo: un identificativo tecnico del dispositivo, usato solo per bloccare chi abusa del Servizio.',
    'privacy.s2.l4': 'Titolari di locali: nome, telefono, partita IVA del locale, repliche, certificati caricati, abbonamento Premium.',
    'privacy.s2.l5': 'Ditte partner: ragione sociale, partita IVA, zone servite e servizi, acquisti di contatti, preventivi, sponsorizzazioni.',
    'privacy.s2.l6': 'Richieste DSA: recapito indicato e motivazione della richiesta.',
    'privacy.s3.title': 'Finalità e basi giuridiche',
    'privacy.s3.l1': 'Esecuzione del servizio (art. 6.1.b GDPR): creazione dell\'account, ricezione, verifica e pubblicazione delle segnalazioni, repliche, richieste di preventivo, contatti, pagamenti e certificati.',
    'privacy.s3.l2': 'Legittimo interesse (art. 6.1.f): sicurezza alimentare e informazione del pubblico; prevenzione degli abusi (limite mensile, verifica dell\'identità, blocco di account e dispositivi); sicurezza e continuità del Servizio.',
    'privacy.s3.l3': 'Consenso (art. 6.1.a): comunicazioni facoltative e avvisi non necessari al servizio. Il consenso è revocabile in qualsiasi momento dal profilo.',
    'privacy.s3.l4': 'Obbligo di legge (art. 6.1.c): risposta alle richieste delle autorità, obblighi del Digital Services Act, obblighi fiscali e contabili.',
    'privacy.s4.title': 'Volti nelle foto e dati di chi segnala',
    'privacy.s4.p1':
      'Prima della pubblicazione la moderazione sfoca i volti e gli altri elementi che permettano di riconoscere le persone eventualmente presenti nella foto. Una segnalazione non viene pubblicata senza questo passaggio.',
    'privacy.s4.p2':
      'Non pubblichiamo mai il nome, il numero di telefono o altri dati identificativi dell\'autore di una segnalazione. Il locale vede la segnalazione e può replicare, ma non sa chi l\'ha inviata. I dati dell\'autore sono comunicati solo all\'autorità giudiziaria, su richiesta legittima.',
    'privacy.s5.title': 'Conservazione',
    'privacy.s5.l1': 'Segnalazioni scartate dal filtro o archiviate dalla moderazione: cancellate dopo 90 giorni, foto compresa.',
    'privacy.s5.l2': 'Segnalazioni pubblicate e risolte: visibili finché rilevanti e comunque al massimo 24 mesi dalla pubblicazione; poi anonimizzate e conservate solo come statistica.',
    'privacy.s5.l3': 'Registro pubblico delle rimozioni: 5 anni. Contiene il nome del locale, il motivo e la data, nessun dato degli autori.',
    'privacy.s5.l4': 'Account: finché attivo e per 12 mesi dopo l\'ultimo accesso. Documenti fiscali e di pagamento: 10 anni, come richiesto dalla legge.',
    'privacy.s6.title': 'Destinatari dei dati',
    'privacy.s6.p1':
      'I dati sono trattati per nostro conto, con contratto ai sensi dell\'art. 28 GDPR, da fornitori di hosting e database, invio di SMS, pagamenti e dal servizio di analisi automatica delle foto (il filtro). [Elenco dei fornitori e dei paesi da completare.] I dati restano nell\'Unione europea o sono trasferiti con le garanzie previste dal GDPR.',
    'privacy.s6.p2': 'Non vendiamo dati personali e non li cediamo a inserzionisti. Le ditte partner vedono i dati di contatto di un locale solo dopo che il locale ha chiesto preventivi e la ditta ha acquistato il contatto.',
    'privacy.s7.title': 'I tuoi diritti',
    'privacy.s7.p1':
      'Puoi chiedere l\'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità, e opporti al trattamento basato sul legittimo interesse. Puoi revocare il consenso in ogni momento. Scrivi a {privacyEmail}: rispondiamo entro 30 giorni.',
    'privacy.s7.p2':
      'Se ritieni che il trattamento violi la legge puoi presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it) o rivolgerti al giudice.',
    'privacy.s8.title': 'Valutazione d\'impatto (DPIA)',
    'privacy.s8.p1':
      'Il Servizio pubblica foto geolocalizzate che riguardano attività commerciali e possono toccare terzi. Per questo abbiamo svolto una valutazione d\'impatto ai sensi dell\'art. 35 GDPR [da completare e aggiornare prima del lancio]. Le misure principali: filtro automatico e verifica umana, sfocatura dei volti, dati minimi sull\'autore, limiti di conservazione, diritto di replica, registro pubblico delle rimozioni.',
    'privacy.s9.title': 'Cookie e archiviazione locale',
    'privacy.s9.p1':
      'Usiamo solo l\'archiviazione tecnica del browser (localStorage) per: lingua scelta, sessione di accesso, identificativo del dispositivo e, nella demo, i dati di prova. Nessun cookie di profilazione, nessun tracciamento pubblicitario, nessuno strumento di analisi di terze parti.',
    'privacy.s10.title': 'Contatti e aggiornamenti',
    'privacy.s10.p1': 'Titolare: [Ragione sociale], Firenze. Email per la privacy: {privacyEmail}. Punto di contatto DSA: {dsaEmail}.',
    'privacy.s10.p2': 'Questa informativa può essere aggiornata; la versione in vigore è sempre quella pubblicata in questa pagina, con la data dell\'ultima modifica. [Data dell\'ultima modifica.]',

    /* modulo DSA */
    'dsa.eyebrow': 'Digital Services Act',
    'dsa.title': 'Segnala un contenuto',
    'dsa.subtitle': 'Modulo di segnalazione ai sensi del Regolamento (UE) 2022/2065, art. 16. Per chiedere la verifica o la rimozione di una specifica segnalazione pubblicata.',
    'dsa.who_title': 'Chi può segnalare',
    'dsa.who_body': 'Chiunque: il locale interessato, un suo legale, un cliente, un\'associazione. Non serve un account.',
    'dsa.what_title': 'Cosa succede',
    'dsa.what.1': 'Riceviamo la richiesta e ti diamo subito un numero di pratica.',
    'dsa.what.2': 'Una persona della moderazione decide entro {removalHours} ore, guardando la foto, i dati dello scatto e la tua motivazione.',
    'dsa.what.3': 'Ti rispondiamo per iscritto al recapito indicato, con la motivazione della decisione.',
    'dsa.what.4': 'Se accogliamo la richiesta, la segnalazione viene rimossa dalla mappa e iscritta nel registro pubblico delle rimozioni.',
    'dsa.what.5': 'Se non sei d\'accordo puoi chiedere un riesame rispondendo alla nostra comunicazione, e rivolgerti all\'autorità competente o al giudice.',
    'dsa.specific_title': 'Serve il codice della segnalazione',
    'dsa.specific_body': 'La richiesta deve riguardare una specifica segnalazione. Il codice si compila da solo se arrivi dalla scheda del locale, dal link "Segnala un contenuto illecito (DSA)" accanto alla segnalazione.',
    'dsa.form_title': 'Modulo',
    'dsa.form.report_id': 'Codice della segnalazione',
    'dsa.form.report_id_help': 'Esempio: r_abc123. Lo trovi nella scheda del locale.',
    'dsa.form.context': 'Segnalazione a cui si riferisce la richiesta',
    'dsa.form.not_found': 'Nessuna segnalazione con questo codice. Controlla il link nella scheda del locale.',
    'dsa.form.contact': 'Il tuo recapito (email o telefono)',
    'dsa.form.contact_help': 'Serve solo per risponderti. Non viene pubblicato.',
    'dsa.form.contact_invalid': 'Indica un\'email o un numero di telefono validi.',
    'dsa.form.reason': 'Perché chiedi la verifica o la rimozione',
    'dsa.form.reason_help': 'Almeno {min} caratteri. Spiega il fatto, non l\'opinione: ad esempio "la foto riguarda un altro locale", "la macchia è un\'ombra, allego perizia".',
    'dsa.form.reason_count': '{n} / {min} caratteri minimi',
    'dsa.form.reason_short': 'Scrivi almeno {min} caratteri.',
    'dsa.form.good_faith': 'Dichiaro in buona fede che le informazioni fornite sono accurate e complete.',
    'dsa.form.good_faith_required': 'Per inviare devi confermare la dichiarazione di buona fede.',
    'dsa.form.report_required': 'Indica il codice della segnalazione.',
    'dsa.form.submit': 'Invia la richiesta',
    'dsa.form.sending': 'Invio…',
    'dsa.success_title': 'Richiesta ricevuta',
    'dsa.success_body': 'Numero di pratica: {id}. Decideremo entro {hours} ore e ti risponderemo a {contact}. Conserva questo numero.',
    'dsa.success_registry': 'Le decisioni, senza dati personali, compaiono nel rapporto di trasparenza.',
    'dsa.success_another': 'Invia un\'altra richiesta',
    'dsa.contact_title': 'Punto di contatto',
    'dsa.contact_body': 'Per le autorità e per chi preferisce scrivere direttamente, il punto di contatto unico (art. 11 e 12 DSA) è:',
    'dsa.contact_placeholder_note': 'Indirizzo segnaposto: il dominio definitivo va inserito prima del lancio.',
    'dsa.privacy_note': 'Il recapito serve solo a risponderti e non viene pubblicato. Nelle "Decisioni DSA" della pagina Trasparenza compaiono solo data, esito e motivazione.',
    'dsa.report_date': 'Pubblicata il',
    'dsa.report_submitted': 'Inviata il',
  },
  en: {
    /* shared */
    'legal.draft': 'Working draft: to be reviewed by a lawyer before launch.',
    'legal.placeholder_legend': 'Text in square brackets is a placeholder to be filled in before launch.',
    'legal.placeholder': 'placeholder to fill in',
    'legal.toc': 'Contents',
    'legal.version': 'Version: draft 0.1',
    'legal.see_rules': 'The 4 rules',
    'legal.see_terms': 'Terms of use',
    'legal.see_privacy': 'Privacy notice',
    'legal.see_transparency': 'Transparency report',
    'legal.see_dsa': 'Flag content (DSA)',
    'legal.contact_select_hint': 'Selectable address: copy it into your email client.',

    /* the 4 rules */
    'rules.eyebrow': 'Part of the Terms of use',
    'rules.title': 'The four rules',
    'rules.subtitle': 'Non-negotiable. They bind the app\'s code, the words you read and anyone who pays us.',
    'rules.rule_label': 'Rule {n}',
    'rules.how_label': 'How we enforce it',
    'rules.how.1':
      'The map shows "user reports" with a photo, never scores or judgements by the app. Every report passes an automatic photo filter, then a human review within {hours} hours; the venue has {days} days to reply before the status becomes final. NAS notices are shown as a public source, with a link to the original. Discarded or archived reports never appear.',
    'rules.how.2':
      'The photo can only be taken with the camera inside the app: the gallery is not available. The app records the GPS position, which must be within {distance} m of the venue, and the capture time, at most {minutes} minutes before sending. You can report only with a phone number verified by SMS or with SPID/CIE, at most {maxReports} times a month.',
    'rules.how.3':
      'On publication the venue is notified. The reply is written in the app and appears next to the report, in the same card, with the same prominence and without edits by us. After {days} days the status becomes final, but replying is always possible; a verified intervention certificate moves the report to "resolved".',
    'rules.how.4':
      'There is no command in the software that lets a company or advertiser edit, hide or remove a report. Only moderation removes, for the reasons listed in the Terms, within {removalHours} hours of a request, and every removal goes into the public registry with date, venue and reason. The founder\'s company pays the same prices as everyone else and never gets priority in quotes.',
    'rules.footer':
      'These four rules are part of the Terms of use. They cannot be changed without notice to all users, given in the app at least 30 days in advance.',

    /* terms */
    'terms.eyebrow': 'Legal document',
    'terms.title': 'Terms of use',
    'terms.subtitle': 'What Nitido is, what it publishes and under which conditions you use it.',
    'terms.s1.title': 'Who we are and what we publish',
    'terms.s1.p1':
      'Nitido is a web service run by [Company name], based at [address], Florence (hereafter "we" or "the Service"). It shows bars, restaurants and other food businesses on a map of Florence and, for each one, hygiene reports sent by users and public notices by the NAS (the Carabinieri health protection unit).',
    'terms.s1.p2':
      'We publish "user reports" together with photo evidence, the time and position of the shot, and the venue\'s reply. We never express our own judgement of a venue, give scores, compile rankings or keep any blacklist. The status shown on the map ("under review", "confirmed", "resolved") only describes the stage the report is at, not the quality of the business.',
    'terms.s1.p3': 'The four rules published on the page "The 4 rules" are an integral part of these Terms.',
    'terms.s2.title': 'Who can report and how',
    'terms.s2.p1':
      'Only users with an account verified by phone number (SMS code) or by SPID or CIE can send a report. Anonymous reports are not accepted.',
    'terms.s2.p2':
      'The photo must be taken with the camera inside the app at the moment of reporting: images from the gallery or other sources cannot be uploaded. The app records the GPS position, which must be within {distance} m of the venue, and the capture time, which may not precede the submission by more than {minutes} minutes.',
    'terms.s2.p3': 'Each user may send at most {maxReports} reports per month. The limit discourages serial reporting and cannot be waived.',
    'terms.s2.p4':
      'It is forbidden to send content that is false, manipulated, offensive or defamatory, that concerns a venue other than the one photographed, or that shows recognisable people without need. The author is responsible for what they send and declares that photo and description match what they saw in person. In case of abuse the account and device may be blocked and the reports archived.',
    'terms.s3.title': 'Review and publication',
    'terms.s3.p1':
      'Every report first passes an automatic filter that checks whether the photo is readable and consistent with a hygiene problem in a venue. If it is not, the report is discarded and the author receives a notice with the reason; nothing is shown on the map.',
    'terms.s3.p2':
      'Reports that pass the filter are reviewed by a person within {hours} hours. Moderation blurs any faces, checks that photo, category, description and venue are consistent, and decides whether to publish ("confirmed") or archive. Archived reports never appear publicly.',
    'terms.s3.p3':
      'Possible states of a report: under review, discarded by the filter, archived, published (confirmed), resolved with certificate, removed. Only "published" and "resolved" are visible to the public.',
    'terms.s4.title': 'Right of reply',
    'terms.s4.p1':
      'On publication the venue is notified (if it has claimed its page) and has {days} days to reply from the app. The reply appears next to the report, in the same card and with the same prominence, without any edit by us, except for unlawful content.',
    'terms.s4.p2': 'After {days} days the "confirmed" status becomes final. Replying is always possible anyway.',
    'terms.s4.p3':
      'The venue can prove it has fixed the problem by uploading the intervention certificate issued by a company. After moderation verifies it, the report moves to "resolved", which stays visible together with the original report and the resolution date.',
    'terms.s5.title': 'Removal',
    'terms.s5.p1':
      'A published report is removed only for one of these reasons: insufficient evidence, irrelevant photo, wrong venue, unlawful content, DSA notice upheld, author\'s request. The assessment is made by moderation only.',
    'terms.s5.p2':
      'Removal requests are decided within {removalHours} hours. If the evidence does not hold, the report disappears from the map and is entered in the public removal registry (Transparency page) with date, venue, reason and who requested it.',
    'terms.s5.p3':
      'There is no paid removal. No subscription, sponsorship or purchase of contacts gives the right to have a report edited or removed, nor to see it before publication.',
    'terms.s6.title': 'Advertisers and partner companies',
    'terms.s6.p1':
      'Pest-control and cleaning companies can buy the contacts of venues that, after a published report, ask for quotes: {lead} per contact, up to {maxBuyers} companies for the same contact; alternatively a {pct}% commission on jobs from {commMin} to {commMax}. The contact is anonymised until bought.',
    'terms.s6.p2':
      'Companies can also buy a sponsored listing at {sponsor} per month, which highlights them in the company directory and at the top of the quote list. Venues can subscribe to Premium at {premium} per month, which includes only: an immediate alert (SMS/email in production) when a report is published, verified intervention certificates highlighted on the public page, and a Premium mark on the map pin. Premium never changes the reports or their visibility.',
    'terms.s6.p3':
      'What cannot be bought, at any price: the removal or editing of a report, access to reports before publication, different treatment in moderation, hiding the venue\'s status on the map.',
    'terms.s6.p4':
      'Commercial conditions are identical for all companies, including the one owned by the Service\'s founder, which pays the same prices, gets no priority in quotes and is labelled as such in the directory. Every company explicitly accepts these conditions before its first purchase.',
    'terms.s7.title': 'Reporting unlawful content (DSA)',
    'terms.s7.p1':
      'Under Regulation (EU) 2022/2065 (Digital Services Act), anyone, including the venue concerned, can notify us of content they consider unlawful or contrary to these Terms through the form on the page "Flag content (DSA)". The notice must refer to a specific published report and explain the reasons.',
    'terms.s7.p2':
      'We decide within {removalHours} hours and communicate the outcome in writing to the contact given, with reasons. If we uphold the request, the report is removed and entered in the public removal registry. Whoever disagrees with the decision can ask us for a review by replying to our message, and can turn to the competent authority or a court.',
    'terms.s7.p3': 'Point of contact for authorities and users: {email}. Decisions, without personal data, are published in the transparency report.',
    'terms.s8.title': 'Liability and limits',
    'terms.s8.p1':
      'The Service is a platform hosting content provided by third parties (users) and relaying public notices. We are not the authors of the reports and do not guarantee that every report is correct, although we apply the checks described above in good faith.',
    'terms.s8.p2':
      'We act diligently in reviewing, moderating and answering removal requests, and we promptly remove content that turns out to be unlawful once we become aware of it.',
    'terms.s8.p3':
      'The Service is covered by civil liability insurance [insurer and cover to be stated]. To the extent permitted by law, our liability for damage arising from use of the Service is limited to cases of wilful misconduct or gross negligence.',
    'terms.s8.p4': 'The Service is offered as is; it may be suspended for maintenance or for causes beyond our control.',
    'terms.s9.title': 'Personal data',
    'terms.s9.p1':
      'The processing of personal data is described in the Privacy notice, which is part of these Terms. In short: we collect only the data needed to run the Service, we never publish the name or phone number of whoever reports, and we blur faces before publication.',
    'terms.s10.title': 'Changes and applicable law',
    'terms.s10.p1':
      'We may update these Terms. Changes are announced in the app at least 30 days in advance; the four rules can change only with the same notice and in a clearly visible way. Continuing to use the Service after the changes take effect means accepting the new version.',
    'terms.s10.p2':
      'These Terms are governed by Italian law. The courts of Florence have jurisdiction over any dispute, without prejudice to the mandatory protections granted to consumers by the Italian Consumer Code.',

    /* privacy */
    'privacy.eyebrow': 'Legal document',
    'privacy.title': 'Privacy notice',
    'privacy.subtitle': 'How we process personal data, under Regulation (EU) 2016/679 (GDPR) and the Italian Privacy Code.',
    'privacy.s1.title': 'Data controller',
    'privacy.s1.p1': 'The data controller is [Company name], based at [address], Florence, VAT number [number].',
    'privacy.s1.p2': 'For any request about personal data: {privacyEmail}. Data Protection Officer (DPO): [name and contact, or "not appointed"].',
    'privacy.s2.title': 'Data we process',
    'privacy.s2.p1': 'We collect only the data needed to run the Service and to prevent abuse.',
    'privacy.s2.l1': 'Identity and contact: phone number verified with an SMS code, or identity verified through SPID/CIE (we receive only the confirmation and an identifier, not the documents). A display name chosen by you.',
    'privacy.s2.l2': 'Reports: photo taken in the app, GPS position and time of the shot, category and description, outcome of the automatic filter and of moderation.',
    'privacy.s2.l3': 'Device: a technical identifier of the device, used only to block whoever abuses the Service.',
    'privacy.s2.l4': 'Venue owners: name, phone, the venue\'s VAT number, replies, uploaded certificates, Premium subscription.',
    'privacy.s2.l5': 'Partner companies: company name, VAT number, areas and services, contact purchases, quotes, sponsorships.',
    'privacy.s2.l6': 'DSA notices: the contact given and the reasons for the request.',
    'privacy.s3.title': 'Purposes and legal bases',
    'privacy.s3.l1': 'Performance of the service (art. 6.1.b GDPR): account creation, receipt, review and publication of reports, replies, quote requests, contacts, payments and certificates.',
    'privacy.s3.l2': 'Legitimate interest (art. 6.1.f): food safety and public information; abuse prevention (monthly limit, identity verification, blocking of accounts and devices); security and continuity of the Service.',
    'privacy.s3.l3': 'Consent (art. 6.1.a): optional communications and alerts not needed for the service. Consent can be withdrawn at any time from your profile.',
    'privacy.s3.l4': 'Legal obligation (art. 6.1.c): answering requests from authorities, Digital Services Act duties, tax and accounting duties.',
    'privacy.s4.title': 'Faces in photos and the reporter\'s data',
    'privacy.s4.p1':
      'Before publication, moderation blurs faces and any other element that would make people in the photo recognisable. A report is not published without this step.',
    'privacy.s4.p2':
      'We never publish the name, phone number or other identifying data of a report\'s author. The venue sees the report and can reply, but does not know who sent it. The author\'s data is disclosed only to judicial authorities, on a lawful request.',
    'privacy.s5.title': 'Retention',
    'privacy.s5.l1': 'Reports discarded by the filter or archived by moderation: deleted after 90 days, photo included.',
    'privacy.s5.l2': 'Published and resolved reports: visible while relevant and in any case at most 24 months from publication; then anonymised and kept only as statistics.',
    'privacy.s5.l3': 'Public removal registry: 5 years. It holds the venue name, reason and date, no data about authors.',
    'privacy.s5.l4': 'Accounts: while active and for 12 months after the last sign-in. Tax and payment records: 10 years, as required by law.',
    'privacy.s6.title': 'Recipients',
    'privacy.s6.p1':
      'Data is processed on our behalf, under a contract pursuant to art. 28 GDPR, by providers of hosting and database, SMS delivery, payments and the automatic photo analysis service (the filter). [List of providers and countries to be completed.] Data stays in the European Union or is transferred with the safeguards provided by the GDPR.',
    'privacy.s6.p2': 'We do not sell personal data and do not pass it to advertisers. Partner companies see a venue\'s contact details only after the venue has asked for quotes and the company has bought the contact.',
    'privacy.s7.title': 'Your rights',
    'privacy.s7.p1':
      'You can ask for access to your data, rectification, erasure, restriction of processing, portability, and object to processing based on legitimate interest. You can withdraw consent at any time. Write to {privacyEmail}: we answer within 30 days.',
    'privacy.s7.p2':
      'If you believe the processing breaches the law you can lodge a complaint with the Italian Data Protection Authority (Garante, garanteprivacy.it) or go to court.',
    'privacy.s8.title': 'Impact assessment (DPIA)',
    'privacy.s8.p1':
      'The Service publishes geolocated photos that concern businesses and may touch third parties. For this reason we carried out a data protection impact assessment under art. 35 GDPR [to be completed and updated before launch]. Main measures: automatic filter and human review, face blurring, minimal data about the author, retention limits, right of reply, public removal registry.',
    'privacy.s9.title': 'Cookies and local storage',
    'privacy.s9.p1':
      'We use only the browser\'s technical storage (localStorage) for: chosen language, sign-in session, device identifier and, in the demo, the sample data. No profiling cookies, no advertising tracking, no third-party analytics.',
    'privacy.s10.title': 'Contacts and updates',
    'privacy.s10.p1': 'Controller: [Company name], Florence. Privacy email: {privacyEmail}. DSA point of contact: {dsaEmail}.',
    'privacy.s10.p2': 'This notice may be updated; the version in force is always the one published on this page, with the date of the last change. [Date of last change.]',

    /* DSA form */
    'dsa.eyebrow': 'Digital Services Act',
    'dsa.title': 'Flag content',
    'dsa.subtitle': 'Notice form under Regulation (EU) 2022/2065, art. 16. To ask for the review or removal of a specific published report.',
    'dsa.who_title': 'Who can notify',
    'dsa.who_body': 'Anyone: the venue concerned, its lawyer, a customer, an association. No account needed.',
    'dsa.what_title': 'What happens',
    'dsa.what.1': 'We receive the request and give you a case number right away.',
    'dsa.what.2': 'A person from moderation decides within {removalHours} hours, looking at the photo, the capture data and your reasons.',
    'dsa.what.3': 'We reply in writing to the contact you give, with the reasons for the decision.',
    'dsa.what.4': 'If we uphold the request, the report is removed from the map and entered in the public removal registry.',
    'dsa.what.5': 'If you disagree you can ask for a review by replying to our message, and turn to the competent authority or a court.',
    'dsa.specific_title': 'The report code is required',
    'dsa.specific_body': 'The request must concern a specific report. The code is filled in for you if you come from the venue page, through the link "Flag unlawful content (DSA)" next to the report.',
    'dsa.form_title': 'Form',
    'dsa.form.report_id': 'Report code',
    'dsa.form.report_id_help': 'Example: r_abc123. You find it on the venue page.',
    'dsa.form.context': 'Report this request refers to',
    'dsa.form.not_found': 'No report with this code. Check the link on the venue page.',
    'dsa.form.contact': 'Your contact (email or phone)',
    'dsa.form.contact_help': 'Used only to reply to you. Never published.',
    'dsa.form.contact_invalid': 'Enter a valid email address or phone number.',
    'dsa.form.reason': 'Why you ask for review or removal',
    'dsa.form.reason_help': 'At least {min} characters. Explain the fact, not the opinion: for instance "the photo shows another venue", "the stain is a shadow, expert report attached".',
    'dsa.form.reason_count': '{n} / {min} characters minimum',
    'dsa.form.reason_short': 'Write at least {min} characters.',
    'dsa.form.good_faith': 'I declare in good faith that the information provided is accurate and complete.',
    'dsa.form.good_faith_required': 'To send, confirm the good-faith declaration.',
    'dsa.form.report_required': 'Enter the report code.',
    'dsa.form.submit': 'Send the request',
    'dsa.form.sending': 'Sending…',
    'dsa.success_title': 'Request received',
    'dsa.success_body': 'Case number: {id}. We will decide within {hours} hours and reply to {contact}. Keep this number.',
    'dsa.success_registry': 'Decisions, without personal data, appear in the transparency report.',
    'dsa.success_another': 'Send another request',
    'dsa.contact_title': 'Point of contact',
    'dsa.contact_body': 'For authorities and for anyone who prefers to write directly, the single point of contact (art. 11 and 12 DSA) is:',
    'dsa.contact_placeholder_note': 'Placeholder address: the final domain must be set before launch.',
    'dsa.privacy_note': 'Your contact is used only to reply and is never published. The "DSA decisions" on the Transparency page show only date, outcome and reasons.',
    'dsa.report_date': 'Published on',
    'dsa.report_submitted': 'Sent on',
  },
}
