-- Require a valid, unique username at email signup; referral code remains optional.
create or replace function public.battleforge_register_player()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare ref_num bigint; ref_user uuid; requested_username text;
begin
  requested_username := nullif(btrim(new.raw_user_meta_data->>'username'), '');
  if requested_username is not null and requested_username !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Username must be 3–24 letters, numbers, or underscores';
  end if;
  if requested_username is not null and exists(select 1 from public.player_accounts p where lower(p.username)=lower(requested_username)) then
    raise exception 'That username is already taken';
  end if;
  begin
    ref_num := nullif(btrim(new.raw_user_meta_data->>'referral_player_number'),'')::bigint;
  exception when others then ref_num := null;
  end;
  if ref_num is not null then
    select user_id into ref_user from public.player_accounts where player_number=ref_num;
    if ref_user=new.id then ref_user:=null; end if;
  end if;
  insert into public.player_accounts(user_id,referred_by,username) values(new.id,ref_user,requested_username) on conflict(user_id) do nothing;
  insert into public.wallet_accounts(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end; $$;

create or replace function public.update_player_profile(p_username text, p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,storage,pg_temp as $$
declare uid uuid:=auth.uid(); acct public.player_accounts%rowtype; changed boolean; fee numeric:=0; wallet public.wallet_accounts%rowtype;
begin
 if uid is null then raise exception 'Please sign in first'; end if;
 if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'Username must be 3–24 letters, numbers, or underscores'; end if;
 if p_avatar_url is not null and (length(p_avatar_url)>1000 or p_avatar_url not like '%/storage/v1/object/public/player-avatars/%') then raise exception 'Invalid profile photo URL'; end if;
 select * into acct from public.player_accounts where user_id=uid for update;
 if not found then raise exception 'Player account not found'; end if;
 changed := acct.username is distinct from p_username;
 if changed and acct.username is not null and acct.username_change_count >= 1 then fee:=5; end if;
 if changed and exists(select 1 from public.player_accounts p where lower(p.username)=lower(p_username) and p.user_id<>uid) then raise exception 'That username is already taken'; end if;
 if fee>0 then
   select * into wallet from public.wallet_accounts where user_id=uid for update;
   if coalesce(wallet.deposited_balance,0)<fee then raise exception 'Changing your username costs ₹5 in entry-fee credits. Your entry-fee balance is too low.'; end if;
   update public.wallet_accounts set deposited_balance=deposited_balance-fee where user_id=uid;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(uid,'admin_adjustment','deposited',fee,'username_change','DEDUCTION: Username change fee');
 end if;
 update public.player_accounts set username=p_username, avatar_url=coalesce(p_avatar_url,avatar_url), username_change_count=username_change_count+case when changed then 1 else 0 end where user_id=uid;
 return jsonb_build_object('success',true,'username',p_username,'fee',fee);
exception when unique_violation then raise exception 'That username is already taken';
end; $$;
revoke all on function public.update_player_profile(text,text) from public,anon;
grant execute on function public.update_player_profile(text,text) to authenticated;
notify pgrst,'reload schema';
