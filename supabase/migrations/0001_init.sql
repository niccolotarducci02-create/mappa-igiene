-- =====================================================================================
-- Nitido — 0001_init.sql
-- Schema Postgres: enum, tabelle, indici, funzioni di supporto e trigger che applicano
-- le regole del piano (src/domain/rules.ts + src/domain/stateMachine.ts).
--
-- Convenzioni:
--  * identificatori in inglese, commenti in italiano;
--  * ogni eccezione ha come messaggio una chiave i18n ('rule.xxx') che il client traduce;
--    più motivi vengono uniti con la virgola ('rule.a,rule.b') come RuleViolation.reasons;
--  * i trigger sono SECURITY DEFINER: girano con i privilegi del proprietario (postgres)
--    e quindi non sono bloccati dalle policy RLS dell'utente che esegue la DML;
--  * nessuna DELETE sulle segnalazioni: solo stati "morbidi" (scartata, archiviata, rimossa).
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------------------
-- ENUM (specchio di src/domain/types.ts)
-- -------------------------------------------------------------------------------------
create type public.venue_type as enum ('ristorante', 'trattoria', 'pizzeria', 'bar', 'gelateria', 'pasticceria', 'altro');
create type public.venue_status as enum ('nessuna', 'in_verifica', 'confermata', 'risolta');
create type public.report_state as enum ('in_verifica', 'scartata', 'archiviata', 'pubblicata', 'risolta', 'rimossa');
create type public.report_category as enum ('blatte', 'roditori', 'formiche', 'mosche', 'sporcizia', 'muffa', 'alimenti', 'altro');
create type public.report_source as enum ('utente', 'nas');
create type public.capture_mode as enum ('fotocamera', 'file_demo');
create type public.user_role as enum ('utente', 'locale', 'ditta', 'moderatore', 'admin');
create type public.lead_status as enum ('aperto', 'completo', 'chiuso');
create type public.dsa_decision as enum ('rimossa', 'mantenuta');
create type public.removal_requester as enum ('locale', 'moderazione', 'dsa', 'utente');
create type public.notification_kind as enum (
  'segnalazione_scartata', 'segnalazione_archiviata', 'segnalazione_pubblicata',
  'nuova_segnalazione_locale', 'replica_ricevuta', 'nuovo_contatto', 'preventivo_ricevuto',
  'certificato_verificato', 'segnalazione_rimossa', 'generico'
);
create type public.ai_verdict as enum ('coerente', 'non_coerente', 'incerta');

-- -------------------------------------------------------------------------------------
-- COSTANTI DEL PIANO (stessi numeri di src/domain/rules.ts)
-- Funzioni IMMUTABLE così si possono usare in default, check e indici.
-- -------------------------------------------------------------------------------------
create function public.rule_max_reports_per_month() returns integer language sql immutable as $$ select 3 $$;
create function public.rule_reply_window_days() returns integer language sql immutable as $$ select 7 $$;
create function public.rule_max_distance_m() returns integer language sql immutable as $$ select 150 $$;
create function public.rule_max_capture_age_min() returns integer language sql immutable as $$ select 30 $$;
create function public.rule_lead_price_cents() returns integer language sql immutable as $$ select 3000 $$;
create function public.rule_lead_max_buyers() returns integer language sql immutable as $$ select 3 $$;
create function public.rule_ai_min_score() returns double precision language sql immutable as $$ select 0.55::double precision $$;

-- Motivi di rimozione ammessi (REMOVAL_REASONS). "pagamento" NON esiste e non deve mai esistere (regola 4).
create function public.is_removal_reason(p_reason text) returns boolean
language sql immutable as $$
  select p_reason in ('prova_insufficiente', 'foto_non_pertinente', 'locale_errato', 'contenuto_illecito', 'richiesta_dsa_accolta', 'richiesta_utente')
$$;

-- -------------------------------------------------------------------------------------
-- TABELLE
-- -------------------------------------------------------------------------------------

-- Profilo applicativo: 1:1 con auth.users. L'OTP via SMS è gestito da Supabase Auth.
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null default '',
  role           public.user_role not null default 'utente',
  phone          text,
  phone_verified boolean not null default false,
  spid_verified  boolean not null default false,
  device_hash    text,
  company_id     uuid,                       -- FK aggiunta dopo la creazione di companies
  blocked        boolean not null default false,
  created_at     timestamptz not null default now()
);
comment on table public.profiles is 'Profilo applicativo dell''utente (1:1 con auth.users). Il ruolo decide cosa può fare; i locali gestiti stanno in venue_owners.';

-- Ditte di disinfestazione / pulizie.
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  vat                 text not null,
  zones               text[] not null default '{}',
  services            public.report_category[] not null default '{}',
  owner_user_id       uuid references public.profiles (id) on delete set null,
  sponsor_until       timestamptz,
  same_conditions_ack boolean not null default false,   -- accettazione delle condizioni uguali per tutti (regola 4)
  is_founder_company  boolean not null default false,   -- la ditta del fondatore: serve solo a dimostrare che NON ha vantaggi
  phone               text,
  email               text,
  created_at          timestamptz not null default now()
);
comment on table public.companies is 'Ditte partner. sponsor_until e same_conditions_ack non danno alcun potere sulle segnalazioni (regola 4).';

alter table public.profiles
  add constraint profiles_company_id_fkey foreign key (company_id) references public.companies (id) on delete set null;

-- Locali (bar, ristoranti...). status è DERIVATO dalle segnalazioni (trigger).
create table public.venues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          public.venue_type not null default 'altro',
  address       text not null default '',
  lat           double precision not null,
  lng           double precision not null,
  status        public.venue_status not null default 'nessuna',
  claimed_by    uuid references public.profiles (id) on delete set null,
  premium_until timestamptz,
  created_at    timestamptz not null default now(),
  constraint venues_lat_check check (lat between -90 and 90),
  constraint venues_lng_check check (lng between -180 and 180)
);
comment on column public.venues.status is 'Derivato: confermata > in_verifica > risolta > nessuna. Ricalcolato dal trigger su reports.';

-- Titolari di un locale (oltre a venues.claimed_by). Un utente può gestire più locali.
create table public.venue_owners (
  venue_id   uuid not null references public.venues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

-- Comunicati pubblici dei NAS importati dalla moderazione.
create table public.nas_notices (
  id               uuid primary key default gen_random_uuid(),
  venue_name_raw   text not null,
  address_raw      text,
  source_url       text not null,
  published_at     timestamptz not null,
  summary          text not null,
  imported_at      timestamptz not null default now(),
  imported_by      uuid references public.profiles (id) on delete set null,
  venue_id         uuid references public.venues (id) on delete set null,
  linked_report_id uuid                      -- FK aggiunta dopo reports
);

-- Segnalazioni. La foto vive nello Storage (bucket "report-photos"), qui solo il percorso.
create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references public.venues (id) on delete restrict,
  user_id           uuid not null references public.profiles (id) on delete restrict,
  source            public.report_source not null default 'utente',
  category          public.report_category not null,
  description       text not null default '',
  photo_path        text,                    -- null per le segnalazioni NAS
  photo_hash        text,
  capture_mode      public.capture_mode not null default 'fotocamera',
  captured_at       timestamptz not null,
  lat               double precision not null,
  lng               double precision not null,
  distance_m        integer not null default 0,
  consent_accepted  boolean not null default false,   -- consenso alle regole della segnalazione (GDPR)
  -- esito del filtro automatico (Edge Function ai-photo-check)
  ai_verdict        public.ai_verdict,
  ai_score          double precision,
  ai_reasons        text[],
  ai_simulated      boolean,
  ai_checked_at     timestamptz,
  state             public.report_state not null default 'in_verifica',
  submitted_at      timestamptz not null default now(),
  moderated_at      timestamptz,
  moderator_id      uuid references public.profiles (id) on delete set null,
  moderation_note   text,
  published_at      timestamptz,
  reply_deadline_at timestamptz,             -- published_at + 7 giorni (trigger)
  resolved_at       timestamptz,
  removed_at        timestamptz,
  removal_reason    text,
  nas_notice_id     uuid references public.nas_notices (id) on delete set null,
  faces_blurred     boolean not null default false,
  constraint reports_removal_reason_check check (removal_reason is null or public.is_removal_reason(removal_reason)),
  constraint reports_ai_score_check check (ai_score is null or ai_score between 0 and 1),
  constraint reports_lat_check check (lat between -90 and 90),
  constraint reports_lng_check check (lng between -180 and 180)
);
comment on table public.reports is 'Segnalazioni degli utenti e comunicati NAS collegati. Mai cancellate: solo stati scartata/archiviata/rimossa.';

alter table public.nas_notices
  add constraint nas_notices_linked_report_id_fkey foreign key (linked_report_id) references public.reports (id) on delete set null;

-- Replica del locale (regola 3), mostrata accanto alla segnalazione.
create table public.replies (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  venue_id   uuid not null references public.venues (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete restrict,
  text       text not null check (length(btrim(text)) > 0),
  created_at timestamptz not null default now()
);

-- Contatto venduto alle ditte: 30 € a contatto, massimo 3 ditte, stesso prezzo per tutte.
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null unique references public.reports (id) on delete cascade,
  venue_id    uuid not null references public.venues (id) on delete cascade,
  category    public.report_category not null,
  zone        text not null,
  created_at  timestamptz not null default now(),
  price_cents integer not null default public.rule_lead_price_cents() check (price_cents > 0),
  max_buyers  integer not null default public.rule_lead_max_buyers() check (max_buyers > 0),
  status      public.lead_status not null default 'aperto'
);

create table public.lead_purchases (
  lead_id    uuid not null references public.leads (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  paid_cents integer not null check (paid_cents > 0),
  created_at timestamptz not null default now(),
  primary key (lead_id, company_id)          -- una ditta compra un contatto una volta sola
);

create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  company_id   uuid not null references public.companies (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  text         text not null default '',
  created_at   timestamptz not null default now(),
  accepted     boolean                       -- null = non ancora deciso dal locale
);

-- Certificato di intervento (bucket "certificates"); verificato dalla moderazione -> segnalazione risolta.
create table public.certificates (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.reports (id) on delete cascade,
  venue_id          uuid not null references public.venues (id) on delete cascade,
  company_id        uuid not null references public.companies (id) on delete restrict,
  file_path         text not null default '',
  intervention_type text not null check (length(btrim(intervention_type)) > 0),
  issued_at         timestamptz not null default now(),
  verified_at       timestamptz,
  verified_by       uuid references public.profiles (id) on delete set null,
  rejected_at       timestamptz,
  rejection_note    text,
  constraint certificates_not_both_check check (verified_at is null or rejected_at is null)
);

-- Registro pubblico delle rimozioni (trasparenza).
create table public.removals (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  venue_name   text not null,
  reason       text not null check (public.is_removal_reason(reason)),
  requested_by public.removal_requester not null,
  published_at timestamptz not null,
  removed_at   timestamptz not null default now()
);

-- Segnalazioni DSA (Digital Services Act): decisione entro 48 ore.
create table public.dsa_notices (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  contact       text not null check (length(btrim(contact)) > 0),
  reason        text not null check (length(btrim(reason)) > 0),
  received_at   timestamptz not null default now(),
  decided_at    timestamptz,
  decision      public.dsa_decision,
  decision_note text
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null default 'generico',
  title      text not null,
  body       text not null default '',
  link       text,
  created_at timestamptz not null default now(),
  read       boolean not null default false
);

-- Registro di audit: solo in scrittura dai trigger/funzioni, lettura via RPC list_audit (moderazione).
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor_id    uuid,                          -- null = sistema / anonimo
  action      text not null,
  target_type text not null,
  target_id   text not null default '',
  note        text
);

-- Dispositivi bloccati per abusi (device_hash calcolato dal client).
create table public.blocked_devices (
  device_hash text primary key,
  blocked_at  timestamptz not null default now(),
  blocked_by  uuid references public.profiles (id) on delete set null,
  note        text
);

-- -------------------------------------------------------------------------------------
-- INDICI (percorsi caldi)
-- -------------------------------------------------------------------------------------
create index reports_venue_state_idx        on public.reports (venue_id, state);
create index reports_user_submitted_idx     on public.reports (user_id, submitted_at desc);
create index reports_state_submitted_idx    on public.reports (state, submitted_at);
create index reports_photo_hash_idx         on public.reports (user_id, photo_hash) where photo_hash is not null and photo_hash <> '';
create index reports_photo_path_idx         on public.reports (photo_path) where photo_path is not null;
create index replies_report_idx             on public.replies (report_id, created_at);
create index leads_status_idx               on public.leads (status, created_at desc);
create index leads_venue_idx                on public.leads (venue_id);
create index lead_purchases_company_idx     on public.lead_purchases (company_id);
create index quotes_lead_idx                on public.quotes (lead_id, created_at);
create index certificates_venue_idx         on public.certificates (venue_id);
create index certificates_pending_idx       on public.certificates (issued_at) where verified_at is null and rejected_at is null;
create index notifications_user_read_idx    on public.notifications (to_user_id, read, created_at desc);
create index audit_log_at_idx               on public.audit_log (at desc);
create index venues_status_idx              on public.venues (status);
create index venue_owners_user_idx          on public.venue_owners (user_id);
create index profiles_company_idx           on public.profiles (company_id) where company_id is not null;
create index dsa_notices_report_idx         on public.dsa_notices (report_id);
create index removals_removed_idx           on public.removals (removed_at desc);

-- -------------------------------------------------------------------------------------
-- FUNZIONI DI SUPPORTO (usate da trigger, policy e RPC)
-- -------------------------------------------------------------------------------------

-- Distanza in metri tra due coordinate (haversine), come src/domain/geo.ts.
create function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns integer language sql immutable as $$
  select round(
    2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  )::integer
$$;

-- Zona approssimativa di Firenze (per anonimizzare i contatti), come zoneFor in geo.ts.
create function public.zone_for(p_lat double precision, p_lng double precision)
returns text language sql immutable as $$
  select case
    when p_lat < 43.765 then 'Oltrarno'
    when p_lng < 11.245 then 'Porta al Prato / Cascine'
    when p_lng > 11.27 then 'Campo di Marte / Sant''Ambrogio'
    when p_lat > 43.78 then 'San Marco / Statuto'
    else 'Centro storico'
  end
$$;

-- Vero quando non c'è una richiesta PostgREST in corso (connessione diretta: migrazioni, seed, psql).
create function public.is_direct_connection() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), nullif(current_setting('request.jwt.claim.role', true), '')) is null
$$;

-- Vero durante il seed locale (seed.sql imposta app.seeding = 'on'); mai vero dentro una richiesta API.
create function public.is_seeding() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.seeding', true), 'off') = 'on' and public.is_direct_connection()
$$;

-- Vero per la chiave service_role (Edge Functions, webhook pagamenti) o per connessione diretta.
create function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or public.is_direct_connection()
$$;

-- Ruolo applicativo dell'utente corrente: prima il claim JWT (app_metadata.role), poi profiles.role.
-- SECURITY DEFINER per non ricadere nelle policy di profiles (evita ricorsione).
create function public.current_profile_role() returns public.user_role
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_claim text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_role  public.user_role;
begin
  if auth.uid() is null then
    return null;
  end if;
  if v_claim in ('utente', 'locale', 'ditta', 'moderatore', 'admin') then
    return v_claim::public.user_role;
  end if;
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  return v_role;
end;
$$;

-- Alias richiesto dalle specifiche. ATTENZIONE: CURRENT_ROLE è una parola riservata di SQL, quindi
-- la funzione va sempre chiamata con nome qualificato e tra virgolette: public."current_role"().
create function public."current_role"() returns public.user_role
language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_profile_role()
$$;

create function public.is_moderator() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_profile_role() in ('moderatore', 'admin'), false)
$$;

-- La ditta dell'utente corrente (profiles.company_id oppure companies.owner_user_id).
create function public.current_company_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p.company_id from public.profiles p where p.id = auth.uid()),
    (select c.id from public.companies c where c.owner_user_id = auth.uid() limit 1)
  )
$$;

-- Vero se l'utente corrente è titolare del locale (venue_owners oppure venues.claimed_by).
create function public.is_venue_owner(p_venue_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue_id and vo.user_id = auth.uid())
    or exists (select 1 from public.venues v where v.id = p_venue_id and v.claimed_by = auth.uid())
  )
$$;

-- Titolari di un locale (venue_owners + claimed_by), come venueOwnerIds in localStore.ts.
create function public.venue_owner_ids(p_venue_id uuid) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select vo.user_id from public.venue_owners vo where vo.venue_id = p_venue_id
  union
  select v.claimed_by from public.venues v where v.id = p_venue_id and v.claimed_by is not null
$$;

-- Il locale di una segnalazione pubblica (pubblicata/risolta), altrimenti null. Usata dalle policy.
create function public.report_public_venue(p_report_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select r.venue_id from public.reports r where r.id = p_report_id and r.state in ('pubblicata', 'risolta')
$$;

create function public.report_is_public(p_report_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.report_public_venue(p_report_id) is not null
$$;

-- Vero se la ditta corrente ha acquistato il contatto. SECURITY DEFINER: usata dalle policy di leads,
-- lead_purchases e quotes al posto di sottoquery dirette, che si richiamerebbero a vicenda
-- (policy di leads -> lead_purchases -> policy di lead_purchases -> leads: "infinite recursion detected").
create function public.company_bought_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_company_id() is not null and exists (
    select 1 from public.lead_purchases lp where lp.lead_id = p_lead_id and lp.company_id = public.current_company_id()
  )
$$;

-- Vero se l'utente corrente è titolare del locale a cui si riferisce il contatto (stesso motivo: niente ricorsione).
create function public.is_lead_venue_owner(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_venue_owner((select l.venue_id from public.leads l where l.id = p_lead_id))
$$;

-- Vero se la ditta corrente ha acquistato il contatto legato alla segnalazione.
create function public.company_bought_report(p_report_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.leads l join public.lead_purchases lp on lp.lead_id = l.id
    where l.report_id = p_report_id and lp.company_id = public.current_company_id()
  )
$$;

-- Vero se la foto (percorso nello Storage) appartiene a una segnalazione pubblica.
create function public.photo_is_public(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.reports r where r.photo_path = p_path and r.state in ('pubblicata', 'risolta'))
$$;

-- Vero se la foto appartiene a una segnalazione il cui contatto è stato acquistato dalla ditta corrente.
create function public.photo_visible_to_company(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.reports r join public.leads l on l.report_id = r.id
    join public.lead_purchases lp on lp.lead_id = l.id
    where r.photo_path = p_path and lp.company_id = public.current_company_id()
  )
$$;

-- Vero se il file certificato appartiene a un certificato verificato (pubblico).
create function public.certificate_file_is_public(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.certificates c where c.file_path = p_path and c.verified_at is not null)
$$;

-- Cast sicuro text -> uuid (per i nomi delle cartelle nello Storage).
create function public.try_uuid(p_text text) returns uuid
language plpgsql immutable as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- Scrittura nel registro di audit.
create function public.write_audit(p_actor_id uuid, p_action text, p_target_type text, p_target_id text, p_note text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, note)
  values (p_actor_id, p_action, p_target_type, coalesce(p_target_id, ''), p_note)
$$;

-- Notifica in-app.
create function public.send_notification(p_to_user_id uuid, p_kind public.notification_kind, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (to_user_id, kind, title, body, link)
  select p_to_user_id, p_kind, p_title, coalesce(p_body, ''), p_link
  where p_to_user_id is not null
$$;

-- Numero di segnalazioni (fonte utente) inviate nel mese di calendario corrente (UTC, come isSameMonth).
-- Ognuno può contare solo le proprie: moderazione e sistema (trigger, service_role) quelle di chiunque,
-- altrimenti un uuid noto (claimed_by, author_id di una replica) rivelerebbe l'attività di un altro utente.
create function public.count_reports_this_month(p_user_id uuid default auth.uid()) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if p_user_id is null then
    return 0;
  end if;
  if p_user_id is distinct from auth.uid() and not (public.is_moderator() or public.is_service_role()) then
    raise exception 'rule.not_allowed';
  end if;
  select count(*)::integer into v_count from public.reports r
  where r.user_id = p_user_id and r.source = 'utente'
    and date_trunc('month', r.submitted_at at time zone 'UTC') = date_trunc('month', now() at time zone 'UTC');
  return v_count;
end;
$$;

-- Ricalcolo dello stato di un locale: confermata > in_verifica > risolta > nessuna (deriveVenueStatus).
create function public.recompute_venue_status(p_venue_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pub bool; v_ver bool; v_ris bool;
begin
  select coalesce(bool_or(state = 'pubblicata'), false),
         coalesce(bool_or(state = 'in_verifica'), false),
         coalesce(bool_or(state = 'risolta'), false)
    into v_pub, v_ver, v_ris
    from public.reports where venue_id = p_venue_id;
  update public.venues
     set status = case when v_pub then 'confermata' when v_ver then 'in_verifica' when v_ris then 'risolta' else 'nessuna' end::public.venue_status
   where id = p_venue_id;
end;
$$;

-- -------------------------------------------------------------------------------------
-- TRIGGER: auth.users -> profiles
-- -------------------------------------------------------------------------------------
-- Crea il profilo quando Supabase Auth crea l'utente (OTP SMS). Il telefono confermato vale come verifica.
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles as p (id, display_name, phone, phone_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'Utente ' || right(coalesce(new.phone, new.id::text), 4)),
    new.phone,
    new.phone_confirmed_at is not null
  )
  on conflict (id) do update
    set phone = coalesce(excluded.phone, p.phone),
        phone_verified = p.phone_verified or excluded.phone_verified;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of phone, phone_confirmed_at on auth.users
  for each row execute function public.handle_new_auth_user();

-- -------------------------------------------------------------------------------------
-- TRIGGER: reports
-- I trigger BEFORE scattano in ordine alfabetico di nome: a_ guardie, b_ validazione, c_ date.
-- -------------------------------------------------------------------------------------

-- a) Nessuno tranne la moderazione (o il seed) può portare una segnalazione a 'rimossa', e solo con
--    un motivo ammesso da una segnalazione pubblica. Nessun inserzionista tocca le segnalazioni (regola 4).
--    Inoltre una segnalazione con foto diventa 'pubblicata' solo con i volti sfocati (rule.blur_required) e con
--    la foto fuori dalla cartella <user_id>/ dello Storage: il percorso compare nella vista pubblica e nei dati
--    del contatto, e la cartella rivelerebbe l'identità del segnalante. Vale anche per gli UPDATE diretti della
--    moderazione, non solo per la RPC moderate_report.
create function public.reports_guard_removal() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.state = 'pubblicata' and (tg_op = 'INSERT' or old.state is distinct from new.state)
     and new.photo_path is not null and not public.is_seeding() then
    if not new.faces_blurred or split_part(new.photo_path, '/', 1) = new.user_id::text then
      raise exception 'rule.blur_required';
    end if;
  end if;
  if new.state = 'rimossa' and (tg_op = 'INSERT' or old.state is distinct from new.state) then
    if public.is_seeding() then
      return new;
    end if;
    if not public.is_moderator() then
      raise exception 'rule.moderator_only';
    end if;
    if new.removal_reason is null or not public.is_removal_reason(new.removal_reason) then
      raise exception 'rule.invalid_removal_reason';
    end if;
    if tg_op = 'UPDATE' and old.state not in ('pubblicata', 'risolta') then
      raise exception 'rule.not_published';
    end if;
  end if;
  -- il motivo di rimozione ha senso solo nello stato rimossa
  if new.state <> 'rimossa' and new.removal_reason is not null and tg_op = 'INSERT' then
    new.removal_reason := null;
  end if;
  return new;
end;
$$;

create trigger a_reports_guard_removal
  before insert or update of state, removal_reason on public.reports
  for each row execute function public.reports_guard_removal();

-- b) Validazione all'inserimento di una segnalazione utente (canSubmitReport):
--    utente verificato e non bloccato, dispositivo non bloccato, consenso, max 3 al mese,
--    solo fotocamera, foto recente (<= 30 min), entro 150 m dal locale, foto non già usata.
create function public.reports_validate_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_profile public.profiles%rowtype;
  v_venue   public.venues%rowtype;
  v_reasons text[] := '{}';
  v_age_min double precision;
begin
  if new.source = 'nas' or public.is_seeding() then
    return new;
  end if;

  -- Due invii concorrenti dello stesso utente vengono serializzati: il limite mensile non si supera "in parallelo".
  perform pg_advisory_xact_lock(hashtext('reports_month:' || new.user_id::text));

  -- NB: array_append e non `v_reasons || 'rule.x'`: con un letterale non tipizzato Postgres sceglie
  -- array || array e fallisce con "malformed array literal".
  select * into v_profile from public.profiles where id = new.user_id;
  if not found then
    v_reasons := array_append(v_reasons, 'rule.login_required');
  else
    if v_profile.blocked then v_reasons := array_append(v_reasons, 'rule.user_blocked'); end if;
    if not v_profile.phone_verified and not v_profile.spid_verified then v_reasons := array_append(v_reasons, 'rule.verified_user_required'); end if;
    if v_profile.device_hash is not null and exists (select 1 from public.blocked_devices b where b.device_hash = v_profile.device_hash) then
      v_reasons := array_append(v_reasons, 'rule.device_blocked');
    end if;
  end if;

  if not new.consent_accepted then v_reasons := array_append(v_reasons, 'rule.consent_required'); end if;

  if public.count_reports_this_month(new.user_id) >= public.rule_max_reports_per_month() then
    v_reasons := array_append(v_reasons, 'rule.max_reports');
  end if;

  -- in produzione è ammessa solo la fotocamera in-app (enforceCamera = true)
  if new.capture_mode <> 'fotocamera' then v_reasons := array_append(v_reasons, 'rule.camera_only'); end if;

  v_age_min := extract(epoch from (now() - new.captured_at)) / 60.0;
  if v_age_min < -5 then
    v_reasons := array_append(v_reasons, 'rule.capture_time_invalid');
  elsif v_age_min > public.rule_max_capture_age_min() then
    v_reasons := array_append(v_reasons, 'rule.capture_too_old');
  end if;

  select * into v_venue from public.venues where id = new.venue_id;
  if not found then
    v_reasons := array_append(v_reasons, 'rule.venue_required');
  else
    new.distance_m := public.haversine_m(new.lat, new.lng, v_venue.lat, v_venue.lng);
    if new.distance_m > public.rule_max_distance_m() then v_reasons := array_append(v_reasons, 'rule.too_far'); end if;
  end if;

  if coalesce(new.photo_hash, '') <> '' and exists (
    select 1 from public.reports r where r.user_id = new.user_id and r.photo_hash = new.photo_hash
  ) then
    v_reasons := array_append(v_reasons, 'rule.duplicate_photo');
  end if;

  if array_length(v_reasons, 1) > 0 then
    raise exception using message = array_to_string(v_reasons, ','), errcode = 'P0001';
  end if;

  -- campi che l'utente non può impostare da solo (stato, moderazione, date derivate e l'esito del filtro
  -- automatico: altrimenti un inserimento diretto con ai_checked_at già valorizzato salterebbe ai-photo-check)
  new.state := 'in_verifica';
  new.faces_blurred := false;
  new.moderated_at := null; new.moderator_id := null; new.moderation_note := null;
  new.published_at := null; new.reply_deadline_at := null; new.resolved_at := null;
  new.removed_at := null; new.removal_reason := null;
  new.ai_verdict := null; new.ai_score := null; new.ai_reasons := null; new.ai_simulated := null; new.ai_checked_at := null;
  new.submitted_at := now();
  return new;
end;
$$;

create trigger b_reports_validate_insert
  before insert on public.reports
  for each row execute function public.reports_validate_insert();

-- c) Date derivate dallo stato: pubblicata -> published_at e reply_deadline_at (+7 giorni);
--    risolta -> resolved_at; rimossa -> removed_at; moderazione -> moderated_at.
create function public.reports_set_dates() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_changed boolean := tg_op = 'INSERT' or old.state is distinct from new.state;
begin
  if new.state = 'pubblicata' and (v_changed or new.reply_deadline_at is null) then
    new.published_at := coalesce(new.published_at, now());
    new.reply_deadline_at := new.published_at + make_interval(days => public.rule_reply_window_days());
  end if;
  if v_changed and new.state in ('pubblicata', 'archiviata') then
    new.moderated_at := coalesce(new.moderated_at, now());
  end if;
  if v_changed and new.state = 'risolta' then
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  if v_changed and new.state = 'rimossa' then
    new.removed_at := coalesce(new.removed_at, now());
  end if;
  return new;
end;
$$;

create trigger c_reports_set_dates
  before insert or update on public.reports
  for each row execute function public.reports_set_dates();

-- d) Le segnalazioni non si cancellano mai.
create function public.reports_forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'rule.delete_forbidden';
end;
$$;

create trigger d_reports_forbid_delete
  before delete on public.reports
  for each row execute function public.reports_forbid_delete();

-- e) Dopo ogni cambio di stato: riga di audit e ricalcolo dello stato del locale.
create function public.reports_after_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.state is distinct from new.state then
    perform public.write_audit(auth.uid(), 'report_state_' || new.state::text, 'report', new.id::text, old.state::text || ' -> ' || new.state::text);
  end if;
  if tg_op = 'INSERT' or old.state is distinct from new.state or old.venue_id is distinct from new.venue_id then
    perform public.recompute_venue_status(new.venue_id);
    if tg_op = 'UPDATE' and old.venue_id is distinct from new.venue_id then
      perform public.recompute_venue_status(old.venue_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger e_reports_after_change
  after insert or update on public.reports
  for each row execute function public.reports_after_change();

-- -------------------------------------------------------------------------------------
-- TRIGGER: lead_purchases (max 3 ditte, una volta sola, stato del contatto)
-- -------------------------------------------------------------------------------------
create function public.lead_purchases_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lead public.leads%rowtype;
  v_count integer;
begin
  -- blocco della riga del contatto: due acquisti concorrenti non superano il massimo
  select * into v_lead from public.leads where id = new.lead_id for update;
  if not found then
    raise exception 'rule.unknown_lead';
  end if;
  if exists (select 1 from public.lead_purchases lp where lp.lead_id = new.lead_id and lp.company_id = new.company_id) then
    raise exception 'rule.lead_already_bought';
  end if;
  select count(*) into v_count from public.lead_purchases lp where lp.lead_id = new.lead_id;
  if v_count >= v_lead.max_buyers then
    raise exception 'rule.lead_full';
  end if;
  if v_lead.status <> 'aperto' then
    raise exception 'rule.lead_closed';
  end if;
  -- stesso prezzo per tutti, compresa la ditta del fondatore (regola 4)
  new.paid_cents := v_lead.price_cents;
  return new;
end;
$$;

create trigger a_lead_purchases_before_insert
  before insert on public.lead_purchases
  for each row execute function public.lead_purchases_before_insert();

create function public.lead_purchases_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.leads l
     set status = case when (select count(*) from public.lead_purchases lp where lp.lead_id = l.id) >= l.max_buyers then 'completo' else 'aperto' end::public.lead_status
   where l.id = new.lead_id and l.status <> 'chiuso';
  return null;
end;
$$;

create trigger b_lead_purchases_after_insert
  after insert on public.lead_purchases
  for each row execute function public.lead_purchases_after_insert();

-- Il prezzo di un contatto non si tocca dopo la creazione: nessuno sconto a nessuno.
create function public.leads_guard_price() returns trigger
language plpgsql as $$
begin
  if new.price_cents is distinct from old.price_cents or new.max_buyers is distinct from old.max_buyers then
    if not public.is_service_role() then
      raise exception 'rule.not_allowed';
    end if;
  end if;
  return new;
end;
$$;

create trigger a_leads_guard_price
  before update on public.leads
  for each row execute function public.leads_guard_price();

-- -------------------------------------------------------------------------------------
-- TRIGGER: audit sulle ditte e sui locali per i campi "a pagamento"
-- -------------------------------------------------------------------------------------
create function public.venues_after_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.claimed_by is distinct from new.claimed_by then
    perform public.write_audit(auth.uid(), 'venue_claimed_by_changed', 'venue', new.id::text, coalesce(new.claimed_by::text, 'null'));
  end if;
  return null;
end;
$$;

create trigger venues_after_update
  after update on public.venues
  for each row execute function public.venues_after_update();

create function public.companies_after_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.same_conditions_ack is distinct from new.same_conditions_ack then
    perform public.write_audit(auth.uid(), 'accept_same_conditions', 'company', new.id::text, new.same_conditions_ack::text);
  end if;
  return null;
end;
$$;

create trigger companies_after_update
  after update on public.companies
  for each row execute function public.companies_after_update();

-- Il registro di audit è append-only.
create function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'rule.not_allowed';
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
