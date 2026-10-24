-- BattleForge player UTR and safe admin deletion support. Apply in Supabase SQL Editor.
create unique index if not exists deposit_requests_payment_reference_unique on public.deposit_requests (lower(trim(payment_reference))) where payment_reference is not null and length(trim(payment_reference)) > 0;
drop function if exists public.create_deposit_request(numeric,text);
create or replace function public.create_deposit_request(p_amount numeric,p_payer_upi text,p_payment_reference text) returns public.deposit_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.deposit_requests;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 or p_amount > 50000 then raise exception 'Amount must be a whole number from 1 to 50000'; end if;
 if p_payer_upi is null or length(trim(p_payer_upi)) not between 3 and 100 or trim(p_payer_upi) !~* '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Enter a valid UPI ID'; end if;
 if p_payment_reference is null or length(trim(p_payment_reference)) not between 6 and 100 then raise exception 'Enter a valid UTR / transaction reference number'; end if;
 if exists(select 1 from public.deposit_requests where lower(trim(payment_reference))=lower(trim(p_payment_reference))) then raise exception 'This UTR has already been submitted'; end if;
 insert into public.deposit_requests(user_id,amount,payer_upi,payment_reference) values(auth.uid(),p_amount,lower(trim(p_payer_upi)),trim(p_payment_reference)) returning * into r; return r;
end; $$;
revoke all on function public.create_deposit_request(numeric,text,text) from public,anon;
grant execute on function public.create_deposit_request(numeric,text,text) to authenticated;
