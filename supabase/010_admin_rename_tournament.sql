-- Safe admin-only rename: updates the title in place and preserves registrations, results, room data, and wallet history.
create or replace function public.admin_rename_tournament(
  p_tournament_id bigint,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_battleforge_admin(), false) then
    raise exception 'Admin access required';
  end if;

  if p_title is null or length(btrim(p_title)) < 3 or length(btrim(p_title)) > 80 then
    raise exception 'Match name must be between 3 and 80 characters';
  end if;

  update public.tournaments
     set title = btrim(p_title)
   where id = p_tournament_id;

  if not found then
    raise exception 'Tournament not found';
  end if;
end;
$$;

revoke all on function public.admin_rename_tournament(bigint, text) from public;
revoke all on function public.admin_rename_tournament(bigint, text) from anon;
grant execute on function public.admin_rename_tournament(bigint, text) to authenticated;
