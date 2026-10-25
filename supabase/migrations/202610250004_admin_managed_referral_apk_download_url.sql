alter table public.battleforge_social_settings add column if not exists referral_download_url text not null default 'https://www.dropbox.com/scl/fi/rdkpfx9lggtvavhzntc6k/BattleForge.apk?rlkey=klsepxvg2ejzjh70tcugy3bmn&st=528fxegd&dl=0';
update public.battleforge_social_settings set referral_download_url='https://www.dropbox.com/scl/fi/rdkpfx9lggtvavhzntc6k/BattleForge.apk?rlkey=klsepxvg2ejzjh70tcugy3bmn&st=528fxegd&dl=0' where id=1 and (referral_download_url is null or referral_download_url='');
create or replace function public.get_battleforge_referral_download_url()
returns table(download_url text)
language sql stable security definer set search_path=public,pg_temp as $$ select s.referral_download_url from public.battleforge_social_settings s where s.id=1; $$;
create or replace function public.admin_update_battleforge_referral_download_url(p_download_url text)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if coalesce(trim(p_download_url),'') !~ '^https://[^[:space:]]+$' then raise exception 'Referral download URL must be a valid HTTPS URL'; end if;
 update public.battleforge_social_settings set referral_download_url=trim(p_download_url),updated_at=now() where id=1;
 return true;
end; $$;
revoke all on function public.get_battleforge_referral_download_url() from public;
grant execute on function public.get_battleforge_referral_download_url() to anon,authenticated;
revoke all on function public.admin_update_battleforge_referral_download_url(text) from public,anon;
grant execute on function public.admin_update_battleforge_referral_download_url(text) to authenticated;
