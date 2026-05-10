/* ============================================
   Migration 090 — notification dedup columns (Sprint 11 §3)

   Adds `notification_email_sent_to UUID REFERENCES auth.users(id)`
   to the two stand-alone trigger sources whose dedup signal is
   not the audit_log row itself:

     - personnel_intake_tokens (intake_submitted trigger):
       fires when submitted_at goes NULL → set. Recipient is
       the inviter (invited_by_user_id). Stamping
       notification_email_sent_to records WHO got the mail; a
       NULL value means the intake-submission email is still
       pending dispatch.

     - workspace_invites (invite_accepted trigger):
       fires when accepted_at goes NULL → set. Recipient is the
       inviter (invited_by_user_id). Same NULL-means-pending
       semantic as above.

   The third Sprint 11 trigger (conflict_detected) keys off
   audit_log entries written when a tour_personnel row is
   created, and uses audit_log.notification_dispatched_at
   (added in 089) for dedup — no new column needed on the
   tour_personnel side.

   Partial indexes scope the dispatcher's scan to the un-sent
   subset, so neither table grows the dispatcher's per-pass
   cost as historical rows accumulate.

   Apply via: npm run db:migrate
   ============================================ */

ALTER TABLE public.personnel_intake_tokens
  ADD COLUMN IF NOT EXISTS notification_email_sent_to UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personnel_intake_tokens_pending_notification_idx
  ON public.personnel_intake_tokens (submitted_at)
  WHERE submitted_at IS NOT NULL
    AND notification_email_sent_to IS NULL;

ALTER TABLE public.workspace_invites
  ADD COLUMN IF NOT EXISTS notification_email_sent_to UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspace_invites_pending_notification_idx
  ON public.workspace_invites (accepted_at)
  WHERE accepted_at IS NOT NULL
    AND notification_email_sent_to IS NULL;

/* ============================================
   Down migration
   ============================================ */
-- DROP INDEX IF EXISTS workspace_invites_pending_notification_idx;
-- ALTER TABLE public.workspace_invites DROP COLUMN IF EXISTS notification_email_sent_to;
-- DROP INDEX IF EXISTS personnel_intake_tokens_pending_notification_idx;
-- ALTER TABLE public.personnel_intake_tokens DROP COLUMN IF EXISTS notification_email_sent_to;
