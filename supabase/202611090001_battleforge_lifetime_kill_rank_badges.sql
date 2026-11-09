create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.get_lifetime_kill_ranks()
returns table (
  user_id uuid,
  username text,
  player_number bigint,
  lifetime_kills bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    pa.user_id,
    coalesce(
      nullif(btrim(pa.username), ''),
      nullif(btrim(p.display_name), ''),
      'Player ' || pa.player_number::text
    )::text,
    pa.player_number,
    coalesce(sum(greatest(coalesce(tr.kills, 0), 0)), 0)::bigint
  from public.player_accounts pa
  left join public.profiles p on p.id = pa.user_id
  left join public.tournament_results tr
    on tr.user_id = pa.user_id and tr.published is true
  group by pa.user_id, pa.username, p.display_name, pa.player_number;
end;
$$;

revoke all on function private.get_lifetime_kill_ranks() from public, anon;
grant execute on function private.get_lifetime_kill_ranks() to authenticated;

create or replace function public.get_lifetime_kill_ranks()
returns table (
  user_id uuid,
  username text,
  player_number bigint,
  lifetime_kills bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_lifetime_kill_ranks();
$$;

revoke all on function public.get_lifetime_kill_ranks() from public, anon;
grant execute on function public.get_lifetime_kill_ranks() to authenticated;

create or replace function private.get_public_past_match_results(p_tournament_id bigint)
returns table (
  user_id uuid,
  username text,
  player_number bigint,
  placement integer,
  kills integer,
  note text,
  earned_points integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and t.is_past_match is true
  ) then
    raise exception 'Past match not found';
  end if;

  return query
  select
    tr.user_id,
    coalesce(
      nullif(btrim(pa.username), ''),
      nullif(btrim(p.display_name), ''),
      'Player ' || coalesce(pa.player_number::text, '—')
    )::text,
    pa.player_number,
    tr.placement,
    tr.kills,
    tr.note,
    tr.earned_points,
    tr.created_at
  from public.tournament_results tr
  left join public.player_accounts pa on pa.user_id = tr.user_id
  left join public.profiles p on p.id = tr.user_id
  where tr.tournament_id = p_tournament_id
    and tr.published is true
  order by tr.placement asc nulls last, tr.created_at asc;
end;
$$;

revoke all on function private.get_public_past_match_results(bigint) from public, anon;
grant execute on function private.get_public_past_match_results(bigint) to authenticated;

create or replace function public.get_public_past_match_results(p_tournament_id bigint)
returns table (
  user_id uuid,
  username text,
  player_number bigint,
  placement integer,
  kills integer,
  note text,
  earned_points integer,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_public_past_match_results(p_tournament_id);
$$;

revoke all on function public.get_public_past_match_results(bigint) from public, anon;
grant execute on function public.get_public_past_match_results(bigint) to authenticated;
