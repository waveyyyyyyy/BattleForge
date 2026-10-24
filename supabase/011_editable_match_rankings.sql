-- Allow admins to revise rankings after publishing, while only crediting the difference.
create or replace function public.admin_publish_match_results(p_tournament_id bigint, p_results jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_entry public.tournament_entries%rowtype; v_points integer; v_old_points integer; v_delta integer; v_kills integer; v_rank integer; v_user uuid; v_existing public.tournament_results%rowtype; v_was_published boolean; v_balance numeric; v_ref text;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results)=0 then raise exception 'Results must be a non-empty array'; end if;
 perform 1 from public.tournaments where id=p_tournament_id for update; if not found then raise exception 'Match not found'; end if;
 if exists(select 1 from (select (value->>'entry_id')::uuid entry_id from jsonb_array_elements(p_results)) x group by entry_id having count(*)>1) then raise exception 'A player can only appear once'; end if;
 if exists(select 1 from (select nullif(value->>'placement','')::integer placement from jsonb_array_elements(p_results)) x where placement is null or placement<1) then raise exception 'Every player must have a rank'; end if;
 if exists(select 1 from (select nullif(value->>'placement','')::integer placement from jsonb_array_elements(p_results)) x group by placement having count(*)>1) then raise exception 'Each rank can only be assigned once'; end if;
 -- Validate the entire roster before writing any result or wallet adjustment.
 for r in select value from jsonb_array_elements(p_results) loop
  select * into v_entry from public.tournament_entries where id=(r->>'entry_id')::uuid and tournament_id=p_tournament_id;
  if not found then raise exception 'Every result must belong to a registered player'; end if;
  v_kills:=coalesce(nullif(r->>'kills','')::integer,0); v_points:=coalesce(nullif(r->>'reward','')::integer,0); v_rank:=nullif(r->>'placement','')::integer;
  if v_kills<0 or v_points<0 or v_points>1000000 or v_rank<1 then raise exception 'Rank, kills, or earned points are invalid'; end if;
 end loop;
 for r in select value from jsonb_array_elements(p_results) loop
  select * into v_entry from public.tournament_entries where id=(r->>'entry_id')::uuid and tournament_id=p_tournament_id;
  v_user:=v_entry.user_id; v_rank:=(r->>'placement')::integer; v_kills:=coalesce(nullif(r->>'kills','')::integer,0); v_points:=coalesce(nullif(r->>'reward','')::integer,0);
  select * into v_existing from public.tournament_results where tournament_id=p_tournament_id and user_id=v_user for update;
  if found then v_was_published:=v_existing.published; v_old_points:=case when v_existing.published then coalesce(v_existing.earned_points,0) else 0 end;
   update public.tournament_results set entry_id=v_entry.id,placement=v_rank,kills=v_kills,note=coalesce(r->>'note',''),earned_points=v_points,published=true,updated_at=now() where id=v_existing.id;
  else v_was_published:=false; v_old_points:=0;
   insert into public.tournament_results(tournament_id,entry_id,user_id,placement,kills,note,published,created_by,earned_points,updated_at) values(p_tournament_id,v_entry.id,v_user,v_rank,v_kills,coalesce(r->>'note',''),true,auth.uid(),v_points,now());
  end if;
  v_delta:=v_points-v_old_points;
  if v_delta<>0 then
   insert into public.wallet_accounts(user_id) values(v_user) on conflict(user_id) do nothing;
   if v_delta>0 then
    update public.wallet_accounts set earned_balance=earned_balance+v_delta,updated_at=now() where user_id=v_user;
    insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(v_user,'admin_adjustment','earned',v_delta,'match_result_revision','Match '||p_tournament_id||' prize adjustment +'||v_delta||' points');
   else
    update public.wallet_accounts set earned_balance=earned_balance+v_delta,updated_at=now() where user_id=v_user and earned_balance>=abs(v_delta) returning earned_balance into v_balance;
    if not found then raise exception 'Cannot reduce % prize: player has already withdrawn or spent those earned points. Add a replacement prize or contact support.',v_entry.in_game_name; end if;
    insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(v_user,'admin_adjustment','earned',abs(v_delta),'match_result_revision','Match '||p_tournament_id||' prize adjustment -'||abs(v_delta)||' points');
   end if;
  end if;
 end loop;
 update public.tournaments set is_past_match=true,results_published_at=now() where id=p_tournament_id;
end; $$;
revoke all on function public.admin_publish_match_results(bigint,jsonb) from public,anon;
grant execute on function public.admin_publish_match_results(bigint,jsonb) to authenticated;
