-- BattleForge payment request intake. This does NOT credit wallet balances or send payouts.
create extension if not exists pgcrypto;
create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 50000), payer_upi text not null check (length(payer_upi) between 3 and 100),
  receiver_upi text not null default 'kjaman@fam', status text not null default 'pending' check (status in ('pending','reported_paid','verified','rejected','expired')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '2 minutes'),
  payment_reference text, verified_at timestamptz, verified_by uuid references auth.users(id), admin_note text
);
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 50000), account_name text not null check (length(trim(account_name)) between 2 and 120),
  payout_upi text not null check (length(payout_upi) between 3 and 100), fee_amount numeric(12,2) generated always as (round(amount * 0.02, 2)) stored,
  net_amount numeric(12,2) generated always as (amount - round(amount * 0.02, 2)) stored,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected')), created_at timestamptz not null default now(),
  reviewed_at timestamptz, reviewed_by uuid references auth.users(id), admin_note text, payout_reference text
);
create index if not exists deposit_requests_user_created_idx on public.deposit_requests(user_id, created_at desc);
create index if not exists withdrawal_requests_user_created_idx on public.withdrawal_requests(user_id, created_at desc);
alter table public.deposit_requests enable row level security;
alter table public.withdrawal_requests enable row level security;
drop policy if exists "Users read own deposit requests" on public.deposit_requests;
create policy "Users read own deposit requests" on public.deposit_requests for select to authenticated using (auth.uid() = user_id or public.is_battleforge_admin());
drop policy if exists "Users read own withdrawal requests" on public.withdrawal_requests;
create policy "Users read own withdrawal requests" on public.withdrawal_requests for select to authenticated using (auth.uid() = user_id or public.is_battleforge_admin());
revoke all on public.deposit_requests from anon, authenticated;
revoke all on public.withdrawal_requests from anon, authenticated;
grant select on public.deposit_requests to authenticated;
grant select on public.withdrawal_requests to authenticated;
drop function if exists public.create_deposit_request(numeric,text);
create unique index if not exists deposit_requests_payment_reference_unique on public.deposit_requests (lower(trim(payment_reference))) where payment_reference is not null and length(trim(payment_reference)) > 0;
create or replace function public.create_deposit_request(p_amount numeric, p_payer_upi text, p_payment_reference text)
returns public.deposit_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.deposit_requests; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 or p_amount > 50000 then raise exception 'Amount must be a whole number from 1 to 50000'; end if;
 if p_payer_upi is null or length(trim(p_payer_upi)) not between 3 and 100 or trim(p_payer_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Enter a valid UPI ID'; end if;
 if p_payment_reference is null or length(trim(p_payment_reference)) not between 6 and 100 then raise exception 'Enter a valid UTR / transaction reference number'; end if;
 if exists (select 1 from public.deposit_requests where lower(trim(payment_reference))=lower(trim(p_payment_reference))) then raise exception 'This UTR has already been submitted'; end if;
 insert into public.deposit_requests(user_id, amount, payer_upi, payment_reference) values(auth.uid(), p_amount, lower(trim(p_payer_upi)), trim(p_payment_reference)) returning * into r; return r;
end; $$;
create or replace function public.create_withdrawal_request(p_amount numeric, p_account_name text, p_payout_upi text)
returns public.withdrawal_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.withdrawal_requests; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 or p_amount > 50000 then raise exception 'Amount must be a whole number from 1 to 50000'; end if;
 if p_account_name is null or length(trim(p_account_name)) not between 2 and 120 then raise exception 'Enter the exact account-holder name'; end if;
 if p_payout_upi is null or length(trim(p_payout_upi)) not between 3 and 100 or trim(p_payout_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Enter a valid UPI ID'; end if;
 insert into public.withdrawal_requests(user_id, amount, account_name, payout_upi) values(auth.uid(), p_amount, trim(p_account_name), lower(trim(p_payout_upi))) returning * into r; return r;
end; $$;
create or replace function public.mark_deposit_payment_reported(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.deposit_requests set status='reported_paid' where id=p_request_id and user_id=auth.uid() and status='pending';
 if not found then raise exception 'Request not found or already updated'; end if; return true;
end; $$;
revoke all on function public.create_deposit_request(numeric,text,text) from public, anon;
revoke all on function public.create_withdrawal_request(numeric,text,text) from public, anon;
revoke all on function public.mark_deposit_payment_reported(uuid) from public, anon;
grant execute on function public.create_deposit_request(numeric,text,text) to authenticated;
grant execute on function public.create_withdrawal_request(numeric,text,text) to authenticated;
grant execute on function public.mark_deposit_payment_reported(uuid) to authenticated;
