-- ============================================
-- LOWPASS — GDPR request log + retention policy config
-- Migration 207
-- ============================================
--
-- Infrastructure for the GDPR tooling. This migration is deliberately
-- NON-DESTRUCTIVE and classification-independent — it adds two tables and
-- touches no existing data. Export/erasure EXECUTION is built separately,
-- after the DATA_MAP classifications are signed off.
--
--   gdpr_requests           one row per access (DSAR) / erasure request,
--                           with status + the result manifest / erasure
--                           certificate (the auditable proof of compliance,
--                           Art. 5(2) accountability + Art. 30).
--   gdpr_retention_policies key→retention-days config. The IP-log keys are
--                           seeded with a conservative default; the
--                           `retain_legal_*` keys are seeded NULL on purpose
--                           — they MUST be filled in with periods confirmed
--                           by Adam's accountant/counsel before any erasure
--                           job treats those categories.
--
-- Service-role writes only (the API routes use the service client, like the
-- ai_usage tables). Reads are workspace-admin scoped; platform-level account
-- requests (workspace_id NULL) are visible to the site-admin dashboard via
-- the service-role client behind its own gate.
--
-- Idempotent. Recorded in public._lp_migrations on apply.
-- ============================================

-- ── Request log + erasure certificates ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.gdpr_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE SET NULL, -- NULL = platform/account-level
  request_type  text NOT NULL CHECK (request_type IN ('export', 'erasure')),
  subject_type  text NOT NULL CHECK (subject_type IN ('account', 'roster_person', 'external_contact', 'venue_intake')),
  subject_ref   text NOT NULL,            -- the id / email / name used to resolve the subject
  subject_label text,                     -- human-readable subject (for the admin UI)
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'awaiting_confirmation', 'in_progress', 'completed', 'failed', 'cancelled')),
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,             -- erasure is two-step: request → confirm
  completed_at  timestamptz,
  result        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- export manifest OR erasure certificate
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gdpr_requests_workspace_idx
  ON public.gdpr_requests (workspace_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS gdpr_requests_subject_idx
  ON public.gdpr_requests (subject_type, subject_ref);

ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;

-- Workspace admins read their workspace's requests. Platform-level rows
-- (workspace_id NULL) are read by site admins via the service-role client.
DROP POLICY IF EXISTS gdpr_requests_select ON public.gdpr_requests;
CREATE POLICY gdpr_requests_select ON public.gdpr_requests
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- No client writes — the API routes insert/update via the service-role client.
DROP POLICY IF EXISTS gdpr_requests_no_client_write ON public.gdpr_requests;
CREATE POLICY gdpr_requests_no_client_write ON public.gdpr_requests
  FOR INSERT WITH CHECK (false);

-- ── Retention policy config ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gdpr_retention_policies (
  key            text PRIMARY KEY,        -- e.g. 'viewer_ip', 'retain_legal_payroll'
  description    text NOT NULL,
  retention_days integer,                 -- NULL = not yet set (must be configured before use)
  lawful_basis   text,                    -- to be filled per legal sign-off
  note           text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gdpr_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gdpr_retention_select ON public.gdpr_retention_policies;
CREATE POLICY gdpr_retention_select ON public.gdpr_retention_policies
  FOR SELECT USING (public.is_workspace_admin());

DROP POLICY IF EXISTS gdpr_retention_no_client_write ON public.gdpr_retention_policies;
CREATE POLICY gdpr_retention_no_client_write ON public.gdpr_retention_policies
  FOR INSERT WITH CHECK (false);

-- Seed: viewer-IP logs get a conservative default; legal-retention keys are
-- seeded with NULL days ON PURPOSE so the erasure job refuses to act on them
-- until a human sets the period. ON CONFLICT DO NOTHING keeps re-runs safe and
-- never overwrites a value Adam has already set.
INSERT INTO public.gdpr_retention_policies (key, description, retention_days, lawful_basis, note) VALUES
  ('viewer_ip',            'last_viewer_ip on advance intake / packet / stage-plot share links', 90,  'legitimate_interest', 'IP retained for abuse/audit; purge after window.'),
  ('intake_submitter',     'submitted_by_name/email + submitted_data on completed/expired intake links', 365, NULL, 'Confirm: how long to keep venue submissions after the show.'),
  ('retain_legal_payroll', 'payroll_entries + personnel_rates (financial)', NULL, NULL, 'SET BY LEGAL — UK tax/accounting commonly ~6 years. Do not erase until set.'),
  ('retain_legal_settlement','settlement + budget income/expense records',  NULL, NULL, 'SET BY LEGAL.'),
  ('retain_legal_deal_memos','deal_memos contractual terms + signed docs',  NULL, NULL, 'SET BY LEGAL.'),
  ('retain_legal_expenses',  'expenses + expense_receipts',                 NULL, NULL, 'SET BY LEGAL.'),
  ('retain_legal_rental_billing','rental_jobs billing details',             NULL, NULL, 'SET BY LEGAL.')
ON CONFLICT (key) DO NOTHING;

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.gdpr_retention_policies CASCADE;
   DROP TABLE IF EXISTS public.gdpr_requests CASCADE;
   ============================================================ */
