-- BattleForge leaderboard and notification management RPCs
-- Uses only credited earned-wallet ledger entries; deposits and manual adjustments are excluded.

CREATE OR REPLACE FUNCTION public.get_earnings_leaderboard(p_period text DEFAULT 'all')
RETURNS TABLE (user_id uuid, username text, player_number bigint, total_earned numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start timestamptz;
BEGIN
  IF p_period NOT IN ('all','month','day') THEN RAISE EXCEPTION 'Invalid leaderboard period'; END IF;
  IF p_period = 'month' THEN v_start := date_trunc('month', now());
  ELSIF p_period = 'day' THEN v_start := date_trunc('day', now());
  ELSE v_start := '-infinity'::timestamptz; END IF;
  RETURN QUERY
  SELECT pa.user_id, COALESCE(pa.username, 'Player ' || pa.player_number::text)::text, pa.player_number::bigint, SUM(wl.amount)::numeric AS total_earned
  FROM public.wallet_ledger wl
  JOIN public.player_accounts pa ON pa.user_id = wl.user_id
  WHERE wl.bucket = 'earned' AND wl.entry_type = 'match_earning' AND wl.amount > 0
    AND wl.created_at >= v_start
  GROUP BY pa.user_id, pa.username, pa.player_number
  ORDER BY SUM(wl.amount) DESC, pa.player_number ASC
  LIMIT 100;
END; $$;
REVOKE ALL ON FUNCTION public.get_earnings_leaderboard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_earnings_leaderboard(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_broadcast_notification(p_notification_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_battleforge_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  DELETE FROM public.notification_broadcasts WHERE id = p_notification_id;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete_broadcast_notification(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_broadcast_notification(bigint) TO authenticated;
