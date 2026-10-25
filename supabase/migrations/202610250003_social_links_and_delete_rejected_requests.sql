-- Shared admin-editable BattleForge social links.
create table if not exists public.battleforge_social_settings (
  id integer primary key default 1 check (id = 1),
  telegram_url text not null default 'https://t.me/battleforgeff',
  instagram_url text not null default 'https://www.instagram.com/battleforgeff?vrfl=MXAxeXhubTd4OTZrZQ==',
  youtube_url text,
  updated_at timestamptz not null default now()
);
insert into public.battleforge_social_settings(id) values (1) on conflict(id) do nothing;
alter table public.battleforge_social_settings enable row level security;
revoke all on public.battleforge_social_settings from anon, authenticated;
create or replace function public.get_battleforge_social_links()
returns table(telegram_url text, instagram_url text, youtube_url text)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.telegram_url,s.instagram_url,s.youtube_url from public.battleforge_social_settings s where s.id=1;
$$;
create or replace function public.admin_update_battleforge_social_links(p_telegram_url text,p_instagram_url text,p_youtube_url text default null)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if coalesce(p_telegram_url,'') !~* '^https://[^[:space:]]+$' or coalesce(p_instagram_url,'') !~* '^https://[^[:space:]]+$' or (nullif(trim(p_youtube_url),'') is not null and p_youtube_url !~* '^https://[^[:space:]]+$') then raise exception 'Social links must be valid HTTPS URLs'; end if;
 update public.battleforge_social_settings set telegram_url=trim(p_telegram_url),instagram_url=trim(p_instagram_url),youtube_url=nullif(trim(p_youtube_url),''),updated_at=now() where id=1;
 return true;
end; $$;
revoke all on function public.get_battleforge_social_links() from public;
revoke all on function public.admin_update_battleforge_social_links(text,text,text) from public,anon;
grant execute on function public.get_battleforge_social_links() to anon,authenticated;
grant execute on function public.admin_update_battleforge_social_links(text,text,text) to authenticated;

-- Rejected requests should no longer appear in either player or admin views.
-- Preserve wallet ledger entries; only remove the rejected request rows.
delete from public.deposit_requests where status='rejected';
delete from public.withdrawal_requests where status='rejected';

create or replace function public.admin_process_deposit(p_request_id uuid,p_action text,p_payment_reference text default null,p_note text default null)
returns public.deposit_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.deposit_requests;
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_action not in ('verify','reject') then raise exception 'Action must be verify or reject'; end if;
 select * into r from public.deposit_requests where id=p_request_id for update;
 if not found then raise exception 'Deposit request not found'; end if;
 if r.status='verified' or r.status='rejected' then raise exception 'Request has already been processed'; end if;
 if p_action='verify' then
  update public.deposit_requests set status='verified',verified_at=now(),verified_by=auth.uid(),payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
  insert into public.wallet_accounts(user_id) values(r.user_id) on conflict(user_id) do nothing;
  update public.wallet_accounts set deposited_balance=deposited_balance+r.amount,updated_at=now() where user_id=r.user_id;
  insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(r.user_id,'deposit_credit','deposited',r.amount,'deposit_request',r.id,coalesce(nullif(trim(p_note),''),'Manual UPI deposit verified by admin'));
 else
  update public.deposit_requests set status='rejected',verified_by=auth.uid(),verified_at=now(),admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
  delete from public.deposit_requests where id=p_request_id;
 end if;
 return r;
end; $$;

create or replace function public.admin_process_withdrawal(p_request_id uuid,p_action text,p_payout_reference text default null,p_note text default null)
returns public.withdrawal_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.withdrawal_requests;
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_action not in ('paid','reject') then raise exception 'Action must be paid or reject'; end if;
 select * into r from public.withdrawal_requests where id=p_request_id for update;
 if not found then raise exception 'Withdrawal request not found'; end if;
 if r.status in ('paid','rejected') then raise exception 'Request has already been processed'; end if;
 if p_action='paid' then
  if nullif(trim(coalesce(p_payout_reference,'')),'') is null then raise exception 'Enter the UPI transaction reference after sending payment'; end if;
  update public.withdrawal_requests set status='paid',reviewed_at=now(),reviewed_by=auth.uid(),payout_reference=trim(p_payout_reference),admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
 else
  update public.withdrawal_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
  insert into public.wallet_accounts(user_id) values(r.user_id) on conflict(user_id) do nothing;
  update public.wallet_accounts set earned_balance=earned_balance+r.amount,updated_at=now() where user_id=r.user_id;
  insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(r.user_id,'withdrawal_refund','earned',r.amount,'withdrawal_request',r.id,coalesce(nullif(trim(p_note),''),'Withdrawal rejected; earned coins returned'));
  delete from public.withdrawal_requests where id=p_request_id;
 end if;
 return r;
end; $$;
revoke all on function public.admin_process_deposit(uuid,text,text,text) from public,anon;
revoke all on function public.admin_process_withdrawal(uuid,text,text,text) from public,anon;
grant execute on function public.admin_process_deposit(uuid,text,text,text) to authenticated;
grant execute on function public.admin_process_withdrawal(uuid,text,text,text) to authenticated;
