-- ============================================================
-- HomeKeeper — power-user audit follow-ups
-- Idempotent. Safe to run multiple times.
-- ============================================================

-- 1. Allow bi_monthly and bi_annual on the recurrence CHECK constraint.
--    The UI offers "Every 2 Months" and "Every 6 Months", and
--    complete_task() switches on these names — but the original CHECK
--    only allowed weekly/monthly/quarterly/yearly/custom, which would
--    reject any task saved with bi_*.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurrence_check
  CHECK (recurrence IN (
    'one_time', 'weekly', 'bi_monthly', 'monthly', 'quarterly',
    'bi_annual', 'yearly', 'custom'
  ));

-- 2. tasks.source_document_id — referenced by lib/types and add-task /
--    documents pages but missing from the original schema.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

-- 3. documents.appliance_id, documents.searchable_text,
--    appliances.manual_document_id — all read/written by the UI but
--    missing from the canonical schema files.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS appliance_id UUID REFERENCES public.appliances(id) ON DELETE SET NULL;
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS searchable_text TEXT;
ALTER TABLE public.appliances
  ADD COLUMN IF NOT EXISTS manual_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_appliance_id ON public.documents(appliance_id);
CREATE INDEX IF NOT EXISTS idx_appliances_manual_document ON public.appliances(manual_document_id);

-- 4. toggle_task_claim RPC — TaskCard claim button calls this but no
--    SQL ever defined it, so claim/unclaim was hitting an RPC that
--    doesn't exist.
CREATE OR REPLACE FUNCTION public.toggle_task_claim(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_task RECORD;
  v_new_assigned UUID;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Task not found');
  END IF;

  -- Toggle: if it's already mine, unclaim. If unclaimed or claimed by
  -- someone else, claim it for me.
  IF v_task.assigned_to = p_user_id THEN
    v_new_assigned := NULL;
  ELSE
    v_new_assigned := p_user_id;
  END IF;

  UPDATE public.tasks
  SET assigned_to = v_new_assigned,
      updated_at = NOW()
  WHERE id = p_task_id;

  RETURN jsonb_build_object('assigned_to', v_new_assigned);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS: profiles SELECT policy was joining home_members which itself
--    has a recursive policy. Use a SECURITY DEFINER helper to break the
--    cycle.
CREATE OR REPLACE FUNCTION public.is_household_member(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.home_members ma
    JOIN public.home_members mb ON ma.home_id = mb.home_id
    WHERE ma.user_id = p_user_a AND mb.user_id = p_user_b
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "Users can view profiles in their household" ON public.profiles;
DROP POLICY IF EXISTS "Users can view household profiles" ON public.profiles;
CREATE POLICY "Users can view household profiles"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_household_member(auth.uid(), id)
  );

-- 6. RLS: home_members INSERT used to allow anyone authenticated to
--    join any home as 'owner' by sending role='owner' from the client.
--    Lock down inserts so only role='member' can come from the client;
--    owner rows are created server-side via create_home_with_owner().
DROP POLICY IF EXISTS "Users can join households" ON public.home_members;
CREATE POLICY "Users can join households"
  ON public.home_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
  );

-- Owner-creation RPC: creates a home and the owner membership atomically.
-- Use this from the client instead of the two-step insert pattern.
CREATE OR REPLACE FUNCTION public.create_home_with_owner(
  p_payload JSONB
)
RETURNS public.homes AS $$
DECLARE
  v_home public.homes;
BEGIN
  INSERT INTO public.homes
    SELECT * FROM jsonb_populate_record(NULL::public.homes, p_payload)
  RETURNING * INTO v_home;

  INSERT INTO public.home_members (home_id, user_id, role)
  VALUES (v_home.id, auth.uid(), 'owner');

  RETURN v_home;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow leaving a household / owner removing a member.
DROP POLICY IF EXISTS "Users can leave or be removed" ON public.home_members;
CREATE POLICY "Users can leave or be removed"
  ON public.home_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.home_members me
      WHERE me.home_id = home_members.home_id
        AND me.user_id = auth.uid()
        AND me.role = 'owner'
    )
  );

-- 7. complete_task — base the next due date on the actual completion
--    date (or today), not on the previous due_date. This stops a
--    quarterly task that was due Jan 1 but completed Apr 5 from
--    re-scheduling itself for Apr 1 (already overdue).
CREATE OR REPLACE FUNCTION public.complete_task(
  p_task_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_cost DECIMAL DEFAULT NULL,
  p_duration INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_task RECORD;
  v_user RECORD;
  v_next_date DATE;
  v_base_date DATE;
  v_new_task_id UUID;
  v_history_id UUID;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Task not found');
  END IF;

  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;

  UPDATE public.tasks SET
    status = 'completed',
    completed_at = NOW(),
    completed_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_task_id;

  INSERT INTO public.task_history (
    task_id, home_id, title, category_name, completed_by,
    completed_by_name, notes, cost, duration_minutes
  )
  VALUES (
    p_task_id, v_task.home_id, v_task.title,
    (SELECT name FROM public.categories WHERE id = v_task.category_id),
    p_user_id, v_user.display_name,
    COALESCE(p_notes, v_task.notes),
    COALESCE(p_cost, v_task.estimated_cost),
    p_duration
  )
  RETURNING id INTO v_history_id;

  IF v_task.recurrence != 'one_time' THEN
    -- Use the later of "today" and "previous due_date", so we never
    -- create a next-due date that is already in the past.
    v_base_date := GREATEST(CURRENT_DATE, COALESCE(v_task.due_date, CURRENT_DATE));
    v_next_date := CASE v_task.recurrence
      WHEN 'weekly'      THEN v_base_date + INTERVAL '7 days'
      WHEN 'bi_monthly'  THEN v_base_date + INTERVAL '2 months'
      WHEN 'monthly'     THEN v_base_date + INTERVAL '1 month'
      WHEN 'quarterly'   THEN v_base_date + INTERVAL '3 months'
      WHEN 'bi_annual'   THEN v_base_date + INTERVAL '6 months'
      WHEN 'yearly'      THEN v_base_date + INTERVAL '1 year'
      WHEN 'custom'      THEN
        CASE WHEN v_task.recurrence_days IS NULL OR v_task.recurrence_days <= 0
             THEN NULL
             ELSE v_base_date + (v_task.recurrence_days || ' days')::INTERVAL
        END
      ELSE NULL
    END;

    IF v_next_date IS NOT NULL THEN
      INSERT INTO public.tasks (
        home_id, category_id, appliance_id, created_by, title, description, notes,
        due_date, recurrence, recurrence_days, estimated_minutes, estimated_cost, priority
      ) VALUES (
        v_task.home_id, v_task.category_id, v_task.appliance_id, v_task.created_by,
        v_task.title, v_task.description, v_task.notes,
        v_next_date, v_task.recurrence, v_task.recurrence_days,
        v_task.estimated_minutes, v_task.estimated_cost, v_task.priority
      )
      RETURNING id INTO v_new_task_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'next_task_id', v_new_task_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
