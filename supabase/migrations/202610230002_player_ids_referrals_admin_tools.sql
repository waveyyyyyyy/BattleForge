-- BattleForge player numbers, referral credits, admin player tools, and stuck request cleanup.
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_number bigint generated always as identity unique,
  referred_by uuid references auth.users(id) on delete set null,
  referral_rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint player_profiles_not_self_referred check (referred_by is null or referred_by <> user_id)
);
create index if not exists player_profiles_referrer_idx on public.player_profiles(referred_by);
alter table public.player_profiles enable row level security;
drop policy if exists player_profiles_read_own on public.player_profiles;
create policy player_profiles_read_own on public.player_profiles for select to authenticated using (auth.uid()=user_id or public.is_battleforge_admin());
grant select on public.player_profiles to authenticated;

create or replace function public.battleforge_create_player_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ref_number bigint; ref_user uuid;
begin
  if nullif(new.raw_user_meta_data->>'referral_player_number','') is not null then
    begin ref_number := (new.raw_user_meta_data->>'referral_player_number')::bigint; exception when others then ref_number := null; end;
    if ref_number is not null then select user_id into ref_user from public.player_profiles where player_number=ref_number; end if;
  end if;
  insert into public.player_profiles(user_id,referred_by) values(new.id,case when ref_user=new.id then null else ref_user end) on conflict(user_id) do nothing;
  return new;
end; $$;
drop trigger if exists battleforge_auth_user_profile on auth.users;
create trigger battleforge_auth_user_profile after insert on auth.users for each row execute function public.battleforge_create_player_profile();
insert into public.player_profiles(user_id)
select u.id from auth.users u on conflict(user_id) do nothing;

create or replace function public.get_my_player_profile()
returns table(player_number bigint, referred_by_number bigint, created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.player_profiles(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 return query select p.player_number, r.player_number, p.created_at from public.player_profiles p left join public.player_profiles r on r.user_id=p.referred_by where p.user_id=auth.uid();
end; $$;

create or replace function public.battleforge_reward_referrer_on_first_paid_withdrawal()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare referred uuid; referrer uuid; already_paid boolean;
begin
 if new.status='paid' and old.status is distinct from 'paid' then
   select exists(select 1 from public.withdrawal_requests w where w.user_id=new.user_id and w.status='paid' and w.id<>new.id) into already_paid;
   if not already_paid then
     select referred_by into referrer from public.player_profiles where user_id=new.user_id for update;
     if referrer is not null then
       update public.player_profiles set referral_rewarded_at=now() where user_id=new.user_id and referral_rewarded_at is null;
       if found then
         insert into public.wallet_accounts(user_id) values(referrer) on conflict(user_id) do nothing;
         update public.wallet_accounts set deposited_balance=deposited_balance+5,updated_at=now() where user_id=referrer;
         insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note)
         values(referrer,'referral_reward','deposited',5,'referral_first_withdrawal',new.id,'₹5 referral reward; entry-fee-only and non-withdrawable');
       end if;
     end if;
   end if;
 end if;
 return new;
end; $$;
drop trigger if exists battleforge_first_withdrawal_referral_reward on public.withdrawal_requests;
create trigger battleforge_first_withdrawal_referral_reward after update of status on public.withdrawal_requests for each row execute function public.battleforge_reward_referrer_on_first_paid_withdrawal();

create or replace function public.admin_get_player_by_number(p_player_number bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; out_json jsonb;
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 select user_id into uid from public.player_profiles where player_number=p_player_number;
 if uid is null then raise exception 'Player ID not found'; end if;
 select jsonb_build_object(
  'profile',(select jsonb_build_object('player_number',p.player_number,'created_at',p.created_at,'referred_by_number',(select rp.player_number from public.player_profiles rp where rp.user_id=p.referred_by),'referral_rewarded_at',p.referral_rewarded_at,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name')) from public.player_profiles p join auth.users u on u.id=p.user_id where p.user_id=uid),
  'wallet',(select to_jsonb(w) from (select coalesce(a.deposited_balance,0) deposited_balance,coalesce(a.earned_balance,0) earned_balance,coalesce(a.deposited_balance,0)+coalesce(a.earned_balance,0) total_balance from (select uid user_id) x left join public.wallet_accounts a on a.user_id=x.user_id) w),
  'stats',jsonb_build_object(
    'entries',(select count(*) from public.tournament_entries e where e.user_id=uid),
    'results',(select count(*) from public.tournament_results r where r.user_id=uid and coalesce(r.published,true)),
    'referrals',(select count(*) from public.player_profiles p where p.referred_by=uid),
    'successful_referrals',(select count(*) from public.player_profiles p where p.referred_by=uid and p.referral_rewarded_at is not null)),
  'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc),'[]'::jsonb) from (select id,entry_type,bucket,amount,reference_type,reference_id,note,created_at from public.wallet_ledger where user_id=uid order by created_at desc limit 100) l),
  'deposits',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb) from (select id,amount,status,payer_upi,payment_reference,admin_note,created_at,verified_at from public.deposit_requests where user_id=uid order by created_at desc limit 100) d),
  'withdrawals',(select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc),'[]'::jsonb) from (select id,amount,fee_amount,net_amount,status,account_name,payout_upi,payout_reference,admin_note,created_at,reviewed_at from public.withdrawal_requests where user_id=uid order by created_at desc limit 100) w)
 ) into out_json;
 return out_json;
end; $$;

create or replace function public.admin_adjust_player_wallet(p_player_number bigint,p_bucket text,p_action text,p_amount numeric,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; col_balance numeric; new_balance numeric; delta numeric;
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_bucket not in ('deposited','earned') or p_action not in ('add','remove') or p_amount is null or p_amount<>trunc(p_amount) or p_amount<1 or p_amount>1000000 then raise exception 'Invalid wallet adjustment'; end if;
 if p_note is null or length(trim(p_note))<3 or length(trim(p_note))>200 then raise exception 'Enter a reason (3–200 characters)'; end if;
 select user_id into uid from public.player_profiles where player_number=p_player_number;
 if uid is null then raise exception 'Player ID not found'; end if;
 insert into public.wallet_accounts(user_id) values(uid) on conflict(user_id) do nothing;
 delta:=case when p_action='add' then p_amount else -p_amount end;
 if p_bucket='deposited' then update public.wallet_accounts set deposited_balance=deposited_balance+delta,updated_at=now() where user_id=uid and deposited_balance+delta>=0 returning deposited_balance into new_balance;
 else update public.wallet_accounts set earned_balance=earned_balance+delta,updated_at=now() where user_id=uid and earned_balance+delta>=0 returning earned_balance into new_balance; end if;
 if new_balance is null then raise exception 'Insufficient balance for removal'; end if;
 insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(uid,'admin_adjustment',p_bucket,p_amount,'admin:'||auth.uid()::text,upper(p_action)||' by admin: '||trim(p_note));
 return jsonb_build_object('player_number',p_player_number,'bucket',p_bucket,'balance',new_balance);
end; $$;

create or replace function public.admin_delete_payment_request(p_kind text,p_request_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.deposit_requests; w public.withdrawal_requests;
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_kind='deposit' then
   delete from public.deposit_requests where id=p_request_id returning * into d;
   if not found then raise exception 'Deposit request not found'; end if;
 elsif p_kind='withdrawal' then
   select * into w from public.withdrawal_requests where id=p_request_id for update;
   if not found then raise exception 'Withdrawal request not found'; end if;
   if w.status not in ('paid','rejected') then
     insert into public.wallet_accounts(user_id) values(w.user_id) on conflict(user_id) do nothing;
     update public.wallet_accounts set earned_balance=earned_balance+w.amount,updated_at=now() where user_id=w.user_id;
     insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,reference_id,note) values(w.user_id,'withdrawal_refund','earned',w.amount,'withdrawal_request',w.id,'Pending withdrawal request deleted by admin; reserved amount returned');
   end if;
   delete from public.withdrawal_requests where id=p_request_id;
 else raise exception 'Kind must be deposit or withdrawal'; end if;
 return true;
end; $$;

revoke all on function public.get_my_player_profile() from public,anon;
revoke all on function public.admin_get_player_by_number(bigint) from public,anon;
revoke all on function public.admin_adjust_player_wallet(bigint,text,text,numeric,text) from public,anon;
revoke all on function public.admin_delete_payment_request(text,uuid) from public,anon;
grant execute on function public.get_my_player_profile() to authenticated;
grant execute on function public.admin_get_player_by_number(bigint) to authenticated;
grant execute on function public.admin_adjust_player_wallet(bigint,text,text,numeric,text) to authenticated;
grant execute on function public.admin_delete_payment_request(text,uuid) to authenticated;
notify pgrst,'reload schema';
