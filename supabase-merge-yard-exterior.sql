-- ============================================================
-- Merge "Yard" category into "Exterior"
-- ============================================================
-- The app no longer ships a separate Yard category — every yard /
-- lawn / landscaping task lives under Exterior now. Run this once in
-- Supabase SQL Editor to:
--   1. Re-point any task / suggestion currently keyed to Yard at
--      Exterior so nothing is orphaned.
--   2. Rewrite Task History rows whose stamped category_name was
--      "Yard" so the chip rail no longer shows a Yard filter.
--   3. Remove the now-unused default Yard category row.
-- Idempotent: safe to run more than once.

DO $$
DECLARE
  v_yard_id     UUID;
  v_exterior_id UUID;
BEGIN
  SELECT id INTO v_yard_id     FROM public.categories WHERE name = 'Yard'     AND is_default = true LIMIT 1;
  SELECT id INTO v_exterior_id FROM public.categories WHERE name = 'Exterior' AND is_default = true LIMIT 1;

  IF v_exterior_id IS NULL THEN
    RAISE NOTICE 'No default Exterior category found; aborting.';
    RETURN;
  END IF;

  IF v_yard_id IS NOT NULL THEN
    UPDATE public.tasks       SET category_id = v_exterior_id WHERE category_id = v_yard_id;
    UPDATE public.task_history SET category_name = 'Exterior'  WHERE category_name = 'Yard';
    DELETE FROM public.categories WHERE id = v_yard_id;
  END IF;

  -- Mop up any user-created (non-default) Yard rows for the same home
  -- by collapsing them into Exterior too. Conservative: only touches
  -- rows literally named "Yard".
  UPDATE public.task_history SET category_name = 'Exterior' WHERE category_name = 'Yard';
  UPDATE public.tasks SET category_id = v_exterior_id
    WHERE category_id IN (SELECT id FROM public.categories WHERE name = 'Yard');
  DELETE FROM public.categories WHERE name = 'Yard';
END $$;
