-- Validate the database-triggered payment notification webhook without exposing its Vault secret.
create or replace function public.verify_battleforge_payment_webhook_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select coalesce(p_secret <> '', false)
     and exists (
       select 1
       from vault.decrypted_secrets s
       where s.name = 'battleforge_payment_request_webhook_secret'
         and s.decrypted_secret = p_secret
     );
$function$;

revoke all on function public.verify_battleforge_payment_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.verify_battleforge_payment_webhook_secret(text) to service_role;

notify pgrst, 'reload schema';
