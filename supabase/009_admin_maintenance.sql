-- BattleForge admin maintenance. Wallet ledger history is retained for accounting.
create index if not exists idx_admin_wallet_adjustments_admin_user_id on public.admin_wallet_adjustments(admin_user_id);
create index if not exists idx_admin_wallet_adjustments_user_id on public.admin_wallet_adjustments(user_id);
create index if not exists idx_deposit_requests_verified_by on public.deposit_requests(verified_by);
create index if not exists idx_notification_broadcasts_created_by on public.notification_broadcasts(created_by);
create index if not exists idx_notification_broadcasts_tournament_id on public.notification_broadcasts(tournament_id);
create index if not exists idx_player_accounts_referred_by on public.player_accounts(referred_by);
create index if not exists idx_push_devices_user_id on public.push_devices(user_id);
create index if not exists idx_tournament_entries_user_id on public.tournament_entries(user_id);
create index if not exists idx_tournament_results_created_by on public.tournament_results(created_by);
create index if not exists idx_tournament_results_user_id on public.tournament_results(user_id);
create index if not exists idx_tournament_rooms_updated_by on public.tournament_rooms(updated_by);
create index if not exists idx_withdrawal_requests_reviewed_by on public.withdrawal_requests(reviewed_by);
create index if not exists idx_tournaments_past_recent on public.tournaments ((coalesce(results_published_at, created_at)) desc, id desc) where is_past_match = true;

create or replace function public.admin_delete_payment_request(p_kind text,p_request_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $function$
declare w public.withdrawal_requests; d public.deposit_requests;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_request_id is null then raise exception 'Request ID is required'; end if;
 if p_note is null or char_length(trim(p_note))<3 then raise exception 'Enter a reason for deleting the request'; end if;
 if lower(trim(p_kind))='deposit' then
  select * into d from public.deposit_requests where id=p_request_id for update;
  if not found then raise exception 'Deposit request not found'; end if;
  if d.status='verified' then raise exception 'Cannot delete a verified deposit; retain it for financial audit'; end if;
  delete from public.deposit_requests where id=p_request_id;
 elsif lower(trim(p_kind))='withdrawal' then
  select * into w from public.withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if w.status='paid' then raise exception 'Cannot delete a paid withdrawal'; end if;
  if w.status in ('pending','approved') then
   insert into public.wallet_accounts(user_id) values(w.user_id) on conflict(user_id) do nothing;
   update public.wallet_accounts set earned_balance=earned_balance+w.amount,updated_at=now() where user_id=w.user_id;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note)
   values(w.user_id,'withdrawal_refund','earned',w.amount,'withdrawal_request',w.id,'Refund from deleted withdrawal request: '||left(trim(p_note),250));
  end if;
  delete from public.withdrawal_requests where id=p_request_id;
 else raise exception 'Kind must be deposit or withdrawal'; end if;
 return true;
end; $function$;

create or replace function public.admin_trim_past_matches()
returns integer language plpgsql security definer set search_path='' as $function$
declare v_old_ids bigint[]; v_deleted integer:=0;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 select array_agg(id) into v_old_ids from (
  select id from public.tournaments where is_past_match=true
  order by coalesce(results_published_at,created_at) desc,id desc offset 5
 ) old_matches;
 if v_old_ids is null or cardinality(v_old_ids)=0 then return 0; end if;
 delete from public.notification_broadcasts where tournament_id=any(v_old_ids);
 delete from public.tournament_results where tournament_id=any(v_old_ids);
 delete from public.tournament_rooms where tournament_id=any(v_old_ids);
 delete from public.tournament_entries where tournament_id=any(v_old_ids);
 delete from public.tournaments where id=any(v_old_ids);
 get diagnostics v_deleted=row_count;
 return v_deleted;
end; $function$;

do $block$ declare r record; begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,6)='admin_'
 loop
  execute format('revoke all on function %s from public, anon',r.signature);
  execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end; $block$;
revoke all on function public.admin_trim_past_matches() from public,anon;
grant execute on function public.admin_trim_past_matches() to authenticated;
