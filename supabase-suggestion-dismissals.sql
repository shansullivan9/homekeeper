-- ============================================================
-- HomeKeeper — persistent suggestion dismissals
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================
--
-- Background: dismissing a suggestion used to DELETE the row, but
-- generate_suggestions() re-inserts every suggestion the next time
-- the home profile is saved. So the user kept seeing things they
-- thought they'd dismissed.
--
-- This migration adds a small table that records the (home_id, title)
-- pairs the user has dismissed. The client filters the banner against
-- that list, and we add a unique constraint so re-dismissals are no-ops.

CREATE TABLE IF NOT EXISTS public.suggestion_dismissals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (home_id, title)
);

ALTER TABLE public.suggestion_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view dismissals" ON public.suggestion_dismissals;
CREATE POLICY "Members view dismissals"
  ON public.suggestion_dismissals FOR SELECT
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members add dismissals" ON public.suggestion_dismissals;
CREATE POLICY "Members add dismissals"
  ON public.suggestion_dismissals FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members remove dismissals" ON public.suggestion_dismissals;
CREATE POLICY "Members remove dismissals"
  ON public.suggestion_dismissals FOR DELETE
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_suggestion_dismissals_home_id
  ON public.suggestion_dismissals(home_id);
