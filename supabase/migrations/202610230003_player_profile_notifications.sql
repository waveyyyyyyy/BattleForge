alter table public.player_accounts add column if not exists username text;
alter table public.player_accounts add column if not exists avatar_url text;
alter table public.player_accounts add column if not exists username_change_count integer not null default 0;
create unique index if not exists player_accounts_username_ci_unique on public.player_accounts (lower(username)) where username is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('player-avatars','player-avatars',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Users upload own player avatar" on storage.objects;
create policy "Users upload own player avatar" on storage.objects for insert to authenticated with check (bucket_id='player-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users update own player avatar" on storage.objects;
create policy "Users update own player avatar" on storage.objects for update to authenticated using (bucket_id='player-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='player-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Public read player avatars" on storage.objects;
create policy "Public read player avatars" on storage.objects for select to public using (bucket_id='player-avatars');

create or replace function public.update_player_profile(p_username text, p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,storage,pg_temp as $$
declare uid uuid:=auth.uid(); acct public.player_accounts%rowtype; changed boolean; fee numeric:=0; wallet public.wallet_accounts%rowtype;
begin
 if uid is null then raise exception 'Please sign in first'; end if;
 if p_username is null or p_username !~ '^[A-Za-z0-9]{3,24}$' then raise exception 'Username must be 3–24 letters or numbers only'; end if;
 if p_avatar_url is not null and (length(p_avatar_url)>1000 or p_avatar_url not like '%/storage/v1/object/public/player-avatars/%') then raise exception 'Invalid profile photo URL'; end if;
 select * into acct from public.player_accounts where user_id=uid for update;
 if not found then raise exception 'Player account not found'; end if;
 changed := acct.username is distinct from p_username;
 if changed and acct.username is not null then
   if acct.username_change_count >= 1 then fee:=5; end if;
 end if;
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
