-- BattleForge moderation controls. Does not alter wallet balances or ledger rows.
create table if not exists public.player_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default 'Admin moderation' check (char_length(reason) <= 300),
  banned_by uuid not null references auth.users(id),
  banned_at timestamptz not null default now()
);
create table if not exists public.match_kicks (
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Removed by admin' check (char_length(reason) <= 300),
  kicked_by uuid not null references auth.users(id),
  kicked_at timestamptz not null default now(),
  primary key (tournament_id,user_id)
);
alter table public.player_bans enable row level security;
alter table public.match_kicks enable row level security;
revoke all on public.player_bans, public.match_kicks from public, anon, authenticated;

create or replace function public.admin_ban_player(p_player_number bigint,p_reason text default 'Admin moderation')
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 select user_id into v_user from public.player_accounts where player_number=p_player_number;
 if v_user is null then raise exception 'Player ID not found'; end if;
 insert into public.player_bans(user_id,reason,banned_by) values(v_user,left(coalesce(nullif(btrim(p_reason),''),'Admin moderation'),300),auth.uid())
 on conflict(user_id) do update set reason=excluded.reason,banned_by=excluded.banned_by,banned_at=now();
end; $$;
create or replace function public.admin_unban_player(p_player_number bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 select user_id into v_user from public.player_accounts where player_number=p_player_number;
 if v_user is null then raise exception 'Player ID not found'; end if;
 delete from public.player_bans where user_id=v_user;
end; $$;
create or replace function public.admin_kick_tournament_player(p_tournament_id bigint,p_entry_id uuid,p_reason text default 'Removed by admin')
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 select user_id into v_user from public.tournament_entries where id=p_entry_id and tournament_id=p_tournament_id for update;
 if v_user is null then raise exception 'Match entry not found'; end if;
 insert into public.match_kicks(tournament_id,user_id,reason,kicked_by) values(p_tournament_id,v_user,left(coalesce(nullif(btrim(p_reason),''),'Removed by admin'),300),auth.uid())
 on conflict(tournament_id,user_id) do update set reason=excluded.reason,kicked_by=excluded.kicked_by,kicked_at=now();
 delete from public.tournament_entries where id=p_entry_id;
end; $$;
create or replace function public.admin_clear_match_kick(p_tournament_id bigint,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 delete from public.match_kicks where tournament_id=p_tournament_id and user_id=p_user_id;
end; $$;
-- Replace join RPC with ban and kick enforcement. A kicked player stays blocked until an admin verifies a fresh fee and clears the kick.
create or replace function public.join_tournament(p_tournament_id bigint,p_in_game_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_tournament public.tournaments%rowtype; v_entry_id uuid; v_count integer; v_name text := btrim(p_in_game_name);
begin
 if v_user_id is null then raise exception 'Sign in before joining a tournament'; end if;
 if exists(select 1 from public.player_bans where user_id=v_user_id) then raise exception 'Your BattleForge account is banned. Contact support if you believe this is a mistake.'; end if;
 if exists(select 1 from public.match_kicks where tournament_id=p_tournament_id and user_id=v_user_id) then raise exception 'You were removed from this match. A fresh entry-fee payment must be verified by an admin before you can rejoin.'; end if;
 if v_name is null or char_length(v_name)<2 or char_length(v_name)>24 then raise exception 'In-game name must be between 2 and 24 characters'; end if;
 select * into v_tournament from public.tournaments where id=p_tournament_id for update;
 if not found then raise exception 'Tournament not found'; end if;
 if v_tournament.status <> 'open' then raise exception 'This tournament is not open for entries'; end if;
 select count(*)::integer into v_count from public.tournament_entries where tournament_id=p_tournament_id;
 if v_count>=v_tournament.max_players then update public.tournaments set status='full' where id=p_tournament_id; raise exception 'This tournament is full'; end if;
 insert into public.tournament_entries(tournament_id,user_id,in_game_name) values(p_tournament_id,v_user_id,v_name) returning id into v_entry_id;
 select count(*)::integer into v_count from public.tournament_entries where tournament_id=p_tournament_id;
 if v_count>=v_tournament.max_players then update public.tournaments set status='full' where id=p_tournament_id; end if;
 return v_entry_id;
end; $$;
revoke all on function public.admin_ban_player(bigint,text),public.admin_unban_player(bigint),public.admin_kick_tournament_player(bigint,uuid,text),public.admin_clear_match_kick(bigint,uuid) from public,anon;
grant execute on function public.admin_ban_player(bigint,text),public.admin_unban_player(bigint),public.admin_kick_tournament_player(bigint,uuid,text),public.admin_clear_match_kick(bigint,uuid) to authenticated;
