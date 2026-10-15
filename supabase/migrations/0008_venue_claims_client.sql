-- =====================================================================================
-- Mappa dell'Igiene — 0008_venue_claims_client.sql
-- Il client legge la coda delle rivendicazioni direttamente da venue_claims
-- (DataStore.listVenueClaims: la moderazione le vede tutte, un utente solo le proprie).
-- La policy di SELECT esiste già in 0003 (venue_claims_select_own); qui, nello stile di 0002_policies.sql:
--  * il privilegio di SELECT per authenticated è esplicito (non dipende dai default privileges dell'istanza),
--    anon resta senza alcun privilegio; insert/update/delete restano solo nelle RPC claim_venue / decide_venue_claim;
--  * Realtime: la console di moderazione vede arrivare una richiesta e il richiedente vede l'esito senza ricaricare
--    (stessa pubblicazione di 0006_realtime.sql; la RLS filtra le righe come per una SELECT).
-- Nota: anche la demo (LocalStore) ora passa dalla coda: nessuno diventa titolare senza l'approvazione.
-- =====================================================================================

revoke all on public.venue_claims from anon;
revoke insert, update, delete on public.venue_claims from authenticated;
grant select on public.venue_claims to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venue_claims'
  ) then
    alter publication supabase_realtime add table public.venue_claims;
  end if;
end;
$$;
