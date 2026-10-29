-- Allow visitors to view the public verified-earnings leaderboard.
-- This function returns only leaderboard rows and does not mutate wallet data.
grant execute on function public.get_earnings_leaderboard(text) to anon, authenticated;
notify pgrst, 'reload schema';
