-- Include each registered player's account identity and preset avatar in the active match roster.
-- Keeps the existing privacy gate: only a registered player can see the roster, and only after room publication.
drop function if exists public.get_tournament_roster(bigint);
create function public.get_tournament_roster(p_tournament_id bigint)
returns table(
  user_id uuid,
  player_number bigint,
  in_game_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view the player list';
  end if;

  if not exists (
    select 1
    from public.tournament_entries e
    where e.tournament_id = p_tournament_id
      and e.user_id = auth.uid()
  ) then
    raise exception 'Join this tournament to view its player list';
  end if;

  if not exists (
    select 1
    from public.tournament_rooms r
    where r.tournament_id = p_tournament_id
      and r.published = true
  ) then
    raise exception 'The player list appears after the room is published';
  end if;

  return query
    select
      e.user_id,
      pa.player_number,
      e.in_game_name,
      pa.avatar_url,
      e.created_at
    from public.tournament_entries e
    left join public.player_accounts pa on pa.user_id = e.user_id
    where e.tournament_id = p_tournament_id
    order by e.created_at asc;
end;
$$;

revoke all on function public.get_tournament_roster(bigint) from public, anon;
grant execute on function public.get_tournament_roster(bigint) to authenticated;
notify pgrst, 'reload schema';
