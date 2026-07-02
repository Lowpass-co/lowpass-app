-- ============================================
-- LOWPASS — Payroll extensible rate types (b2)
-- Migration 228 — MONEY-CRITICAL (reconciliation-gated)
--
-- Replaces the four hardcoded payroll rate columns with a user-definable
-- catalog. The legacy columns on personnel_rates STAY (transition) — this
-- migration is additive + backfills from them. computeTotals (fees.ts)
-- reproduces the legacy math exactly (proven by reconcile.harness.ts).
--
--   rate_types            the catalog — workspace-scoped, reusable across
--                         tours. A global tier (workspace_id IS NULL) holds
--                         the seeded defaults (mirror export_templates).
--   personnel_rate_lines  the amounts — per tour, per person, per type
--                         (keyed on personnel_rates.id, which IS one row per
--                         tour+person). Unique (personnel_rate_id, rate_type_id).
--
-- Idempotent (fixed seed UUIDs + ON CONFLICT). Down-block at the end.
-- internal_rate is untouched (admin-only, its own path — not a rate type).
-- ============================================

-- ── 1. Catalog ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,  -- NULL = global default
  name         text NOT NULL,
  bucket       text NOT NULL CHECK (bucket IN ('fee', 'per_diem')),
  basis        text NOT NULL CHECK (basis IN ('per_day_status', 'per_active_day', 'flat_once')),
  day_statuses text[] NOT NULL DEFAULT '{}',  -- for per_day_status: which statuses it bills
  order_index  integer NOT NULL DEFAULT 0,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_types ENABLE ROW LEVEL SECURITY;

-- SELECT: the global defaults + your own workspace's types.
DROP POLICY IF EXISTS rate_types_select ON public.rate_types;
CREATE POLICY rate_types_select ON public.rate_types
  FOR SELECT USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());

-- WRITE: only your own workspace's types (never the global tier from a client).
DROP POLICY IF EXISTS rate_types_write ON public.rate_types;
CREATE POLICY rate_types_write ON public.rate_types
  FOR ALL USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP TRIGGER IF EXISTS rate_types_updated_at ON public.rate_types;
CREATE TRIGGER rate_types_updated_at
  BEFORE UPDATE ON public.rate_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Amounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.personnel_rate_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id           uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  personnel_rate_id uuid NOT NULL REFERENCES public.personnel_rates(id) ON DELETE CASCADE,
  rate_type_id      uuid NOT NULL REFERENCES public.rate_types(id) ON DELETE CASCADE,
  amount            numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (personnel_rate_id, rate_type_id)  -- one amount per person-on-tour per type
);

CREATE INDEX IF NOT EXISTS personnel_rate_lines_tour_idx ON public.personnel_rate_lines (tour_id);
CREATE INDEX IF NOT EXISTS personnel_rate_lines_workspace_idx ON public.personnel_rate_lines (workspace_id);

ALTER TABLE public.personnel_rate_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personnel_rate_lines_select ON public.personnel_rate_lines;
CREATE POLICY personnel_rate_lines_select ON public.personnel_rate_lines
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS personnel_rate_lines_write ON public.personnel_rate_lines;
CREATE POLICY personnel_rate_lines_write ON public.personnel_rate_lines
  FOR ALL USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP TRIGGER IF EXISTS personnel_rate_lines_updated_at ON public.personnel_rate_lines;
CREATE TRIGGER personnel_rate_lines_updated_at
  BEFORE UPDATE ON public.personnel_rate_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Seed the five global defaults (fixed UUIDs → deterministic backfill) ──
INSERT INTO public.rate_types (id, workspace_id, name, bucket, basis, day_statuses, order_index, is_default)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', NULL, 'Show',        'fee',      'per_day_status', ARRAY['show'],       0, true),
  ('00000000-0000-0000-0000-0000000000a2', NULL, 'Off / Travel','fee',      'per_day_status', ARRAY['off_travel'], 1, true),
  ('00000000-0000-0000-0000-0000000000a3', NULL, 'Rehearsal',   'fee',      'per_day_status', ARRAY['rehearsal'],  2, true),
  ('00000000-0000-0000-0000-0000000000a4', NULL, 'Per diem',    'per_diem', 'per_active_day', '{}',                3, true),
  ('00000000-0000-0000-0000-0000000000a5', NULL, 'Advance',     'fee',      'flat_once',      '{}',                4, true)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Backfill amounts from the legacy personnel_rates columns ─────
-- One line per (personnel_rates row × default type). ON CONFLICT DO NOTHING
-- keeps this idempotent and never overwrites an edited amount.
INSERT INTO public.personnel_rate_lines (tour_id, workspace_id, personnel_rate_id, rate_type_id, amount)
SELECT pr.tour_id, pr.workspace_id, pr.id, seed.rate_type_id, seed.amount
FROM public.personnel_rates pr
CROSS JOIN LATERAL (VALUES
  ('00000000-0000-0000-0000-0000000000a1'::uuid, pr.show_rate),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, pr.off_rate),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, pr.rehearsal_rate),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, pr.per_diem),
  ('00000000-0000-0000-0000-0000000000a5'::uuid, pr.advance_fee)
) AS seed(rate_type_id, amount)
ON CONFLICT (personnel_rate_id, rate_type_id) DO NOTHING;

-- ============================================
-- DOWN (manual)
-- DROP TABLE IF EXISTS public.personnel_rate_lines CASCADE;
-- DELETE FROM public.rate_types WHERE id IN (
--   '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',
--   '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4',
--   '00000000-0000-0000-0000-0000000000a5');
-- DROP TABLE IF EXISTS public.rate_types CASCADE;
-- ============================================
