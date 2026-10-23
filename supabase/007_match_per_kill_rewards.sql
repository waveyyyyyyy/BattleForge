-- BattleForge per-match entry fee and per-kill reward settings.
-- Amounts are displayed as demo points only; this migration does not pay players.
alter table public.tournaments add column if not exists per_kill_points integer not null default 0 check (per_kill_points >= 0 and per_kill_points <= 1000000);

create or replace function public.admin_create_tournament_with_rewards(
 p_title text, p_game_mode text, p_entry_points integer, p_per_kill_points integer,
 p_prize_pool_points integer, p_max_players integer, p_starts_at timestamptz default null, p_description text default ''
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 3 and 80 then raise exception 'Title must be 3-80 characters'; end if;
 if p_game_mode not in ('SOLO','DUO','SQUAD') then raise exception 'Invalid tournament mode'; end if;
 if p_entry_points < 0 or p_entry_points > 1000000 or p_per_kill_points < 0 or p_per_kill_points > 1000000 or p_prize_pool_points < 0 or p_max_players < 1 or p_max_players > 500 then raise exception 'Invalid tournament amounts'; end if;
 if char_length(coalesce(p_description,'')) > 5000 then raise exception 'Description must be 5000 characters or less'; end if;
 insert into public.tournaments(title,description,game_mode,entry_points,per_kill_points,prize_pool_points,max_players,status,starts_at)
 values (btrim(p_title),btrim(coalesce(p_description,'')),p_game_mode,p_entry_points,p_per_kill_points,p_prize_pool_points,p_max_players,'open',p_starts_at) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.admin_create_tournament_with_rewards(text,text,integer,integer,integer,integer,timestamptz,text) from public, anon;
grant execute on function public.admin_create_tournament_with_rewards(text,text,integer,integer,integer,integer,timestamptz,text) to authenticated;

create or replace function public.admin_update_tournament_rewards(p_tournament_id bigint, p_entry_points integer, p_per_kill_points integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 if p_entry_points is null or p_per_kill_points is null or p_entry_points < 0 or p_entry_points > 1000000 or p_per_kill_points < 0 or p_per_kill_points > 1000000 then raise exception 'Amounts must be whole numbers from 0 to 1000000'; end if;
 update public.tournaments set entry_points=p_entry_points, per_kill_points=p_per_kill_points where id=p_tournament_id;
 if not found then raise exception 'Tournament not found'; end if;
end; $$;
revoke all on function public.admin_update_tournament_rewards(bigint,integer,integer) from public, anon;
grant execute on function public.admin_update_tournament_rewards(bigint,integer,integer) to authenticated;
