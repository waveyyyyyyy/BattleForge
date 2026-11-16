-- Atomic deposit submission: create request, store UTR and mark payment reported in one transaction.
create or replace function public.submit_deposit_request(
  p_amount numeric,
  p_payer_upi text,
  p_reference text
) returns public.deposit_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare r public.deposit_requests;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_reference is null or char_length(trim(p_reference)) < 6
     or char_length(trim(p_reference)) > 100
     or trim(p_reference) !~ '^[A-Za-z0-9-]+$' then
    raise exception 'Enter a valid UTR / transaction reference';
  end if;
  r := public.create_deposit_request(p_amount,p_payer_upi);
  update public.deposit_requests
     set payment_reference=trim(p_reference),status='reported_paid'
   where id=r.id and user_id=auth.uid() and status='pending'
   returning * into r;
  if not found then raise exception 'Could not complete the deposit request'; end if;
  return r;
end;
$function$;
revoke all on function public.submit_deposit_request(numeric,text,text) from public,anon;
grant execute on function public.submit_deposit_request(numeric,text,text) to authenticated;
