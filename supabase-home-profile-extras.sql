-- ============================================================
-- HomeKeeper — Home Profile extras
-- Adds the columns the Home Profile UI now expects but that
-- weren't in the original supabase-schema.sql. Idempotent —
-- safe to run multiple times.
-- ============================================================

ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS roof_installed_year INTEGER;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS hvac_installed_year INTEGER;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS water_heater_installed_year INTEGER;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS dryer_type TEXT;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS has_basement BOOLEAN DEFAULT FALSE;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS has_attic BOOLEAN DEFAULT FALSE;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS has_crawlspace BOOLEAN DEFAULT FALSE;
ALTER TABLE public.homes ADD COLUMN IF NOT EXISTS has_hoa BOOLEAN DEFAULT FALSE;
