-- Remove the legacy support-ticket feature and its RPC surface.
drop function if exists public.create_support_ticket(text,text);
drop function if exists public.admin_list_support_tickets();
drop function if exists private.create_support_ticket(text,text);
drop function if exists private.admin_list_support_tickets();
drop function if exists private.admin_update_support_ticket(uuid,text,text);
drop table if exists public.support_tickets cascade;
