-- Prevent tournament joins without enough points and charge the wallet atomically.
CREATE OR REPLACE FUNCTION public.join_tournament(p_tournament_id bigint, p_in_game_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
  v_entry_id uuid;
  v_count integer;
  v_name text := btrim(p_in_game_name);
  v_fee numeric;
  v_deposited numeric;
  v_earned numeric;
  v_from_deposited numeric;
  v_from_earned numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before joining a tournament';
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 24 THEN
    RAISE EXCEPTION 'In-game name must be between 2 and 24 characters';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_tournament.status <> 'open' THEN
    RAISE EXCEPTION 'This tournament is not open for entries';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You have already joined this tournament';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.tournament_entries WHERE tournament_id = p_tournament_id;
  IF v_count >= v_tournament.max_players THEN
    UPDATE public.tournaments SET status = 'full' WHERE id = p_tournament_id;
    RAISE EXCEPTION 'This tournament is full';
  END IF;

  v_fee := greatest(coalesce(v_tournament.entry_points, 0), 0);
  INSERT INTO public.wallet_accounts(user_id)
  VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;

  SELECT deposited_balance, earned_balance
  INTO v_deposited, v_earned
  FROM public.wallet_accounts
  WHERE user_id = v_user_id
  FOR UPDATE;

  v_deposited := coalesce(v_deposited, 0);
  v_earned := coalesce(v_earned, 0);
  IF v_deposited + v_earned < v_fee THEN
    RAISE EXCEPTION 'Not enough points. This tournament requires % points; your balance is % points.',
      v_fee, v_deposited + v_earned;
  END IF;

  -- Spend deposited points first, then earned points.
  v_from_deposited := least(v_deposited, v_fee);
  v_from_earned := v_fee - v_from_deposited;

  INSERT INTO public.tournament_entries (tournament_id, user_id, in_game_name)
  VALUES (p_tournament_id, v_user_id, v_name)
  RETURNING id INTO v_entry_id;

  IF v_from_deposited > 0 THEN
    UPDATE public.wallet_accounts
    SET deposited_balance = deposited_balance - v_from_deposited, updated_at = now()
    WHERE user_id = v_user_id;
    INSERT INTO public.wallet_ledger(user_id, entry_type, bucket, amount, reference_type, reference_id, note)
    VALUES (v_user_id, 'entry_fee', 'deposited', v_from_deposited, 'tournament_entry', v_entry_id,
            'Tournament entry fee: ' || v_tournament.title);
  END IF;

  IF v_from_earned > 0 THEN
    UPDATE public.wallet_accounts
    SET earned_balance = earned_balance - v_from_earned, updated_at = now()
    WHERE user_id = v_user_id;
    INSERT INTO public.wallet_ledger(user_id, entry_type, bucket, amount, reference_type, reference_id, note)
    VALUES (v_user_id, 'entry_fee', 'earned', v_from_earned, 'tournament_entry', v_entry_id,
            'Tournament entry fee: ' || v_tournament.title);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.tournament_entries WHERE tournament_id = p_tournament_id;
  IF v_count >= v_tournament.max_players THEN
    UPDATE public.tournaments SET status = 'full' WHERE id = p_tournament_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_tournament(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_tournament(bigint, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
