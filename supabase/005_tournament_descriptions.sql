-- BattleForge 2.0: per-tournament organiser descriptions and rules.
-- Run once in Supabase SQL Editor after the existing schema and admin migrations.

alter table public.tournaments
  add column if not exists description text not null default '';

create or replace function public.admin_create_tournament_with_description(
  p_title text,
  p_game_mode text,
  p_entry_points integer,
  p_prize_pool_points integer,
  p_max_players integer,
  p_starts_at timestamptz default null,
  p_description text default ''
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare v_id bigint;
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 80 then raise exception 'Title must be 3-80 characters'; end if;
  if p_game_mode not in ('SOLO','DUO','SQUAD') then raise exception 'Invalid tournament mode'; end if;
  if p_entry_points < 0 or p_prize_pool_points < 0 or p_max_players < 1 or p_max_players > 500 then raise exception 'Invalid tournament numbers'; end if;
  if char_length(coalesce(p_description,'')) > 5000 then raise exception 'Description must be 5000 characters or less'; end if;
  insert into public.tournaments(title,description,game_mode,entry_points,prize_pool_points,max_players,status,starts_at)
  values (btrim(p_title),btrim(coalesce(p_description,'')),p_game_mode,p_entry_points,p_prize_pool_points,p_max_players,'open',p_starts_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_create_tournament_with_description(text,text,integer,integer,integer,timestamptz,text) from public;
grant execute on function public.admin_create_tournament_with_description(text,text,integer,integer,integer,timestamptz,text) to authenticated;

create or replace function public.admin_set_tournament_description(
  p_tournament_id bigint,
  p_description text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if char_length(coalesce(p_description,'')) > 5000 then raise exception 'Description must be 5000 characters or less'; end if;
  update public.tournaments
  set description = btrim(coalesce(p_description,''))
  where id = p_tournament_id;
  if not found then raise exception 'Tournament not found'; end if;
end;
$$;
revoke all on function public.admin_set_tournament_description(bigint,text) from public;
grant execute on function public.admin_set_tournament_description(bigint,text) to authenticated;
