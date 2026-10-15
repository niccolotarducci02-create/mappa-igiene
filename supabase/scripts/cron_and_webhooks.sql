-- =====================================================================================
-- Mappa dell'Igiene — scripts/cron_and_webhooks.sql
-- Collega il database alle Edge Functions: webhook (trigger + pg_net) e lavori periodici (pg_cron).
--
-- NON è una migrazione: va eseguito UNA volta nell'SQL Editor del progetto Supabase, DOPO
-- `supabase db push` e `supabase functions deploy`, sostituendo i due segnaposto qui sotto.
-- In alternativa i webhook si creano a mano dal pannello (Database -> Webhooks), vedi docs/DEPLOY.md.
--
-- Segnaposto da sostituire:
--   <PROJECT_REF>        es. abcdefghijklmnop  (URL del progetto: https://<PROJECT_REF>.supabase.co)
--   <SERVICE_ROLE_KEY>   Settings -> API -> service_role (segreta: mai nel client, mai su git)
-- =====================================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- -------------------------------------------------------------------------------------
-- 1. Segreti nel Vault (cifrati). Rieseguire con vault.update_secret se cambiano.
-- -------------------------------------------------------------------------------------
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'edge_base_url', 'URL del progetto Supabase (per pg_net)');
select vault.create_secret('<SERVICE_ROLE_KEY>', 'edge_service_key', 'Chiave service_role usata da trigger e cron per chiamare le Edge Functions');

-- -------------------------------------------------------------------------------------
-- 2. Chiamata asincrona a una Edge Function (pg_net accoda la richiesta e la invia dopo il commit).
-- -------------------------------------------------------------------------------------
create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_url text;
  v_key text;
  v_req bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_service_key';
  if v_url is null or v_key is null then
    raise exception 'Vault: mancano i segreti edge_base_url / edge_service_key';
  end if;
  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 15000
  ) into v_req;
  return v_req;
end;
$$;
revoke execute on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 3. Webhook: nuova segnalazione -> on-report-submitted (avviso alla moderazione + filtro foto)
--    Il payload ha la stessa forma dei Database Webhook del pannello.
--    Un errore di pg_net non deve mai bloccare l'inserimento della segnalazione.
-- -------------------------------------------------------------------------------------
create or replace function public.webhook_reports_insert() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.invoke_edge_function('on-report-submitted', jsonb_build_object(
    'type', 'INSERT', 'table', 'reports', 'schema', 'public', 'record', to_jsonb(new), 'old_record', null));
  return null;
exception when others then
  raise warning 'webhook on-report-submitted non inviato: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists zz_webhook_reports_insert on public.reports;
create trigger zz_webhook_reports_insert
  after insert on public.reports
  for each row execute function public.webhook_reports_insert();

-- -------------------------------------------------------------------------------------
-- 4. Webhook: nuova notifica -> notify (SMS/email)
-- -------------------------------------------------------------------------------------
create or replace function public.webhook_notifications_insert() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.invoke_edge_function('notify', jsonb_build_object(
    'type', 'INSERT', 'table', 'notifications', 'schema', 'public', 'record', to_jsonb(new), 'old_record', null));
  return null;
exception when others then
  raise warning 'webhook notify non inviato: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists zz_webhook_notifications_insert on public.notifications;
create trigger zz_webhook_notifications_insert
  after insert on public.notifications
  for each row execute function public.webhook_notifications_insert();

-- -------------------------------------------------------------------------------------
-- 5. pg_cron (orari UTC)
--    06:15  reply-deadline-cron : promemoria giorno 5, avviso giorno 7, retention foto 90 gg, contatti 60 gg
--    */15   notify              : rete di sicurezza per le notifiche non ancora consegnate
-- -------------------------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job where jobname in ('reply-deadline-cron', 'notify-pending');
select cron.schedule('reply-deadline-cron', '15 6 * * *', $$ select public.invoke_edge_function('reply-deadline-cron') $$);
select cron.schedule('notify-pending', '*/15 * * * *', $$ select public.invoke_edge_function('notify') $$);

-- Controlli utili:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select id, status_code, content::text from net._http_response order by id desc limit 20;
