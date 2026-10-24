-- BattleForge manual UPI processing and split wallet ledger.
-- Run after migrations 006 and 008. Admins manually verify UPI credits and manually send payouts.
create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deposited_balance numeric(12,2) not null default 0 check (deposited_balance >= 0),
  earned_balance numeric(12,2) not null default 0 check (earned_balance >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('deposit_credit','match_earning','entry_fee','withdrawal_reserve','withdrawal_refund','admin_adjustment')),
  bucket text not null check (bucket in ('deposited','earned')),
  amount numeric(12,2) not null check (amount > 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists wallet_ledger_unique_reference on public.wallet_ledger(entry_type, reference_type, reference_id) where reference_id is not null and entry_type in ('deposit_credit','withdrawal_reserve','withdrawal_refund');
create index if not exists wallet_ledger_user_created_idx on public.wallet_ledger(user_id, created_at desc);
alter table public.wallet_accounts enable row level security;
alter table public.wallet_ledger enable row level security;
drop policy if exists wallet_accounts_read_own on public.wallet_accounts;
create policy wallet_accounts_read_own on public.wallet_accounts for select to authenticated using (auth.uid() = user_id or public.is_battleforge_admin());
drop policy if exists wallet_ledger_read_own on public.wallet_ledger;
create policy wallet_ledger_read_own on public.wallet_ledger for select to authenticated using (auth.uid() = user_id or public.is_battleforge_admin());
revoke all on public.wallet_accounts from anon, authenticated;
revoke all on public.wallet_ledger from anon, authenticated;
grant select on public.wallet_accounts, public.wallet_ledger to authenticated;

create or replace function public.get_wallet_summary()
returns table(deposited_balance numeric, earned_balance numeric, total_balance numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); begin
 if uid is null then raise exception 'Sign in required'; end if;
 insert into public.wallet_accounts(user_id) values(uid) on conflict(user_id) do nothing;
 return query select a.deposited_balance, a.earned_balance, a.deposited_balance + a.earned_balance from public.wallet_accounts a where a.user_id=uid;
end; $$;

create or replace function public.create_withdrawal_request(p_amount numeric, p_account_name text, p_payout_upi text)
returns public.withdrawal_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.withdrawal_requests; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 100 or p_amount > 50000 then raise exception 'Minimum withdrawal is 100; amount must be a whole number up to 50000'; end if;
 if p_account_name is null or length(trim(p_account_name)) not between 2 and 120 then raise exception 'Enter the exact account-holder name'; end if;
 if p_payout_upi is null or length(trim(p_payout_upi)) not between 3 and 100 or trim(p_payout_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Enter a valid UPI ID'; end if;
 insert into public.wallet_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 update public.wallet_accounts set earned_balance=earned_balance-p_amount, updated_at=now() where user_id=auth.uid() and earned_balance >= p_amount;
 if not found then raise exception 'Insufficient match earnings. Deposited coins cannot be withdrawn.'; end if;
 insert into public.withdrawal_requests(user_id, amount, account_name, payout_upi) values(auth.uid(), p_amount, trim(p_account_name), lower(trim(p_payout_upi))) returning * into r;
 insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(auth.uid(),'withdrawal_reserve','earned',p_amount,'withdrawal_request',r.id,'Earned coins reserved for withdrawal');
 return r;
end; $$;
revoke all on function public.create_withdrawal_request(numeric,text,text) from public, anon;
grant execute on function public.create_withdrawal_request(numeric,text,text) to authenticated;

create or replace function public.admin_process_deposit(p_request_id uuid, p_action text, p_payment_reference text default null, p_note text default null)
returns public.deposit_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.deposit_requests; begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_action not in ('verify','reject') then raise exception 'Action must be verify or reject'; end if;
 select * into r from public.deposit_requests where id=p_request_id for update;
 if not found then raise exception 'Deposit request not found'; end if;
 if r.status='verified' or r.status='rejected' then raise exception 'Request has already been processed'; end if;
 if p_action='verify' then
   update public.deposit_requests set status='verified', verified_at=now(), verified_by=auth.uid(), payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''), admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
   insert into public.wallet_accounts(user_id) values(r.user_id) on conflict(user_id) do nothing;
   update public.wallet_accounts set deposited_balance=deposited_balance+r.amount, updated_at=now() where user_id=r.user_id;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(r.user_id,'deposit_credit','deposited',r.amount,'deposit_request',r.id,coalesce(nullif(trim(p_note),''),'Manual UPI deposit verified by admin'));
 else
   update public.deposit_requests set status='rejected', verified_by=auth.uid(), verified_at=now(), admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
 end if;
 return r;
end; $$;

create or replace function public.admin_process_withdrawal(p_request_id uuid, p_action text, p_payout_reference text default null, p_note text default null)
returns public.withdrawal_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.withdrawal_requests; begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_action not in ('paid','reject') then raise exception 'Action must be paid or reject'; end if;
 select * into r from public.withdrawal_requests where id=p_request_id for update;
 if not found then raise exception 'Withdrawal request not found'; end if;
 if r.status in ('paid','rejected') then raise exception 'Request has already been processed'; end if;
 if p_action='paid' then
   if nullif(trim(coalesce(p_payout_reference,'')),'') is null then raise exception 'Enter the UPI transaction reference after sending payment'; end if;
   update public.withdrawal_requests set status='paid', reviewed_at=now(), reviewed_by=auth.uid(), payout_reference=trim(p_payout_reference), admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
 else
   update public.withdrawal_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(), admin_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request_id returning * into r;
   insert into public.wallet_accounts(user_id) values(r.user_id) on conflict(user_id) do nothing;
   update public.wallet_accounts set earned_balance=earned_balance+r.amount, updated_at=now() where user_id=r.user_id;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(r.user_id,'withdrawal_refund','earned',r.amount,'withdrawal_request',r.id,coalesce(nullif(trim(p_note),''),'Withdrawal rejected; reserved earned coins returned'));
 end if;
 return r;
end; $$;

create or replace function public.admin_credit_match_earnings(p_user_id uuid, p_amount numeric, p_reference text, p_note text default null)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare new_balance numeric; begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_user_id is null or p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'Invalid player or earning amount'; end if;
 if p_reference is null or length(trim(p_reference)) not between 3 and 160 then raise exception 'A unique match/result reference is required'; end if;
 if exists(select 1 from public.wallet_ledger where entry_type='match_earning' and reference_type='match_result' and note=trim(p_reference)) then raise exception 'This match earning reference was already credited'; end if;
 insert into public.wallet_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
 update public.wallet_accounts set earned_balance=earned_balance+p_amount, updated_at=now() where user_id=p_user_id returning earned_balance into new_balance;
 insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(p_user_id,'match_earning','earned',p_amount,'match_result',trim(p_reference)||case when nullif(trim(coalesce(p_note,'')),'') is null then '' else ' — '||trim(p_note) end);
 return new_balance;
end; $$;

revoke all on function public.get_wallet_summary() from public, anon;
revoke all on function public.admin_process_deposit(uuid,text,text,text) from public, anon;
revoke all on function public.admin_process_withdrawal(uuid,text,text,text) from public, anon;
revoke all on function public.admin_credit_match_earnings(uuid,numeric,text,text) from public, anon;
grant execute on function public.get_wallet_summary() to authenticated;
grant execute on function public.admin_process_deposit(uuid,text,text,text) to authenticated;
grant execute on function public.admin_process_withdrawal(uuid,text,text,text) to authenticated;
grant execute on function public.admin_credit_match_earnings(uuid,numeric,text,text) to authenticated;
