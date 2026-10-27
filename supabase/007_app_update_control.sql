-- BattleForge remote app update controls
-- Apply this file once in Supabase SQL Editor. It does not modify player balances or tournament records.
create table if not exists public.app_update_config (
  id integer primary key default 1 check (id = 1),
  force_update boolean not null default false,
  min_version text not null default '1.2.0' check (min_version ~ '^\\d+\\.\\d+\\.\\d+$'),
  download_url text,
  message text not null default 'A new version of BattleForge is available.' check (char_length(message) <= 300),
  updated_at timestamptz not null default now()
);
insert into public.app_update_config (id, force_update, min_version, download_url, message)
values (1, false, '1.2.0', null, 'A new version of BattleForge is available.')
on conflict (id) do nothing;
alter table public.app_update_config enable row level security;
revoke all on public.app_update_config from anon, authenticated, public;

create or replace function public.get_app_update_config()
returns table(force_update boolean, min_version text, download_url text, message text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.force_update, c.min_version, c.download_url, c.message, c.updated_at
  from public.app_update_config c where c.id = 1;
$$;
revoke all on function public.get_app_update_config() from public;
grant execute on function public.get_app_update_config() to anon, authenticated;

create or replace function public.admin_save_app_update_config(
  p_force_update boolean,
  p_min_version text,
  p_download_url text,
  p_message text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_battleforge_admin(), false) then
    raise exception 'Admin access required';
  end if;
  if p_min_version is null or p_min_version !~ '^\\d+\\.\\d+\\.\\d+$' then
    raise exception 'Minimum version must use major.minor.patch format, e.g. 1.2.0';
  end if;
  if p_download_url is not null and length(btrim(p_download_url)) > 0 and p_download_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Download link must be a valid HTTPS URL';
  end if;
  if char_length(coalesce(p_message, '')) > 300 then raise exception 'Update message is too long'; end if;
  insert into public.app_update_config(id, force_update, min_version, download_url, message, updated_at)
  values (1, p_force_update, p_min_version, nullif(btrim(p_download_url), ''), coalesce(nullif(btrim(p_message), ''), 'Please update BattleForge to continue.'), now())
  on conflict (id) do update set force_update = excluded.force_update, min_version = excluded.min_version,
    download_url = excluded.download_url, message = excluded.message, updated_at = now();
end;
$$;
revoke all on function public.admin_save_app_update_config(boolean, text, text, text) from public;
grant execute on function public.admin_save_app_update_config(boolean, text, text, text) to authenticated;
