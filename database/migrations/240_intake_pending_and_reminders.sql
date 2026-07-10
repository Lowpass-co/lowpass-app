-- ============================================
-- LOWPASS — Intake upgrade (P7): store-pending answers + reminders
-- Migration 240
-- ============================================
--
-- Q7 STORE-PENDING (Adam's call): the venue's intake answers are NO LONGER
-- auto-merged into advance_instances.data on submit. They land PENDING in
-- intake_pending_answers, one row per (advance_instance × section × field ×
-- source), and the TM reviews them via the existing ChangeReviewQueue. ACCEPT is
-- the apply gate — mergeIntakeIntoAdvance (never-clobber) runs at accept-time,
-- not submit-time (intake.test.ts §12.4 stays green: the guard just fires later).
--
-- `source` distinguishes the three fill paths that all ride this same pending +
-- review flow: 'venue' (form submit), 'prefill' (confirmed proposal from the
-- canonical venue / a prior same-venue advance), 'tech_pack' (AI extraction from
-- an uploaded tech pack). `provenance` carries the human note ("From your March
-- 2026 show") shown next to a proposal.
--
-- intake_reminders: the smallest-possible nudge lane — one row per (link × kind);
-- sent_at is the idempotency guard (a scheduled job only sends when sent_at IS
-- NULL). NOT the general notification lane.
--
-- Idempotent (CREATE / DROP POLICY IF EXISTS); RLS via get_my_workspace_id();
-- the public submit route writes via the SERVICE ROLE (bypasses RLS) with the
-- link's workspace_id. Down-block at the end. Next free after 239 on main.
-- ============================================

-- ---- intake_pending_answers ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intake_pending_answers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  advance_instance_id uuid NOT NULL REFERENCES public.advance_instances(id) ON DELETE CASCADE,
  link_id             uuid REFERENCES public.advance_intake_links(id) ON DELETE CASCADE,
  section_id          text NOT NULL,
  field_id            text NOT NULL,
  value               jsonb NOT NULL,
  source              text NOT NULL DEFAULT 'venue' CHECK (source IN ('venue', 'prefill', 'tech_pack')),
  provenance          text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- One pending answer per field per source; a re-submit / re-extract upserts.
  CONSTRAINT intake_pending_answers_uniq UNIQUE (advance_instance_id, section_id, field_id, source)
);

ALTER TABLE public.intake_pending_answers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS intake_pending_answers_instance_idx
  ON public.intake_pending_answers (workspace_id, advance_instance_id, status);

DROP POLICY IF EXISTS intake_pending_answers_select ON public.intake_pending_answers;
CREATE POLICY intake_pending_answers_select ON public.intake_pending_answers
  FOR SELECT USING ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS intake_pending_answers_insert ON public.intake_pending_answers;
CREATE POLICY intake_pending_answers_insert ON public.intake_pending_answers
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS intake_pending_answers_update ON public.intake_pending_answers;
CREATE POLICY intake_pending_answers_update ON public.intake_pending_answers
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS intake_pending_answers_delete ON public.intake_pending_answers;
CREATE POLICY intake_pending_answers_delete ON public.intake_pending_answers
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

-- ---- intake_reminders ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intake_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  link_id      uuid NOT NULL REFERENCES public.advance_intake_links(id) ON DELETE CASCADE,
  -- 't14' / 't7' / 't3' = reminder to the venue contact; 'tm_completed' = the
  -- one "venue completed" email to the TM.
  kind         text NOT NULL CHECK (kind IN ('t14', 't7', 't3', 'tm_completed')),
  send_at      timestamptz NOT NULL,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- One reminder per kind per link — the row identity that stops duplicate rows;
  -- sent_at NULL→timestamp is the second (send-time) idempotency guard.
  CONSTRAINT intake_reminders_uniq UNIQUE (link_id, kind)
);

ALTER TABLE public.intake_reminders ENABLE ROW LEVEL SECURITY;

-- Due, unsent reminders (the scheduled job's working set).
CREATE INDEX IF NOT EXISTS intake_reminders_due_idx
  ON public.intake_reminders (send_at) WHERE sent_at IS NULL;

DROP POLICY IF EXISTS intake_reminders_select ON public.intake_reminders;
CREATE POLICY intake_reminders_select ON public.intake_reminders
  FOR SELECT USING ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS intake_reminders_insert ON public.intake_reminders;
CREATE POLICY intake_reminders_insert ON public.intake_reminders
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS intake_reminders_update ON public.intake_reminders;
CREATE POLICY intake_reminders_update ON public.intake_reminders
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS intake_reminders_delete ON public.intake_reminders;
CREATE POLICY intake_reminders_delete ON public.intake_reminders
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.intake_reminders CASCADE;
   DROP TABLE IF EXISTS public.intake_pending_answers CASCADE;
   ============================================================ */
