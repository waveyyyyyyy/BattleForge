-- BattleForge player lobby: authenticated tournament members can view the roster only after room publication.
-- Run once in Supabase SQL Editor after 002_admin_matches_results.sql.
create or replace function public.get_tournament_roster(p_tournament_id bigint)
returns table(in_game_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view the player list'; end if;
  if not exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = p_tournament_id and e.user_id = auth.uid()
  ) then raise exception 'Join this tournament to view its player list'; end if;
  if not exists (
    select 1 from public.tournament_rooms r
    where r.tournament_id = p_tournament_id and r.published = true
  ) then raise exception 'The player list appears after the room is published'; end if;
  return query
    select e.in_game_name, e.created_at
    from public.tournament_entries e
    where e.tournament_id = p_tournament_id
    order by e.created_at asc;
end;
$$;
revoke all on function public.get_tournament_roster(bigint) from public;
grant execute on function public.get_tournament_roster(bigint) to authenticated;
