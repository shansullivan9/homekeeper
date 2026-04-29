-- ============================================================
-- HomeKeeper — local-time reminder dispatch
-- Adds timezone + preferred hour columns and switches the cron
-- from once-a-day-UTC to once-an-hour, so the edge function can
-- send to each user at THEIR local noon (or whatever hour they
-- configure).
-- ============================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS reminder_hour_local INT DEFAULT 12;

-- Backfill any existing rows that were created before this migration.
UPDATE public.notification_preferences
SET timezone = COALESCE(timezone, 'America/New_York'),
    reminder_hour_local = COALESCE(reminder_hour_local, 12)
WHERE timezone IS NULL OR reminder_hour_local IS NULL;

-- Reschedule the cron to fire hourly. The edge function decides
-- per-user whether THEIR local hour matches.
SELECT cron.unschedule('homekeeper-daily-reminders');

SELECT cron.schedule(
  'homekeeper-hourly-reminders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https' || '://jnctklqltpuwhhyulynh' || '.functions.supabase.co/send-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
