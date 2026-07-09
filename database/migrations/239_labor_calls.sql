-- ============================================
-- LOWPASS — labor_calls + labor_call_templates (P6 Labor Calls)
-- Migration 239
-- ============================================
--
-- Per-day crew call schedule: which departments, how many heads, called when,
-- from which local company, under what rules. A first-class object (TMs template
-- it, venues/local production confirm it via intake, it prints on the day sheet)
-- — a Schedule text field can't do any of that.
--
-- NOT payroll: local crew ≠ tour payroll. These tables never touch rate_lines /
-- fees / provenance / FX. Departments are FREE-TEXT (no enum) — touring reality
-- is messy (suggested defaults live in app code: steel, audio, lights, video,
-- backline, loaders, wardrobe, runner).
--
-- Anchoring: labor_calls hang off routing_id (the day = the editing home) with a
-- denormalised tour_id for the tour-level Crew › Labor rollup. Templates are
-- artist- OR tour-scoped (artist-level inherits to tours per the existing scope
-- pattern) and apply-to-day COPIES their jsonb rows (additive, like budget
-- templates).
--
-- Idempotent (CREATE / ADD IF NOT EXISTS, DROP POLICY IF EXISTS); RLS via the
-- standard workspace helper get_my_workspace_id(); down-block at the end.
-- Next free number after 238 on main.
-- ============================================

-- ---- labor_calls --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labor_calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id          uuid REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id       uuid REFERENCES public.routing(id) ON DELETE CASCADE,
  department       text NOT NULL DEFAULT '',
  call_time        time,
  headcount        integer,
  company          text NOT NULL DEFAULT '',
  contact_name     text NOT NULL DEFAULT '',
  contact_phone    text NOT NULL DEFAULT '',
  meal_break_notes text NOT NULL DEFAULT '',
  union_notes      text NOT NULL DEFAULT '',
  notes            text NOT NULL DEFAULT '',
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.labor_calls ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS labor_calls_routing_idx ON public.labor_calls (workspace_id, routing_id, sort_order);
CREATE INDEX IF NOT EXISTS labor_calls_tour_idx    ON public.labor_calls (workspace_id, tour_id);

DROP POLICY IF EXISTS labor_calls_select ON public.labor_calls;
CREATE POLICY labor_calls_select ON public.labor_calls
  FOR SELECT USING ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS labor_calls_insert ON public.labor_calls;
CREATE POLICY labor_calls_insert ON public.labor_calls
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS labor_calls_update ON public.labor_calls;
CREATE POLICY labor_calls_update ON public.labor_calls
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS labor_calls_delete ON public.labor_calls;
CREATE POLICY labor_calls_delete ON public.labor_calls
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

-- ---- labor_call_templates -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labor_call_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Exactly one of artist_id / tour_id is set in practice: an artist-scoped
  -- template inherits to that artist's tours; a tour-scoped one is local.
  artist_id     uuid REFERENCES public.artists(id) ON DELETE CASCADE,
  tour_id       uuid REFERENCES public.tours(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Labor call template',
  -- Array of call rows: [{ department, call_time, headcount, company,
  -- contact_name, contact_phone, meal_break_notes, union_notes, notes }, …].
  rows          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.labor_call_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS labor_call_templates_artist_idx ON public.labor_call_templates (workspace_id, artist_id);
CREATE INDEX IF NOT EXISTS labor_call_templates_tour_idx   ON public.labor_call_templates (workspace_id, tour_id);

DROP POLICY IF EXISTS labor_call_templates_select ON public.labor_call_templates;
CREATE POLICY labor_call_templates_select ON public.labor_call_templates
  FOR SELECT USING ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS labor_call_templates_insert ON public.labor_call_templates;
CREATE POLICY labor_call_templates_insert ON public.labor_call_templates
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS labor_call_templates_update ON public.labor_call_templates;
CREATE POLICY labor_call_templates_update ON public.labor_call_templates
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS labor_call_templates_delete ON public.labor_call_templates;
CREATE POLICY labor_call_templates_delete ON public.labor_call_templates
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.labor_call_templates CASCADE;
   DROP TABLE IF EXISTS public.labor_calls CASCADE;
   ============================================================ */
