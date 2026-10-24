-- BattleForge maintenance: retain only the five newest Past Matches.
-- Scope is strictly tournaments.is_past_match = true; wallet and payment tables are untouched.
with ranked_past_matches as (
  select id, row_number() over (order by starts_at desc nulls last, created_at desc, id desc) as rn
  from public.tournaments
  where is_past_match is true
)
delete from public.tournaments t
using ranked_past_matches r
where t.id = r.id and r.rn > 5;
