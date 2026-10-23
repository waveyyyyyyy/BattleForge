-- Enforce BattleForge payment request minimums on the server as well as in the app UI.
-- Deposits are entry-fee-only by policy; real-money balances and match earnings are not yet wired to a ledger.
create or replace function public.create_deposit_request(p_amount numeric, p_payer_upi text)
returns public.deposit_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.deposit_requests; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 30 or p_amount > 50000 then raise exception 'Minimum deposit is 30; amount must be a whole number up to 50000'; end if;
 if p_payer_upi is null or length(trim(p_payer_upi)) not between 3 and 100 or trim(p_payer_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Enter a valid UPI ID'; end if;
 insert into public.deposit_requests(user_id, amount, payer_upi) values(auth.uid(), p_amount, lower(trim(p_payer_upi))) returning * into r; return r;
end; $$;

create or replace function public.create_withdrawal_request(p_amount numeric, p_account_name text, p_payout_upi text)
returns public.withdrawal_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.withdrawal_requests; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 100 or p_amount > 50000 then raise exception 'Minimum withdrawal is 100; amount must be a whole number up to 50000'; end if;
 if p_account_name is null or length(trim(p_account_name)) not between 2 and 120 then raise exception 'Enter the exact account-holder name'; end if;
 if p_payout_upi is null or length(trim(p_payout_upi)) not between 3 and 100 or trim(p_payout_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Enter a valid UPI ID'; end if;
 insert into public.withdrawal_requests(user_id, amount, account_name, payout_upi) values(auth.uid(), p_amount, trim(p_account_name), lower(trim(p_payout_upi))) returning * into r; return r;
end; $$;

revoke all on function public.create_deposit_request(numeric,text) from public, anon;
revoke all on function public.create_withdrawal_request(numeric,text,text) from public, anon;
grant execute on function public.create_deposit_request(numeric,text) to authenticated;
grant execute on function public.create_withdrawal_request(numeric,text,text) to authenticated;
