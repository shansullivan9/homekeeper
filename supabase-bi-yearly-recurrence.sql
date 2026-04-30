-- ============================================================
-- HomeKeeper — add 'bi_yearly' (every 2 years) recurrence option
-- 1) Widens the tasks_recurrence_check constraint to allow it
-- 2) Updates the complete_task() function so the next-occurrence
--    branch knows to add 2 years for bi_yearly tasks
-- ============================================================

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurrence_check
  CHECK (recurrence IN (
    'one_time', 'weekly', 'monthly', 'bi_monthly', 'quarterly',
    'bi_annual', 'yearly', 'bi_yearly', 'custom'
  ));

-- Re-create complete_task() so its CASE statement covers bi_yearly.
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
    notes, cost, duration_minutes
  )
  VALUES (
    p_task_id, v_task.home_id, v_task.title,
    (SELECT name FROM public.categories WHERE id = v_task.category_id),
    p_user_id, COALESCE(v_user_name, 'Member'), NOW(),
    p_notes, p_cost, p_duration
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
      estimated_minutes, estimated_cost, assigned_to, source_document_id
    )
    VALUES (
      v_task.home_id, v_task.category_id, v_task.title, v_task.description,
      v_next_date, v_task.recurrence, v_task.recurrence_days,
      v_task.priority, 'pending',
      v_task.estimated_minutes, v_task.estimated_cost,
      v_task.assigned_to, v_task.source_document_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'next_due', v_next_date
  );
END;
$$;
