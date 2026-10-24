-- Admin-only deletion of a broadcast announcement from the global feed.
create or replace function public.admin_delete_broadcast_notification(p_notification_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.is_battleforge_admin() then raise exception 'Admin access required'; end if;
 delete from public.notification_broadcasts where id=p_notification_id;
 if not found then raise exception 'Announcement not found'; end if;
end; $$;
revoke all on function public.admin_delete_broadcast_notification(bigint) from public, anon;
grant execute on function public.admin_delete_broadcast_notification(bigint) to authenticated;
