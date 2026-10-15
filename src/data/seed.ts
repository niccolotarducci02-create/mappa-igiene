/**
 * Dati dimostrativi. Tutti i locali, le persone, le ditte e le segnalazioni sono INVENTATI:
 * i nomi non corrispondono ad attività reali. Le vie e le coordinate sono di Firenze.
 */
import type {
  Company,
  DsaNotice,
  NasNotice,
  Profile,
  Removal,
  Report,
  Reply,
  Venue,
  VenueType,
} from '../domain/types'
import { placeholderPhoto } from '../lib/photoCheck'
import { addDays, addHours } from '../domain/time'

export const DEMO_NOW = () => new Date().toISOString()

const d = (daysAgo: number, hour = 10) => {
  const t = new Date()
  t.setUTCDate(t.getUTCDate() - daysAgo)
  t.setUTCHours(hour, 0, 0, 0)
  return t.toISOString()
}

export const personas: Profile[] = [
  { id: 'u_giulia', displayName: 'Giulia (cliente)', role: 'utente', phone: '+39 333 000 0001', phoneVerified: true, spidVerified: false, createdAt: d(60) },
  { id: 'u_tourist', displayName: 'Mark (tourist)', role: 'utente', phone: '+44 7700 900001', phoneVerified: true, spidVerified: false, createdAt: d(3) },
  { id: 'u_marco', displayName: 'Marco (titolare Trattoria del Giglio)', role: 'locale', phone: '+39 333 000 0002', phoneVerified: true, spidVerified: true, venueIds: ['v_giglio'], createdAt: d(50) },
  { id: 'u_sara', displayName: 'Sara (titolare Bar Arnolfo)', role: 'locale', phone: '+39 333 000 0003', phoneVerified: true, spidVerified: false, venueIds: ['v_arnolfo'], createdAt: d(40) },
  { id: 'u_ditta1', displayName: 'Paolo (Disinfesta Toscana)', role: 'ditta', phoneVerified: true, spidVerified: false, companyId: 'c_disinfesta', createdAt: d(45) },
  { id: 'u_ditta2', displayName: 'Elena (PuliCasa Firenze)', role: 'ditta', phoneVerified: true, spidVerified: false, companyId: 'c_pulicasa', createdAt: d(44) },
  { id: 'u_founder', displayName: 'Lorenzo (ditta del fondatore)', role: 'ditta', phoneVerified: true, spidVerified: true, companyId: 'c_founder', createdAt: d(90) },
  { id: 'u_mod', displayName: 'Chiara (moderazione)', role: 'moderatore', phoneVerified: true, spidVerified: true, createdAt: d(90) },
  { id: 'u_admin', displayName: 'Admin', role: 'admin', phoneVerified: true, spidVerified: true, createdAt: d(90) },
]

export const companies: Company[] = [
  { id: 'c_disinfesta', name: 'Disinfesta Toscana Srl', vat: 'IT01234560481', zones: ['Centro storico', 'Oltrarno'], services: ['blatte', 'roditori', 'formiche', 'mosche'], ownerUserId: 'u_ditta1', sameConditionsAck: true, sponsorUntil: addDays(DEMO_NOW(), 20), phone: '+39 055 000 0001', email: 'info@disinfesta-demo.it' },
  { id: 'c_pulicasa', name: 'PuliCasa Firenze', vat: 'IT01234560482', zones: ['Centro storico', 'San Marco / Statuto'], services: ['sporcizia', 'muffa', 'alimenti', 'altro'], ownerUserId: 'u_ditta2', sameConditionsAck: true, phone: '+39 055 000 0002', email: 'ciao@pulicasa-demo.it' },
  { id: 'c_founder', name: 'Ditta del fondatore (demo)', vat: 'IT01234560483', zones: ['Centro storico', 'Oltrarno', 'Campo di Marte / Sant\'Ambrogio'], services: ['blatte', 'roditori', 'formiche', 'mosche', 'altro'], ownerUserId: 'u_founder', sameConditionsAck: true, isFounderCompany: true, phone: '+39 055 000 0003' },
  { id: 'c_verde', name: 'Verde Igiene Ambientale', vat: 'IT01234560484', zones: ['Oltrarno'], services: ['blatte', 'roditori'], ownerUserId: 'u_none', sameConditionsAck: false, phone: '+39 055 000 0004' },
]

type V = [id: string, name: string, type: VenueType, address: string, lat: number, lng: number]
const venueRows: V[] = [
  ['v_giglio', 'Trattoria del Giglio Rosso', 'trattoria', 'Via dei Neri 22', 43.7687, 11.2582],
  ['v_arnolfo', 'Bar Arnolfo', 'bar', 'Piazza della Signoria 4', 43.7696, 11.2558],
  ['v_duomo_caffe', 'Caffè del Campanile', 'bar', 'Piazza del Duomo 12', 43.7731, 11.2560],
  ['v_pizza_santo', 'Pizzeria Santo Spirito 9', 'pizzeria', 'Piazza Santo Spirito 9', 43.7665, 11.2473],
  ['v_gelato_vecchio', 'Gelateria Ponte Vecchio Sud', 'gelateria', 'Via de\' Guicciardini 8', 43.7676, 11.2531],
  ['v_osteria_cento', 'Osteria Cento Lampioni', 'ristorante', 'Via Ghibellina 110', 43.7703, 11.2622],
  ['v_mercato_bar', 'Bar del Mercato Centrale', 'bar', 'Via dell\'Ariento 16', 43.7762, 11.2535],
  ['v_ristorante_arno', 'Ristorante Lungarno Blu', 'ristorante', 'Lungarno Corsini 6', 43.7701, 11.2498],
  ['v_pasticceria_croce', 'Pasticceria Santa Croce', 'pasticceria', 'Borgo de\' Greci 21', 43.7686, 11.2609],
  ['v_trattoria_sanlorenzo', 'Trattoria da Nanni', 'trattoria', 'Via Sant\'Antonino 27', 43.7749, 11.2528],
  ['v_bar_sanmarco', 'Bar Piazza San Marco', 'bar', 'Piazza San Marco 5', 43.7779, 11.2589],
  ['v_pizzeria_oltrarno', 'Pizzeria Il Forno di Boboli', 'pizzeria', 'Via Romana 41', 43.7637, 11.2447],
  ['v_ristorante_ambrogio', 'Ristorante Sant\'Ambrogio', 'ristorante', 'Piazza Ghiberti 14', 43.7703, 11.2680],
  ['v_gelateria_repubblica', 'Gelateria della Repubblica', 'gelateria', 'Piazza della Repubblica 3', 43.7715, 11.2540],
  ['v_bar_stazione', 'Bar Binario 16', 'bar', 'Piazza della Stazione 9', 43.7764, 11.2478],
  ['v_trattoria_tornabuoni', 'Trattoria Tornabuoni', 'trattoria', 'Via de\' Tornabuoni 70', 43.7712, 11.2512],
  ['v_ristorante_pitti', 'Ristorante Palazzo Pitti Vista', 'ristorante', 'Piazza de\' Pitti 20', 43.7651, 11.2500],
  ['v_bar_porta_romana', 'Bar Porta Romana', 'bar', 'Via Romana 110', 43.7607, 11.2420],
  ['v_pizzeria_novoli', 'Pizzeria Le Cure', 'pizzeria', 'Piazza delle Cure 7', 43.7855, 11.2690],
  ['v_caffe_annunziata', 'Caffè dell\'Annunziata', 'bar', 'Piazza SS. Annunziata 8', 43.7766, 11.2608],
  ['v_ristorante_cascine', 'Ristorante alle Cascine', 'ristorante', 'Viale degli Olmi 3', 43.7752, 11.2340],
  ['v_bar_beccaria', 'Bar Piazza Beccaria', 'bar', 'Piazza Beccaria 2', 43.7697, 11.2720],
  ['v_trattoria_sanfrediano', 'Trattoria San Frediano', 'trattoria', 'Borgo San Frediano 48', 43.7684, 11.2420],
  ['v_gelateria_carmine', 'Gelateria del Carmine', 'gelateria', 'Piazza del Carmine 6', 43.7680, 11.2440],
  ['v_ristorante_santacroce', 'Ristorante Piazza Santa Croce', 'ristorante', 'Piazza Santa Croce 18', 43.7686, 11.2626],
  ['v_bar_libertà', 'Bar Piazza della Libertà', 'bar', 'Piazza della Libertà 10', 43.7836, 11.2598],
  ['v_pasticceria_statuto', 'Pasticceria Statuto', 'pasticceria', 'Via dello Statuto 25', 43.7858, 11.2510],
  ['v_pizzeria_ognissanti', 'Pizzeria Ognissanti', 'pizzeria', 'Borgo Ognissanti 70', 43.7725, 11.2452],
  ['v_ristorante_belvedere', 'Ristorante Forte Belvedere', 'ristorante', 'Costa San Giorgio 18', 43.7638, 11.2545],
  ['v_bar_sanniccolo', 'Bar San Niccolò', 'bar', 'Via San Niccolò 60', 43.7643, 11.2612],
  ['v_trattoria_cibreo', 'Trattoria Via de\' Macci', 'trattoria', 'Via de\' Macci 118', 43.7698, 11.2665],
  ['v_caffe_strozzi', 'Caffè Palazzo Strozzi', 'bar', 'Piazza degli Strozzi 1', 43.7713, 11.2525],
  ['v_ristorante_michelangelo', 'Ristorante Piazzale', 'ristorante', 'Piazzale Michelangelo 2', 43.7629, 11.2650],
  ['v_gelateria_neri', 'Gelateria dei Neri Demo', 'gelateria', 'Via dei Neri 9', 43.7684, 11.2572],
  ['v_bar_dalmazia', 'Bar Piazza Dalmazia', 'bar', 'Piazza Dalmazia 12', 43.7912, 11.2370],
  ['v_pizzeria_gavinana', 'Pizzeria Gavinana', 'pizzeria', 'Piazza Gavinana 3', 43.7565, 11.2740],
  ['v_ristorante_sanlorenzo', 'Ristorante San Lorenzo', 'ristorante', 'Piazza San Lorenzo 11', 43.7748, 11.2545],
  ['v_bar_oltrarno', 'Bar Oltrarno 1', 'bar', 'Via Maggio 32', 43.7668, 11.2496],
  ['v_trattoria_santaMaria', 'Trattoria Santa Maria Novella', 'trattoria', 'Piazza Santa Maria Novella 7', 43.7727, 11.2495],
  ['v_pasticceria_isolotto', 'Pasticceria Isolotto', 'pasticceria', 'Piazza dell\'Isolotto 4', 43.7650, 11.2180],
]

export const venues: Venue[] = venueRows.map(([id, name, type, address, lat, lng]) => ({
  id, name, type, address, lat, lng, status: 'nessuna', createdAt: d(80),
  claimedBy: id === 'v_giglio' ? 'u_marco' : id === 'v_arnolfo' ? 'u_sara' : undefined,
  premiumUntil: id === 'v_arnolfo' ? addDays(DEMO_NOW(), 25) : undefined,
}))

const photo = (label: string, hue: number) => placeholderPhoto(label, hue)

export const reports: Report[] = [
  // Pubblicata 2 giorni fa, il locale ha replicato e chiesto preventivi
  {
    id: 'r_giglio_1', venueId: 'v_giglio', userId: 'u_giulia', source: 'utente', category: 'blatte',
    description: 'Due blatte vive sotto il tavolo accanto alla cucina, ore 21:30.',
    photo: photo('Blatta sotto il tavolo', 25), photoHash: 'a1b2c3d4', captureMode: 'fotocamera',
    capturedAt: d(3, 19), lat: 43.7688, lng: 11.2581, distanceM: 12,
    aiCheck: { verdict: 'coerente', score: 0.86, reasons: ['photo.ok'], simulated: true, checkedAt: d(3, 19) },
    state: 'pubblicata', submittedAt: d(3, 19), moderatedAt: addHours(d(3, 19), 9), moderatorId: 'u_mod',
    publishedAt: addHours(d(3, 19), 9), replyDeadlineAt: addDays(addHours(d(3, 19), 9), 7), facesBlurred: true,
  },
  // In verifica da 5 ore
  {
    id: 'r_arnolfo_1', venueId: 'v_arnolfo', userId: 'u_tourist', source: 'utente', category: 'sporcizia',
    description: 'Bancone con residui e bicchieri sporchi riutilizzati.',
    photo: photo('Bancone sporco', 200), photoHash: 'b2c3d4e5', captureMode: 'fotocamera',
    capturedAt: addHours(DEMO_NOW(), -5), lat: 43.7697, lng: 11.2559, distanceM: 15,
    aiCheck: { verdict: 'coerente', score: 0.71, reasons: ['photo.ok'], simulated: true, checkedAt: addHours(DEMO_NOW(), -5) },
    state: 'in_verifica', submittedAt: addHours(DEMO_NOW(), -5), facesBlurred: false,
  },
  // In verifica da 20 ore (SLA quasi scaduto)
  {
    id: 'r_mercato_1', venueId: 'v_mercato_bar', userId: 'u_giulia', source: 'utente', category: 'roditori',
    description: 'Escrementi di topo dietro il frigo delle bibite.',
    photo: photo('Escrementi dietro il frigo', 15), photoHash: 'c3d4e5f6', captureMode: 'fotocamera',
    capturedAt: addHours(DEMO_NOW(), -20), lat: 43.7763, lng: 11.2534, distanceM: 9,
    aiCheck: { verdict: 'incerta', score: 0.52, reasons: ['photo.low_detail'], simulated: true, checkedAt: addHours(DEMO_NOW(), -20) },
    state: 'in_verifica', submittedAt: addHours(DEMO_NOW(), -20), facesBlurred: true,
  },
  // Risolta con certificato
  {
    id: 'r_santo_1', venueId: 'v_pizza_santo', userId: 'u_giulia', source: 'utente', category: 'formiche',
    description: 'Fila di formiche sul bancone delle pizze.',
    photo: photo('Formiche sul bancone', 45), photoHash: 'd4e5f6a7', captureMode: 'fotocamera',
    capturedAt: d(20, 12), lat: 43.7666, lng: 11.2474, distanceM: 10,
    aiCheck: { verdict: 'coerente', score: 0.9, reasons: ['photo.ok'], simulated: true, checkedAt: d(20, 12) },
    state: 'risolta', submittedAt: d(20, 12), moderatedAt: addHours(d(20, 12), 6), moderatorId: 'u_mod',
    publishedAt: addHours(d(20, 12), 6), replyDeadlineAt: addDays(addHours(d(20, 12), 6), 7), resolvedAt: d(14, 16), facesBlurred: true,
  },
  // Pubblicata 10 giorni fa, nessuna replica: definitiva
  {
    id: 'r_cento_1', venueId: 'v_osteria_cento', userId: 'u_tourist', source: 'utente', category: 'alimenti',
    description: 'Carne cruda lasciata fuori dal frigo accanto alla porta della cucina.',
    photo: photo('Alimenti fuori dal frigo', 350), photoHash: 'e5f6a7b8', captureMode: 'fotocamera',
    capturedAt: d(11, 13), lat: 43.7704, lng: 11.2621, distanceM: 8,
    aiCheck: { verdict: 'coerente', score: 0.78, reasons: ['photo.ok'], simulated: true, checkedAt: d(11, 13) },
    state: 'pubblicata', submittedAt: d(11, 13), moderatedAt: addHours(d(11, 13), 14), moderatorId: 'u_mod',
    publishedAt: addHours(d(11, 13), 14), replyDeadlineAt: addDays(addHours(d(11, 13), 14), 7), facesBlurred: true,
  },
  // Scartata dal filtro
  {
    id: 'r_scartata_1', venueId: 'v_duomo_caffe', userId: 'u_giulia', source: 'utente', category: 'altro',
    description: 'Foto buia.', photo: photo('Foto troppo scura', 0), photoHash: 'f6a7b8c9', captureMode: 'fotocamera',
    capturedAt: d(40, 22), lat: 43.7731, lng: 11.2561, distanceM: 6,
    aiCheck: { verdict: 'non_coerente', score: 0.2, reasons: ['photo.too_dark', 'photo.uniform'], simulated: true, checkedAt: d(40, 22) },
    state: 'scartata', submittedAt: d(40, 22), facesBlurred: false,
  },
  // Archiviata dalla moderazione
  {
    id: 'r_archiviata_1', venueId: 'v_bar_sanmarco', userId: 'u_tourist', source: 'utente', category: 'mosche',
    description: 'Una mosca sul tavolo.', photo: photo('Una mosca', 90), photoHash: 'a7b8c9d0', captureMode: 'fotocamera',
    capturedAt: d(6, 15), lat: 43.7779, lng: 11.2588, distanceM: 11,
    aiCheck: { verdict: 'incerta', score: 0.5, reasons: ['photo.low_detail'], simulated: true, checkedAt: d(6, 15) },
    state: 'archiviata', submittedAt: d(6, 15), moderatedAt: addHours(d(6, 15), 3), moderatorId: 'u_mod',
    moderationNote: 'Una sola mosca su un tavolo all\'aperto non è un problema igienico del locale.', facesBlurred: true,
  },
  // Rimossa (prova insufficiente) -> nel registro delle rimozioni
  {
    id: 'r_rimossa_1', venueId: 'v_ristorante_arno', userId: 'u_giulia', source: 'utente', category: 'muffa',
    description: 'Muffa sul soffitto della sala.', photo: photo('Macchia sul soffitto', 120), photoHash: 'b8c9d0e1', captureMode: 'fotocamera',
    capturedAt: d(30, 20), lat: 43.7702, lng: 11.2497, distanceM: 14,
    aiCheck: { verdict: 'coerente', score: 0.66, reasons: ['photo.ok'], simulated: true, checkedAt: d(30, 20) },
    state: 'rimossa', submittedAt: d(30, 20), moderatedAt: addHours(d(30, 20), 10), moderatorId: 'u_mod',
    publishedAt: addHours(d(30, 20), 10), replyDeadlineAt: addDays(addHours(d(30, 20), 10), 7),
    removedAt: d(28, 11), removalReason: 'prova_insufficiente', facesBlurred: true,
  },
  // Comunicato NAS collegato (fonte pubblica, nessuna foto)
  {
    id: 'r_nas_1', venueId: 'v_bar_stazione', userId: 'u_mod', source: 'nas', category: 'alimenti',
    description: 'Comunicato NAS Firenze: sequestrati 12 kg di alimenti privi di tracciabilità; sospensione temporanea dell\'attività.',
    photo: '', photoHash: '', captureMode: 'fotocamera', capturedAt: d(15, 9), lat: 43.7764, lng: 11.2478, distanceM: 0,
    state: 'pubblicata', submittedAt: d(15, 9), moderatedAt: d(15, 9), moderatorId: 'u_mod',
    publishedAt: d(15, 9), replyDeadlineAt: addDays(d(15, 9), 7), nasNoticeId: 'nas_1', facesBlurred: true,
  },
]

export const replies: Reply[] = [
  { id: 'rep_1', reportId: 'r_giglio_1', venueId: 'v_giglio', authorId: 'u_marco', text: 'Ci scusiamo con la cliente. Abbiamo chiuso la cucina la sera stessa, chiamato una ditta e richiesto i preventivi tramite l\'app. Pubblicheremo il certificato appena concluso l\'intervento.', createdAt: d(2, 9) },
  { id: 'rep_2', reportId: 'r_santo_1', venueId: 'v_pizza_santo', authorId: 'u_none', text: 'Intervento eseguito e certificato caricato. Grazie per la segnalazione.', createdAt: d(14, 17) },
]

export const nasNotices: NasNotice[] = [
  { id: 'nas_1', venueNameRaw: 'Bar in Piazza della Stazione (esempio)', addressRaw: 'Piazza della Stazione, Firenze', sourceUrl: 'https://www.carabinieri.it/in-vostro-aiuto/consigli/nas', publishedAt: d(15, 8), summary: 'Esempio dimostrativo: sequestro di alimenti privi di tracciabilità e sospensione temporanea dell\'attività.', importedAt: d(15, 9), importedBy: 'u_mod', venueId: 'v_bar_stazione', linkedReportId: 'r_nas_1' },
  { id: 'nas_2', venueNameRaw: 'Ristorante zona Santa Croce (esempio, non ancora collegato)', addressRaw: 'Via Ghibellina, Firenze', sourceUrl: 'https://www.carabinieri.it/in-vostro-aiuto/consigli/nas', publishedAt: d(2, 8), summary: 'Esempio dimostrativo: carenze igienico-sanitarie nel locale cucina, sanzioni per 3.000 €.', importedAt: d(1, 9), importedBy: 'u_mod' },
]

export const removals: Removal[] = [
  { id: 'rm_1', reportId: 'r_rimossa_1', venueName: 'Ristorante Lungarno Blu', reason: 'prova_insufficiente', requestedBy: 'locale', publishedAt: addHours(d(30, 20), 10), removedAt: d(28, 11) },
]

export const dsaNotices: DsaNotice[] = [
  { id: 'dsa_1', reportId: 'r_rimossa_1', contact: 'legale@lungarnoblu-demo.it', reason: 'La macchia fotografata è un\'ombra della lampada, non muffa. Allegata perizia.', receivedAt: d(29, 10), decidedAt: d(28, 11), decision: 'rimossa', decisionNote: 'La foto non prova il problema segnalato: rimossa entro 48 ore, registrata nel registro pubblico.' },
]
