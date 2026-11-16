-- Deposit bank details and atomic bulk payment-queue actions.
alter table public.deposit_requests add column if not exists payer_bank_name text;

create or replace function public.submit_deposit_request(
  p_amount numeric,p_payer_upi text,p_reference text,p_bank_name text
)
returns public.deposit_requests language plpgsql security definer set search_path = '' as $$
declare r public.deposit_requests;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_bank_name is null or length(trim(p_bank_name)) not between 2 and 120 then
    raise exception 'Enter the exact bank name used for payment';
  end if;
  if p_reference is null or char_length(trim(p_reference)) < 6
     or char_length(trim(p_reference)) > 100
     or trim(p_reference) !~ '^[A-Za-z0-9-]+$' then
    raise exception 'Enter a valid UTR / transaction reference';
  end if;
  r := public.create_deposit_request(p_amount,p_payer_upi);
  update public.deposit_requests set payer_bank_name=trim(p_bank_name),
    payment_reference=trim(p_reference),status='reported_paid'
   where id=r.id and user_id=auth.uid() and status='pending' returning * into r;
  if not found then raise exception 'Could not complete the deposit request'; end if;
  return r;
end; $$;
revoke all on function public.submit_deposit_request(numeric,text,text,text) from public,anon;
grant execute on function public.submit_deposit_request(numeric,text,text,text) to authenticated;

create or replace function public.admin_bulk_payment_action(p_action text,p_requests jsonb,p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; request_id uuid; request_kind text; request_status text; processed integer:=0;
begin
  if auth.uid() is null or not private.has_battleforge_permission('finance') then raise exception 'Admin access required'; end if;
  if p_action not in ('approve','reject','delete') then raise exception 'Action must be approve, reject, or delete'; end if;
  if p_requests is null or jsonb_typeof(p_requests)<>'array' or jsonb_array_length(p_requests)<1 or jsonb_array_length(p_requests)>100 then
    raise exception 'Select between 1 and 100 payment requests';
  end if;
  for item in select value from jsonb_array_elements(p_requests) loop
    request_id:=nullif(item->>'id','')::uuid;
    request_kind:=lower(coalesce(item->>'kind',''));
    if request_id is null or request_kind not in ('deposit','withdrawal') then raise exception 'Invalid payment request selection'; end if;
    if p_action='delete' then
      perform public.admin_delete_payment_request(request_kind,request_id,p_note);
    elsif request_kind='deposit' then
      select status into request_status from public.deposit_requests where id=request_id for update;
      if not found then raise exception 'Deposit request not found'; end if;
      if p_action='approve' then perform public.admin_process_deposit(request_id,'verify',null,p_note);
      else perform public.admin_process_deposit(request_id,'reject',null,p_note); end if;
    else
      select status into request_status from public.withdrawal_requests where id=request_id for update;
      if not found then raise exception 'Withdrawal request not found'; end if;
      if p_action='approve' then
        if request_status<>'pending' then raise exception 'Only pending withdrawals can be approved'; end if;
        update public.withdrawal_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),
          admin_note=nullif(trim(coalesce(p_note,'')),'') where id=request_id;
      else perform public.admin_process_withdrawal(request_id,'reject',null,p_note); end if;
    end if;
    processed:=processed+1;
  end loop;
  return processed;
end; $$;
revoke all on function public.admin_bulk_payment_action(text,jsonb,text) from public,anon;
grant execute on function public.admin_bulk_payment_action(text,jsonb,text) to authenticated;
