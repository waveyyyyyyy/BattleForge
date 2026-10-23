-- Admin-confirmed tournament results with atomic earned-wallet credits.
create or replace function public.admin_publish_match_results(p_tournament_id bigint, p_results jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  item jsonb; entry_row record; reward_amount numeric; placement_value integer; kills_value integer;
  published_count integer := 0; total_reward numeric := 0; note_value text;
begin
  if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if p_tournament_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results)=0 then
    raise exception 'Choose a tournament and at least one player';
  end if;
  if jsonb_array_length(p_results)>100 then raise exception 'Maximum 100 players per result batch'; end if;
  note_value := left(coalesce(nullif(trim(p_note),''),'Verified tournament result'),500);
  for item in select value from jsonb_array_elements(p_results) loop
    if coalesce(item->>'entry_id','') !~ '^[0-9]+$' then raise exception 'Invalid registration ID'; end if;
    select e.id, e.user_id, e.tournament_id, e.in_game_name
      into entry_row from public.tournament_entries e
      where e.id=(item->>'entry_id')::bigint and e.tournament_id=p_tournament_id for update;
    if not found then raise exception 'A player registration does not belong to this tournament'; end if;
    if exists (select 1 from public.wallet_ledger l where l.user_id=entry_row.user_id and l.reference_type='match_reward' and l.note like ('Tournament '||p_tournament_id||' entry '||entry_row.id||' reward%')) then
      raise exception 'Reward already credited for player %; batch cancelled to prevent duplicate payment', entry_row.in_game_name;
    end if;
    reward_amount := coalesce((item->>'reward')::numeric,0);
    kills_value := coalesce((item->>'kills')::integer,0);
    placement_value := nullif(item->>'placement','')::integer;
    if reward_amount < 0 or reward_amount > 1000000 or scale(reward_amount)>2 then raise exception 'Reward must be between 0 and 1,000,000 with at most 2 decimals'; end if;
    if kills_value < 0 or (placement_value is not null and placement_value < 1) then raise exception 'Invalid placement or kills'; end if;
    if placement_value is not null and exists (select 1 from jsonb_array_elements(p_results) x where x.value->>'placement'=item->>'placement' and x.value->>'entry_id'<>item->>'entry_id') then
      raise exception 'Duplicate rank assigned';
    end if;
    -- Existing result RPC and wallet operations share this transaction; any failure rolls everything back.
    perform public.admin_publish_result(entry_row.id, placement_value, kills_value, note_value);
    if reward_amount > 0 then
      insert into public.wallet_accounts(user_id) values(entry_row.user_id) on conflict(user_id) do nothing;
      update public.wallet_accounts set earned_balance=coalesce(earned_balance,0)+reward_amount, updated_at=now() where user_id=entry_row.user_id;
      insert into public.wallet_ledger(user_id,entry_type,bucket,amount,reference_type,note)
      values(entry_row.user_id,'match_earning','earned',reward_amount,'match_reward',
        'Tournament '||p_tournament_id||' entry '||entry_row.id||' reward - '||note_value);
    end if;
    total_reward := total_reward + reward_amount;
    published_count := published_count + 1;
  end loop;
  return jsonb_build_object('published_count',published_count,'total_reward',total_reward,'tournament_id',p_tournament_id);
end; $$;
revoke all on function public.admin_publish_match_results(bigint,jsonb,text) from public,anon;
grant execute on function public.admin_publish_match_results(bigint,jsonb,text) to authenticated;
notify pgrst, 'reload schema';
