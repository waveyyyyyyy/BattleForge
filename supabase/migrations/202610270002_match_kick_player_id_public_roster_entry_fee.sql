drop function if exists public.get_tournament_roster(bigint);
create function public.get_tournament_roster(p_tournament_id bigint)
returns table(in_game_name text, created_at timestamptz, player_number bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view the player list'; end if;
  return query select e.in_game_name, e.created_at, pa.player_number from public.tournament_entries e left join public.player_accounts pa on pa.user_id=e.user_id where e.tournament_id=p_tournament_id order by e.created_at asc;
end; $$;
revoke all on function public.get_tournament_roster(bigint) from public;
grant execute on function public.get_tournament_roster(bigint) to authenticated;

create or replace function public.admin_kick_tournament_player_by_number(p_tournament_id bigint,p_player_number bigint,p_reason text default 'Removed by admin')
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_entry uuid;
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  select pa.user_id into v_user from public.player_accounts pa where pa.player_number=p_player_number;
  if v_user is null then raise exception 'Player ID not found'; end if;
  select e.id into v_entry from public.tournament_entries e where e.tournament_id=p_tournament_id and e.user_id=v_user for update;
  if v_entry is null then raise exception 'That player is not registered for the selected match'; end if;
  insert into public.match_kicks(tournament_id,user_id,reason,kicked_by) values(p_tournament_id,v_user,left(coalesce(nullif(btrim(p_reason),''),'Removed by admin'),300),auth.uid()) on conflict(tournament_id,user_id) do update set reason=excluded.reason,kicked_by=excluded.kicked_by,kicked_at=now();
  delete from public.tournament_entries where id=v_entry;
  update public.tournaments t set status=case when t.status='full' then 'open' else t.status end where t.id=p_tournament_id;
end; $$;
revoke all on function public.admin_kick_tournament_player_by_number(bigint,bigint,text) from public;
grant execute on function public.admin_kick_tournament_player_by_number(bigint,bigint,text) to authenticated;

create or replace function public.join_tournament(p_tournament_id bigint, p_in_game_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_tournament public.tournaments%rowtype; v_entry_id uuid; v_count integer; v_name text := btrim(p_in_game_name); v_fee numeric; v_deposited numeric; v_earned numeric; v_from_deposited numeric; v_from_earned numeric;
begin
  if v_user_id is null then raise exception 'Sign in before joining a tournament'; end if;
  if exists(select 1 from public.player_bans where user_id=v_user_id) then raise exception 'Your BattleForge account is banned. Contact support if you believe this is a mistake.'; end if;
  if v_name is null or char_length(v_name)<2 or char_length(v_name)>24 then raise exception 'In-game name must be between 2 and 24 characters'; end if;
  select * into v_tournament from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if v_tournament.status <> 'open' then raise exception 'This tournament is not open for entries'; end if;
  if exists(select 1 from public.tournament_entries where tournament_id=p_tournament_id and user_id=v_user_id) then raise exception 'You are already registered for this match'; end if;
  select count(*)::integer into v_count from public.tournament_entries where tournament_id=p_tournament_id;
  if v_count>=v_tournament.max_players then update public.tournaments set status='full' where id=p_tournament_id; raise exception 'This tournament is full'; end if;
  v_fee := greatest(coalesce(v_tournament.entry_points,0),0);
  insert into public.wallet_accounts(user_id) values(v_user_id) on conflict(user_id) do nothing;
  select deposited_balance,earned_balance into v_deposited,v_earned from public.wallet_accounts where user_id=v_user_id for update;
  if coalesce(v_deposited,0)+coalesce(v_earned,0)<v_fee then raise exception 'Not enough coins to join. Entry fee: % coins.',v_fee; end if;
  v_from_deposited := least(coalesce(v_deposited,0),v_fee); v_from_earned := v_fee-v_from_deposited;
  if v_fee>0 then
    update public.wallet_accounts set deposited_balance=deposited_balance-v_from_deposited, earned_balance=earned_balance-v_from_earned, updated_at=now() where user_id=v_user_id;
    if v_from_deposited>0 then insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(v_user_id,'entry_fee','deposited',v_from_deposited,'tournament','Entry fee for match #'||p_tournament_id); end if;
    if v_from_earned>0 then insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note) values(v_user_id,'entry_fee','earned',v_from_earned,'tournament','Entry fee for match #'||p_tournament_id); end if;
  end if;
  insert into public.tournament_entries(tournament_id,user_id,in_game_name) values(p_tournament_id,v_user_id,v_name) returning id into v_entry_id;
  select count(*)::integer into v_count from public.tournament_entries where tournament_id=p_tournament_id;
  if v_count>=v_tournament.max_players then update public.tournaments set status='full' where id=p_tournament_id; end if;
  return v_entry_id;
end; $$;
revoke all on function public.join_tournament(bigint,text) from public;
grant execute on function public.join_tournament(bigint,text) to authenticated;
