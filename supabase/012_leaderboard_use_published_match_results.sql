-- Use the authoritative published match results for leaderboard totals.
-- Wallet ledger adjustments are recorded as admin_adjustment, not match_earning.
create or replace function public.get_earnings_leaderboard(p_period text default 'all')
returns table(user_id uuid, username text, player_number bigint, total_earned numeric)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_start timestamptz;
begin
  if p_period not in ('all', 'month', 'day') then
    raise exception 'Invalid leaderboard period';
  end if;

  if p_period = 'month' then
    v_start := date_trunc('month', now());
  elsif p_period = 'day' then
    v_start := date_trunc('day', now());
  else
    v_start := '-infinity'::timestamptz;
  end if;

  return query
  select
    pa.user_id,
    coalesce(nullif(btrim(pa.username), ''), 'Player ' || pa.player_number::text)::text,
    pa.player_number,
    sum(tr.earned_points)::numeric as total_earned
  from public.tournament_results tr
  join public.player_accounts pa on pa.user_id = tr.user_id
  where tr.published is true
    and coalesce(tr.earned_points, 0) > 0
    and coalesce(tr.updated_at, tr.created_at) >= v_start
  group by pa.user_id, pa.username, pa.player_number
  order by sum(tr.earned_points) desc, pa.player_number asc
  limit 100;
end;
$function$;

grant execute on function public.get_earnings_leaderboard(text) to anon, authenticated;
notify pgrst, 'reload schema';
