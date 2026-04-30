-- ============================================================
-- HomeKeeper — pause-notifications flag
-- Lets users turn push notifications off from inside the app
-- without losing their reminder preferences. The send-reminders
-- edge function already filters out users with no push_subscription,
-- so pausing nulls that out AND sets this flag so the silent
-- auto-resubscribe on the settings page knows to stay quiet.
-- ============================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notifications_paused BOOLEAN DEFAULT FALSE;

UPDATE public.notification_preferences
SET notifications_paused = COALESCE(notifications_paused, FALSE)
WHERE notifications_paused IS NULL;
