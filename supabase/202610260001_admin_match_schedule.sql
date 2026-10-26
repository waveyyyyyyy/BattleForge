-- BattleForge: admin-only match schedule updates (additive, wallet-safe).
create or replace function public.admin_update_tournament_schedule(
  p_tournament_id bigint, p_starts_at timestamptz
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
  if p_starts_at is null then raise exception 'A match date and time are required'; end if;
  update public.tournaments set starts_at = p_starts_at where id = p_tournament_id;
  if not found then raise exception 'Tournament not found'; end if;
end;
$$;
revoke all on function public.admin_update_tournament_schedule(bigint, timestamptz) from public, anon;
grant execute on function public.admin_update_tournament_schedule(bigint, timestamptz) to authenticated;
