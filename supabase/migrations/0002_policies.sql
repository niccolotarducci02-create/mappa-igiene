-- =====================================================================================
-- Nitido — 0002_policies.sql
-- Row Level Security su OGNI tabella, viste pubbliche e privilegi per colonna.
--
-- Principi:
--  * anon vede solo ciò che è pubblico per il piano: locali, ditte (colonne pubbliche),
--    segnalazioni pubblicate/risolte SENZA l'identità del segnalante (vista public_reports),
--    repliche, certificati verificati, comunicati NAS, registro delle rimozioni, richieste DSA decise
--    senza il contatto;
--  * le scritture che applicano una regola passano dalle RPC di 0003_functions.sql (SECURITY DEFINER);
--    le policy di INSERT/UPDATE dirette sono volutamente strette;
--  * audit_log: nessuna policy -> solo service_role / proprietario (lettura via RPC list_audit).
--
-- Nota su Supabase: i privilegi di default concedono ALL su public.* ad anon/authenticated/service_role;
-- qui si revocano quelli che non servono e si restringono per colonna dove la RLS non basta.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- RLS attiva su tutte le tabelle
-- -------------------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.venues          enable row level security;
alter table public.venue_owners    enable row level security;
alter table public.nas_notices     enable row level security;
alter table public.reports         enable row level security;
alter table public.replies         enable row level security;
alter table public.leads           enable row level security;
alter table public.lead_purchases  enable row level security;
alter table public.quotes          enable row level security;
alter table public.certificates    enable row level security;
alter table public.removals        enable row level security;
alter table public.dsa_notices     enable row level security;
alter table public.notifications   enable row level security;
alter table public.audit_log       enable row level security;
alter table public.blocked_devices enable row level security;

-- -------------------------------------------------------------------------------------
-- Revoca dei privilegi di default non desiderati (difesa in profondità oltre alla RLS)
-- -------------------------------------------------------------------------------------
revoke all on public.audit_log from anon, authenticated;
revoke all on public.blocked_devices from anon;
revoke all on public.notifications from anon;
revoke all on public.lead_purchases from anon;
revoke all on public.leads from anon;
revoke all on public.quotes from anon;
revoke all on public.venue_owners from anon;
revoke all on public.profiles from anon;
revoke delete on public.reports from anon, authenticated;           -- il trigger lo vieta comunque
revoke delete on public.replies, public.leads, public.lead_purchases, public.quotes, public.certificates,
       public.removals, public.dsa_notices, public.nas_notices, public.venues, public.companies from anon, authenticated;
revoke truncate on all tables in schema public from anon, authenticated;

-- Aggiornamenti per colonna: la RLS decide le righe, la grant decide le colonne.
revoke update on public.profiles from authenticated;
grant update (display_name, device_hash) on public.profiles to authenticated;
revoke update on public.companies from authenticated;
grant update (same_conditions_ack, zones, services, phone, email) on public.companies to authenticated;
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
revoke insert on public.notifications from authenticated;          -- solo via funzioni
revoke insert on public.leads, public.lead_purchases, public.removals from authenticated;  -- solo via RPC
revoke update on public.leads, public.lead_purchases, public.removals, public.quotes from authenticated;
-- Inserimento diretto di una segnalazione: solo le colonne che l'utente fornisce davvero. Stato, moderazione,
-- esito del filtro automatico (ai_*) e colonne aggiunte in seguito (volti, promemoria) restano al server;
-- il trigger b_reports_validate_insert li azzera comunque (difesa in profondità).
revoke insert on public.reports from authenticated;
grant insert (venue_id, user_id, source, category, description, photo_path, photo_hash, capture_mode, captured_at,
              lat, lng, consent_accepted) on public.reports to authenticated;

-- -------------------------------------------------------------------------------------
-- profiles
-- -------------------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_moderator on public.profiles
  for select to authenticated using (public.is_moderator());
-- La riga nasce dal trigger su auth.users; l'utente può comunque crearla per sé se mancante.
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'utente' and not blocked and company_id is null and not spid_verified);
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- role, blocked, company_id, phone_verified, spid_verified cambiano solo via RPC/service role.

-- -------------------------------------------------------------------------------------
-- companies
-- -------------------------------------------------------------------------------------
-- Il pubblico legge dalla vista companies_public (sotto); la tabella completa (telefono, email,
-- owner_user_id) è per i membri della ditta e per la moderazione.
create policy companies_select_member on public.companies
  for select to authenticated using (id = public.current_company_id() or owner_user_id = auth.uid() or public.is_moderator());
create policy companies_insert_moderator on public.companies
  for insert to authenticated with check (public.is_moderator());
create policy companies_update_member on public.companies
  for update to authenticated
  using (id = public.current_company_id() or owner_user_id = auth.uid() or public.is_moderator())
  with check (id = public.current_company_id() or owner_user_id = auth.uid() or public.is_moderator());
-- sponsor_until e is_founder_company non sono nelle colonne concesse: solo via RPC sponsor_company / service role.

-- -------------------------------------------------------------------------------------
-- venues
-- -------------------------------------------------------------------------------------
create policy venues_select_all on public.venues
  for select to anon, authenticated using (true);
create policy venues_insert_moderator on public.venues
  for insert to authenticated with check (public.is_moderator());
create policy venues_update_moderator on public.venues
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
-- claimed_by e premium_until cambiano per i titolari solo via RPC claim_venue / set_venue_premium.

-- -------------------------------------------------------------------------------------
-- venue_owners
-- -------------------------------------------------------------------------------------
create policy venue_owners_select_own on public.venue_owners
  for select to authenticated using (user_id = auth.uid() or public.is_moderator());
create policy venue_owners_insert_moderator on public.venue_owners
  for insert to authenticated with check (public.is_moderator());
create policy venue_owners_delete_moderator on public.venue_owners
  for delete to authenticated using (public.is_moderator());

-- -------------------------------------------------------------------------------------
-- nas_notices (fonte pubblica)
-- -------------------------------------------------------------------------------------
create policy nas_notices_select_all on public.nas_notices
  for select to anon, authenticated using (true);
create policy nas_notices_insert_moderator on public.nas_notices
  for insert to authenticated with check (public.is_moderator());
create policy nas_notices_update_moderator on public.nas_notices
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- -------------------------------------------------------------------------------------
-- reports
-- Il pubblico (e i titolari) leggono dalla vista public_reports che nasconde user_id.
-- Sulla tabella: l'autore vede le proprie in ogni stato, la moderazione tutto.
-- Le ditte NON hanno accesso alla tabella: i dati del contatto arrivano da lead_details() dopo l'acquisto.
-- -------------------------------------------------------------------------------------
create policy reports_select_own on public.reports
  for select to authenticated using (user_id = auth.uid());
create policy reports_select_moderator on public.reports
  for select to authenticated using (public.is_moderator());
-- Inserimento diretto per sé: il trigger b_reports_validate_insert applica tutte le regole (distanza, età
-- della foto, 3/mese, utente verificato...). Consigliato comunque l'uso della RPC submit_report.
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and source = 'utente'
    and state = 'in_verifica'
    and moderator_id is null
    and nas_notice_id is null
  );
-- Nessun UPDATE diretto per gli utenti: moderazione sì (il trigger a_reports_guard_removal protegge 'rimossa').
create policy reports_update_moderator on public.reports
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
-- Nessuna policy di DELETE: le segnalazioni non si cancellano.

-- -------------------------------------------------------------------------------------
-- replies
-- -------------------------------------------------------------------------------------
create policy replies_select_public on public.replies
  for select to anon, authenticated using (public.report_is_public(report_id) or public.is_moderator() or author_id = auth.uid());
-- Solo il titolare del locale, sulla segnalazione pubblica del proprio locale (canReply).
create policy replies_insert_owner on public.replies
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and venue_id = public.report_public_venue(report_id)
    and public.is_venue_owner(venue_id)
  );
create policy replies_update_moderator on public.replies
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- -------------------------------------------------------------------------------------
-- leads / lead_purchases / quotes
-- -------------------------------------------------------------------------------------
-- Il contatto completo (venue_id, report_id) solo a: titolare del locale, moderazione, ditta che ha acquistato.
-- Le ditte vedono l'elenco anonimizzato dalla vista leads_anonymised.
-- Le policy di leads, lead_purchases e quotes NON contengono sottoquery dirette sulle altre due tabelle:
-- si richiamerebbero a vicenda ("infinite recursion detected in policy"). Usano le funzioni SECURITY DEFINER
-- company_bought_lead() e is_lead_venue_owner() di 0001_init.sql.
create policy leads_select on public.leads
  for select to authenticated
  using (public.is_venue_owner(venue_id) or public.is_moderator() or public.company_bought_lead(id));
-- INSERT/UPDATE solo via RPC request_quotes / buy_lead (privilegi revocati sopra).

create policy lead_purchases_select on public.lead_purchases
  for select to authenticated
  using (company_id = public.current_company_id() or public.is_moderator() or public.is_lead_venue_owner(lead_id));

create policy quotes_select on public.quotes
  for select to authenticated
  using (company_id = public.current_company_id() or public.is_moderator() or public.is_lead_venue_owner(lead_id));
-- Una ditta può inviare un preventivo solo se ha acquistato il contatto.
create policy quotes_insert_company on public.quotes
  for insert to authenticated
  with check (company_id = public.current_company_id() and accepted is null and public.company_bought_lead(lead_id));
-- accepted cambia solo via RPC accept_quote.

-- -------------------------------------------------------------------------------------
-- certificates
-- -------------------------------------------------------------------------------------
create policy certificates_select on public.certificates
  for select to anon, authenticated
  using (
    verified_at is not null                                   -- pubblico: certificati verificati
    or public.is_venue_owner(venue_id)
    or company_id = public.current_company_id()
    or public.is_moderator()
  );
create policy certificates_insert on public.certificates
  for insert to authenticated
  with check (
    (public.is_venue_owner(venue_id) or company_id = public.current_company_id())
    and venue_id = public.report_public_venue(report_id)      -- solo su segnalazioni pubbliche
    and verified_at is null and verified_by is null and rejected_at is null
  );
create policy certificates_update_moderator on public.certificates
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- -------------------------------------------------------------------------------------
-- removals (registro pubblico)
-- -------------------------------------------------------------------------------------
create policy removals_select_all on public.removals
  for select to anon, authenticated using (true);
-- INSERT solo via RPC remove_report (privilegio revocato); la moderazione può correggere una riga.
create policy removals_update_moderator on public.removals
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- -------------------------------------------------------------------------------------
-- dsa_notices
-- Il pubblico legge le richieste decise dalla vista dsa_notices_public (senza contatto).
-- -------------------------------------------------------------------------------------
create policy dsa_notices_select_moderator on public.dsa_notices
  for select to authenticated using (public.is_moderator());
-- Chiunque (anche anonimo) può inviare una richiesta DSA su una segnalazione.
create policy dsa_notices_insert_anyone on public.dsa_notices
  for insert to anon, authenticated
  with check (decided_at is null and decision is null and decision_note is null);
create policy dsa_notices_update_moderator on public.dsa_notices
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- -------------------------------------------------------------------------------------
-- notifications
-- -------------------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated using (to_user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (to_user_id = auth.uid()) with check (to_user_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (to_user_id = auth.uid());

-- -------------------------------------------------------------------------------------
-- audit_log: nessuna policy. Solo service_role (bypass RLS) e le funzioni SECURITY DEFINER.
-- -------------------------------------------------------------------------------------

-- -------------------------------------------------------------------------------------
-- blocked_devices
-- -------------------------------------------------------------------------------------
create policy blocked_devices_moderator on public.blocked_devices
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- =====================================================================================
-- VISTE PUBBLICHE
-- Le viste girano con i privilegi del proprietario (postgres, che aggira la RLS), quindi
-- hanno filtri espliciti e security_barrier = true per evitare che funzioni "leaky" li saltino.
-- =====================================================================================

-- Segnalazioni visibili al pubblico: SENZA user_id (identità del segnalante) e senza il consenso.
create view public.public_reports
with (security_barrier = true, security_invoker = false) as
select
  r.id, r.venue_id, r.source, r.category, r.description, r.photo_path, r.capture_mode, r.captured_at,
  r.lat, r.lng, r.distance_m,
  r.ai_verdict, r.ai_score, r.ai_simulated, r.ai_checked_at,
  r.state, r.submitted_at, r.moderated_at, r.published_at, r.reply_deadline_at, r.resolved_at,
  r.nas_notice_id, r.faces_blurred
from public.reports r
where r.state in ('pubblicata', 'risolta');
comment on view public.public_reports is 'Segnalazioni pubblicate/risolte senza l''identità del segnalante. Unica via di lettura per anon e titolari.';

-- Ditte: colonne pubbliche (niente owner_user_id, telefono, email).
create view public.companies_public
with (security_barrier = true, security_invoker = false) as
select c.id, c.name, c.vat, c.zones, c.services, c.sponsor_until, c.same_conditions_ack, c.is_founder_company, c.created_at
from public.companies c;

-- Contatti anonimizzati per le ditte: zona e categoria, mai il locale finché non si acquista.
create view public.leads_anonymised
with (security_barrier = true, security_invoker = false) as
select
  l.id, l.category, l.zone, l.created_at, l.price_cents, l.max_buyers, l.status,
  (select count(*) from public.lead_purchases lp where lp.lead_id = l.id)::integer as purchases_count,
  exists (select 1 from public.lead_purchases lp where lp.lead_id = l.id and lp.company_id = public.current_company_id()) as purchased_by_me
from public.leads l
where public.current_company_id() is not null or public.is_moderator();

-- Richieste DSA decise, senza il contatto di chi le ha inviate (rapporto di trasparenza).
create view public.dsa_notices_public
with (security_barrier = true, security_invoker = false) as
select d.id, d.report_id, d.received_at, d.decided_at, d.decision, d.decision_note
from public.dsa_notices d
where d.decided_at is not null;

-- Profili dei titolari di locale in forma minima (nome mostrato accanto alla replica).
create view public.profiles_public
with (security_barrier = true, security_invoker = false) as
select p.id, p.display_name, p.role
from public.profiles p
where p.role in ('locale', 'ditta', 'moderatore', 'admin') and not p.blocked;

grant select on public.public_reports, public.companies_public, public.dsa_notices_public, public.profiles_public to anon, authenticated;
grant select on public.leads_anonymised to authenticated;
revoke all on public.leads_anonymised from anon;
