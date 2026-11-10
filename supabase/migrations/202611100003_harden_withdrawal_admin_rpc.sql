-- Harden the privileged withdrawal-processing RPC.
-- This migration is safe to reapply: CREATE OR REPLACE preserves the function signature.
create or replace function public.admin_process_withdrawal(
  p_request_id uuid,
  p_action text,
  p_payout_reference text default null,
  p_note text default null
) returns public.withdrawal_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r public.withdrawal_requests;
begin
  if auth.uid() is null or not private.has_battleforge_permission('finance') then
    raise exception 'Admin access required';
  end if;
  if p_action not in ('paid','reject') then
    raise exception 'Action must be paid or reject';
  end if;
  if p_action='paid' and exists (
    select 1 from public.platform_controls
    where id=1 and (withdrawals_paused or maintenance_mode)
  ) then
    raise exception 'Withdrawal payouts are temporarily paused';
  end if;
  select * into r from public.withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if r.status in ('paid','rejected') then raise exception 'Request has already been processed'; end if;
  if p_action='paid' then
    if nullif(trim(coalesce(p_payout_reference,'')),'') is null then
      raise exception 'Enter the UPI transaction reference after sending payment';
    end if;
    update public.withdrawal_requests
      set status='paid', reviewed_at=now(), reviewed_by=auth.uid(),
          payout_reference=trim(p_payout_reference),
          admin_note=nullif(trim(coalesce(p_note,'')),'')
      where id=p_request_id returning * into r;
  else
    update public.withdrawal_requests
      set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(),
          admin_note=nullif(trim(coalesce(p_note,'')),'')
      where id=p_request_id returning * into r;
    insert into public.wallet_accounts(user_id) values(r.user_id)
      on conflict(user_id) do nothing;
    update public.wallet_accounts
      set earned_balance=earned_balance+r.amount, updated_at=now()
      where user_id=r.user_id;
    insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note)
      values(r.user_id,'withdrawal_refund','earned',r.amount,'withdrawal_request',r.id,
             coalesce(nullif(trim(p_note),''),'Withdrawal rejected; earned coins returned'));
    delete from public.withdrawal_requests where id=p_request_id;
  end if;
  return r;
end;
$function$;
