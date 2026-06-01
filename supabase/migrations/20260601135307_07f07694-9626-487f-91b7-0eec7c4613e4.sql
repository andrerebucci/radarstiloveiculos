
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Monitors
CREATE TABLE public.monitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  refresh_interval_hours INTEGER NOT NULL DEFAULT 24,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitors TO authenticated;
GRANT ALL ON public.monitors TO service_role;
ALTER TABLE public.monitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitors_select_own" ON public.monitors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "monitors_insert_own" ON public.monitors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "monitors_update_own" ON public.monitors FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "monitors_delete_own" ON public.monitors FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_monitors_updated_at BEFORE UPDATE ON public.monitors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- History entries
CREATE TABLE public.history_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  monitor_id UUID NOT NULL REFERENCES public.monitors(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  price TEXT,
  mileage TEXT,
  location TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (monitor_id, site, url)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.history_entries TO authenticated;
GRANT ALL ON public.history_entries TO service_role;
ALTER TABLE public.history_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history_select_own" ON public.history_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "history_insert_own" ON public.history_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "history_update_own" ON public.history_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "history_delete_own" ON public.history_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_history_monitor ON public.history_entries(monitor_id);

CREATE TRIGGER update_history_updated_at BEFORE UPDATE ON public.history_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notes
CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site, url)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_own" ON public.notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notes_insert_own" ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_update_own" ON public.notes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notes_delete_own" ON public.notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
