create sequence if not exists public.battleforge_player_number_seq start 100001;
create table if not exists public.player_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 player_number bigint not null unique default nextval('public.battleforge_player_number_seq'),
 referred_by uuid references auth.users(id) on delete set null,
 referral_rewarded_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists player_accounts_number_idx on public.player_accounts(player_number);
alter table public.player_accounts enable row level security;
drop policy if exists player_accounts_read_self_or_admin on public.player_accounts;
create policy player_accounts_read_self_or_admin on public.player_accounts for select to authenticated using (auth.uid()=user_id or public.is_battleforge_admin());
revoke all on public.player_accounts from anon, public;
grant select on public.player_accounts to authenticated;

create or replace function public.battleforge_register_player() returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare ref_num bigint; ref_user uuid;
begin
 if new.raw_user_meta_data ? 'referral_player_number' then
  begin ref_num := nullif(new.raw_user_meta_data->>'referral_player_number','')::bigint; exception when others then ref_num := null; end;
  if ref_num is not null then select user_id into ref_user from public.player_accounts where player_number=ref_num; if ref_user=new.id then ref_user:=null; end if; end if;
 end if;
 insert into public.player_accounts(user_id,referred_by) values(new.id,ref_user) on conflict(user_id) do nothing;
 insert into public.wallet_accounts(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end; $$;
drop trigger if exists battleforge_register_player on auth.users;
create trigger battleforge_register_player after insert on auth.users for each row execute function public.battleforge_register_player();
insert into public.player_accounts(user_id) select id from auth.users on conflict(user_id) do nothing;
insert into public.wallet_accounts(user_id) select id from auth.users on conflict(user_id) do nothing;

create table if not exists public.admin_wallet_adjustments (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete restrict,
 admin_user_id uuid not null references auth.users(id) on delete restrict,
 bucket text not null check(bucket in ('deposited','earned')),
 amount numeric(12,2) not null check(amount <> 0),
 note text not null check(char_length(trim(note)) between 3 and 300),
 created_at timestamptz not null default now()
);
alter table public.admin_wallet_adjustments enable row level security;
drop policy if exists admin_wallet_adjustments_admin_read on public.admin_wallet_adjustments;
create policy admin_wallet_adjustments_admin_read on public.admin_wallet_adjustments for select to authenticated using(public.is_battleforge_admin());
revoke all on public.admin_wallet_adjustments from anon, public;
grant select on public.admin_wallet_adjustments to authenticated;

create or replace function public.admin_adjust_player_balance(p_player_number bigint,p_bucket text,p_amount numeric,p_note text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare uid uuid; bal numeric;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_bucket not in ('deposited','earned') then raise exception 'Invalid balance bucket'; end if;
 if p_amount is null or p_amount=0 or abs(p_amount)>1000000 then raise exception 'Amount must be non-zero and at most 1,000,000'; end if;
 if p_note is null or char_length(trim(p_note))<3 or char_length(trim(p_note))>300 then raise exception 'Enter an audit note (3-300 characters)'; end if;
 select user_id into uid from public.player_accounts where player_number=p_player_number for update;
 if uid is null then raise exception 'Player ID not found'; end if;
 insert into public.wallet_accounts(user_id) values(uid) on conflict(user_id) do nothing;
 if p_bucket='earned' then
  update public.wallet_accounts set earned_balance=earned_balance+p_amount,updated_at=now() where user_id=uid and earned_balance+p_amount>=0 returning earned_balance into bal;
 else
  update public.wallet_accounts set deposited_balance=deposited_balance+p_amount,updated_at=now() where user_id=uid and deposited_balance+p_amount>=0 returning deposited_balance into bal;
 end if;
 if bal is null then raise exception 'Adjustment would make this balance negative'; end if;
 insert into public.admin_wallet_adjustments(user_id,admin_user_id,bucket,amount,note) values(uid,auth.uid(),p_bucket,p_amount,trim(p_note));
 insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(uid,'admin_adjustment',p_bucket,abs(p_amount),'admin_adjustment',case when p_amount<0 then 'DEDUCTION: ' else 'CREDIT: ' end||trim(p_note));
 return jsonb_build_object('player_number',p_player_number,'bucket',p_bucket,'balance',bal);
end; $$;

create or replace function public.admin_get_player_details(p_player_number bigint)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare uid uuid; result jsonb;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 select user_id into uid from public.player_accounts where player_number=p_player_number;
 if uid is null then raise exception 'Player ID not found'; end if;
 select jsonb_build_object(
  'player_number',pa.player_number,'user_id',u.id,'email',u.email,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,
  'referred_by_player_number',(select player_number from public.player_accounts where user_id=pa.referred_by),
  'wallet',jsonb_build_object('deposited_balance',coalesce(wa.deposited_balance,0),'earned_balance',coalesce(wa.earned_balance,0),'total_balance',coalesce(wa.deposited_balance,0)+coalesce(wa.earned_balance,0)),
  'stats',jsonb_build_object('entries',(select count(*) from public.tournament_entries e where e.user_id=uid),'deposits',(select count(*) from public.deposit_requests d where d.user_id=uid),'withdrawals',(select count(*) from public.withdrawal_requests w where w.user_id=uid),'paid_withdrawals',(select count(*) from public.withdrawal_requests w where w.user_id=uid and w.status='paid')),
  'deposits',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,amount,status,created_at,payer_upi,payment_reference,admin_note from public.deposit_requests where user_id=uid order by created_at desc limit 100) d),'[]'::jsonb),
  'withdrawals',coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at desc) from (select id,amount,fee_amount,net_amount,status,created_at,payout_upi,payout_reference,admin_note from public.withdrawal_requests where user_id=uid order by created_at desc limit 100) w),'[]'::jsonb),
  'wallet_history',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select entry_type,bucket,amount,reference_type,reference_id,note,created_at from public.wallet_ledger where user_id=uid order by created_at desc limit 200) l),'[]'::jsonb),
  'admin_adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select bucket,amount,note,created_at,admin_user_id from public.admin_wallet_adjustments where user_id=uid order by created_at desc limit 100) a),'[]'::jsonb)
 ) into result from public.player_accounts pa join auth.users u on u.id=pa.user_id left join public.wallet_accounts wa on wa.user_id=pa.user_id where pa.user_id=uid;
 return result;
end; $$;

create or replace function public.admin_delete_payment_request(p_kind text,p_request_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare w public.withdrawal_requests; d public.deposit_requests;
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_note is null or char_length(trim(p_note))<3 then raise exception 'Enter a reason for deleting the request'; end if;
 if p_kind='deposit' then
  select * into d from public.deposit_requests where id=p_request_id for update;
  if not found then raise exception 'Deposit request not found'; end if;
  if d.status='verified' then raise exception 'Cannot delete a verified deposit; use an audited balance adjustment instead'; end if;
  delete from public.deposit_requests where id=p_request_id;
 elsif p_kind='withdrawal' then
  select * into w from public.withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if w.status in ('pending','approved') then
   insert into public.wallet_accounts(user_id) values(w.user_id) on conflict(user_id) do nothing;
   update public.wallet_accounts set earned_balance=earned_balance+w.amount,updated_at=now() where user_id=w.user_id;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(w.user_id,'withdrawal_refund','earned',w.amount,'withdrawal_request',w.id,'Refund from deleted request: '||left(trim(p_note),250));
  elsif w.status='paid' then raise exception 'Cannot delete a paid withdrawal'; end if;
  delete from public.withdrawal_requests where id=p_request_id;
 else raise exception 'Kind must be deposit or withdrawal'; end if;
 return true;
end; $$;

create or replace function public.battleforge_reward_referrer_after_withdrawal() returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare referrer uuid; referred_number bigint; new_balance numeric;
begin
 if new.status='paid' and old.status is distinct from new.status then
  select referred_by into referrer from public.player_accounts where user_id=new.user_id and referral_rewarded_at is null for update;
  if referrer is not null and referrer<>new.user_id then
   insert into public.wallet_accounts(user_id) values(referrer) on conflict(user_id) do nothing;
   update public.wallet_accounts set deposited_balance=deposited_balance+5,updated_at=now() where user_id=referrer returning deposited_balance into new_balance;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(referrer,'deposit_credit','deposited',5,'referral_first_withdrawal',new.id,'₹5 referral reward; entry-fee-only credit');
   update public.player_accounts set referral_rewarded_at=now() where user_id=new.user_id and referral_rewarded_at is null;
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists battleforge_referral_first_withdrawal on public.withdrawal_requests;
create trigger battleforge_referral_first_withdrawal after update of status on public.withdrawal_requests for each row execute function public.battleforge_reward_referrer_after_withdrawal();

revoke all on function public.admin_adjust_player_balance(bigint,text,numeric,text) from public,anon;
revoke all on function public.admin_get_player_details(bigint) from public,anon;
revoke all on function public.admin_delete_payment_request(text,uuid,text) from public,anon;
grant execute on function public.admin_adjust_player_balance(bigint,text,numeric,text) to authenticated;
grant execute on function public.admin_get_player_details(bigint) to authenticated;
grant execute on function public.admin_delete_payment_request(text,uuid,text) to authenticated;
notify pgrst,'reload schema';

alter table public.wallet_ledger drop constraint if exists wallet_ledger_entry_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_entry_type_check check (entry_type = any (array['deposit_credit','match_earning','entry_fee','withdrawal_reserve','withdrawal_refund','admin_adjustment']::text[]));
