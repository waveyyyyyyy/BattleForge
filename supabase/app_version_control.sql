-- Remote version controls for BattleForge APK clients.
create table if not exists public.app_update_config (
  id integer primary key check (id = 1),
  latest_version text not null default '1.1.0',
  minimum_version text not null default '1.1.0',
  apk_url text not null default '',
  update_message text not null default 'A new BattleForge update is available.',
  force_update boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_update_config(id) values (1) on conflict (id) do nothing;
alter table public.app_update_config enable row level security;
drop policy if exists "Anyone can read app update config" on public.app_update_config;
create policy "Anyone can read app update config" on public.app_update_config for select using (true);
revoke insert, update, delete on public.app_update_config from anon, authenticated;
grant select on public.app_update_config to anon, authenticated;

create or replace function public.admin_set_app_update_config(
  p_latest_version text,
  p_minimum_version text,
  p_apk_url text,
  p_update_message text,
  p_force_update boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_battleforge_admin() then
    raise exception 'Admin access required';
  end if;
  if p_latest_version !~ '^[0-9]+([.][0-9]+){1,3}
    raise exception 'Versions must look like 1.2.1';
  end if;
  if string_to_array(p_minimum_version, '.')::int[] > string_to_array(p_latest_version, '.')::int[] then
    raise exception 'Minimum supported version cannot be newer than latest version';
  end if;
  if coalesce(p_apk_url,'') <> '' and p_apk_url !~ '^https://' then
    raise exception 'APK URL must use HTTPS';
  end if;
  if p_force_update and coalesce(p_apk_url,'') = '' then
    raise exception 'APK URL is required before forcing updates';
  end if;
  update public.app_update_config
    set latest_version=p_latest_version,
        minimum_version=p_minimum_version,
        apk_url=coalesce(p_apk_url,''),
        update_message=left(coalesce(p_update_message,''),500),
        force_update=p_force_update,
        updated_at=now(),
        updated_by=auth.uid()
    where id=1;
end;
$$;
revoke all on function public.admin_set_app_update_config(text,text,text,text,boolean) from public;
grant execute on function public.admin_set_app_update_config(text,text,text,text,boolean) to authenticated;
 or p_minimum_version !~ '^[0-9]+([.][0-9]+){1,3}
    raise exception 'Versions must look like 1.2.1';
  end if;
  if string_to_array(p_minimum_version, '.')::int[] > string_to_array(p_latest_version, '.')::int[] then
    raise exception 'Minimum supported version cannot be newer than latest version';
  end if;
  if coalesce(p_apk_url,'') <> '' and p_apk_url !~ '^https://' then
    raise exception 'APK URL must use HTTPS';
  end if;
  if p_force_update and coalesce(p_apk_url,'') = '' then
    raise exception 'APK URL is required before forcing updates';
  end if;
  update public.app_update_config
    set latest_version=p_latest_version,
        minimum_version=p_minimum_version,
        apk_url=coalesce(p_apk_url,''),
        update_message=left(coalesce(p_update_message,''),500),
        force_update=p_force_update,
        updated_at=now(),
        updated_by=auth.uid()
    where id=1;
end;
$$;
revoke all on function public.admin_set_app_update_config(text,text,text,text,boolean) from public;
grant execute on function public.admin_set_app_update_config(text,text,text,text,boolean) to authenticated;
 then
    raise exception 'Versions must look like 1.2.1';
  end if;
  if string_to_array(p_minimum_version, '.')::int[] > string_to_array(p_latest_version, '.')::int[] then
    raise exception 'Minimum supported version cannot be newer than latest version';
  end if;
  if coalesce(p_apk_url,'') <> '' and p_apk_url !~ '^https://' then
    raise exception 'APK URL must use HTTPS';
  end if;
  if p_force_update and coalesce(p_apk_url,'') = '' then
    raise exception 'APK URL is required before forcing updates';
  end if;
  update public.app_update_config
    set latest_version=p_latest_version,
        minimum_version=p_minimum_version,
        apk_url=coalesce(p_apk_url,''),
        update_message=left(coalesce(p_update_message,''),500),
        force_update=p_force_update,
        updated_at=now(),
        updated_by=auth.uid()
    where id=1;
end;
$$;
revoke all on function public.admin_set_app_update_config(text,text,text,text,boolean) from public;
grant execute on function public.admin_set_app_update_config(text,text,text,text,boolean) to authenticated;
