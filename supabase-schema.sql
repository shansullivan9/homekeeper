-- ============================================================
-- HomeKeeper Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view household members"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT hm2.user_id FROM public.home_members hm1
      JOIN public.home_members hm2 ON hm1.home_id = hm2.home_id
      WHERE hm1.user_id = auth.uid()
    )
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- HOMES
-- ============================================================
CREATE TABLE public.homes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Home',
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  year_built INTEGER,
  square_footage INTEGER,
  floors INTEGER DEFAULT 1,
  roof_type TEXT,
  roof_installed_year INTEGER,
  exterior_type TEXT,
  hvac_type TEXT,
  hvac_units INTEGER DEFAULT 1,
  hvac_installed_year INTEGER,
  water_heater_type TEXT,
  water_heater_installed_year INTEGER,
  plumbing_type TEXT,
  dryer_type TEXT,
  has_irrigation BOOLEAN DEFAULT FALSE,
  has_septic BOOLEAN DEFAULT FALSE,
  has_well_water BOOLEAN DEFAULT FALSE,
  has_deck BOOLEAN DEFAULT FALSE,
  has_pool BOOLEAN DEFAULT FALSE,
  has_garage BOOLEAN DEFAULT FALSE,
  has_fireplace BOOLEAN DEFAULT FALSE,
  has_dryer BOOLEAN DEFAULT FALSE,
  has_basement BOOLEAN DEFAULT FALSE,
  has_attic BOOLEAN DEFAULT FALSE,
  has_crawlspace BOOLEAN DEFAULT FALSE,
  has_hoa BOOLEAN DEFAULT FALSE,
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members can view their home"
  ON public.homes FOR SELECT
  USING (id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can update their home"
  ON public.homes FOR UPDATE
  USING (id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert homes"
  ON public.homes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- HOME MEMBERS (join table)
-- ============================================================
CREATE TABLE public.home_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(home_id, user_id)
);

ALTER TABLE public.home_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view home members"
  ON public.home_members FOR SELECT
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can join homes"
  ON public.home_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can manage members"
  ON public.home_members FOR DELETE
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'wrench',
  color TEXT DEFAULT '#007AFF',
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members can view categories"
  ON public.categories FOR SELECT
  USING (
    home_id IS NULL OR
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Home members can manage categories"
  ON public.categories FOR ALL
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

-- Insert default categories (global, no home_id)
INSERT INTO public.categories (name, icon, color, is_default, sort_order) VALUES
  ('Interior', 'home', '#007AFF', true, 1),
  ('Exterior', 'trees', '#34C759', true, 2),
  ('HVAC', 'thermometer', '#FF9F0A', true, 3),
  ('Plumbing', 'droplets', '#5AC8FA', true, 4),
  ('Electrical', 'zap', '#FFCC00', true, 5),
  ('Yard', 'flower2', '#30D158', true, 6),
  ('Appliances', 'refrigerator', '#AF52DE', true, 7),
  ('HOA / Bills', 'receipt', '#FF6482', true, 8),
  ('Projects', 'hammer', '#FF3B30', true, 9);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  appliance_id UUID,
  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  due_date DATE,
  recurrence TEXT DEFAULT 'one_time' CHECK (
    recurrence IN ('one_time', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')
  ),
  recurrence_days INTEGER,
  estimated_minutes INTEGER,
  estimated_cost DECIMAL(10,2),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  is_suggestion BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members can view tasks"
  ON public.tasks FOR SELECT
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can create tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can update tasks"
  ON public.tasks FOR UPDATE
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can delete tasks"
  ON public.tasks FOR DELETE
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- ============================================================
-- TASK HISTORY (completion log)
-- ============================================================
CREATE TABLE public.task_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category_name TEXT,
  completed_by UUID REFERENCES auth.users(id),
  completed_by_name TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  cost DECIMAL(10,2),
  photos TEXT[], -- array of storage URLs
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members can view task history"
  ON public.task_history FOR SELECT
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can create task history"
  ON public.task_history FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- ============================================================
-- APPLIANCES
-- ============================================================
CREATE TABLE public.appliances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manufacturer TEXT,
  model_number TEXT,
  serial_number TEXT,
  category TEXT,
  location TEXT,
  installation_date DATE,
  warranty_expiration DATE,
  purchase_price DECIMAL(10,2),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members can view appliances"
  ON public.appliances FOR SELECT
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can manage appliances"
  ON public.appliances FOR ALL
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- ============================================================
-- TIMELINE EVENTS
-- ============================================================
CREATE TABLE public.timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('maintenance', 'replacement', 'repair', 'renovation', 'purchase', 'other')
  ),
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost DECIMAL(10,2),
  photos TEXT[],
  related_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  related_appliance_id UUID REFERENCES public.appliances(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members can view timeline"
  ON public.timeline_events FOR SELECT
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "Home members can manage timeline"
  ON public.timeline_events FOR ALL
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_subscription JSONB,
  remind_days_before INTEGER DEFAULT 3,
  remind_on_due BOOLEAN DEFAULT TRUE,
  remind_when_overdue BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notification prefs"
  ON public.notification_preferences FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_tasks_home_id ON public.tasks(home_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_home_status_due ON public.tasks(home_id, status, due_date);
CREATE INDEX idx_task_history_home_id ON public.task_history(home_id);
CREATE INDEX idx_task_history_completed_at ON public.task_history(completed_at);
CREATE INDEX idx_appliances_home_id ON public.appliances(home_id);
CREATE INDEX idx_timeline_home_id ON public.timeline_events(home_id);
CREATE INDEX idx_timeline_event_date ON public.timeline_events(event_date);
CREATE INDEX idx_home_members_user ON public.home_members(user_id);
CREATE INDEX idx_home_members_home ON public.home_members(home_id);

-- ============================================================
-- REALTIME: Enable for live sync
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_history;

-- ============================================================
-- FUNCTION: Complete a task and auto-schedule next occurrence
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
  -- Get task
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Task not found');
  END IF;

  -- Get user
  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;

  -- Mark task complete
  UPDATE public.tasks SET
    status = 'completed',
    completed_at = NOW(),
    completed_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log to history
  INSERT INTO public.task_history (task_id, home_id, title, category_name, completed_by, completed_by_name, notes, cost, duration_minutes)
  VALUES (
    p_task_id, v_task.home_id, v_task.title,
    (SELECT name FROM public.categories WHERE id = v_task.category_id),
    p_user_id, v_user.display_name,
    COALESCE(p_notes, v_task.notes), COALESCE(p_cost, v_task.estimated_cost), p_duration
  )
  RETURNING id INTO v_history_id;

  -- Log to timeline
  INSERT INTO public.timeline_events (home_id, event_type, title, description, cost, related_task_id, created_by)
  VALUES (v_task.home_id, 'maintenance', v_task.title, COALESCE(p_notes, 'Completed'), p_cost, p_task_id, p_user_id);

  -- Auto-schedule next occurrence
  IF v_task.recurrence != 'one_time' THEN
    v_next_date := CASE v_task.recurrence
      WHEN 'weekly' THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '7 days'
      WHEN 'bi_monthly' THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '2 months'
      WHEN 'monthly' THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '1 month'
      WHEN 'quarterly' THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '3 months'
      WHEN 'bi_annual' THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '6 months'
      WHEN 'yearly' THEN COALESCE(v_task.due_date, CURRENT_DATE) + INTERVAL '1 year'
      WHEN 'custom' THEN COALESCE(v_task.due_date, CURRENT_DATE) + (v_task.recurrence_days || ' days')::INTERVAL
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

-- ============================================================
-- FUNCTION: Generate maintenance suggestions from home profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_suggestions(p_home_id UUID)
RETURNS void AS $$
DECLARE
  v_home RECORD;
  v_hvac_cat UUID;
  v_plumbing_cat UUID;
  v_exterior_cat UUID;
  v_appliance_cat UUID;
  v_interior_cat UUID;
  v_yard_cat UUID;
BEGIN
  SELECT * INTO v_home FROM public.homes WHERE id = p_home_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Get category IDs
  SELECT id INTO v_hvac_cat FROM public.categories WHERE name = 'HVAC' AND is_default = true LIMIT 1;
  SELECT id INTO v_plumbing_cat FROM public.categories WHERE name = 'Plumbing' AND is_default = true LIMIT 1;
  SELECT id INTO v_exterior_cat FROM public.categories WHERE name = 'Exterior' AND is_default = true LIMIT 1;
  SELECT id INTO v_appliance_cat FROM public.categories WHERE name = 'Appliances' AND is_default = true LIMIT 1;
  SELECT id INTO v_interior_cat FROM public.categories WHERE name = 'Interior' AND is_default = true LIMIT 1;
  SELECT id INTO v_yard_cat FROM public.categories WHERE name = 'Yard' AND is_default = true LIMIT 1;

  -- Delete old unaccepted suggestions
  DELETE FROM public.tasks WHERE home_id = p_home_id AND is_suggestion = true AND status = 'pending';

  -- HVAC suggestions
  IF v_home.hvac_type IS NOT NULL THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_hvac_cat, 'Change HVAC Filter', 'Replace air filter to maintain efficiency and air quality.', CURRENT_DATE + INTERVAL '7 days', 'quarterly', 15, true),
      (p_home_id, v_hvac_cat, 'Annual HVAC Service', 'Schedule professional HVAC maintenance and inspection.', CURRENT_DATE + INTERVAL '30 days', 'yearly', 120, true);
  END IF;

  -- Water heater suggestions
  IF v_home.water_heater_type = 'tank' OR v_home.water_heater_type IS NOT NULL THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_plumbing_cat, 'Flush Water Heater', 'Drain and flush sediment from the water heater tank.', CURRENT_DATE + INTERVAL '60 days', 'yearly', 60, true);
  END IF;

  -- Dryer vent
  IF v_home.has_dryer THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_appliance_cat, 'Clean Dryer Vent', 'Clean the dryer vent to prevent fire hazard and improve efficiency.', CURRENT_DATE + INTERVAL '30 days', 'yearly', 45, true);
  END IF;

  -- Deck suggestions
  IF v_home.has_deck THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_exterior_cat, 'Inspect Deck', 'Check for loose boards, rot, and structural issues.', CURRENT_DATE + INTERVAL '30 days', 'yearly', 30, true),
      (p_home_id, v_exterior_cat, 'Reseal Deck', 'Apply sealant or stain to protect deck wood.', CURRENT_DATE + INTERVAL '90 days', 'custom', 240, true);
    -- Set custom recurrence for reseal (every 730 days ~ 2 years)
    UPDATE public.tasks SET recurrence_days = 730 WHERE home_id = p_home_id AND title = 'Reseal Deck' AND is_suggestion = true;
  END IF;

  -- Pool
  IF v_home.has_pool THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_yard_cat, 'Test Pool Water Chemistry', 'Check pH, chlorine, and alkalinity levels.', CURRENT_DATE + INTERVAL '7 days', 'weekly', 15, true),
      (p_home_id, v_yard_cat, 'Professional Pool Service', 'Annual pool opening/closing and equipment check.', CURRENT_DATE + INTERVAL '60 days', 'yearly', 120, true);
  END IF;

  -- Irrigation
  IF v_home.has_irrigation THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_yard_cat, 'Winterize Irrigation System', 'Blow out sprinkler lines before freeze.', CURRENT_DATE + INTERVAL '180 days', 'yearly', 60, true),
      (p_home_id, v_yard_cat, 'Spring Irrigation Startup', 'Check sprinkler heads and test zones.', CURRENT_DATE + INTERVAL '90 days', 'yearly', 45, true);
  END IF;

  -- Septic
  IF v_home.has_septic THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_plumbing_cat, 'Pump Septic Tank', 'Schedule septic tank pumping every 3-5 years.', CURRENT_DATE + INTERVAL '365 days', 'custom', 60, true);
    UPDATE public.tasks SET recurrence_days = 1095 WHERE home_id = p_home_id AND title = 'Pump Septic Tank' AND is_suggestion = true;
  END IF;

  -- Fireplace
  IF v_home.has_fireplace THEN
    INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
    VALUES
      (p_home_id, v_interior_cat, 'Chimney Sweep & Inspection', 'Professional chimney cleaning and safety inspection.', CURRENT_DATE + INTERVAL '90 days', 'yearly', 90, true);
  END IF;

  -- General tasks for all homes
  INSERT INTO public.tasks (home_id, category_id, title, description, due_date, recurrence, estimated_minutes, is_suggestion)
  VALUES
    (p_home_id, v_interior_cat, 'Test Smoke & CO Detectors', 'Test all smoke and carbon monoxide detectors; replace batteries.', CURRENT_DATE + INTERVAL '14 days', 'quarterly', 20, true),
    (p_home_id, v_plumbing_cat, 'Check for Leaks', 'Inspect under sinks, around toilets, and water heater for leaks.', CURRENT_DATE + INTERVAL '30 days', 'quarterly', 20, true),
    (p_home_id, v_exterior_cat, 'Clean Gutters', 'Remove debris from gutters and check downspouts.', CURRENT_DATE + INTERVAL '60 days', 'quarterly', 60, true),
    (p_home_id, v_exterior_cat, 'Inspect Roof', 'Visual roof inspection for damage or missing shingles.', CURRENT_DATE + INTERVAL '90 days', 'yearly', 30, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STORAGE BUCKET for photos
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');
