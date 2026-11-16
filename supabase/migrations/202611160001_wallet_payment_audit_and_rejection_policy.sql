-- BattleForge wallet and payment audit improvements.
-- Apply after the existing payment and wallet migrations.
alter table public.withdrawal_requests alter column fee_amount set default 0;
update public.withdrawal_requests set fee_amount = coalesce(fee_amount, 0) where fee_amount is null;
alter table public.withdrawal_requests alter column fee_amount set not null;
alter table public.withdrawal_requests alter column net_amount set default 0;
update public.withdrawal_requests set net_amount = coalesce(net_amount, amount) where net_amount is null;

-- Rejected withdrawals remain rejected and reserved coins are NOT automatically refunded.
create or replace function public.admin_process_withdrawal(
 p_request_id uuid, p_action text, p_payout_reference text default null, p_note text default null
) returns public.withdrawal_requests
language plpgsql security definer set search_path = '' as $$
declare r public.withdrawal_requests;
begin
 if auth.uid() is null or not private.has_battleforge_permission('finance') then raise exception 'Admin access required'; end if;
 if p_action not in ('paid','reject') then raise exception 'Action must be paid or reject'; end if;
 select * into r from public.withdrawal_requests where id=p_request_id for update;
 if not found then raise exception 'Withdrawal request not found'; end if;
 if r.status in ('paid','rejected') then raise exception 'Request has already been processed'; end if;
 if p_action='paid' then
   if nullif(trim(coalesce(p_payout_reference,'')),'') is null then raise exception 'Enter the UPI transaction reference after sending payment'; end if;
   update public.withdrawal_requests set status='paid', reviewed_at=now(), reviewed_by=auth.uid(),
     payout_reference=trim(p_payout_reference), admin_note=nullif(trim(coalesce(p_note,'')),'')
     where id=p_request_id returning * into r;
 else
   update public.withdrawal_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(),
     admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
 end if;
 return r;
end; $$;
revoke all on function public.admin_process_withdrawal(uuid,text,text,text) from public, anon;
grant execute on function public.admin_process_withdrawal(uuid,text,text,text) to authenticated;
