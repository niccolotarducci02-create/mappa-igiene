-- =====================================================================================
-- Mappa dell'Igiene — seed.sql (SOLO sviluppo locale / beta di prova)
-- Dati dimostrativi: locali, persone, ditte e segnalazioni sono INVENTATI (nomi non reali,
-- vie e coordinate di Firenze). Specchio di src/data/seed.ts con uuid fissi.
--
-- Utenti: i profili dipendono da auth.users. Qui, per `supabase db reset` in locale, le righe di
-- auth.users vengono inserite direttamente con uuid fissi (il trigger on_auth_user_created crea
-- i profili, poi aggiornati sotto). In un progetto ospitato NON eseguire questo file: creare gli
-- utenti con l'Admin API (supabase.auth.admin.createUser({ phone, phone_confirm: true,
-- user_metadata: { display_name } })) oppure dal Dashboard > Authentication > Users, usando gli
-- stessi uuid (oppure sostituendo gli uuid qui sotto), e poi eseguire solo le sezioni 2-6.
--
-- Mappa degli id demo -> uuid:
--   utenti   a0000000-0000-4000-8000-0000000000NN  (01 u_giulia, 02 u_tourist, 03 u_marco, 04 u_sara,
--            05 u_ditta1, 06 u_ditta2, 07 u_founder, 08 u_mod, 09 u_admin)
--   ditte    b0000000-...-01 c_disinfesta, 02 c_pulicasa, 03 c_founder, 04 c_verde
--   locali   c0000000-...-01..28 nell'ordine di seed.ts (01 v_giglio, 02 v_arnolfo, 03 v_duomo_caffe,
--            04 v_pizza_santo, 06 v_osteria_cento, 07 v_mercato_bar, 08 v_ristorante_arno, 0b v_bar_sanmarco,
--            0f v_bar_stazione)
--   segnalazioni d0000000-...-01..09, repliche e0000000-..., comunicati NAS f0000000-...,
--   rimozioni 10000000-..., DSA 20000000-..., contatti 30000000-..., preventivi 40000000-..., certificati 50000000-...
-- =====================================================================================

begin;

-- Flag di seed: disattiva, SOLO su connessione diretta (mai via API), le guardie dei trigger che
-- rifiuterebbero dati storici (foto vecchie, 3/mese, stato 'rimossa' senza moderatore loggato).
select set_config('app.seeding', 'on', false);

-- -------------------------------------------------------------------------------------
-- 1. auth.users (solo locale) — telefono senza '+' come fa GoTrue
-- -------------------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.phone, now(),
  jsonb_build_object('provider', 'phone', 'providers', array['phone'], 'role', u.app_role),
  jsonb_build_object('display_name', u.display_name),
  now() - u.age, now(), '', '', '', '', false
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, '393330000001', 'Giulia (cliente)',                     'utente',     interval '60 days'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, '447700900001', 'Mark (tourist)',                        'utente',     interval '3 days'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, '393330000002', 'Marco (titolare Trattoria del Giglio)', 'locale',     interval '50 days'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, '393330000003', 'Sara (titolare Bar Arnolfo)',           'locale',     interval '40 days'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, '393330000005', 'Paolo (Disinfesta Toscana)',            'ditta',      interval '45 days'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, '393330000006', 'Elena (PuliCasa Firenze)',              'ditta',      interval '44 days'),
  ('a0000000-0000-4000-8000-000000000007'::uuid, '393330000007', 'Lorenzo (ditta del fondatore)',         'ditta',      interval '90 days'),
  ('a0000000-0000-4000-8000-000000000008'::uuid, '393330000008', 'Chiara (moderazione)',                  'moderatore', interval '90 days'),
  ('a0000000-0000-4000-8000-000000000009'::uuid, '393330000009', 'Admin',                                 'admin',      interval '90 days')
) as u(id, phone, display_name, app_role, age)
on conflict (id) do nothing;

-- Il trigger on_auth_user_created ha creato i profili base; se gli utenti sono stati creati
-- dal Dashboard/Admin API con gli stessi uuid, questo upsert funziona lo stesso.
insert into public.profiles (id, display_name, role, phone, phone_verified, spid_verified, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'Giulia (cliente)',                     'utente',     '+393330000001', true, false, now() - interval '60 days'),
  ('a0000000-0000-4000-8000-000000000002', 'Mark (tourist)',                        'utente',     '+447700900001', true, false, now() - interval '3 days'),
  ('a0000000-0000-4000-8000-000000000003', 'Marco (titolare Trattoria del Giglio)', 'locale',     '+393330000002', true, true,  now() - interval '50 days'),
  ('a0000000-0000-4000-8000-000000000004', 'Sara (titolare Bar Arnolfo)',           'locale',     '+393330000003', true, false, now() - interval '40 days'),
  ('a0000000-0000-4000-8000-000000000005', 'Paolo (Disinfesta Toscana)',            'ditta',      '+393330000005', true, false, now() - interval '45 days'),
  ('a0000000-0000-4000-8000-000000000006', 'Elena (PuliCasa Firenze)',              'ditta',      '+393330000006', true, false, now() - interval '44 days'),
  ('a0000000-0000-4000-8000-000000000007', 'Lorenzo (ditta del fondatore)',         'ditta',      '+393330000007', true, true,  now() - interval '90 days'),
  ('a0000000-0000-4000-8000-000000000008', 'Chiara (moderazione)',                  'moderatore', '+393330000008', true, true,  now() - interval '90 days'),
  ('a0000000-0000-4000-8000-000000000009', 'Admin',                                 'admin',      '+393330000009', true, true,  now() - interval '90 days')
on conflict (id) do update set
  display_name = excluded.display_name, role = excluded.role, phone = excluded.phone,
  phone_verified = excluded.phone_verified, spid_verified = excluded.spid_verified, created_at = excluded.created_at;

-- -------------------------------------------------------------------------------------
-- 2. Ditte (la quarta non ha ancora accettato le condizioni uguali: non può comprare contatti)
-- -------------------------------------------------------------------------------------
insert into public.companies (id, name, vat, zones, services, owner_user_id, same_conditions_ack, sponsor_until, is_founder_company, phone, email)
values
  ('b0000000-0000-4000-8000-000000000001', 'Disinfesta Toscana Srl',      'IT01234560481', array['Centro storico', 'Oltrarno'],
     array['blatte', 'roditori', 'formiche', 'mosche']::public.report_category[],
     'a0000000-0000-4000-8000-000000000005', true, now() + interval '20 days', false, '+39 055 000 0001', 'info@disinfesta-demo.it'),
  ('b0000000-0000-4000-8000-000000000002', 'PuliCasa Firenze',            'IT01234560482', array['Centro storico', 'San Marco / Statuto'],
     array['sporcizia', 'muffa', 'alimenti', 'altro']::public.report_category[],
     'a0000000-0000-4000-8000-000000000006', true, null, false, '+39 055 000 0002', 'ciao@pulicasa-demo.it'),
  ('b0000000-0000-4000-8000-000000000003', 'Ditta del fondatore (demo)',  'IT01234560483', array['Centro storico', 'Oltrarno', 'Campo di Marte / Sant''Ambrogio'],
     array['blatte', 'roditori', 'formiche', 'mosche', 'altro']::public.report_category[],
     'a0000000-0000-4000-8000-000000000007', true, null, true, '+39 055 000 0003', null),
  ('b0000000-0000-4000-8000-000000000004', 'Verde Igiene Ambientale',     'IT01234560484', array['Oltrarno'],
     array['blatte', 'roditori']::public.report_category[],
     null, false, null, false, '+39 055 000 0004', null)
on conflict (id) do nothing;

update public.profiles set company_id = 'b0000000-0000-4000-8000-000000000001' where id = 'a0000000-0000-4000-8000-000000000005';
update public.profiles set company_id = 'b0000000-0000-4000-8000-000000000002' where id = 'a0000000-0000-4000-8000-000000000006';
update public.profiles set company_id = 'b0000000-0000-4000-8000-000000000003' where id = 'a0000000-0000-4000-8000-000000000007';

-- -------------------------------------------------------------------------------------
-- 3. Locali (40, come seed.ts). Lo stato viene ricalcolato dai trigger sulle segnalazioni.
-- -------------------------------------------------------------------------------------
insert into public.venues (id, name, type, address, lat, lng) values
  ('c0000000-0000-4000-8000-000000000001', 'Trattoria del Giglio Rosso', 'trattoria', 'Via dei Neri 22', 43.7687, 11.2582),  -- v_giglio
  ('c0000000-0000-4000-8000-000000000002', 'Bar Arnolfo', 'bar', 'Piazza della Signoria 4', 43.7696, 11.2558),  -- v_arnolfo
  ('c0000000-0000-4000-8000-000000000003', 'Caffè del Campanile', 'bar', 'Piazza del Duomo 12', 43.7731, 11.2560),  -- v_duomo_caffe
  ('c0000000-0000-4000-8000-000000000004', 'Pizzeria Santo Spirito 9', 'pizzeria', 'Piazza Santo Spirito 9', 43.7665, 11.2473),  -- v_pizza_santo
  ('c0000000-0000-4000-8000-000000000005', 'Gelateria Ponte Vecchio Sud', 'gelateria', 'Via de'' Guicciardini 8', 43.7676, 11.2531),  -- v_gelato_vecchio
  ('c0000000-0000-4000-8000-000000000006', 'Osteria Cento Lampioni', 'ristorante', 'Via Ghibellina 110', 43.7703, 11.2622),  -- v_osteria_cento
  ('c0000000-0000-4000-8000-000000000007', 'Bar del Mercato Centrale', 'bar', 'Via dell''Ariento 16', 43.7762, 11.2535),  -- v_mercato_bar
  ('c0000000-0000-4000-8000-000000000008', 'Ristorante Lungarno Blu', 'ristorante', 'Lungarno Corsini 6', 43.7701, 11.2498),  -- v_ristorante_arno
  ('c0000000-0000-4000-8000-000000000009', 'Pasticceria Santa Croce', 'pasticceria', 'Borgo de'' Greci 21', 43.7686, 11.2609),  -- v_pasticceria_croce
  ('c0000000-0000-4000-8000-00000000000a', 'Trattoria da Nanni', 'trattoria', 'Via Sant''Antonino 27', 43.7749, 11.2528),  -- v_trattoria_sanlorenzo
  ('c0000000-0000-4000-8000-00000000000b', 'Bar Piazza San Marco', 'bar', 'Piazza San Marco 5', 43.7779, 11.2589),  -- v_bar_sanmarco
  ('c0000000-0000-4000-8000-00000000000c', 'Pizzeria Il Forno di Boboli', 'pizzeria', 'Via Romana 41', 43.7637, 11.2447),  -- v_pizzeria_oltrarno
  ('c0000000-0000-4000-8000-00000000000d', 'Ristorante Sant''Ambrogio', 'ristorante', 'Piazza Ghiberti 14', 43.7703, 11.2680),  -- v_ristorante_ambrogio
  ('c0000000-0000-4000-8000-00000000000e', 'Gelateria della Repubblica', 'gelateria', 'Piazza della Repubblica 3', 43.7715, 11.2540),  -- v_gelateria_repubblica
  ('c0000000-0000-4000-8000-00000000000f', 'Bar Binario 16', 'bar', 'Piazza della Stazione 9', 43.7764, 11.2478),  -- v_bar_stazione
  ('c0000000-0000-4000-8000-000000000010', 'Trattoria Tornabuoni', 'trattoria', 'Via de'' Tornabuoni 70', 43.7712, 11.2512),  -- v_trattoria_tornabuoni
  ('c0000000-0000-4000-8000-000000000011', 'Ristorante Palazzo Pitti Vista', 'ristorante', 'Piazza de'' Pitti 20', 43.7651, 11.2500),  -- v_ristorante_pitti
  ('c0000000-0000-4000-8000-000000000012', 'Bar Porta Romana', 'bar', 'Via Romana 110', 43.7607, 11.2420),  -- v_bar_porta_romana
  ('c0000000-0000-4000-8000-000000000013', 'Pizzeria Le Cure', 'pizzeria', 'Piazza delle Cure 7', 43.7855, 11.2690),  -- v_pizzeria_novoli
  ('c0000000-0000-4000-8000-000000000014', 'Caffè dell''Annunziata', 'bar', 'Piazza SS. Annunziata 8', 43.7766, 11.2608),  -- v_caffe_annunziata
  ('c0000000-0000-4000-8000-000000000015', 'Ristorante alle Cascine', 'ristorante', 'Viale degli Olmi 3', 43.7752, 11.2340),  -- v_ristorante_cascine
  ('c0000000-0000-4000-8000-000000000016', 'Bar Piazza Beccaria', 'bar', 'Piazza Beccaria 2', 43.7697, 11.2720),  -- v_bar_beccaria
  ('c0000000-0000-4000-8000-000000000017', 'Trattoria San Frediano', 'trattoria', 'Borgo San Frediano 48', 43.7684, 11.2420),  -- v_trattoria_sanfrediano
  ('c0000000-0000-4000-8000-000000000018', 'Gelateria del Carmine', 'gelateria', 'Piazza del Carmine 6', 43.7680, 11.2440),  -- v_gelateria_carmine
  ('c0000000-0000-4000-8000-000000000019', 'Ristorante Piazza Santa Croce', 'ristorante', 'Piazza Santa Croce 18', 43.7686, 11.2626),  -- v_ristorante_santacroce
  ('c0000000-0000-4000-8000-00000000001a', 'Bar Piazza della Libertà', 'bar', 'Piazza della Libertà 10', 43.7836, 11.2598),  -- v_bar_libertà
  ('c0000000-0000-4000-8000-00000000001b', 'Pasticceria Statuto', 'pasticceria', 'Via dello Statuto 25', 43.7858, 11.2510),  -- v_pasticceria_statuto
  ('c0000000-0000-4000-8000-00000000001c', 'Pizzeria Ognissanti', 'pizzeria', 'Borgo Ognissanti 70', 43.7725, 11.2452),  -- v_pizzeria_ognissanti
  ('c0000000-0000-4000-8000-00000000001d', 'Ristorante Forte Belvedere', 'ristorante', 'Costa San Giorgio 18', 43.7638, 11.2545),  -- v_ristorante_belvedere
  ('c0000000-0000-4000-8000-00000000001e', 'Bar San Niccolò', 'bar', 'Via San Niccolò 60', 43.7643, 11.2612),  -- v_bar_sanniccolo
  ('c0000000-0000-4000-8000-00000000001f', 'Trattoria Via de'' Macci', 'trattoria', 'Via de'' Macci 118', 43.7698, 11.2665),  -- v_trattoria_cibreo
  ('c0000000-0000-4000-8000-000000000020', 'Caffè Palazzo Strozzi', 'bar', 'Piazza degli Strozzi 1', 43.7713, 11.2525),  -- v_caffe_strozzi
  ('c0000000-0000-4000-8000-000000000021', 'Ristorante Piazzale', 'ristorante', 'Piazzale Michelangelo 2', 43.7629, 11.2650),  -- v_ristorante_michelangelo
  ('c0000000-0000-4000-8000-000000000022', 'Gelateria dei Neri Demo', 'gelateria', 'Via dei Neri 9', 43.7684, 11.2572),  -- v_gelateria_neri
  ('c0000000-0000-4000-8000-000000000023', 'Bar Piazza Dalmazia', 'bar', 'Piazza Dalmazia 12', 43.7912, 11.2370),  -- v_bar_dalmazia
  ('c0000000-0000-4000-8000-000000000024', 'Pizzeria Gavinana', 'pizzeria', 'Piazza Gavinana 3', 43.7565, 11.2740),  -- v_pizzeria_gavinana
  ('c0000000-0000-4000-8000-000000000025', 'Ristorante San Lorenzo', 'ristorante', 'Piazza San Lorenzo 11', 43.7748, 11.2545),  -- v_ristorante_sanlorenzo
  ('c0000000-0000-4000-8000-000000000026', 'Bar Oltrarno 1', 'bar', 'Via Maggio 32', 43.7668, 11.2496),  -- v_bar_oltrarno
  ('c0000000-0000-4000-8000-000000000027', 'Trattoria Santa Maria Novella', 'trattoria', 'Piazza Santa Maria Novella 7', 43.7727, 11.2495),  -- v_trattoria_santaMaria
  ('c0000000-0000-4000-8000-000000000028', 'Pasticceria Isolotto', 'pasticceria', 'Piazza dell''Isolotto 4', 43.7650, 11.2180);  -- v_pasticceria_isolotto

update public.venues set created_at = now() - interval '80 days';
update public.venues set claimed_by = 'a0000000-0000-4000-8000-000000000003' where id = 'c0000000-0000-4000-8000-000000000001';  -- v_giglio -> Marco
update public.venues set claimed_by = 'a0000000-0000-4000-8000-000000000004', premium_until = now() + interval '25 days'
 where id = 'c0000000-0000-4000-8000-000000000002';  -- v_arnolfo -> Sara, Premium attivo
insert into public.venue_owners (venue_id, user_id) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004')
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- 4. Comunicati NAS (il primo verrà collegato alla segnalazione d..09)
-- -------------------------------------------------------------------------------------
insert into public.nas_notices (id, venue_name_raw, address_raw, source_url, published_at, summary, imported_at, imported_by, venue_id)
values
  ('f0000000-0000-4000-8000-000000000001', 'Bar in Piazza della Stazione (esempio)', 'Piazza della Stazione, Firenze',
   'https://www.carabinieri.it/in-vostro-aiuto/consigli/nas', now() - interval '15 days' - interval '2 hours',
   'Esempio dimostrativo: sequestro di alimenti privi di tracciabilità e sospensione temporanea dell''attività.',
   now() - interval '15 days', 'a0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-00000000000f'),
  ('f0000000-0000-4000-8000-000000000002', 'Ristorante zona Santa Croce (esempio, non ancora collegato)', 'Via Ghibellina, Firenze',
   'https://www.carabinieri.it/in-vostro-aiuto/consigli/nas', now() - interval '2 days',
   'Esempio dimostrativo: carenze igienico-sanitarie nel locale cucina, sanzioni per 3.000 €.',
   now() - interval '1 day', 'a0000000-0000-4000-8000-000000000008', null)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------------------
-- 5. Segnalazioni. Le foto NON esistono nello Storage: i percorsi sono segnaposto; caricare file veri con quei
--    nomi per vederle nell'app. Le foto ancora da controllare stanno in <user_id>/seed/<nome>.jpg (cartella
--    dell'utente); quelle già passate dalla moderazione (faces_blurred = true) in blurred/<report_id>/<nome>.jpg,
--    come fa set_report_blurred: il percorso pubblico non deve mai contenere l'id del segnalante.
--    Le date sono relative a now() come in seed.ts. I trigger calcolano reply_deadline_at e lo stato dei locali.
-- -------------------------------------------------------------------------------------
insert into public.reports (
  id, venue_id, user_id, source, category, description, photo_path, photo_hash, capture_mode, captured_at,
  lat, lng, distance_m, consent_accepted, ai_verdict, ai_score, ai_reasons, ai_simulated, ai_checked_at,
  state, submitted_at, moderated_at, moderator_id, moderation_note, published_at, resolved_at, removed_at, removal_reason,
  nas_notice_id, faces_blurred
) values
  -- d01: pubblicata 3 giorni fa (Trattoria del Giglio), il locale ha replicato e chiesto preventivi
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'utente', 'blatte',
   'Due blatte vive sotto il tavolo accanto alla cucina, ore 21:30.',
   'blurred/d0000000-0000-4000-8000-000000000001/blatta-tavolo.jpg', 'a1b2c3d4', 'fotocamera', now() - interval '3 days',
   43.7688, 11.2581, 12, true, 'coerente', 0.86, array['photo.ok'], true, now() - interval '3 days',
   'pubblicata', now() - interval '3 days', now() - interval '3 days' + interval '9 hours', 'a0000000-0000-4000-8000-000000000008', null,
   now() - interval '3 days' + interval '9 hours', null, null, null, null, true),
  -- d02: in verifica da 5 ore (Bar Arnolfo), volti non ancora sfocati
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'utente', 'sporcizia',
   'Bancone con residui e bicchieri sporchi riutilizzati.',
   'a0000000-0000-4000-8000-000000000002/seed/bancone-sporco.jpg', 'b2c3d4e5', 'fotocamera', now() - interval '5 hours',
   43.7697, 11.2559, 15, true, 'coerente', 0.71, array['photo.ok'], true, now() - interval '5 hours',
   'in_verifica', now() - interval '5 hours', null, null, null, null, null, null, null, null, false),
  -- d03: in verifica da 20 ore (SLA 24 h quasi scaduto), Bar del Mercato Centrale
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'utente', 'roditori',
   'Escrementi di topo dietro il frigo delle bibite.',
   'blurred/d0000000-0000-4000-8000-000000000003/escrementi-frigo.jpg', 'c3d4e5f6', 'fotocamera', now() - interval '20 hours',
   43.7763, 11.2534, 9, true, 'incerta', 0.52, array['photo.low_detail'], true, now() - interval '20 hours',
   'in_verifica', now() - interval '20 hours', null, null, null, null, null, null, null, null, true),
  -- d04: risolta con certificato (Pizzeria Santo Spirito 9)
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'utente', 'formiche',
   'Fila di formiche sul bancone delle pizze.',
   'blurred/d0000000-0000-4000-8000-000000000004/formiche-bancone.jpg', 'd4e5f6a7', 'fotocamera', now() - interval '35 days',
   43.7666, 11.2474, 10, true, 'coerente', 0.9, array['photo.ok'], true, now() - interval '35 days',
   'risolta', now() - interval '35 days', now() - interval '35 days' + interval '6 hours', 'a0000000-0000-4000-8000-000000000008', null,
   now() - interval '35 days' + interval '6 hours', now() - interval '29 days', null, null, null, true),
  -- d05: pubblicata 11 giorni fa senza replica: definitiva (Osteria Cento Lampioni)
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002', 'utente', 'alimenti',
   'Carne cruda lasciata fuori dal frigo accanto alla porta della cucina.',
   'blurred/d0000000-0000-4000-8000-000000000005/alimenti-fuori-frigo.jpg', 'e5f6a7b8', 'fotocamera', now() - interval '11 days',
   43.7704, 11.2621, 8, true, 'coerente', 0.78, array['photo.ok'], true, now() - interval '11 days',
   'pubblicata', now() - interval '11 days', now() - interval '11 days' + interval '14 hours', 'a0000000-0000-4000-8000-000000000008', null,
   now() - interval '11 days' + interval '14 hours', null, null, null, null, true),
  -- d06: scartata dal filtro automatico (Caffè del Campanile)
  ('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'utente', 'altro',
   'Foto buia.',
   'a0000000-0000-4000-8000-000000000002/seed/foto-scura.jpg', 'f6a7b8c9', 'fotocamera', now() - interval '40 days',
   43.7731, 11.2561, 6, true, 'non_coerente', 0.2, array['photo.too_dark', 'photo.uniform'], true, now() - interval '40 days',
   'scartata', now() - interval '40 days', null, null, null, null, null, null, null, null, false),
  -- d07: archiviata dalla moderazione (Bar Piazza San Marco)
  ('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000002', 'utente', 'mosche',
   'Una mosca sul tavolo.',
   'blurred/d0000000-0000-4000-8000-000000000007/una-mosca.jpg', 'a7b8c9d0', 'fotocamera', now() - interval '6 days',
   43.7779, 11.2588, 11, true, 'incerta', 0.5, array['photo.low_detail'], true, now() - interval '6 days',
   'archiviata', now() - interval '6 days', now() - interval '6 days' + interval '3 hours', 'a0000000-0000-4000-8000-000000000008',
   'Una sola mosca su un tavolo all''aperto non è un problema igienico del locale.', null, null, null, null, null, true),
  -- d08: rimossa (prova insufficiente) -> registro pubblico delle rimozioni (Ristorante Lungarno Blu)
  ('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'utente', 'muffa',
   'Muffa sul soffitto della sala.',
   'blurred/d0000000-0000-4000-8000-000000000008/macchia-soffitto.jpg', 'b8c9d0e1', 'fotocamera', now() - interval '45 days',
   43.7702, 11.2497, 14, true, 'coerente', 0.66, array['photo.ok'], true, now() - interval '45 days',
   'rimossa', now() - interval '45 days', now() - interval '45 days' + interval '10 hours', 'a0000000-0000-4000-8000-000000000008', null,
   now() - interval '45 days' + interval '10 hours', null, now() - interval '43 days', 'prova_insufficiente', null, true),
  -- d09: comunicato NAS collegato (fonte pubblica, nessuna foto) - Bar Binario 16
  ('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-000000000008', 'nas', 'alimenti',
   'Comunicato NAS Firenze: sequestrati 12 kg di alimenti privi di tracciabilità; sospensione temporanea dell''attività.',
   null, null, 'fotocamera', now() - interval '15 days' - interval '2 hours',
   43.7764, 11.2478, 0, true, null, null, null, null, null,
   'pubblicata', now() - interval '15 days', now() - interval '15 days', 'a0000000-0000-4000-8000-000000000008', 'Fonte pubblica: comunicato NAS',
   now() - interval '15 days', null, null, null, 'f0000000-0000-4000-8000-000000000001', true)
on conflict (id) do nothing;

update public.nas_notices set linked_report_id = 'd0000000-0000-4000-8000-000000000009' where id = 'f0000000-0000-4000-8000-000000000001';

-- -------------------------------------------------------------------------------------
-- 6. Repliche, contatto venduto, preventivo, certificato, rimozione, richiesta DSA
-- -------------------------------------------------------------------------------------
insert into public.replies (id, report_id, venue_id, author_id, text, created_at) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   'Ci scusiamo con la cliente. Abbiamo chiuso la cucina la sera stessa, chiamato una ditta e richiesto i preventivi tramite l''app. Pubblicheremo il certificato appena concluso l''intervento.',
   now() - interval '2 days'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000008',
   'Intervento eseguito e certificato caricato. Grazie per la segnalazione.',
   now() - interval '29 days' + interval '1 hour')
on conflict (id) do nothing;

-- Contatto aperto per la segnalazione d01, acquistato da Disinfesta Toscana (30 €), con un preventivo.
insert into public.leads (id, report_id, venue_id, category, zone, created_at, price_cents, max_buyers, status)
values ('30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'blatte', public.zone_for(43.7688, 11.2581), now() - interval '3 days' + interval '9 hours', 3000, 3, 'aperto')
on conflict (id) do nothing;

insert into public.lead_purchases (lead_id, company_id, paid_cents, created_at)
values ('30000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 3000, now() - interval '2 days')
on conflict do nothing;

insert into public.quotes (id, lead_id, company_id, amount_cents, text, created_at)
values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        28000, 'Trattamento gel + monitoraggio 30 giorni, intervento entro 48 ore.', now() - interval '2 days')
on conflict (id) do nothing;

-- Certificato verificato per la pizzeria risolta (d04). Il file non esiste nello Storage (segnaposto).
insert into public.certificates (id, report_id, venue_id, company_id, file_path, intervention_type, issued_at, verified_at, verified_by)
values ('50000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004',
        'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004/seed/certificato-formiche.pdf',
        'Disinfestazione formiche con gel insetticida', now() - interval '29 days', now() - interval '29 days', 'a0000000-0000-4000-8000-000000000008')
on conflict (id) do nothing;

-- Registro pubblico delle rimozioni (d08).
insert into public.removals (id, report_id, venue_name, reason, requested_by, published_at, removed_at)
values ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000008', 'Ristorante Lungarno Blu', 'prova_insufficiente', 'locale',
        now() - interval '45 days' + interval '10 hours', now() - interval '43 days')
on conflict (id) do nothing;

-- Richiesta DSA decisa entro 48 ore (d08).
insert into public.dsa_notices (id, report_id, contact, reason, received_at, decided_at, decision, decision_note)
values ('20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000008', 'legale@lungarnoblu-demo.it',
        'La macchia fotografata è un''ombra della lampada, non muffa. Allegata perizia.',
        now() - interval '44 days', now() - interval '43 days', 'rimossa',
        'La foto non prova il problema segnalato: rimossa entro 48 ore, registrata nel registro pubblico.')
on conflict (id) do nothing;

-- Audit minimo per la pagina di moderazione.
insert into public.audit_log (actor_id, action, target_type, target_id, note, at) values
  ('a0000000-0000-4000-8000-000000000008', 'moderate_conferma', 'report', 'd0000000-0000-4000-8000-000000000001', null, now() - interval '3 days' + interval '9 hours'),
  ('a0000000-0000-4000-8000-000000000008', 'remove_report', 'report', 'd0000000-0000-4000-8000-000000000008', 'locale: prova_insufficiente', now() - interval '43 days'),
  ('a0000000-0000-4000-8000-000000000008', 'verify_certificate', 'certificate', '50000000-0000-4000-8000-000000000001', null, now() - interval '29 days'),
  ('a0000000-0000-4000-8000-000000000008', 'link_nas', 'nas', 'f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000f', now() - interval '15 days');

-- Ricalcolo finale degli stati dei locali (i trigger lo hanno già fatto: qui per sicurezza).
select public.recompute_venue_status(v.id) from public.venues v;

select set_config('app.seeding', 'off', false);

commit;
