-- Repair the public withdrawal-request RPC without writing generated columns.
-- fee_amount and net_amount are GENERATED ALWAYS columns on the deployed schema.
-- PostgreSQL calculates them from amount; callers must not supply either value.
create or replace function public.create_withdrawal_request(
  p_amount numeric,
  p_account_name text,
  p_payout_upi text
) returns public.withdrawal_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r public.withdrawal_requests;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 100 or p_amount > 50000 then
    raise exception 'Withdrawal amount must be a whole number from 100 to 50000';
  end if;
  if p_account_name is null or length(trim(p_account_name)) not between 2 and 120 then
    raise exception 'Enter the exact account-holder name';
  end if;
  if p_payout_upi is null or length(trim(p_payout_upi)) not between 3 and 100
     or trim(p_payout_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then
    raise exception 'Enter a valid UPI ID';
  end if;
  if exists (
    select 1 from public.platform_controls
    where id = 1 and (withdrawals_paused or maintenance_mode)
  ) then
    raise exception 'Withdrawals are temporarily paused';
  end if;

  -- Do not include fee_amount or net_amount in this INSERT.
  insert into public.withdrawal_requests(user_id, amount, account_name, payout_upi)
  values (auth.uid(), p_amount, trim(p_account_name), lower(trim(p_payout_upi)))
  returning * into r;

  return r;
end;
$function$;

revoke all on function public.create_withdrawal_request(numeric,text,text) from public, anon;
grant execute on function public.create_withdrawal_request(numeric,text,text) to authenticated;
