-- Run this once in Supabase SQL Editor AFTER schema.sql has succeeded.
-- Safe to re-run: it will not duplicate these starter tournaments.
insert into public.tournaments
  (title, game_mode, entry_points, prize_pool_points, max_players, status, starts_at)
select v.title, v.game_mode, v.entry_points, v.prize_pool_points, v.max_players, 'open', v.starts_at
from (values
  ('Solo Survival', 'SOLO', 12, 500, 48, now() + interval '1 day'),
  ('Duo Dash', 'DUO', 20, 800, 24, now() + interval '2 days'),
  ('Squad Showdown', 'SQUAD', 50, 1700, 48, now() + interval '3 days')
) as v(title, game_mode, entry_points, prize_pool_points, max_players, starts_at)
where not exists (
  select 1 from public.tournaments t where t.title = v.title
);

create or replace function public.get_tournament_counts()
returns table(tournament_id bigint, player_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, count(e.id)
  from public.tournaments t
  left join public.tournament_entries e on e.tournament_id = t.id
  group by t.id;
$$;

revoke all on function public.get_tournament_counts() from public;
grant execute on function public.get_tournament_counts() to anon, authenticated;
