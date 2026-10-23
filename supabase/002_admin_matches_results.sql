-- BattleForge admin, match-room and result operations (additive migration).
-- Run after schema.sql and seed.sql. Real-money wallets/payouts are intentionally NOT enabled.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

create or replace function public.is_battleforge_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admin_users a where a.user_id = auth.uid()); $$;
revoke all on function public.is_battleforge_admin() from public;
grant execute on function public.is_battleforge_admin() to authenticated;

create table if not exists public.tournament_rooms (
  tournament_id bigint primary key references public.tournaments(id) on delete cascade,
  room_id text not null default '' check (char_length(room_id) <= 80),
  room_password text not null default '' check (char_length(room_password) <= 80),
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.tournament_rooms enable row level security;
revoke all on public.tournament_rooms from anon, authenticated;
grant select on public.tournament_rooms to authenticated;
drop policy if exists "Joined players and admins can read match rooms" on public.tournament_rooms;
create policy "Joined players and admins can read match rooms" on public.tournament_rooms
for select to authenticated using (
  public.is_battleforge_admin() or
  (published and exists (select 1 from public.tournament_entries e where e.tournament_id = tournament_rooms.tournament_id and e.user_id = auth.uid()))
);

create table if not exists public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  entry_id uuid not null unique references public.tournament_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  placement integer check (placement is null or placement > 0),
  kills integer not null default 0 check (kills >= 0),
  note text not null default '' check (char_length(note) <= 500),
  published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tournament_results enable row level security;
revoke all on public.tournament_results from anon, authenticated;
grant select on public.tournament_results to authenticated;
drop policy if exists "Players can read published own results and admins all results" on public.tournament_results;
create policy "Players can read published own results and admins all results" on public.tournament_results
for select to authenticated using (public.is_battleforge_admin() or (user_id = auth.uid() and published));

create or replace function public.admin_list_tournament_entries(p_tournament_id bigint)
returns table(entry_id uuid, user_id uuid, in_game_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  return query select e.id, e.user_id, e.in_game_name, e.created_at
  from public.tournament_entries e where e.tournament_id = p_tournament_id order by e.created_at;
end; $$;

create or replace function public.admin_create_tournament(
  p_title text, p_game_mode text, p_entry_points integer, p_prize_pool_points integer,
  p_max_players integer, p_starts_at timestamptz default null
) returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_id bigint;
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 80 then raise exception 'Title must be 3-80 characters'; end if;
  if p_game_mode not in ('SOLO','DUO','SQUAD') then raise exception 'Invalid tournament mode'; end if;
  if p_entry_points < 0 or p_prize_pool_points < 0 or p_max_players < 1 or p_max_players > 500 then raise exception 'Invalid tournament numbers'; end if;
  insert into public.tournaments(title,game_mode,entry_points,prize_pool_points,max_players,status,starts_at)
  values (btrim(p_title),p_game_mode,p_entry_points,p_prize_pool_points,p_max_players,'open',p_starts_at)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_set_tournament_status(p_tournament_id bigint, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_max integer; v_count integer;
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','closed','full') then raise exception 'Invalid tournament status'; end if;
  select max_players into v_max from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  select count(*)::integer into v_count from public.tournament_entries where tournament_id=p_tournament_id;
  if p_status='open' and v_count >= v_max then raise exception 'Cannot reopen a full tournament'; end if;
  update public.tournaments set status=p_status where id=p_tournament_id;
end; $$;

create or replace function public.admin_set_tournament_room(
  p_tournament_id bigint, p_room_id text, p_room_password text, p_published boolean
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if not exists (select 1 from public.tournaments where id=p_tournament_id) then raise exception 'Tournament not found'; end if;
  if char_length(coalesce(p_room_id,'')) > 80 or char_length(coalesce(p_room_password,'')) > 80 then raise exception 'Room details must be 80 characters or less'; end if;
  insert into public.tournament_rooms(tournament_id,room_id,room_password,published,updated_at,updated_by)
  values (p_tournament_id,btrim(coalesce(p_room_id,'')),btrim(coalesce(p_room_password,'')),coalesce(p_published,false),now(),auth.uid())
  on conflict (tournament_id) do update set room_id=excluded.room_id,room_password=excluded.room_password,
    published=excluded.published,updated_at=now(),updated_by=auth.uid();
end; $$;

create or replace function public.admin_publish_result(
  p_entry_id uuid, p_placement integer, p_kills integer, p_note text default ''
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_result_id uuid; v_entry public.tournament_entries%rowtype;
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if p_placement is not null and p_placement < 1 then raise exception 'Placement must be positive'; end if;
  if p_kills is null or p_kills < 0 then raise exception 'Kills cannot be negative'; end if;
  if char_length(coalesce(p_note,'')) > 500 then raise exception 'Note must be 500 characters or less'; end if;
  select * into v_entry from public.tournament_entries where id=p_entry_id;
  if not found then raise exception 'Tournament entry not found'; end if;
  insert into public.tournament_results(tournament_id,entry_id,user_id,placement,kills,note,published,created_by,updated_at)
  values (v_entry.tournament_id,v_entry.id,v_entry.user_id,p_placement,p_kills,btrim(coalesce(p_note,'')),true,auth.uid(),now())
  on conflict (entry_id) do update set placement=excluded.placement,kills=excluded.kills,note=excluded.note,
    published=true,created_by=auth.uid(),updated_at=now()
  returning id into v_result_id;
  return v_result_id;
end; $$;

revoke all on function public.admin_list_tournament_entries(bigint) from public;
revoke all on function public.admin_create_tournament(text,text,integer,integer,integer,timestamptz) from public;
revoke all on function public.admin_set_tournament_status(bigint,text) from public;
revoke all on function public.admin_set_tournament_room(bigint,text,text,boolean) from public;
revoke all on function public.admin_publish_result(uuid,integer,integer,text) from public;
grant execute on function public.admin_list_tournament_entries(bigint) to authenticated;
grant execute on function public.admin_create_tournament(text,text,integer,integer,integer,timestamptz) to authenticated;
grant execute on function public.admin_set_tournament_status(bigint,text) to authenticated;
grant execute on function public.admin_set_tournament_room(bigint,text,text,boolean) to authenticated;
grant execute on function public.admin_publish_result(uuid,integer,integer,text) to authenticated;

-- Provision an administrator manually in the Supabase SQL Editor after the admin has signed up:
-- insert into public.admin_users(user_id) select id from auth.users where email = 'YOUR_ADMIN_EMAIL' on conflict do nothing;
-- Never grant admin access from the app, and never put a service-role key in the APK.
-- Result records are display-only; this migration does not move points or money.
