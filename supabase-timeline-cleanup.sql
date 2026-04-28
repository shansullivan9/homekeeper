-- ============================================================
-- HomeKeeper — Timeline cleanup
-- 1. Patches complete_task() so completing a task no longer
--    inserts a row into timeline_events. Task History is the
--    canonical completion log; the Timeline is for hand-logged
--    milestones (purchases, renovations, repairs).
-- 2. Removes the existing auto-generated timeline rows (the
--    ones that have a related_task_id). User-created events
--    have related_task_id IS NULL and are left intact.
-- Idempotent — safe to re-run.
-- ============================================================

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

  -- (Removed) timeline_events insert — task completions live in
  -- task_history; the Timeline page is reserved for milestones.

  IF v_task.recurrence != 'one_time' THEN
    v_next_date := CASE v_task.recurrence
      WHEN 'weekly'      THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '7 days'
      WHEN 'bi_monthly'  THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '2 months'
      WHEN 'monthly'     THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '1 month'
      WHEN 'quarterly'   THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '3 months'
      WHEN 'bi_annual'   THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '6 months'
      WHEN 'yearly'      THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '1 year'
      WHEN 'custom'      THEN COALESCE(v_task.due_date, CURRENT_DATE) + (v_task.recurrence_days || ' days')::INTERVAL
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

-- Strip the auto-created task rows from timeline_events.
DELETE FROM public.timeline_events
WHERE related_task_id IS NOT NULL;
