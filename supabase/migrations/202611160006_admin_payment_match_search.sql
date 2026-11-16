-- Admin transaction lookup and match-number lookup. Deleting a request never changes balances.
create or replace function public.admin_delete_payment_request(p_kind text,p_request_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_battleforge_permission('finance') then raise exception 'Admin access required'; end if;
 if p_request_id is null then raise exception 'Request ID is required'; end if;
 if lower(trim(p_kind))='deposit' then
  delete from public.deposit_requests where id=p_request_id;
  if not found then raise exception 'Deposit request not found'; end if;
 elsif lower(trim(p_kind))='withdrawal' then
  delete from public.withdrawal_requests where id=p_request_id;
  if not found then raise exception 'Withdrawal request not found'; end if;
 else raise exception 'Kind must be deposit or withdrawal'; end if;
 return true;
end; $$;
revoke all on function public.admin_delete_payment_request(text,uuid,text) from public,anon;
grant execute on function public.admin_delete_payment_request(text,uuid,text) to authenticated;

create or replace function public.admin_search_payment_request(p_payment_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key text; d public.deposit_requests; w public.withdrawal_requests; p record;
begin
 if auth.uid() is null or not private.has_battleforge_permission('finance') then raise exception 'Admin access required'; end if;
 v_key:=regexp_replace(upper(trim(coalesce(p_payment_id,''))),'^PAY-','');
 v_key:=regexp_replace(v_key,'[^0-9A-F]','','g');
 if length(v_key)<6 then raise exception 'Enter at least 6 characters from the payment ID'; end if;
 select * into d from public.deposit_requests where replace(id::text,'-','') like lower(v_key)||'%' limit 1;
 if found then
  select player_number,username into p from public.player_accounts where user_id=d.user_id;
  return jsonb_build_object('kind','deposit','request',to_jsonb(d),'player',jsonb_build_object('player_number',p.player_number,'username',p.username));
 end if;
 select * into w from public.withdrawal_requests where replace(id::text,'-','') like lower(v_key)||'%' limit 1;
 if found then
  select player_number,username into p from public.player_accounts where user_id=w.user_id;
  return jsonb_build_object('kind','withdrawal','request',to_jsonb(w),'player',jsonb_build_object('player_number',p.player_number,'username',p.username));
 end if;
 return jsonb_build_object('kind',null,'request',null,'player',null);
end; $$;
revoke all on function public.admin_search_payment_request(text) from public,anon;
grant execute on function public.admin_search_payment_request(text) to authenticated;

create or replace function public.admin_search_match_details(p_match_number bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tournaments; v_entries jsonb; v_room jsonb;
begin
 if auth.uid() is null or not (private.has_battleforge_permission('tournament_manage') or private.has_battleforge_permission('finance')) then
  raise exception 'Admin access required';
 end if;
 select * into t from public.tournaments where id=p_match_number;
 if not found then return jsonb_build_object('tournament',null,'entries','[]'::jsonb,'room',null); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'entry_id',e.id,'in_game_name',e.in_game_name,'player_number',pa.player_number,'username',pa.username,
  'placement',r.placement,'kills',r.kills,'earned_points',r.earned_points,
  'published',coalesce(r.published,false),'joined_at',e.created_at
 ) order by coalesce(r.placement,2147483647),e.created_at),'[]'::jsonb)
 into v_entries from public.tournament_entries e
 left join public.player_accounts pa on pa.user_id=e.user_id
 left join public.tournament_results r on r.entry_id=e.id and r.tournament_id=e.tournament_id
 where e.tournament_id=p_match_number;
 select to_jsonb(tr) into v_room from public.tournament_rooms tr where tr.tournament_id=p_match_number;
 return jsonb_build_object('tournament',to_jsonb(t),'entries',v_entries,'room',v_room);
end; $$;
revoke all on function public.admin_search_match_details(bigint) from public,anon;
grant execute on function public.admin_search_match_details(bigint) to authenticated;
