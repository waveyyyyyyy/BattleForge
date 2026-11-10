-- Allow usernames to contain spaces and underscores while rejecting all other special characters.
-- Keep uniqueness case-insensitive and preserve the existing username-change fee rules.
create or replace function public.update_player_profile(p_username text, p_avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
 uid uuid := auth.uid();
 acct public.player_accounts%rowtype;
 changed boolean;
 fee numeric := 0;
 wallet public.wallet_accounts%rowtype;
 v_username text;
begin
 if uid is null then raise exception 'Please sign in first'; end if;
 v_username := regexp_replace(btrim(coalesce(p_username,'')), '[[:space:]]+', ' ', 'g');
 if length(v_username) < 3 or length(v_username) > 24 or v_username !~ '^[A-Za-z0-9_ ]+$' then
   raise exception 'Username must be 3–24 characters. Use only letters, numbers, spaces, and underscores.';
 end if;
 if p_avatar_url is not null and p_avatar_url not in ('preset:viper-squad','preset:shatterpoint','preset:the-forged','preset:nightfall','preset:apex-predator','preset:the-vanguard','preset:breach-team','preset:phantom-signal','preset:tactical-precision','preset:sentinel') then
   raise exception 'Choose one of the 10 BattleForge preset avatars or None';
 end if;
 select * into acct from public.player_accounts where user_id=uid for update;
 if not found then raise exception 'Player account not found'; end if;
 changed := acct.username is distinct from v_username;
 if changed and acct.username is not null and acct.username_change_count >= 1 then fee:=5; end if;
 if changed and exists(select 1 from public.player_accounts p where lower(p.username)=lower(v_username) and p.user_id<>uid) then
   raise exception 'That username is already taken';
 end if;
 if fee>0 then
   select * into wallet from public.wallet_accounts where user_id=uid for update;
   if coalesce(wallet.deposited_balance,0)<fee then
     raise exception 'Changing your username costs ₹5 in entry-fee credits. Your entry-fee balance is too low.';
   end if;
   update public.wallet_accounts set deposited_balance=deposited_balance-fee where user_id=uid;
   insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note)
   values(uid,'admin_adjustment','deposited',fee,'username_change','DEDUCTION: Username change fee');
 end if;
 update public.player_accounts
 set username=v_username,avatar_url=p_avatar_url,
     username_change_count=username_change_count+case when changed then 1 else 0 end
 where user_id=uid;
 return jsonb_build_object('success',true,'username',v_username,'avatar',p_avatar_url,'fee',fee);
exception when unique_violation then
 raise exception 'That username is already taken';
end;
$function$;
grant execute on function public.update_player_profile(text,text) to authenticated;
