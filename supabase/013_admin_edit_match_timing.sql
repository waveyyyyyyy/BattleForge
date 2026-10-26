-- Allow admins to reschedule any tournament, including archived/past matches.
-- This migration changes schedule metadata only; it never touches wallet or result data.
create or replace function public.admin_set_tournament_start_time(
  p_tournament_id bigint,
  p_starts_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.is_battleforge_admin() then
    raise exception 'Admin access required';
  end if;
  update public.tournaments
     set starts_at = p_starts_at
   where id = p_tournament_id;
  if not found then
    raise exception 'Match not found';
  end if;
end;
$$;
revoke all on function public.admin_set_tournament_start_time(bigint, timestamptz) from public, anon;
grant execute on function public.admin_set_tournament_start_time(bigint, timestamptz) to authenticated;
