-- Remove anonymous write privileges; RLS is not a substitute for revoking unused table privileges.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
-- TRUNCATE bypasses row-level security. Neither client role should be able to truncate application tables.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
-- Direct client mutations are intentionally routed through permission-checked RPCs or trusted server code.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.admin_wallet_adjustments,
  public.notification_broadcasts,
  public.player_accounts,
  public.match_disputes,
  public.player_warnings
FROM authenticated;
REVOKE INSERT, DELETE ON TABLE public.profiles FROM authenticated;
REVOKE UPDATE ON TABLE public.tournament_chat_messages FROM authenticated;

-- Future application tables/sequences/functions created by the postgres migration role
-- must receive explicit grants and RLS policies instead of inheriting broad client access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
