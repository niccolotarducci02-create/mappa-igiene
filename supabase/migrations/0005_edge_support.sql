-- =====================================================================================
-- Mappa dell'Igiene — 0005_edge_support.sql
-- Colonne e funzioni di supporto alle Edge Functions (supabase/functions):
--   * profiles.email                      per le notifiche via email (notify)
--   * notifications.sent_at/sent_via/...  tracciamento della consegna SMS/email (notify)
--   * reports.reply_reminder_sent_at ...  idempotenza dei lavori periodici (reply-deadline-cron)
--   * reports.photo_deleted_at            retention delle foto non pubblicate (reply-deadline-cron)
--   * payments                            registro degli eventi Stripe, idempotenza (payments-webhook)
--   * buy_lead_paid(...)                  acquisto di un contatto confermato da un pagamento (payments-webhook)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- profiles.email: facoltativa, impostabile dall'utente (le notifiche email partono solo se presente)
-- -------------------------------------------------------------------------------------
alter table public.profiles add column email text;
alter table public.profiles
  add constraint profiles_email_check check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
grant update (email) on public.profiles to authenticated;
comment on column public.profiles.email is 'Email per le notifiche (facoltativa). Mai esposta: profiles_public non la include.';

-- -------------------------------------------------------------------------------------
-- notifications: esito della consegna fuori dall'app
-- -------------------------------------------------------------------------------------
alter table public.notifications
  add column sent_at    timestamptz,
  add column sent_via   text[],          -- es. {in_app,sms,email} oppure {in_app,dry_run:sms}
  add column send_error text;
create index notifications_pending_idx on public.notifications (created_at) where sent_at is null;
comment on column public.notifications.sent_at is 'Quando la Edge Function notify ha tentato la consegna SMS/email (null = in attesa).';

-- -------------------------------------------------------------------------------------
-- reports: idempotenza degli avvisi del cron e retention delle foto
-- -------------------------------------------------------------------------------------
alter table public.reports
  add column reply_reminder_sent_at     timestamptz,   -- promemoria al giorno 5
  add column reply_final_notice_sent_at timestamptz,   -- avviso "stato definitivo" al giorno 7
  add column photo_deleted_at           timestamptz;   -- foto cancellata dallo Storage (retention 90 giorni)
create index reports_reply_reminder_idx on public.reports (published_at) where state = 'pubblicata' and reply_reminder_sent_at is null;
create index reports_reply_final_idx    on public.reports (reply_deadline_at) where state = 'pubblicata' and reply_final_notice_sent_at is null;
create index reports_photo_retention_idx on public.reports (submitted_at) where state in ('scartata', 'archiviata') and photo_path is not null and photo_deleted_at is null;
comment on column public.reports.photo_deleted_at is 'Foto rimossa dallo Storage per retention (segnalazioni scartate/archiviate oltre 90 giorni). La riga resta.';

-- -------------------------------------------------------------------------------------
-- payments: ogni evento Stripe ricevuto, una sola volta (event_id unique)
-- -------------------------------------------------------------------------------------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null default 'stripe',
  event_id       text not null unique,
  session_id     text,
  payment_intent text,
  product        text check (product is null or product in ('lead', 'sponsor', 'premium')),
  status         text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed', 'error')),
  amount_cents   integer,
  currency       text,
  livemode       boolean not null default false,
  user_id        uuid references public.profiles (id) on delete set null,
  company_id     uuid references public.companies (id) on delete set null,
  venue_id       uuid references public.venues (id) on delete set null,
  lead_id        uuid references public.leads (id) on delete set null,
  months         integer,
  metadata       jsonb not null default '{}'::jsonb,
  error          text,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
comment on table public.payments is 'Eventi del fornitore di pagamento (Stripe). Scritti solo dalla Edge Function payments-webhook con service_role. Nessun pagamento tocca le segnalazioni (regola 4).';
create index payments_session_idx on public.payments (session_id) where session_id is not null;
create index payments_user_idx    on public.payments (user_id, created_at desc) where user_id is not null;

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
-- Nessuna policy: solo service_role (bypassa la RLS). La ditta/il locale vedono l'esito tramite le
-- notifiche e lo stato di leads / companies.sponsor_until / venues.premium_until.

-- -------------------------------------------------------------------------------------
-- buy_lead_paid: acquisto confermato da un pagamento (solo service_role, dal webhook).
-- Stessi controlli di buy_lead / canBuyLead; il prezzo è quello del contatto, identico per
-- tutte le ditte, compresa quella del fondatore (regola 4). Il trigger a_lead_purchases_before_insert
-- ribadisce i limiti (max 3, una volta sola, aperto) anche in caso di concorrenza.
-- -------------------------------------------------------------------------------------
create function public.buy_lead_paid(p_lead_id uuid, p_company_id uuid, p_payment_ref text, p_paid_cents integer default null)
returns public.leads
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company public.companies%rowtype;
  v_lead    public.leads%rowtype;
  v_reasons text[] := '{}';
  v_count   integer;
begin
  if not public.is_service_role() then
    raise exception 'rule.not_allowed';
  end if;
  select * into v_company from public.companies c where c.id = p_company_id;
  if not found then
    raise exception 'rule.unknown_company';
  end if;
  select * into v_lead from public.leads l where l.id = p_lead_id for update;
  if not found then
    raise exception 'rule.unknown_lead';
  end if;
  select count(*) into v_count from public.lead_purchases lp where lp.lead_id = p_lead_id;

  -- array_append e non `v_reasons || 'rule.x'` (letterale non tipizzato -> "malformed array literal")
  if not v_company.same_conditions_ack then v_reasons := array_append(v_reasons, 'rule.same_conditions_ack'); end if;
  if v_lead.status <> 'aperto' then v_reasons := array_append(v_reasons, 'rule.lead_closed'); end if;
  if v_count >= v_lead.max_buyers then v_reasons := array_append(v_reasons, 'rule.lead_full'); end if;
  if exists (select 1 from public.lead_purchases lp where lp.lead_id = p_lead_id and lp.company_id = p_company_id) then
    v_reasons := array_append(v_reasons, 'rule.lead_already_bought');
  end if;
  if not (v_lead.category = any (v_company.services) or 'altro' = any (v_company.services)) then
    v_reasons := array_append(v_reasons, 'rule.service_mismatch');
  end if;
  -- l'importo pagato deve essere esattamente il prezzo del contatto: niente sconti, niente maggiorazioni
  if p_paid_cents is not null and p_paid_cents <> v_lead.price_cents then
    v_reasons := array_append(v_reasons, 'rule.invalid_amount');
  end if;
  if array_length(v_reasons, 1) > 0 then
    raise exception using message = array_to_string(v_reasons, ','), errcode = 'P0001';
  end if;

  insert into public.lead_purchases (lead_id, company_id, paid_cents)
  values (p_lead_id, p_company_id, v_lead.price_cents);
  perform public.write_audit(v_company.owner_user_id, 'buy_lead', 'lead', p_lead_id::text,
    (v_lead.price_cents / 100.0)::numeric(10,2)::text || ' € · pagamento confermato · ' || coalesce(p_payment_ref, ''));

  select * into v_lead from public.leads l where l.id = p_lead_id;
  return v_lead;
end;
$$;

revoke execute on function public.buy_lead_paid(uuid, uuid, text, integer) from public, anon, authenticated;
