-- BattleForge past-match lifecycle and atomic results publishing with idempotent wallet credits.
alter table public.tournaments add column if not exists is_past_match boolean not null default false, add column if not exists results_published_at timestamptz;
alter table public.tournament_results add column if not exists earned_points integer not null default 0 check (earned_points >= 0);
create index if not exists tournaments_past_matches_idx on public.tournaments (is_past_match, starts_at desc, created_at desc);
create unique index if not exists tournament_results_tournament_user_unique on public.tournament_results(tournament_id,user_id);
create or replace function public.admin_mark_match_past(p_tournament_id bigint) returns void language plpgsql security definer set search_path = '' as $$ begin if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if; update public.tournaments set is_past_match=true where id=p_tournament_id; if not found then raise exception 'Match not found'; end if; end; $$;
revoke all on function public.admin_mark_match_past(bigint) from public, anon; grant execute on function public.admin_mark_match_past(bigint) to authenticated;
create or replace function public.admin_publish_match_results(p_tournament_id bigint, p_results jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_entry public.tournament_entries%rowtype; v_points integer; v_kills integer; v_rank integer; v_user uuid; v_existing public.tournament_results%rowtype; v_ref text;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if jsonb_typeof(p_results) <> 'array' then raise exception 'Results must be an array'; end if;
 perform 1 from public.tournaments where id=p_tournament_id for update; if not found then raise exception 'Match not found'; end if;
 if exists(select 1 from public.tournament_results where tournament_id=p_tournament_id and published) then raise exception 'Results are already published'; end if;
 for r in select value from jsonb_array_elements(p_results) loop
  select user_id into v_user from public.tournament_entries where id=(r->>'entry_id')::uuid and tournament_id=p_tournament_id; if not found then raise exception 'Every result must belong to a registered player'; end if; v_rank := nullif(r->>'placement','')::integer; v_kills := coalesce(nullif(r->>'kills','')::integer,0); v_points := coalesce(nullif(r->>'reward','')::integer,0);
  if v_kills < 0 or v_points < 0 or (v_rank is not null and v_rank < 1) then raise exception 'Rank, kills, or earned points are invalid'; end if;
  select * into v_entry from public.tournament_entries where tournament_id=p_tournament_id and user_id=v_user;
  select * into v_existing from public.tournament_results where tournament_id=p_tournament_id and user_id=v_user for update;
  if found then update public.tournament_results set placement=v_rank,kills=v_kills,note=coalesce(r->>'note',''),earned_points=v_points,published=false,updated_at=now() where id=v_existing.id;
  else insert into public.tournament_results(tournament_id,entry_id,user_id,placement,kills,note,published,created_by,earned_points,updated_at) values(p_tournament_id,v_entry.id,v_user,v_rank,v_kills,coalesce(r->>'note',''),false,auth.uid(),v_points,now()); end if;
 end loop;
 -- Only after every row validates, credit each player with an idempotency reference per match.
 for r in select value from jsonb_array_elements(p_results) loop
  select user_id into v_user from public.tournament_entries where id=(r->>'entry_id')::uuid and tournament_id=p_tournament_id; v_points := coalesce(nullif(r->>'reward','')::integer,0); v_ref := 'tournament:'||p_tournament_id||':user:'||v_user::text;
  if v_points > 0 then perform public.admin_credit_match_earnings(v_user,v_points,v_ref,'Match result points'); end if;
 end loop;
 update public.tournament_results set published=true,updated_at=now() where tournament_id=p_tournament_id;
 update public.tournaments set is_past_match=true,results_published_at=now() where id=p_tournament_id;
end; $$;
revoke all on function public.admin_publish_match_results(bigint,jsonb) from public, anon; grant execute on function public.admin_publish_match_results(bigint,jsonb) to authenticated;
