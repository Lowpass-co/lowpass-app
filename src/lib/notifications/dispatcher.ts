/* ============================================
   LOWPASS — notification dispatcher (Sprint 10 §4.2)

   Reads un-dispatched audit_log rows + workspace_invites rows
   + personnel_intake_tokens rows since last run, fans them out
   into emails via Resend, and stamps notification_dispatched_at
   so the next pass doesn't re-process.

   Called from:
     - /api/cron/dispatch-notifications (Vercel cron, every 5 min)
     - /api/admin/notifications/test-send (admin manual trigger)

   Resend API key read from process.env.RESEND_API_KEY
   (confirmed present in both Vercel + .env.local per Adam).

   Design notes:
     - Dispatcher uses the SERVICE-ROLE Supabase client because
       the cron caller has no auth user. Caller must own the
       service-role key handoff.
     - Per-trigger composition is intentionally inline — the
       set is small (5 triggers), and a lookup table would
       obscure the actual data shape each one reads. If the
       set grows, refactor to a registry.
     - Failures dispatching one row don't block other rows.
       The dispatcher logs + skips, leaving the un-stamped row
       to retry on the next run.
   ============================================ */

import { Resend } from 'resend';
import {
  assignmentCancelled,
  inviteSent,
  inviteAccepted,
  intakeSubmitted,
  wrapShell,
  type NotificationTemplate,
} from '@/lib/notifications/templates';
import type { SupabaseClient } from '@supabase/supabase-js';

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'Lowpass <notifications@lowpass.co>';

export interface DispatchSummary {
  attempted: number;
  sent: number;
  failed: number;
  failedReasons: string[];
}

/* ============================================
   Send a single email via Resend. Returns true on success,
   throws on hard failure. The dispatcher catches throws so
   one bad row doesn't block the batch.
   ============================================ */
async function sendEmail(
  resend: Resend,
  to: string,
  template: NotificationTemplate,
): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: template.subject,
    html: wrapShell(template.html),
  });
  if (error) {
    throw new Error(error.message ?? 'Resend error');
  }
}

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  workspace_id: string;
  field_changes: Record<string, unknown> | null;
  created_at: string;
}

/* ============================================
   Process audit_log rows (assignment cancelled, conflict
   detected, etc.). Reads the next batch of un-dispatched
   rows. After each successful send (or skip), stamps the
   row's notification_dispatched_at.

   Limit per batch: 50. Cron runs every 5min; backlogs drain
   in ~5min × (count / 50).
   ============================================ */
async function processAuditRows(
  supabase: SupabaseClient,
  resend: Resend,
  summary: DispatchSummary,
): Promise<void> {
  const { data: rows } = await supabase
    .from('audit_log')
    .select('id, action, entity_type, entity_id, workspace_id, field_changes, created_at')
    .is('notification_dispatched_at', null)
    .in('action', ['status_changed', 'created'])
    .order('created_at', { ascending: true })
    .limit(50);

  const auditRows = (rows ?? []) as AuditRow[];
  for (const row of auditRows) {
    summary.attempted++;
    let dispatched = false;
    try {
      if (
        row.action === 'status_changed' &&
        row.entity_type === 'tour_personnel'
      ) {
        const fc = row.field_changes ?? {};
        const status = (fc as { status?: { from?: string; to?: string } }).status;
        if (status?.from === 'confirmed' && status?.to === 'cancelled') {
          /* Look up the personnel + tour + workspace + the
             person's email. Skip if no email on record. */
          const { data: tp } = await supabase
            .from('tour_personnel')
            .select('person_id, role, starts_on, ends_on, tours(id, name)')
            .eq('id', row.entity_id)
            .maybeSingle();
          const tpRow = tp as
            | {
                person_id: string;
                starts_on: string | null;
                ends_on: string | null;
                tours: { id: string; name: string } | { id: string; name: string }[] | null;
              }
            | null;
          if (!tpRow) {
            // Tour personnel row deleted — nothing to email.
            dispatched = true;
          } else {
            const tour = Array.isArray(tpRow.tours) ? tpRow.tours[0] : tpRow.tours;
            const { data: person } = await supabase
              .from('personnel')
              .select('name, email')
              .eq('id', tpRow.person_id)
              .maybeSingle();
            const personRow = person as { name: string; email: string | null } | null;
            const { data: ws } = await supabase
              .from('workspaces')
              .select('name')
              .eq('id', row.workspace_id)
              .maybeSingle();
            const wsName = (ws as { name?: string } | null)?.name ?? 'Lowpass';
            if (personRow?.email && tour?.name) {
              await sendEmail(
                resend,
                personRow.email,
                assignmentCancelled({
                  personnelName: personRow.name,
                  tourName: tour.name,
                  startDate: tpRow.starts_on,
                  endDate: tpRow.ends_on,
                  workspaceName: wsName,
                }),
              );
              summary.sent++;
            }
            dispatched = true;
          }
        } else {
          // Other status transitions don't trigger email.
          dispatched = true;
        }
      } else {
        // Action not in our trigger set — mark dispatched so
        // it doesn't keep re-processing.
        dispatched = true;
      }
    } catch (err) {
      summary.failed++;
      summary.failedReasons.push(
        `audit ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Don't stamp — leave for retry.
      continue;
    }
    if (dispatched) {
      await supabase
        .from('audit_log')
        .update({ notification_dispatched_at: new Date().toISOString() })
        .eq('id', row.id);
    }
  }
}

/* ============================================
   Process workspace_invites — invite_sent emails fire on
   row insert. The invites table doesn't have a stamp column
   in this sprint; we use a composite "sent if created within
   last hour AND not already accepted" heuristic. Long-term
   replace with an invite_email_sent_at column (Sprint 11).

   Skipped in v1 — Supabase Auth's built-in invite email is
   the v1 path and Adam's invite generation route already
   triggers it. This dispatcher slot stays here as a no-op
   placeholder so the trigger list in §4.1 is honoured at
   the code level.
   ============================================ */
async function processInviteRows(
  _supabase: SupabaseClient,
  _resend: Resend,
  _summary: DispatchSummary,
): Promise<void> {
  /* No-op v1 — Supabase Auth handles invite emails directly
     during the invite POST. Re-implement here when the
     workspace_invites table grows the email_sent_at column. */
}

/* ============================================
   Process intake_submitted — fires when
   personnel_intake_tokens.submitted_at goes from NULL → set.
   We can't currently observe that transition without a
   trigger or change-feed, so we use a "submitted within last
   N minutes AND not already notified" heuristic via a tiny
   scratch column. Skipped in v1 for the same reason as
   invites — wire when intake table grows email_sent_at
   (Sprint 11).
   ============================================ */
async function processIntakeRows(
  _supabase: SupabaseClient,
  _resend: Resend,
  _summary: DispatchSummary,
): Promise<void> {
  /* No-op v1 — wired in Sprint 11 with a dedicated tracking
     column. */
}

/* Public alias to silence unused warnings for the v1
   placeholders. */
void processInviteRows;
void processIntakeRows;
void inviteSent;
void inviteAccepted;
void intakeSubmitted;

/* ============================================
   Top-level entry point. Caller supplies a service-role
   Supabase client + the dispatcher fans out + returns a
   summary suitable for the test-send admin UI / cron logs.
   ============================================ */
export async function dispatchPendingNotifications(
  supabase: SupabaseClient,
): Promise<DispatchSummary> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY missing — cannot dispatch.');
  }
  const resend = new Resend(apiKey);

  const summary: DispatchSummary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    failedReasons: [],
  };

  await processAuditRows(supabase, resend, summary);
  // processInviteRows + processIntakeRows are v1 no-ops; the
  // trigger list in §4.1 names them so they exist in the
  // dispatcher even though Supabase Auth handles invite mail
  // directly today.

  return summary;
}
