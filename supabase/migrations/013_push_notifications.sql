-- BattleForge push notification targeting and per-device registration.
ALTER TABLE public.notification_broadcasts
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS tournament_id bigint REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE public.notification_broadcasts DROP CONSTRAINT IF EXISTS notification_broadcasts_audience_type_check;
ALTER TABLE public.notification_broadcasts ADD CONSTRAINT notification_broadcasts_audience_type_check CHECK (audience_type IN ('all','match'));
CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push devices" ON public.push_devices;
CREATE POLICY "Users manage own push devices" ON public.push_devices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can read broadcasts" ON public.notification_broadcasts;
DROP POLICY IF EXISTS "Users can read announcements and their match notices" ON public.notification_broadcasts;
CREATE POLICY "Users can read announcements and their match notices" ON public.notification_broadcasts FOR SELECT TO authenticated USING (
 public.is_battleforge_admin() OR audience_type = 'all' OR (audience_type = 'match' AND EXISTS (
 SELECT 1 FROM public.tournament_entries e WHERE e.tournament_id = notification_broadcasts.tournament_id AND e.user_id = (SELECT auth.uid())
 )));
