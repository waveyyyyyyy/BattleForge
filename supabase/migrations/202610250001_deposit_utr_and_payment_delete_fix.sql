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
    if w.status = 'paid' then raise exception 'Cannot delete a paid withdrawal'; end if;
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

CREATE OR REPLACE FUNCTION public.set_deposit_payment_reference(p_request_id uuid, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare d public.deposit_requests;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_request_id is null or p_reference is null or char_length(trim(p_reference)) < 6 or char_length(trim(p_reference)) > 100 or trim(p_reference) !~ '^[A-Za-z0-9-]+$' then
    raise exception 'Enter a valid UTR / transaction reference';
  end if;
  select * into d from public.deposit_requests where id = p_request_id and user_id = auth.uid() for update;
  if not found then raise exception 'Deposit request not found'; end if;
  if d.status not in ('pending','reported_paid') then raise exception 'UTR can only be set while the deposit is awaiting review'; end if;
  update public.deposit_requests set payment_reference = trim(p_reference) where id = p_request_id;
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_deposit_payment_reference(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_deposit_payment_reference(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_payment_request(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_payment_request(text,uuid,text) TO authenticated;
