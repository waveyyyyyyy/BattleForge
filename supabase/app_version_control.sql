-- BattleForge remote app-version control.
-- Run once in Supabase SQL Editor. Existing tournament and user data is untouched.
create table if not exists public.app_update_config (
  id integer primary key default 1 check (id = 1),
  latest_version text not null default '1.1.0',
  minimum_version text not null default '1.0.0',
  apk_url text not null default '',
  update_message text not null default 'A new BattleForge update is available. Update to continue.',
  force_update boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_update_config (id, latest_version, minimum_version, apk_url, update_message, force_update)
values (1, '1.1.0', '1.0.0', '', 'A new BattleForge update is available. Update to continue.', false)
on conflict (id) do nothing;

alter table public.app_update_config enable row level security;
drop policy if exists "Anyone can read app update config" on public.app_update_config;
create policy "Anyone can read app update config" on public.app_update_config
for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_update_config from anon, authenticated;

create or replace function public.admin_set_app_update_config(
  p_latest_version text,
  p_minimum_version text,
  p_apk_url text,
  p_update_message text,
  p_force_update boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_battleforge_admin() then
    raise exception 'Admin access required';
  end if;
  if btrim(coalesce(p_latest_version,'')) !~ '^[0-9]+(\.[0-9]+){1,3}$'
    or btrim(coalesce(p_minimum_version,'')) !~ '^[0-9]+(\.[0-9]+){1,3}$' then
    raise exception 'Versions must use numeric format such as 1.2.3';
  end if;
  if btrim(coalesce(p_apk_url,'')) <> '' and btrim(p_apk_url) !~ '^https://[^[:space:]]+$' then
    raise exception 'APK link must be a valid HTTPS URL';
  end if;
  if char_length(coalesce(p_update_message,'')) > 500 then
    raise exception 'Update message must be 500 characters or less';
  end if;
  insert into public.app_update_config (id, latest_version, minimum_version, apk_url, update_message, force_update, updated_at)
  values (1, btrim(p_latest_version), btrim(p_minimum_version), btrim(coalesce(p_apk_url,'')), btrim(coalesce(p_update_message,'')), coalesce(p_force_update,false), now())
  on conflict (id) do update set
    latest_version = excluded.latest_version,
    minimum_version = excluded.minimum_version,
    apk_url = excluded.apk_url,
    update_message = excluded.update_message,
    force_update = excluded.force_update,
    updated_at = now();
end;
$$;
revoke all on function public.admin_set_app_update_config(text,text,text,text,boolean) from public;
grant execute on function public.admin_set_app_update_config(text,text,text,text,boolean) to authenticated;
