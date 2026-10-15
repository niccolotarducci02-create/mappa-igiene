-- =====================================================================================
-- Mappa dell'Igiene — 0006_realtime.sql
-- Pubblicazione Realtime: il client (src/data/supabaseStore.ts, subscribe()) ascolta il canale
-- `db-changes` con postgres_changes su schema `public` e ricarica le pagine quando una riga cambia.
--
-- Supabase consegna gli eventi solo per le tabelle presenti nella pubblicazione `supabase_realtime`
-- e, con la RLS attiva, solo per le righe che il chiamante potrebbe leggere con una SELECT:
--  * anon riceve venues, replies, certificates, removals, nas_notices (ciò che è pubblico);
--  * reports arriva solo all'autore e alla moderazione (le viste non emettono eventi: il pubblico
--    vede le segnalazioni pubblicate al ricaricamento successivo, oppure tramite il cambio di
--    venues.status che il trigger aggiorna a ogni cambio di stato);
--  * notifications arriva solo al destinatario; audit_log e blocked_devices non sono pubblicati.
-- Lo store emette comunque un refresh locale dopo ogni azione dell'utente: Realtime serve agli
-- aggiornamenti fatti da altri (moderazione, repliche, preventivi).
-- =====================================================================================

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- istanza senza Realtime preconfigurato (es. Postgres locale puro): la crea vuota
    create publication supabase_realtime;
  end if;

  foreach v_table in array array[
    'venues', 'venue_owners', 'profiles', 'companies',
    'reports', 'replies', 'leads', 'lead_purchases', 'quotes',
    'certificates', 'nas_notices', 'removals', 'dsa_notices', 'notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- Gli eventi UPDATE/DELETE portano la riga precedente solo con REPLICA IDENTITY FULL; il client non ne ha
-- bisogno (ricarica tutto), quindi resta l'identità di default (chiave primaria): meno dati sul canale.
