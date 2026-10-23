-- BattleForge admin tournament deletion.
-- Run once in Supabase SQL Editor after 002_admin_matches_results.sql.
-- This is an admin-only destructive action; it removes the tournament and its registrations/results/room.
create or replace function public.admin_delete_tournament(p_tournament_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_battleforge_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists (select 1 from public.tournaments t where t.id = p_tournament_id) then
    raise exception 'Tournament not found';
  end if;

  delete from public.tournament_results where tournament_id = p_tournament_id;
  delete from public.tournament_rooms where tournament_id = p_tournament_id;
  delete from public.tournament_entries where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id;
end;
$$;
revoke all on function public.admin_delete_tournament(bigint) from public;
grant execute on function public.admin_delete_tournament(bigint) to authenticated;
