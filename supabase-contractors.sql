-- ============================================================
-- HomeKeeper — Contractors
-- Adds a contractors directory and links from tasks, task_history,
-- documents, and appliances. Existing rows in those four tables
-- automatically get a NULL contractor_id (the column default), so
-- the user can attach contractors to existing data the same way
-- they do new data — no backfill needed at the DB level.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  category TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_home_id ON public.contractors(home_id);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contractors_select" ON public.contractors;
CREATE POLICY "contractors_select" ON public.contractors
  FOR SELECT USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "contractors_modify" ON public.contractors;
CREATE POLICY "contractors_modify" ON public.contractors
  FOR ALL USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Foreign-key columns on the four "linkable" tables. ON DELETE SET
-- NULL so removing a contractor doesn't delete every row that
-- referenced them — the rows just become unlinked again.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL;

ALTER TABLE public.task_history
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL;

ALTER TABLE public.appliances
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_contractor_id ON public.tasks(contractor_id);
CREATE INDEX IF NOT EXISTS idx_task_history_contractor_id ON public.task_history(contractor_id);
CREATE INDEX IF NOT EXISTS idx_documents_contractor_id ON public.documents(contractor_id);
CREATE INDEX IF NOT EXISTS idx_appliances_contractor_id ON public.appliances(contractor_id);

-- Keep complete_task() in sync — it copies the source task's
-- contractor onto the next-occurrence row, so a quarterly HVAC
-- service stays linked to the same vendor across cycles.
CREATE OR REPLACE FUNCTION public.complete_task(
  p_task_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_cost NUMERIC DEFAULT NULL,
  p_duration INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_history_id UUID;
  v_next_date DATE;
  v_base_date DATE;
  v_user_name TEXT;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Task not found');
  END IF;

  SELECT display_name INTO v_user_name
  FROM public.profiles WHERE id = p_user_id;

  UPDATE public.tasks
  SET status = 'completed',
      completed_at = NOW(),
      completed_by = p_user_id,
      updated_at = NOW()
  WHERE id = p_task_id;

  INSERT INTO public.task_history (
    task_id, home_id, title, category_name,
    completed_by, completed_by_name, completed_at,
    notes, cost, duration_minutes, contractor_id
  )
  VALUES (
    p_task_id, v_task.home_id, v_task.title,
    (SELECT name FROM public.categories WHERE id = v_task.category_id),
    p_user_id, COALESCE(v_user_name, 'Member'), NOW(),
    p_notes, p_cost, p_duration, v_task.contractor_id
  )
  RETURNING id INTO v_history_id;

  IF v_task.recurrence != 'one_time' THEN
    v_base_date := GREATEST(CURRENT_DATE, COALESCE(v_task.due_date, CURRENT_DATE));
    v_next_date := CASE v_task.recurrence
      WHEN 'weekly'      THEN v_base_date + INTERVAL '7 days'
      WHEN 'monthly'     THEN v_base_date + INTERVAL '1 month'
      WHEN 'bi_monthly'  THEN v_base_date + INTERVAL '2 months'
      WHEN 'quarterly'   THEN v_base_date + INTERVAL '3 months'
      WHEN 'bi_annual'   THEN v_base_date + INTERVAL '6 months'
      WHEN 'yearly'      THEN v_base_date + INTERVAL '1 year'
      WHEN 'bi_yearly'   THEN v_base_date + INTERVAL '2 years'
      WHEN 'custom'      THEN
        CASE WHEN v_task.recurrence_days IS NULL OR v_task.recurrence_days <= 0
             THEN v_base_date + INTERVAL '1 month'
             ELSE v_base_date + (v_task.recurrence_days || ' days')::INTERVAL
        END
      ELSE v_base_date + INTERVAL '1 month'
    END;

    INSERT INTO public.tasks (
      home_id, category_id, title, description, due_date,
      recurrence, recurrence_days, priority, status,
      estimated_minutes, estimated_cost, assigned_to, source_document_id,
      contractor_id
    )
    VALUES (
      v_task.home_id, v_task.category_id, v_task.title, v_task.description,
      v_next_date, v_task.recurrence, v_task.recurrence_days,
      v_task.priority, 'pending',
      v_task.estimated_minutes, v_task.estimated_cost,
      v_task.assigned_to, v_task.source_document_id,
      v_task.contractor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'next_due', v_next_date
  );
END;
$$;
