-- ============================================================================
-- 244_workbook_import_proposals.sql
--
-- X1-B — workbook IMPORT staging. Uploaded workbook rows land as PROPOSALS (never
-- direct writes); the TM accepts/rejects, and ACCEPTED rows write through the SAME
-- budget/income API paths the UI uses. Mirrors the intake pending-answer grammar
-- (240_intake_pending_and_reminders.sql): value jsonb + source ref + status enum +
-- reviewed audit.
--
--   import_batches       — one uploaded file (tour-scoped, workspace-scoped).
--   import_pending_lines  — one proposed row: target table + value jsonb + dup flag.
--
-- HAND-APPLIED: paste into the Supabase SQL editor. Idempotent / re-runnable;
-- down-block at the end. No engine code depends on it until Adam confirms "pasted".
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.import_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  filename      TEXT,
  -- 'mapping'   = foreign layout awaiting the user's column-map confirmation
  -- 'review'    = parsed into pending lines, awaiting accept/reject
  -- 'applied'   = accepted lines written through; 'discarded' = abandoned
  status        TEXT NOT NULL DEFAULT 'review'
                  CHECK (status IN ('mapping','review','applied','discarded')),
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_batches_tour_idx ON public.import_batches(tour_id);

CREATE TABLE IF NOT EXISTS public.import_pending_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  batch_id      UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  -- which single UI write path an accepted row routes to.
  target        TEXT NOT NULL DEFAULT 'budget_line'
                  CHECK (target IN ('budget_line','income_actual')),
  -- the proposed row payload (matches the target route's POST body shape).
  value         JSONB NOT NULL,
  -- human-readable source cell reference, e.g. "Budget!A14".
  source_ref    TEXT,
  provenance    TEXT,
  -- duplicate flagging: the existing line this is a possible dup of (default-skip).
  dup_of        UUID,
  dup_reason    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','skipped')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS import_pending_lines_batch_idx ON public.import_pending_lines(batch_id);

-- RLS — workspace-scoped, mirrors intake_pending_answers (get_my_workspace_id()).
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_batches_workspace" ON public.import_batches;
CREATE POLICY "import_batches_workspace" ON public.import_batches FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE public.import_pending_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_pending_lines_workspace" ON public.import_pending_lines;
CREATE POLICY "import_pending_lines_workspace" ON public.import_pending_lines FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

COMMIT;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP TABLE IF EXISTS public.import_pending_lines;
-- DROP TABLE IF EXISTS public.import_batches;
-- COMMIT;
-- ============================================================================
