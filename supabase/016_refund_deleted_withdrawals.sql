-- If an unpaid withdrawal request is deleted, return its reserved earned coins.
create or replace function public.admin_delete_payment_request(p_kind text,p_request_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.withdrawal_requests;
begin
  if auth.uid() is null or not private.has_battleforge_permission('finance') then raise exception 'Admin access required'; end if;
  if p_request_id is null then raise exception 'Request ID is required'; end if;
  if lower(trim(p_kind))='deposit' then
    delete from public.deposit_requests where id=p_request_id;
    if not found then raise exception 'Deposit request not found'; end if;
  elsif lower(trim(p_kind))='withdrawal' then
    select * into r from public.withdrawal_requests where id=p_request_id for update;
    if not found then raise exception 'Withdrawal request not found'; end if;
    if r.status in ('pending','approved')
       and exists(select 1 from public.wallet_ledger where entry_type='withdrawal_reserve' and reference_type='withdrawal_request' and reference_id=r.id)
       and not exists(select 1 from public.wallet_ledger where entry_type='withdrawal_refund' and reference_type='withdrawal_request' and reference_id=r.id) then
      insert into public.wallet_accounts(user_id) values(r.user_id) on conflict(user_id) do nothing;
      update public.wallet_accounts set earned_balance=earned_balance+r.amount,updated_at=now() where user_id=r.user_id;
      insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note)
        values(r.user_id,'withdrawal_refund','earned',r.amount,'withdrawal_request',r.id,
          coalesce(nullif(trim(p_note),''),'Withdrawal request deleted; reserved earned coins returned'));
    end if;
    delete from public.withdrawal_requests where id=p_request_id;
  else raise exception 'Kind must be deposit or withdrawal'; end if;
  return true;
end; $$;
revoke all on function public.admin_delete_payment_request(text,uuid,text) from public,anon;
grant execute on function public.admin_delete_payment_request(text,uuid,text) to authenticated;
