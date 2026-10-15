-- =====================================================================================
-- Mappa dell'Igiene — 0007_unblock_user.sql
-- Revoca del blocco (block_user è a senso unico in 0003): solo la moderazione, con audit.
-- Controparte di DataStore.unblockUser (src/data/store.ts).
-- =====================================================================================

create function public.unblock_user(p_user_id uuid)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_moderator();
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'rule.unknown_user';
  end if;
  if not v_profile.blocked then
    raise exception 'rule.not_allowed';
  end if;
  update public.profiles set blocked = false where id = p_user_id returning * into v_profile;
  if v_profile.device_hash is not null then
    delete from public.blocked_devices where device_hash = v_profile.device_hash;
  end if;
  perform public.write_audit(v_uid, 'unblock_user', 'profile', p_user_id::text);
  return v_profile;
end;
$$;

revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;
