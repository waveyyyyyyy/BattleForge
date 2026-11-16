-- Keep rejected deposit requests in the admin past-transactions history.
create or replace function public.admin_process_deposit(
 p_request_id uuid, p_action text, p_payment_reference text default null, p_note text default null
) returns public.deposit_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare r public.deposit_requests;
begin
 if auth.uid() is null or not private.has_battleforge_permission('finance') then
  raise exception 'Admin access required';
 end if;
 if p_action not in ('verify','reject') then raise exception 'Action must be verify or reject'; end if;
 select * into r from public.deposit_requests where id=p_request_id for update;
 if not found then raise exception 'Deposit request not found'; end if;
 if r.status in ('verified','rejected') then raise exception 'Request has already been processed'; end if;
 if p_action='verify' then
  update public.deposit_requests
   set status='verified',verified_at=now(),verified_by=auth.uid(),
       payment_reference=coalesce(nullif(trim(coalesce(p_payment_reference,'')),''),payment_reference),
       admin_note=nullif(trim(coalesce(p_note,'')),'')
   where id=p_request_id returning * into r;
  insert into public.wallet_accounts(user_id) values(r.user_id) on conflict(user_id) do nothing;
  update public.wallet_accounts set deposited_balance=deposited_balance+r.amount,updated_at=now() where user_id=r.user_id;
  insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note)
   values(r.user_id,'deposit_credit','deposited',r.amount,'deposit_request',r.id,
          coalesce(nullif(trim(p_note),''),'Manual UPI deposit verified by admin'));
 else
  update public.deposit_requests
   set status='rejected',verified_by=auth.uid(),verified_at=now(),
       admin_note=nullif(trim(coalesce(p_note,'')),'')
   where id=p_request_id returning * into r;
 end if;
 return r;
end;
$function$;
revoke all on function public.admin_process_deposit(uuid,text,text,text) from public,anon;
grant execute on function public.admin_process_deposit(uuid,text,text,text) to authenticated;
