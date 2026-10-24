-- Past Matches lifecycle: marking a match past is separate from publishing its results.
alter table public.tournaments
  add column if not exists is_past_match boolean not null default false,
  add column if not exists results_published_at timestamptz;

create index if not exists tournaments_past_matches_idx
  on public.tournaments (is_past_match, starts_at desc, created_at desc);

create or replace function public.admin_mark_match_past(p_tournament_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_battleforge_admin() then
    raise exception 'Admin access required';
  end if;
  update public.tournaments
     set is_past_match = true
   where id = p_tournament_id;
  if not found then raise exception 'Match not found'; end if;
end;
$$;
revoke all on function public.admin_mark_match_past(bigint) from public, anon;
grant execute on function public.admin_mark_match_past(bigint) to authenticated;

-- The existing admin_publish_match_results RPC remains the sole publishing/crediting path.
-- Record the publish timestamp only when a match is first published; wallet-credit idempotency
-- remains enforced by the existing RPC and ledger implementation.
