-- ============================================================
-- Home Inboxes: per-home email-forwarding address
-- ============================================================
-- Each home gets a single inbox row keyed by an opaque address_slug.
-- The inbound-email webhook (/api/inbox/email) parses the recipient
-- local-part (e.g. "bills-a3f9k2b8" from "bills-a3f9k2b8@inbox.example.com"),
-- looks up the home via this table, and drops the email's attachments
-- into that home's documents bucket.
--
-- Run once in Supabase → SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.home_inboxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  address_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (home_id)
);

CREATE INDEX IF NOT EXISTS idx_home_inboxes_address_slug
  ON public.home_inboxes (address_slug);

ALTER TABLE public.home_inboxes ENABLE ROW LEVEL SECURITY;

-- Home members can see and manage their home's inbox row. The webhook
-- itself uses the service role key (in /api/inbox/email) to look up
-- the home from the inbound address — that path bypasses RLS.
DROP POLICY IF EXISTS "Home members can view inbox" ON public.home_inboxes;
CREATE POLICY "Home members can view inbox"
  ON public.home_inboxes FOR SELECT
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Home members can create inbox" ON public.home_inboxes;
CREATE POLICY "Home members can create inbox"
  ON public.home_inboxes FOR INSERT
  WITH CHECK (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Home members can update inbox" ON public.home_inboxes;
CREATE POLICY "Home members can update inbox"
  ON public.home_inboxes FOR UPDATE
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Home members can delete inbox" ON public.home_inboxes;
CREATE POLICY "Home members can delete inbox"
  ON public.home_inboxes FOR DELETE
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );
