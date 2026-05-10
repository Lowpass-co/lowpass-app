/* ============================================
   Migration 089 — audit_log notification dispatch tracking
   (Sprint 10 §4.3)

   Adds a single column + a partial index so the notification
   dispatcher (Phase 4) can read the next batch of un-
   dispatched audit_log rows efficiently. After dispatch the
   column is stamped, taking the row out of the partial index
   so the next pass doesn't re-process it.

   Apply via: npm run db:migrate
   ============================================ */

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS notification_dispatched_at TIMESTAMPTZ;

/* Partial index — only un-dispatched rows. The dispatcher
   query filters notification_dispatched_at IS NULL AND action
   IN (...) so this index is the smallest set Postgres needs to
   scan. Stays small even as audit_log grows because dispatched
   rows drop out of the index. */
CREATE INDEX IF NOT EXISTS audit_log_pending_notifications_idx
  ON public.audit_log (created_at)
  WHERE notification_dispatched_at IS NULL
    AND action IN ('status_changed', 'created');

/* ============================================
   Down migration
   ============================================ */
-- DROP INDEX IF EXISTS audit_log_pending_notifications_idx;
-- ALTER TABLE public.audit_log DROP COLUMN IF EXISTS notification_dispatched_at;
