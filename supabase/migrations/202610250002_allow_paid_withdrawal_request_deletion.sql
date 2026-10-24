-- Allow admins to delete withdrawal request records in any status, including paid.
-- Pending/approved withdrawals are refunded before deletion; paid withdrawals are not refunded again.
-- Wallet ledger history is deliberately preserved.
CREATE OR REPLACE FUNCTION public.admin_delete_payment_request(p_kind text, p_request_id uuid, p_note text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare w public.withdrawal_requests; d public.deposit_requests;
begin
  if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if p_request_id is null then raise exception 'Request ID is required'; end if;
  if lower(trim(p_kind)) = 'deposit' then
    select * into d from public.deposit_requests where id = p_request_id for update;
    if not found then raise exception 'Deposit request not found'; end if;
    delete from public.deposit_requests where id = p_request_id;
  elsif lower(trim(p_kind)) = 'withdrawal' then
    select * into w from public.withdrawal_requests where id = p_request_id for update;
    if not found then raise exception 'Withdrawal request not found'; end if;
    if w.status in ('pending', 'approved') then
      insert into public.wallet_accounts(user_id) values (w.user_id) on conflict (user_id) do nothing;
      update public.wallet_accounts set earned_balance = earned_balance + w.amount, updated_at = now() where user_id = w.user_id;
      insert into public.wallet_ledger(user_id, entry_type, bucket, amount, reference_type, reference_id, note)
      values (w.user_id, 'withdrawal_refund', 'earned', w.amount, 'withdrawal_request', w.id, 'Refund from deleted withdrawal request');
    end if;
    delete from public.withdrawal_requests where id = p_request_id;
  else
    raise exception 'Kind must be deposit or withdrawal';
  end if;
  return true;
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_payment_request(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_payment_request(text,uuid,text) TO authenticated;
