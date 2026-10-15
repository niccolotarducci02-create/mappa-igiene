-- =====================================================================================
-- Mappa dell'Igiene — 0003_functions.sql
-- Funzioni RPC (chiamate dal client con supabase.rpc('nome', { p_param: ... })) e Storage.
--
--  * Tutte le RPC sono SECURITY DEFINER con controlli espliciti su auth.uid() / ruolo:
--    girano come proprietario (postgres) e quindi aggirano la RLS, perciò ogni funzione
--    verifica da sola chi la chiama.
--  * Ogni eccezione ha come messaggio una chiave i18n ('rule.xxx'); più motivi sono uniti
--    con la virgola. Il client: errorKeys(e) = e.message.split(',').
--  * I parametri hanno prefisso p_ per non confondersi con le colonne.
--  * Funzioni che restituiscono una riga (returns public.reports ...) arrivano al client come
--    oggetto JSON con le colonne snake_case; il client le mappa in camelCase.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Guardie comuni
-- -------------------------------------------------------------------------------------
-- Utente autenticato e non bloccato: un profilo bloccato (block_user) non può più usare alcuna RPC,
-- non solo l'invio di segnalazioni (replica, rivendicazione, acquisto contatti, preventivi...).
create function public.require_uid() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'rule.login_required';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.blocked) then
    raise exception 'rule.user_blocked';
  end if;
  return v_uid;
end;
$$;

create function public.require_moderator() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_uid();
begin
  if not public.is_moderator() then
    raise exception 'rule.moderator_only';
  end if;
  return v_uid;
end;
$$;

-- La ditta del chiamante, obbligatoria.
create function public.require_company(p_company_id uuid default null) returns public.companies
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_company public.companies%rowtype;
  v_id uuid := coalesce(p_company_id, public.current_company_id());
begin
  if v_id is null then
    raise exception 'rule.unknown_company';
  end if;
  select * into v_company from public.companies c where c.id = v_id;
  if not found then
    raise exception 'rule.unknown_company';
  end if;
  if not (v_company.owner_user_id = v_uid
          or exists (select 1 from public.profiles p where p.id = v_uid and p.company_id = v_company.id)
          or public.is_moderator()) then
    raise exception 'rule.not_allowed';
  end if;
  return v_company;
end;
$$;

-- Vero se il file di un certificato è della ditta corrente (per le policy dello Storage).
create function public.certificate_file_visible_to_company(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.certificates c where c.file_path = p_path and c.company_id = public.current_company_id())
$$;

-- Notifica a tutti i titolari di un locale.
create function public.notify_venue_owners(p_venue_id uuid, p_kind public.notification_kind, p_title text, p_body text, p_link text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  for v_owner in select * from public.venue_owner_ids(p_venue_id) loop
    perform public.send_notification(v_owner, p_kind, p_title, p_body, p_link);
  end loop;
end;
$$;

-- Notifica a tutta la moderazione.
create function public.notify_moderators(p_kind public.notification_kind, p_title text, p_body text, p_link text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_mod uuid;
begin
  for v_mod in select p.id from public.profiles p where p.role in ('moderatore', 'admin') and not p.blocked loop
    perform public.send_notification(v_mod, p_kind, p_title, p_body, p_link);
  end loop;
end;
$$;

-- =====================================================================================
-- LOCALI
-- =====================================================================================

-- Locali più vicini a un punto (per scegliere il locale da segnalare).
create function public.nearest_venues(p_lat double precision, p_lng double precision, p_limit integer default 8)
returns table (
  id uuid, name text, type public.venue_type, address text, lat double precision, lng double precision,
  status public.venue_status, claimed_by uuid, premium_until timestamptz, created_at timestamptz, distance_m integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.id, v.name, v.type, v.address, v.lat, v.lng, v.status, v.claimed_by, v.premium_until, v.created_at,
         public.haversine_m(p_lat, p_lng, v.lat, v.lng)
  from public.venues v
  order by 11, v.name
  limit greatest(coalesce(p_limit, 8), 1)
$$;

-- Rivendicazione del locale (regola 3: il diritto di replica spetta al locale, non a chiunque).
-- La richiesta NON attiva nulla: resta "in_verifica" finché la moderazione non controlla i dati
-- (visura camerale, telefono) e la approva con decide_venue_claim. Solo allora vengono scritti
-- venues.claimed_by / venue_owners e il ruolo 'locale'. Nella demo (LocalStore) è immediata.
create type public.claim_status as enum ('in_verifica', 'approvata', 'rifiutata');

create table public.venue_claims (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  vat        text not null,
  phone      text,
  status     public.claim_status not null default 'in_verifica',
  note       text,                                      -- motivo della moderazione (soprattutto se rifiutata)
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
comment on table public.venue_claims is 'Richieste di gestione di un locale. Diventano titolarità (claimed_by/venue_owners) solo se approvate dalla moderazione.';
create unique index venue_claims_pending_idx on public.venue_claims (venue_id, user_id) where status = 'in_verifica';
create index venue_claims_status_idx on public.venue_claims (status, created_at);

alter table public.venue_claims enable row level security;
revoke all on public.venue_claims from anon;
revoke insert, update, delete on public.venue_claims from authenticated;   -- solo tramite le RPC qui sotto
create policy venue_claims_select_own on public.venue_claims
  for select to authenticated using (user_id = auth.uid() or public.is_moderator());

-- Il titolare chiede di gestire il locale con partita IVA e telefono: crea una richiesta in verifica,
-- avvisa la moderazione e restituisce il locale (ancora senza claimed_by).
create function public.claim_venue(p_venue_id uuid, p_vat text, p_phone text default null)
returns public.venues
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_venue public.venues%rowtype;
  v_vat text := regexp_replace(coalesce(p_vat, ''), '\s+', '', 'g');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'), '');
begin
  select * into v_venue from public.venues v where v.id = p_venue_id for update;
  if not found then
    raise exception 'rule.unknown_venue';
  end if;
  if v_venue.claimed_by is not null and v_venue.claimed_by <> v_uid then
    raise exception 'rule.venue_already_claimed';
  end if;
  if public.is_venue_owner(p_venue_id) then
    return v_venue;                                      -- già titolare: niente da fare
  end if;
  if v_vat !~* '^(IT)?\d{11}$' then
    raise exception 'rule.invalid_vat';
  end if;
  if exists (select 1 from public.venue_claims c
              where c.venue_id = p_venue_id and c.user_id = v_uid and c.status = 'in_verifica') then
    raise exception 'rule.claim_pending';
  end if;

  insert into public.venue_claims (venue_id, user_id, vat, phone) values (p_venue_id, v_uid, v_vat, v_phone);
  perform public.notify_moderators('generico', 'Rivendicazione da verificare',
    v_venue.name || ' · P.IVA ' || v_vat, '/moderazione');
  perform public.write_audit(v_uid, 'claim_venue_requested', 'venue', p_venue_id::text, v_vat);
  return v_venue;
end;
$$;

-- La moderazione approva o rifiuta una rivendicazione. Solo l'approvazione rende l'utente titolare.
create function public.decide_venue_claim(p_claim_id uuid, p_accept boolean, p_note text default null)
returns public.venue_claims
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_claim public.venue_claims%rowtype;
  v_venue public.venues%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_claim from public.venue_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'rule.unknown_claim';
  end if;
  if v_claim.status <> 'in_verifica' then
    raise exception 'rule.already_decided';
  end if;
  select * into v_venue from public.venues v where v.id = v_claim.venue_id for update;
  if not found then
    raise exception 'rule.unknown_venue';
  end if;

  if p_accept then
    if v_venue.claimed_by is not null and v_venue.claimed_by <> v_claim.user_id then
      raise exception 'rule.venue_already_claimed';
    end if;
    if exists (select 1 from public.profiles p where p.id = v_claim.user_id and p.blocked) then
      raise exception 'rule.user_blocked';
    end if;
    update public.venues set claimed_by = v_claim.user_id where id = v_claim.venue_id;
    insert into public.venue_owners (venue_id, user_id) values (v_claim.venue_id, v_claim.user_id) on conflict do nothing;
    update public.profiles
       set role = case when role = 'utente' then 'locale'::public.user_role else role end,
           phone = coalesce(phone, v_claim.phone)
     where id = v_claim.user_id;
    update public.venue_claims set status = 'approvata', note = v_note, decided_at = now(), decided_by = v_uid
     where id = p_claim_id returning * into v_claim;
    perform public.send_notification(v_claim.user_id, 'generico', 'Rivendicazione approvata',
      'Ora gestisci ' || v_venue.name || ' in app: repliche, preventivi e certificati.', '/locale/' || v_venue.id || '/gestisci');
    perform public.write_audit(v_uid, 'claim_venue_approved', 'venue', v_venue.id::text, v_claim.vat);
  else
    update public.venue_claims set status = 'rifiutata', note = v_note, decided_at = now(), decided_by = v_uid
     where id = p_claim_id returning * into v_claim;
    perform public.send_notification(v_claim.user_id, 'generico', 'Rivendicazione non approvata',
      coalesce(v_note, 'I dati forniti per ' || v_venue.name || ' non sono stati confermati.'), '/locale/' || v_venue.id);
    perform public.write_audit(v_uid, 'claim_venue_rejected', 'venue', v_venue.id::text, v_claim.vat);
  end if;
  return v_claim;
end;
$$;

-- Premium 20 €/mese. In produzione la chiama il webhook del pagamento (service_role);
-- nella beta la può chiamare il titolare e l'audit riporta "pagamento simulato".
create function public.set_venue_premium(p_venue_id uuid, p_months integer)
returns public.venues
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_venue public.venues%rowtype;
  v_base timestamptz;
  v_simulated boolean := not public.is_service_role();
begin
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'rule.invalid_amount';
  end if;
  if v_simulated and not (public.is_venue_owner(p_venue_id) or public.is_moderator()) then
    raise exception 'rule.not_venue_owner';
  end if;
  select * into v_venue from public.venues v where v.id = p_venue_id for update;
  if not found then
    raise exception 'rule.unknown_venue';
  end if;
  v_base := greatest(coalesce(v_venue.premium_until, now()), now());
  update public.venues set premium_until = v_base + make_interval(months => p_months)
   where id = p_venue_id returning * into v_venue;
  perform public.write_audit(coalesce(auth.uid(), v_venue.claimed_by), 'premium', 'venue', p_venue_id::text,
    p_months || ' mesi' || case when v_simulated then ' (pagamento simulato, beta)' else ' (pagamento confermato)' end);
  return v_venue;
end;
$$;

-- =====================================================================================
-- SEGNALAZIONI
-- =====================================================================================

-- Invio di una segnalazione. Le regole (distanza <= 150 m, foto <= 30 min, utente verificato,
-- consenso, dispositivo non bloccato, max 3/mese, foto non duplicata) sono applicate dal trigger
-- b_reports_validate_insert; qui si aggiungono i controlli che servono prima dell'INSERT.
-- La foto va caricata PRIMA nel bucket report-photos in <auth.uid()>/<file>; p_photo_path è quel percorso.
create function public.submit_report(
  p_venue_id uuid,
  p_category public.report_category,
  p_description text,
  p_photo_path text,
  p_photo_hash text,
  p_capture_mode public.capture_mode,
  p_captured_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_consent_accepted boolean,
  p_device_hash text default null
)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_report public.reports%rowtype;
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  if p_venue_id is null then
    raise exception 'rule.venue_required';
  end if;
  if v_photo is null then
    raise exception 'rule.camera_only';
  end if;
  -- la foto deve stare nella cartella dell'utente (coerente con le policy dello Storage)
  if split_part(v_photo, '/', 1) <> v_uid::text then
    raise exception 'rule.not_allowed';
  end if;
  if not coalesce(p_consent_accepted, false) then
    raise exception 'rule.consent_required';
  end if;
  if p_device_hash is not null then
    if exists (select 1 from public.blocked_devices b where b.device_hash = p_device_hash) then
      raise exception 'rule.device_blocked';
    end if;
    update public.profiles set device_hash = p_device_hash where id = v_uid;
  end if;

  insert into public.reports (
    venue_id, user_id, source, category, description, photo_path, photo_hash, capture_mode, captured_at,
    lat, lng, consent_accepted, state
  ) values (
    p_venue_id, v_uid, 'utente', p_category, btrim(coalesce(p_description, '')), v_photo, nullif(p_photo_hash, ''),
    coalesce(p_capture_mode, 'fotocamera'), p_captured_at, p_lat, p_lng, true, 'in_verifica'
  )
  returning * into v_report;

  perform public.write_audit(v_uid, 'submit_report', 'report', v_report.id::text, v_report.state::text);
  return v_report;
end;
$$;

-- Esito del filtro automatico (Edge Function ai-photo-check con service_role; o moderazione).
-- Come applyAiCheck: 'non_coerente' con punteggio sotto soglia -> scartata; 'incerta' resta in verifica.
create function public.apply_ai_check(
  p_report_id uuid,
  p_verdict public.ai_verdict,
  p_score double precision,
  p_reasons text[] default '{}',
  p_simulated boolean default false
)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_report public.reports%rowtype;
  v_passes boolean;
  v_borderline boolean;
  v_new_state public.report_state;
begin
  if not (public.is_service_role() or public.is_moderator()) then
    raise exception 'rule.moderator_only';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if v_report.state <> 'in_verifica' then
    raise exception 'rule.not_in_verification';
  end if;
  v_passes := p_verdict <> 'non_coerente' and p_score >= public.rule_ai_min_score();
  v_borderline := p_verdict = 'incerta' or (p_verdict = 'coerente' and p_score < public.rule_ai_min_score());
  v_new_state := case when v_passes or v_borderline then 'in_verifica' else 'scartata' end;

  update public.reports
     set ai_verdict = p_verdict, ai_score = p_score, ai_reasons = coalesce(p_reasons, '{}'),
         ai_simulated = coalesce(p_simulated, false), ai_checked_at = now(), state = v_new_state
   where id = p_report_id
   returning * into v_report;

  if v_new_state = 'scartata' then
    perform public.send_notification(v_report.user_id, 'segnalazione_scartata', 'Segnalazione scartata',
      'La foto non è risultata coerente con una segnalazione igienica. Puoi riprovare con una foto più chiara.', '/profilo');
  end if;
  perform public.write_audit(auth.uid(), 'ai_check', 'report', p_report_id::text, p_verdict::text || ' ' || round(p_score::numeric, 2)::text);
  return v_report;
end;
$$;

-- Sostituisce la foto con la versione a volti sfocati (caricata dalla moderazione nel bucket).
create function public.set_report_blurred(p_report_id uuid, p_new_photo_path text)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if v_report.state <> 'in_verifica' then
    raise exception 'rule.not_in_verification';
  end if;
  if nullif(btrim(coalesce(p_new_photo_path, '')), '') is null then
    raise exception 'rule.empty_text';
  end if;
  -- La versione pubblicabile deve stare fuori dalla cartella <user_id>/ del segnalante (es. blurred/<report_id>/...):
  -- il percorso finisce nella vista pubblica e nei dati del contatto e rivelerebbe chi ha segnalato.
  -- Il client copia il file anche quando non ci sono volti da sfocare.
  if split_part(btrim(p_new_photo_path), '/', 1) = v_report.user_id::text or btrim(p_new_photo_path) ~* '^https?://' then
    raise exception 'rule.not_allowed';
  end if;
  update public.reports set photo_path = btrim(p_new_photo_path), faces_blurred = true
   where id = p_report_id returning * into v_report;
  perform public.write_audit(v_uid, 'blur_photo', 'report', p_report_id::text);
  return v_report;
end;
$$;

-- Decisione della moderazione: 'conferma' -> pubblicata (7 giorni di replica), 'archivia' -> archiviata.
create function public.moderate_report(p_report_id uuid, p_decision text, p_note text default null)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_report public.reports%rowtype;
  v_venue public.venues%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_decision not in ('conferma', 'archivia') then
    raise exception 'rule.not_allowed';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if v_report.state <> 'in_verifica' then
    raise exception 'rule.not_in_verification';
  end if;
  if p_decision = 'conferma' and v_report.photo_path is not null and not v_report.faces_blurred then
    raise exception 'rule.blur_required';
  end if;
  select * into v_venue from public.venues v where v.id = v_report.venue_id;

  if p_decision = 'archivia' then
    update public.reports
       set state = 'archiviata', moderated_at = now(), moderator_id = v_uid, moderation_note = v_note
     where id = p_report_id returning * into v_report;
    perform public.send_notification(v_report.user_id, 'segnalazione_archiviata', 'Segnalazione archiviata',
      coalesce('Motivo: ' || v_note, 'La moderazione non ha confermato la segnalazione.'), '/profilo');
  else
    update public.reports
       set state = 'pubblicata', moderated_at = now(), moderator_id = v_uid, moderation_note = v_note,
           published_at = now()   -- il trigger c_reports_set_dates imposta reply_deadline_at = published_at + 7 giorni
     where id = p_report_id returning * into v_report;
    perform public.send_notification(v_report.user_id, 'segnalazione_pubblicata', 'Segnalazione pubblicata',
      'La tua segnalazione su ' || v_venue.name || ' è stata confermata e pubblicata.', '/locale/' || v_venue.id);
    perform public.notify_venue_owners(v_venue.id, 'nuova_segnalazione_locale', 'Nuova segnalazione sul tuo locale',
      'Hai 7 giorni per replicare e chiedere preventivi alle ditte partner.', '/locale/' || v_venue.id || '/gestisci');
  end if;
  perform public.write_audit(v_uid, 'moderate_' || p_decision, 'report', p_report_id::text, v_note);
  return v_report;
end;
$$;

-- Rimozione: SOLO la moderazione, con motivo ammesso, da una segnalazione pubblica; entra nel registro pubblico.
-- Non esiste un motivo "pagamento" né un percorso per le ditte (regola 4).
create function public.remove_report(p_report_id uuid, p_reason text, p_requested_by public.removal_requester default 'moderazione')
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_report public.reports%rowtype;
  v_venue_name text;
begin
  if not public.is_removal_reason(p_reason) then
    raise exception 'rule.invalid_removal_reason';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if v_report.state not in ('pubblicata', 'risolta') then
    raise exception 'rule.not_published';
  end if;
  select v.name into v_venue_name from public.venues v where v.id = v_report.venue_id;

  update public.reports set state = 'rimossa', removed_at = now(), removal_reason = p_reason
   where id = p_report_id returning * into v_report;
  insert into public.removals (report_id, venue_name, reason, requested_by, published_at, removed_at)
  values (p_report_id, coalesce(v_venue_name, ''), p_reason, coalesce(p_requested_by, 'moderazione'),
          coalesce(v_report.published_at, v_report.submitted_at), v_report.removed_at);
  perform public.write_audit(v_uid, 'remove_report', 'report', p_report_id::text, p_requested_by::text || ': ' || p_reason);
  perform public.send_notification(v_report.user_id, 'segnalazione_rimossa', 'Segnalazione rimossa',
    'La segnalazione è stata rimossa dalla mappa; la rimozione è registrata nel registro pubblico.', '/trasparenza');
  return v_report;
end;
$$;

-- Blocco di un utente (e del suo dispositivo) per abusi.
create function public.block_user(p_user_id uuid)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_profile public.profiles%rowtype;
begin
  update public.profiles set blocked = true where id = p_user_id returning * into v_profile;
  if not found then
    raise exception 'rule.unknown_user';
  end if;
  if v_profile.device_hash is not null then
    insert into public.blocked_devices (device_hash, blocked_by, note)
    values (v_profile.device_hash, v_uid, 'block_user ' || p_user_id::text)
    on conflict (device_hash) do nothing;
  end if;
  perform public.write_audit(v_uid, 'block_user', 'profile', p_user_id::text);
  return v_profile;
end;
$$;

-- Replica del locale (regola 3): solo il titolare, solo su segnalazione pubblicata/risolta.
create function public.add_reply(p_report_id uuid, p_text text)
returns public.replies
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_report public.reports%rowtype;
  v_reply public.replies%rowtype;
  v_text text := btrim(coalesce(p_text, ''));
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if v_report.state not in ('pubblicata', 'risolta') then
    raise exception 'rule.not_published';
  end if;
  if not public.is_venue_owner(v_report.venue_id) then
    raise exception 'rule.not_venue_owner';
  end if;
  if v_text = '' then
    raise exception 'rule.empty_text';
  end if;
  insert into public.replies (report_id, venue_id, author_id, text)
  values (p_report_id, v_report.venue_id, v_uid, v_text) returning * into v_reply;
  perform public.write_audit(v_uid, 'reply', 'report', p_report_id::text);
  perform public.send_notification(v_report.user_id, 'replica_ricevuta', 'Il locale ha risposto',
    'Il locale ha pubblicato una replica accanto alla tua segnalazione.', '/locale/' || v_report.venue_id);
  return v_reply;
end;
$$;

-- =====================================================================================
-- DITTE E CONTATTI
-- =====================================================================================

-- Accettazione esplicita delle condizioni uguali per tutti (regola 4).
create function public.accept_same_conditions(p_company_id uuid default null)
returns public.companies
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company public.companies := public.require_company(p_company_id);
begin
  update public.companies set same_conditions_ack = true where id = v_company.id returning * into v_company;
  return v_company;
end;
$$;

-- Scheda sponsorizzata 100 €/mese. Come set_venue_premium: webhook (service_role) in produzione,
-- pagamento simulato nella beta. Lo sponsor non compra alcun potere sulle segnalazioni (regola 4).
create function public.sponsor_company(p_company_id uuid, p_months integer)
returns public.companies
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company public.companies%rowtype;
  v_base timestamptz;
  v_simulated boolean := not public.is_service_role();
begin
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'rule.invalid_amount';
  end if;
  if v_simulated then
    v_company := public.require_company(p_company_id);
  end if;
  select * into v_company from public.companies c where c.id = p_company_id for update;
  if not found then
    raise exception 'rule.unknown_company';
  end if;
  v_base := greatest(coalesce(v_company.sponsor_until, now()), now());
  update public.companies set sponsor_until = v_base + make_interval(months => p_months)
   where id = p_company_id returning * into v_company;
  perform public.write_audit(coalesce(auth.uid(), v_company.owner_user_id), 'sponsor', 'company', p_company_id::text,
    p_months || ' mesi' || case when v_simulated then ' (pagamento simulato, beta)' else ' (pagamento confermato)' end);
  return v_company;
end;
$$;

-- Il titolare chiede preventivi: nasce il contatto (zona anonima, 30 €, max 3 ditte). Idempotente.
create function public.request_quotes(p_report_id uuid)
returns public.leads
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_report public.reports%rowtype;
  v_lead public.leads%rowtype;
  v_company record;
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if not public.is_venue_owner(v_report.venue_id) then
    raise exception 'rule.not_venue_owner';
  end if;
  select * into v_lead from public.leads l where l.report_id = p_report_id;
  if found then
    return v_lead;
  end if;
  if v_report.state <> 'pubblicata' then
    raise exception 'rule.not_published';
  end if;

  insert into public.leads (report_id, venue_id, category, zone, price_cents, max_buyers, status)
  values (p_report_id, v_report.venue_id, v_report.category, public.zone_for(v_report.lat, v_report.lng),
          public.rule_lead_price_cents(), public.rule_lead_max_buyers(), 'aperto')
  returning * into v_lead;
  perform public.write_audit(v_uid, 'request_quotes', 'lead', v_lead.id::text);

  for v_company in
    select c.owner_user_id from public.companies c
    where c.owner_user_id is not null and (v_lead.category = any (c.services) or 'altro' = any (c.services))
  loop
    perform public.send_notification(v_company.owner_user_id, 'nuovo_contatto', 'Nuovo contatto disponibile',
      v_lead.category::text || ' · ' || v_lead.zone || ' · 30 € a contatto, massimo 3 ditte.', '/ditte');
  end loop;
  return v_lead;
end;
$$;

-- Acquisto di un contatto da parte della ditta del chiamante: stesso prezzo per tutti (anche la ditta
-- del fondatore), massimo 3 ditte, una volta sola, solo se i servizi coprono la categoria (canBuyLead).
create function public.buy_lead(p_lead_id uuid)
returns public.leads
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company public.companies := public.require_company();
  v_lead public.leads%rowtype;
  v_reasons text[] := '{}';
  v_count integer;
begin
  select * into v_lead from public.leads l where l.id = p_lead_id for update;
  if not found then
    raise exception 'rule.unknown_lead';
  end if;
  select count(*) into v_count from public.lead_purchases lp where lp.lead_id = p_lead_id;

  -- array_append e non `v_reasons || 'rule.x'` (letterale non tipizzato -> "malformed array literal")
  if not v_company.same_conditions_ack then v_reasons := array_append(v_reasons, 'rule.same_conditions_ack'); end if;
  if v_lead.status <> 'aperto' then v_reasons := array_append(v_reasons, 'rule.lead_closed'); end if;
  if v_count >= v_lead.max_buyers then v_reasons := array_append(v_reasons, 'rule.lead_full'); end if;
  if exists (select 1 from public.lead_purchases lp where lp.lead_id = p_lead_id and lp.company_id = v_company.id) then
    v_reasons := array_append(v_reasons, 'rule.lead_already_bought');
  end if;
  if not (v_lead.category = any (v_company.services) or 'altro' = any (v_company.services)) then
    v_reasons := array_append(v_reasons, 'rule.service_mismatch');
  end if;
  if array_length(v_reasons, 1) > 0 then
    raise exception using message = array_to_string(v_reasons, ','), errcode = 'P0001';
  end if;

  -- priceForCompany: il prezzo del contatto, identico per tutte le ditte
  insert into public.lead_purchases (lead_id, company_id, paid_cents)
  values (p_lead_id, v_company.id, v_lead.price_cents);
  perform public.write_audit(auth.uid(), 'buy_lead', 'lead', p_lead_id::text, (v_lead.price_cents / 100.0)::numeric(10,2)::text || ' €');

  select * into v_lead from public.leads l where l.id = p_lead_id;
  return v_lead;
end;
$$;

-- Dati del locale per la ditta che ha acquistato il contatto (LeadView: venueName, venueAddress, venuePhone, photo).
create function public.lead_details(p_lead_id uuid)
returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_company_id uuid := public.current_company_id();
  v_lead public.leads%rowtype;
begin
  select * into v_lead from public.leads l where l.id = p_lead_id;
  if not found then
    raise exception 'rule.unknown_lead';
  end if;
  -- moderazione: sempre (anche senza una ditta); ditta: solo dopo l'acquisto
  if not (public.is_moderator() or (v_company_id is not null and exists (
    select 1 from public.lead_purchases lp where lp.lead_id = p_lead_id and lp.company_id = v_company_id
  ))) then
    raise exception 'rule.lead_not_purchased';
  end if;
  return (
    select json_build_object(
      'leadId', v_lead.id,
      'venueId', v.id,
      'venueName', v.name,
      'venueAddress', v.address,
      'venuePhone', (select p.phone from public.profiles p
                      where p.id in (select public.venue_owner_ids(v.id)) and p.phone is not null
                      order by p.created_at limit 1),
      'photoPath', r.photo_path,
      'category', r.category,
      'description', r.description
    )
    from public.venues v join public.reports r on r.id = v_lead.report_id
    where v.id = v_lead.venue_id
  );
end;
$$;

-- Preventivo della ditta: solo dopo l'acquisto del contatto.
create function public.submit_quote(p_lead_id uuid, p_amount_cents integer, p_text text default '')
returns public.quotes
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company public.companies := public.require_company();
  v_lead public.leads%rowtype;
  v_quote public.quotes%rowtype;
begin
  select * into v_lead from public.leads l where l.id = p_lead_id;
  if not found then
    raise exception 'rule.unknown_lead';
  end if;
  if not exists (select 1 from public.lead_purchases lp where lp.lead_id = p_lead_id and lp.company_id = v_company.id) then
    raise exception 'rule.lead_not_purchased';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'rule.invalid_amount';
  end if;
  insert into public.quotes (lead_id, company_id, amount_cents, text)
  values (p_lead_id, v_company.id, p_amount_cents, btrim(coalesce(p_text, ''))) returning * into v_quote;
  perform public.notify_venue_owners(v_lead.venue_id, 'preventivo_ricevuto', 'Nuovo preventivo',
    v_company.name || ': ' || (p_amount_cents / 100)::text || ' €', '/locale/' || v_lead.venue_id || '/gestisci');
  perform public.write_audit(auth.uid(), 'quote', 'lead', p_lead_id::text, v_quote.id::text);
  return v_quote;
end;
$$;

-- Preventivi di un contatto nell'ordine mostrato al locale (sortQuotesForVenue): prima gli sponsor attivi,
-- MAI la ditta del fondatore in testa, poi per ordine di arrivo. Titolare/moderazione: tutti; ditta: solo i propri.
create function public.quotes_for_lead(p_lead_id uuid)
returns setof public.quotes
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_lead public.leads%rowtype;
  v_all boolean;
begin
  select * into v_lead from public.leads l where l.id = p_lead_id;
  if not found then
    raise exception 'rule.unknown_lead';
  end if;
  v_all := public.is_moderator() or public.is_venue_owner(v_lead.venue_id);
  if not v_all and public.current_company_id() is null then
    raise exception 'rule.not_allowed';
  end if;
  return query
    select q.*
    from public.quotes q
    left join public.companies c on c.id = q.company_id
    where q.lead_id = p_lead_id
      and (v_all or q.company_id = public.current_company_id())
    order by
      case when c.id is null or c.is_founder_company or c.sponsor_until is null or c.sponsor_until <= now() then 1 else 0 end,
      q.created_at;
end;
$$;

-- Il titolare accetta un preventivo (gli altri dello stesso contatto diventano non accettati).
create function public.accept_quote(p_quote_id uuid)
returns public.quotes
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_quote public.quotes%rowtype;
  v_lead public.leads%rowtype;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id;
  if not found then
    raise exception 'rule.unknown_quote';
  end if;
  select * into v_lead from public.leads l where l.id = v_quote.lead_id;
  if not public.is_venue_owner(v_lead.venue_id) then
    raise exception 'rule.not_venue_owner';
  end if;
  update public.quotes set accepted = (id = p_quote_id) where lead_id = v_quote.lead_id;
  select * into v_quote from public.quotes q where q.id = p_quote_id;
  perform public.write_audit(v_uid, 'accept_quote', 'quote', p_quote_id::text);
  return v_quote;
end;
$$;

-- =====================================================================================
-- CERTIFICATI
-- =====================================================================================

-- Caricamento del certificato (file già nel bucket certificates in <venue_id>/<file>) da parte del
-- titolare o della ditta che ha eseguito l'intervento. Solo su segnalazione pubblicata.
create function public.upload_certificate(p_report_id uuid, p_company_id uuid, p_file_path text, p_intervention_type text)
returns public.certificates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_report public.reports%rowtype;
  v_company public.companies%rowtype;
  v_cert public.certificates%rowtype;
  v_type text := btrim(coalesce(p_intervention_type, ''));
  v_file text := btrim(coalesce(p_file_path, ''));
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'rule.unknown_report';
  end if;
  if v_report.state <> 'pubblicata' then
    raise exception 'rule.not_published';
  end if;
  -- il file deve stare nella cartella <venue_id>/ del bucket certificates (come lo carica il client): così un
  -- titolare non può registrare, e far diventare pubblico con la verifica, un file caricato da altri
  if v_file <> '' and split_part(v_file, '/', 1) <> v_report.venue_id::text and not public.is_moderator() then
    raise exception 'rule.not_allowed';
  end if;
  select * into v_company from public.companies c where c.id = p_company_id;
  if not found then
    raise exception 'rule.unknown_company';
  end if;
  if not (public.is_venue_owner(v_report.venue_id)
          or v_company.owner_user_id = v_uid
          or exists (select 1 from public.profiles p where p.id = v_uid and p.company_id = v_company.id)
          or public.is_moderator()) then
    raise exception 'rule.not_allowed';
  end if;
  if v_type = '' then
    raise exception 'rule.empty_text';
  end if;
  insert into public.certificates (report_id, venue_id, company_id, file_path, intervention_type)
  values (p_report_id, v_report.venue_id, p_company_id, v_file, v_type) returning * into v_cert;
  perform public.write_audit(v_uid, 'upload_certificate', 'report', p_report_id::text, v_company.name);
  perform public.notify_moderators('generico', 'Certificato da verificare', v_company.name || ' · ' || v_type, '/moderazione');
  return v_cert;
end;
$$;

-- Verifica del certificato: accettato -> segnalazione risolta; rifiutato -> nota.
create function public.verify_certificate(p_certificate_id uuid, p_accept boolean, p_note text default null)
returns public.certificates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_cert public.certificates%rowtype;
  v_report public.reports%rowtype;
begin
  select * into v_cert from public.certificates c where c.id = p_certificate_id for update;
  if not found then
    raise exception 'rule.unknown_certificate';
  end if;
  if v_cert.verified_at is not null or v_cert.rejected_at is not null then
    raise exception 'rule.already_decided';
  end if;
  if p_accept then
    select * into v_report from public.reports r where r.id = v_cert.report_id for update;
    if v_report.state <> 'pubblicata' then
      raise exception 'rule.not_published';
    end if;
    update public.reports set state = 'risolta', resolved_at = now() where id = v_cert.report_id;
    update public.certificates set verified_at = now(), verified_by = v_uid
     where id = p_certificate_id returning * into v_cert;
    perform public.notify_venue_owners(v_cert.venue_id, 'certificato_verificato', 'Certificato verificato',
      'Il locale è ora in stato "risolta" sulla mappa.', '/locale/' || v_cert.venue_id);
  else
    update public.certificates set rejected_at = now(), rejection_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_certificate_id returning * into v_cert;
  end if;
  perform public.write_audit(v_uid, case when p_accept then 'verify_certificate' else 'reject_certificate' end,
    'certificate', p_certificate_id::text, p_note);
  return v_cert;
end;
$$;

-- =====================================================================================
-- NAS
-- =====================================================================================

create function public.import_nas_notice(p_venue_name_raw text, p_address_raw text, p_source_url text, p_published_at timestamptz, p_summary text)
returns public.nas_notices
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_notice public.nas_notices%rowtype;
begin
  if coalesce(p_source_url, '') !~* '^https?://' then
    raise exception 'rule.invalid_url';
  end if;
  if btrim(coalesce(p_venue_name_raw, '')) = '' or btrim(coalesce(p_summary, '')) = '' then
    raise exception 'rule.empty_text';
  end if;
  insert into public.nas_notices (venue_name_raw, address_raw, source_url, published_at, summary, imported_by)
  values (btrim(p_venue_name_raw), nullif(btrim(coalesce(p_address_raw, '')), ''), p_source_url,
          coalesce(p_published_at, now()), btrim(p_summary), v_uid)
  returning * into v_notice;
  perform public.write_audit(v_uid, 'import_nas', 'nas', v_notice.id::text);
  return v_notice;
end;
$$;

-- Collega un comunicato a un locale: nasce una segnalazione pubblicata con fonte 'nas' (nessuna foto).
create function public.link_nas_notice(p_notice_id uuid, p_venue_id uuid)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_notice public.nas_notices%rowtype;
  v_venue public.venues%rowtype;
  v_report public.reports%rowtype;
begin
  select * into v_notice from public.nas_notices n where n.id = p_notice_id for update;
  if not found then
    raise exception 'rule.unknown_notice';
  end if;
  if v_notice.linked_report_id is not null then
    raise exception 'rule.notice_already_linked';
  end if;
  select * into v_venue from public.venues v where v.id = p_venue_id;
  if not found then
    raise exception 'rule.unknown_venue';
  end if;

  insert into public.reports (
    venue_id, user_id, source, category, description, photo_path, photo_hash, capture_mode, captured_at,
    lat, lng, distance_m, consent_accepted, state, moderated_at, moderator_id, moderation_note, published_at,
    nas_notice_id, faces_blurred
  ) values (
    p_venue_id, v_uid, 'nas', 'alimenti', 'Comunicato NAS: ' || v_notice.summary, null, null, 'fotocamera', v_notice.published_at,
    v_venue.lat, v_venue.lng, 0, true, 'pubblicata', now(), v_uid, 'Fonte pubblica: comunicato NAS', now(),
    p_notice_id, true
  ) returning * into v_report;

  update public.nas_notices set venue_id = p_venue_id, linked_report_id = v_report.id where id = p_notice_id;
  perform public.write_audit(v_uid, 'link_nas', 'nas', p_notice_id::text, p_venue_id::text);
  perform public.notify_venue_owners(p_venue_id, 'nuova_segnalazione_locale', 'Comunicato pubblico collegato al tuo locale',
    'Hai 7 giorni per replicare.', '/locale/' || p_venue_id || '/gestisci');
  return v_report;
end;
$$;

-- =====================================================================================
-- TRASPARENZA / DSA
-- =====================================================================================

-- Richiesta DSA: chiunque, anche anonimo. La moderazione decide entro 48 ore.
create function public.submit_dsa_notice(p_report_id uuid, p_contact text, p_reason text)
returns public.dsa_notices
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_notice public.dsa_notices%rowtype;
begin
  if not exists (select 1 from public.reports r where r.id = p_report_id) then
    raise exception 'rule.unknown_report';
  end if;
  if btrim(coalesce(p_contact, '')) = '' or btrim(coalesce(p_reason, '')) = '' then
    raise exception 'rule.empty_text';
  end if;
  insert into public.dsa_notices (report_id, contact, reason)
  values (p_report_id, btrim(p_contact), btrim(p_reason)) returning * into v_notice;
  perform public.write_audit(auth.uid(), 'dsa_notice', 'report', p_report_id::text);
  perform public.notify_moderators('generico', 'Nuova segnalazione DSA', 'Decisione dovuta entro 48 ore.', '/moderazione');
  return v_notice;
end;
$$;

-- Decisione DSA: 'rimossa' -> rimozione (motivo richiesta_dsa_accolta) se la segnalazione è pubblica.
create function public.decide_dsa_notice(p_notice_id uuid, p_decision public.dsa_decision, p_note text default '')
returns public.dsa_notices
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_notice public.dsa_notices%rowtype;
  v_state public.report_state;
begin
  select * into v_notice from public.dsa_notices d where d.id = p_notice_id for update;
  if not found then
    raise exception 'rule.unknown_notice';
  end if;
  if v_notice.decided_at is not null then
    raise exception 'rule.already_decided';
  end if;
  update public.dsa_notices
     set decided_at = now(), decision = p_decision, decision_note = btrim(coalesce(p_note, ''))
   where id = p_notice_id returning * into v_notice;
  if p_decision = 'rimossa' then
    select r.state into v_state from public.reports r where r.id = v_notice.report_id;
    if v_state in ('pubblicata', 'risolta') then
      perform public.remove_report(v_notice.report_id, 'richiesta_dsa_accolta', 'dsa');
    end if;
  end if;
  perform public.write_audit(v_uid, 'dsa_' || p_decision::text, 'dsa', p_notice_id::text, p_note);
  return v_notice;
end;
$$;

-- Statistiche pubbliche, stessa forma di Stats in src/domain/types.ts.
create function public.get_stats()
returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'venues', (select count(*) from public.venues),
    'venuesByStatus', (
      select json_object_agg(e.s::text, coalesce(v.cnt, 0))
      from unnest(enum_range(null::public.venue_status)) as e(s)
      left join (select status, count(*)::integer as cnt from public.venues group by status) v on v.status = e.s
    ),
    'reportsTotal', (select count(*) from public.reports),
    'reportsByState', (
      select json_object_agg(e.s::text, coalesce(r.cnt, 0))
      from unnest(enum_range(null::public.report_state)) as e(s)
      left join (select state, count(*)::integer as cnt from public.reports group by state) r on r.state = e.s
    ),
    'repliesTotal', (select count(*) from public.replies),
    'leadsSold', (select count(*) from public.lead_purchases),
    'removals', (select count(*) from public.removals),
    'dsaNotices', (select count(*) from public.dsa_notices),
    'medianModerationHours', (
      select percentile_cont(0.5) within group (order by (extract(epoch from (r.moderated_at - r.submitted_at)) / 3600.0)::double precision)
      from public.reports r where r.moderated_at is not null
    )
  )
$$;

-- Registro di audit (solo moderazione), dal più recente.
create function public.list_audit(p_limit integer default 100)
returns setof public.audit_log
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_moderator();
  return query select a.* from public.audit_log a order by a.at desc limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

-- =====================================================================================
-- PRIVILEGI DI ESECUZIONE
-- Le funzioni di supporto restano eseguibili (servono a policy e trigger); le RPC che richiedono
-- un utente sono tolte ad anon (il controllo auth.uid() le rifiuterebbe comunque).
-- =====================================================================================
revoke execute on function
  public.claim_venue(uuid, text, text),
  public.decide_venue_claim(uuid, boolean, text),
  public.set_venue_premium(uuid, integer),
  public.submit_report(uuid, public.report_category, text, text, text, public.capture_mode, timestamptz, double precision, double precision, boolean, text),
  public.apply_ai_check(uuid, public.ai_verdict, double precision, text[], boolean),
  public.set_report_blurred(uuid, text),
  public.moderate_report(uuid, text, text),
  public.remove_report(uuid, text, public.removal_requester),
  public.block_user(uuid),
  public.add_reply(uuid, text),
  public.accept_same_conditions(uuid),
  public.sponsor_company(uuid, integer),
  public.request_quotes(uuid),
  public.buy_lead(uuid),
  public.lead_details(uuid),
  public.submit_quote(uuid, integer, text),
  public.quotes_for_lead(uuid),
  public.accept_quote(uuid),
  public.upload_certificate(uuid, uuid, text, text),
  public.verify_certificate(uuid, boolean, text),
  public.import_nas_notice(text, text, text, timestamptz, text),
  public.link_nas_notice(uuid, uuid),
  public.decide_dsa_notice(uuid, public.dsa_decision, text),
  public.list_audit(integer),
  public.write_audit(uuid, text, text, text, text),
  public.send_notification(uuid, public.notification_kind, text, text, text),
  public.notify_venue_owners(uuid, public.notification_kind, text, text, text),
  public.notify_moderators(public.notification_kind, text, text, text),
  public.recompute_venue_status(uuid)
from public, anon;

-- Le funzioni interne non sono RPC: nemmeno authenticated le chiama direttamente.
revoke execute on function
  public.write_audit(uuid, text, text, text, text),
  public.send_notification(uuid, public.notification_kind, text, text, text),
  public.notify_venue_owners(uuid, public.notification_kind, text, text, text),
  public.notify_moderators(public.notification_kind, text, text, text),
  public.recompute_venue_status(uuid)
from authenticated;

-- =====================================================================================
-- STORAGE: bucket privati e policy
--  report-photos : <auth.uid()>/<file>  caricato dall'utente; letto dal pubblico solo se la segnalazione
--                  è pubblicata/risolta (URL firmati), dalla ditta che ha acquistato il contatto, dalla moderazione
--                  (che carica anche le versioni sfocate, in qualunque cartella).
--  certificates  : <venue_id>/<file>    caricato da titolari/ditte; letto dal pubblico se verificato.
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('report-photos', 'report-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('certificates', 'certificates', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

create policy "report_photos_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator())
  );

create policy "report_photos_select" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'report-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.photo_is_public(name)
      or public.photo_visible_to_company(name)
      or public.is_moderator()
    )
  );

create policy "report_photos_update_moderator" on storage.objects
  for update to authenticated
  using (bucket_id = 'report-photos' and public.is_moderator())
  with check (bucket_id = 'report-photos' and public.is_moderator());

create policy "report_photos_delete_moderator" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-photos' and public.is_moderator());

create policy "certificates_insert_owner_or_company" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and (
      public.is_venue_owner(public.try_uuid((storage.foldername(name))[1]))
      or public.current_company_id() is not null
      or public.is_moderator()
    )
  );

create policy "certificates_select" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'certificates'
    and (
      public.certificate_file_is_public(name)
      or public.is_venue_owner(public.try_uuid((storage.foldername(name))[1]))
      or public.certificate_file_visible_to_company(name)
      or public.is_moderator()
    )
  );

create policy "certificates_update_moderator" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificates' and public.is_moderator())
  with check (bucket_id = 'certificates' and public.is_moderator());

create policy "certificates_delete_moderator" on storage.objects
  for delete to authenticated
  using (bucket_id = 'certificates' and public.is_moderator());
