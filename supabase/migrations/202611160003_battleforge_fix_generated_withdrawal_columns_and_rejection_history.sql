-- BattleForge withdrawal creation fix and retained rejection history.
-- fee_amount and net_amount are GENERATED ALWAYS from amount.
create or replace function public.create_withdrawal_request(
  p_amount numeric,
  p_account_name text,
  p_payout_upi text
) returns public.withdrawal_requests
language plpgsql security definer set search_path = '' as $function$
declare r public.withdrawal_requests;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 100 or p_amount > 50000 then
    raise exception 'Minimum withdrawal is 100; maximum is 50000 coins';
  end if;
  if p_account_name is null or length(trim(p_account_name)) not between 2 and 120 then
    raise exception 'Enter the exact account-holder name';
  end if;
  if p_payout_upi is null or length(trim(p_payout_upi)) not between 3 and 100
     or trim(p_payout_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then
    raise exception 'Enter a valid UPI ID';
  end if;
  if exists (select 1 from public.platform_controls where id=1
    and (coalesce(withdrawals_paused,false) or coalesce(maintenance_mode,false))) then
    raise exception 'Withdrawals are temporarily paused';
  end if;
  insert into public.wallet_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  update public.wallet_accounts set earned_balance=earned_balance-p_amount,updated_at=now()
    where user_id=auth.uid() and earned_balance>=p_amount;
  if not found then raise exception 'Insufficient match earnings. Deposited coins cannot be withdrawn.'; end if;
  -- Do not include generated fee_amount/net_amount in this INSERT.
  insert into public.withdrawal_requests(user_id,amount,account_name,payout_upi)
    values(auth.uid(),p_amount,trim(p_account_name),lower(trim(p_payout_upi))) returning * into r;
  insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note)
    values(auth.uid(),'withdrawal_reserve','earned',p_amount,'withdrawal_request',r.id,'Earned coins reserved for withdrawal');
  return r;
end;
$function$;
revoke all on function public.create_withdrawal_request(numeric,text,text) from public,anon;
grant execute on function public.create_withdrawal_request(numeric,text,text) to authenticated;

-- A rejected withdrawal stays visible; reserved coins are not refunded or silently deleted.
create or replace function public.admin_process_withdrawal(
  p_request_id uuid,p_action text,p_payout_reference text default null,p_note text default null
) returns public.withdrawal_requests
language plpgsql security definer set search_path = '' as $function$
declare r public.withdrawal_requests;
begin
  if auth.uid() is null or not private.has_battleforge_permission('finance') then raise exception 'Admin access required'; end if;
  if p_action not in ('paid','reject') then raise exception 'Action must be paid or reject'; end if;
  select * into r from public.withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if r.status in ('paid','rejected') then raise exception 'Request has already been processed'; end if;
  if p_action='paid' then
    if nullif(trim(coalesce(p_payout_reference,'')),'') is null then raise exception 'Enter the UPI transaction reference after sending payment'; end if;
    update public.withdrawal_requests set status='paid',reviewed_at=now(),reviewed_by=auth.uid(),
      payout_reference=trim(p_payout_reference),admin_note=nullif(trim(coalesce(p_note,'')),'')
      where id=p_request_id returning * into r;
  else
    update public.withdrawal_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
  end if;
  return r;
end;
$function$;
revoke all on function public.admin_process_withdrawal(uuid,text,text,text) from public,anon;
grant execute on function public.admin_process_withdrawal(uuid,text,text,text) to authenticated;
