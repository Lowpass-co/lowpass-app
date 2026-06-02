/* ============================================================
   MIGRATION 108 — advance_intake notification dedup (T3 follow-up)

   Adds the dedup column the notification dispatcher uses to send a
   "venue submitted their advance" email to the TM exactly once. Mirrors
   migration 090's pattern for personnel_intake_tokens / workspace_invites:

     - submitted_at IS NOT NULL          → the venue has submitted
     - notification_email_sent_to IS NULL → not yet emailed

   The 5-minute cron (dispatchPendingNotifications → processAdvanceIntakeRows)
   selects on that partial index, emails the link's created_by (the TM who
   sent the packet), then stamps notification_email_sent_to to prevent
   re-send.

   Idempotent — safe to re-run.
   ============================================================ */

ALTER TABLE public.advance_intake_links
  ADD COLUMN IF NOT EXISTS notification_email_sent_to UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS advance_intake_links_pending_notification_idx
  ON public.advance_intake_links (submitted_at)
  WHERE submitted_at IS NOT NULL
    AND notification_email_sent_to IS NULL;

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP INDEX IF EXISTS public.advance_intake_links_pending_notification_idx;
   ALTER TABLE public.advance_intake_links
     DROP COLUMN IF EXISTS notification_email_sent_to;
   ============================================================ */
