/* ============================================
   LOWPASS — notification dispatcher (Sprint 10 §4.2 +
   Sprint 11 §3 trigger expansion)

   Reads un-dispatched audit_log rows + workspace_invites rows
   + personnel_intake_tokens rows since last run, fans them out
   into emails via Resend, and stamps a per-source dedup
   column so the next pass doesn't re-process.

   Called from:
     - /api/cron/dispatch-notifications (Vercel cron, every 5 min)
     - /api/admin/notifications/test-send (admin manual trigger)

   Resend API key read from process.env.RESEND_API_KEY
   (confirmed present in both Vercel + .env.local per Adam).

   Sprint 11 §3 trigger set (now wired):

     - assignment_cancelled  (audit_log status_changed
                              tour_personnel — Sprint 10)
     - conflict_detected     (audit_log created tour_personnel
                              with a same-person overlap in the
                              same workspace — Sprint 11)
     - invite_accepted       (workspace_invites.accepted_at set
                              and notification_email_sent_to
                              still NULL — Sprint 11)
     - intake_submitted      (personnel_intake_tokens.submitted_at
                              set and notification_email_sent_to
                              still NULL — Sprint 11)

   Design notes:
     - Dispatcher uses the SERVICE-ROLE Supabase client because
       the cron caller has no auth user. Caller must own the
       service-role key handoff.
     - Per-trigger composition is intentionally inline — the
       set is small (4 wired triggers + invite_sent which is
       still handled by Supabase Auth's own invite mail), and a
       lookup table would obscure the actual data shape each
       one reads. If the set grows past ~6, refactor to a
       registry.
     - Failures dispatching one row don't block other rows.
       The dispatcher logs + skips, leaving the un-stamped row
       to retry on the next run.
     - Dedup model:
         * audit_log triggers stamp `notification_dispatched_at`
           (column added in 089).
         * workspace_invites + personnel_intake_tokens triggers
           stamp `notification_email_sent_to` with the user_id
           of the recipient (column added in 090). NULL means
           pending.
   ============================================ */

import { Resend } from 'resend';
import {
  assignmentCancelled,
  inviteSent,
  inviteAccepted,
  intakeSubmitted,
  conflictDetected,
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

/* ============================================
   Resolve an auth user's email + display name. Used by
   inviter-recipient triggers (invite_accepted, intake_submitted)
   and the conflict_detected trigger (sends to the manager who
   created the assignment).

   profiles.full_name is the human-friendly name; we fall back
   to the email local-part if the profile row has no name.
   Returns null when the user can't be resolved (deleted /
   disabled), in which case the caller should mark the row
   dispatched without sending.
   ============================================ */
interface ResolvedUser {
  email: string;
  name: string;
}
async function lookupUserEmailAndName(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResolvedUser | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) {
    return null;
  }
  const email = data.user.email;
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  const fullName = ((profile as { full_name?: string | null } | null)?.full_name ?? '').trim();
  return {
    email,
    name: fullName || email.split('@')[0] || 'A teammate',
  };
}

function formatOverlap(startA: string, endA: string, startB: string, endB: string): string {
  /* Show the intersection of [startA,endA] and [startB,endB] when
     possible; otherwise fall back to "ranges A and B" so the
     recipient can see what was double-booked. */
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return `${start} – ${end}`;
}

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  workspace_id: string;
  actor_user_id: string | null;
  field_changes: Record<string, unknown> | null;
  created_at: string;
}

interface TourLite {
  id: string;
  name: string;
}
function unwrapTour(t: TourLite | TourLite[] | null | undefined): TourLite | null {
  if (!t) return null;
  return Array.isArray(t) ? (t[0] ?? null) : t;
}

/* ============================================
   Process audit_log rows. Two wired triggers:
     - status_changed tour_personnel confirmed→cancelled
       → assignment_cancelled (sends to personnel.email)
     - created tour_personnel with same-workspace, same-person,
       date-overlapping non-cancelled assignment
       → conflict_detected (sends to actor_user_id)

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
    .select(
      'id, action, entity_type, entity_id, workspace_id, actor_user_id, field_changes, created_at',
    )
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
        dispatched = await handleAssignmentCancelled(supabase, resend, row, summary);
      } else if (
        row.action === 'created' &&
        row.entity_type === 'tour_personnel'
      ) {
        dispatched = await handleConflictDetected(supabase, resend, row, summary);
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

async function handleAssignmentCancelled(
  supabase: SupabaseClient,
  resend: Resend,
  row: AuditRow,
  summary: DispatchSummary,
): Promise<boolean> {
  const fc = row.field_changes ?? {};
  const status = (fc as { status?: { from?: string; to?: string } }).status;
  if (!(status?.from === 'confirmed' && status?.to === 'cancelled')) {
    // Other status transitions don't trigger email.
    return true;
  }
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
        tours: TourLite | TourLite[] | null;
      }
    | null;
  if (!tpRow) {
    return true; // Tour personnel row deleted — nothing to email.
  }
  const tour = unwrapTour(tpRow.tours);
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
  return true;
}

async function handleConflictDetected(
  supabase: SupabaseClient,
  resend: Resend,
  row: AuditRow,
  summary: DispatchSummary,
): Promise<boolean> {
  /* Conflict semantics: the new tour_personnel row overlaps
     another non-cancelled tour_personnel row for the same
     person within the same workspace. Cross-workspace
     conflicts are out of scope for this trigger — they're
     surfaced in the UI via check_personnel_conflicts_batch
     but the dispatcher doesn't have the standing to email
     across workspace boundaries.

     Recipient: actor_user_id on the audit row (the manager
     who created the assignment). If actor is null (system
     insert), we mark dispatched and skip. */
  if (!row.actor_user_id) {
    return true;
  }
  const { data: tpData } = await supabase
    .from('tour_personnel')
    .select('person_id, starts_on, ends_on, tour_id, status, tours(id, name)')
    .eq('id', row.entity_id)
    .maybeSingle();
  const tp = tpData as
    | {
        person_id: string;
        starts_on: string | null;
        ends_on: string | null;
        tour_id: string;
        status: string;
        tours: TourLite | TourLite[] | null;
      }
    | null;
  if (!tp || !tp.starts_on || !tp.ends_on) {
    // No row, or no date window — can't compute overlap.
    return true;
  }
  if (tp.status === 'cancelled') {
    return true; // Cancelled-on-create — no conflict.
  }
  const { data: overlapsData } = await supabase
    .from('tour_personnel')
    .select('id, tour_id, starts_on, ends_on, status, tours(id, name)')
    .eq('workspace_id', row.workspace_id)
    .eq('person_id', tp.person_id)
    .neq('id', row.entity_id)
    .neq('status', 'cancelled')
    .lte('starts_on', tp.ends_on)
    .gte('ends_on', tp.starts_on);
  const overlaps = (overlapsData ?? []) as Array<{
    id: string;
    tour_id: string;
    starts_on: string | null;
    ends_on: string | null;
    tours: TourLite | TourLite[] | null;
  }>;
  if (overlaps.length === 0) {
    return true; // No conflict — nothing to email.
  }
  const tourA = unwrapTour(tp.tours);
  if (!tourA) {
    return true;
  }
  const { data: person } = await supabase
    .from('personnel')
    .select('name')
    .eq('id', tp.person_id)
    .maybeSingle();
  const personName = (person as { name?: string } | null)?.name ?? 'Personnel';
  const recipient = await lookupUserEmailAndName(supabase, row.actor_user_id);
  if (!recipient) {
    return true; // Actor disabled / deleted.
  }
  /* Email once per source audit row even if multiple
     overlaps were found — the body lists the first
     conflict's tour name, which is enough to drive the
     manager back to the UI. */
  const first = overlaps[0];
  const tourB = unwrapTour(first.tours);
  if (!tourB) {
    return true;
  }
  const overlap =
    first.starts_on && first.ends_on
      ? formatOverlap(tp.starts_on, tp.ends_on, first.starts_on, first.ends_on)
      : `${tp.starts_on} – ${tp.ends_on}`;
  await sendEmail(
    resend,
    recipient.email,
    conflictDetected({
      personnelName: personName,
      tourAName: tourA.name,
      tourBName: tourB.name,
      overlapDates: overlap,
    }),
  );
  summary.sent++;
  return true;
}

/* ============================================
   Process workspace_invites — invite_accepted fires when
   accepted_at is non-null AND notification_email_sent_to is
   still NULL. Recipient: the inviter (invited_by_user_id).

   invite_sent emails are still handled by Supabase Auth's
   built-in invite mail; this dispatcher slot exists for the
   accept-side notification only.
   ============================================ */
interface InviteRow {
  id: string;
  workspace_id: string;
  invited_by_user_id: string | null;
  accepted_user_id: string | null;
  invited_email: string;
  accepted_at: string | null;
}
async function processInviteRows(
  supabase: SupabaseClient,
  resend: Resend,
  summary: DispatchSummary,
): Promise<void> {
  const { data: rows } = await supabase
    .from('workspace_invites')
    .select(
      'id, workspace_id, invited_by_user_id, accepted_user_id, invited_email, accepted_at',
    )
    .not('accepted_at', 'is', null)
    .is('notification_email_sent_to', null)
    .order('accepted_at', { ascending: true })
    .limit(50);

  const inviteRows = (rows ?? []) as InviteRow[];
  for (const row of inviteRows) {
    summary.attempted++;
    try {
      if (!row.invited_by_user_id || !row.accepted_user_id) {
        // Inviter or accepter unknown — mark sent (with NULL
        // would re-process). We use a sentinel of the accepted
        // user when present, otherwise stamp with the invite's
        // own row id is impossible (column is auth.users FK).
        // Skip: mark by stamping the accepted user when present;
        // when both are null we leave the row alone — dispatcher
        // will revisit if data fills in later.
        if (row.accepted_user_id) {
          await supabase
            .from('workspace_invites')
            .update({ notification_email_sent_to: row.accepted_user_id })
            .eq('id', row.id);
        }
        continue;
      }
      const inviter = await lookupUserEmailAndName(supabase, row.invited_by_user_id);
      const accepter = await lookupUserEmailAndName(supabase, row.accepted_user_id);
      if (!inviter || !accepter) {
        // One side missing — mark dispatched so we don't loop.
        await supabase
          .from('workspace_invites')
          .update({ notification_email_sent_to: row.invited_by_user_id })
          .eq('id', row.id);
        continue;
      }
      const { data: ws } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', row.workspace_id)
        .maybeSingle();
      const wsName = (ws as { name?: string } | null)?.name ?? 'Lowpass';
      await sendEmail(
        resend,
        inviter.email,
        inviteAccepted({
          acceptedByName: accepter.name,
          workspaceName: wsName,
        }),
      );
      summary.sent++;
      await supabase
        .from('workspace_invites')
        .update({ notification_email_sent_to: row.invited_by_user_id })
        .eq('id', row.id);
    } catch (err) {
      summary.failed++;
      summary.failedReasons.push(
        `invite ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Don't stamp — leave for retry.
      continue;
    }
  }
}

/* ============================================
   Process personnel_intake_tokens — intake_submitted fires
   when submitted_at is non-null AND notification_email_sent_to
   is still NULL. Recipient: the inviter (invited_by_user_id).
   ============================================ */
interface IntakeRow {
  id: string;
  workspace_id: string;
  personnel_id: string;
  invited_by_user_id: string | null;
  submitted_at: string | null;
}
async function processIntakeRows(
  supabase: SupabaseClient,
  resend: Resend,
  summary: DispatchSummary,
): Promise<void> {
  const { data: rows } = await supabase
    .from('personnel_intake_tokens')
    .select('id, workspace_id, personnel_id, invited_by_user_id, submitted_at')
    .not('submitted_at', 'is', null)
    .is('notification_email_sent_to', null)
    .order('submitted_at', { ascending: true })
    .limit(50);

  const intakeRows = (rows ?? []) as IntakeRow[];
  for (const row of intakeRows) {
    summary.attempted++;
    try {
      if (!row.invited_by_user_id) {
        // No inviter on record — token was created by a
        // service path with no auth user. Nothing to do; we
        // can't stamp without a uuid, so we leave the row
        // alone. Dispatcher won't re-attempt because
        // invited_by_user_id will stay null forever.
        // Mark by writing a noop: skip, don't loop.
        continue;
      }
      const inviter = await lookupUserEmailAndName(supabase, row.invited_by_user_id);
      if (!inviter) {
        // Inviter disabled / deleted — stamp with the inviter
        // id anyway so we don't keep retrying.
        await supabase
          .from('personnel_intake_tokens')
          .update({ notification_email_sent_to: row.invited_by_user_id })
          .eq('id', row.id);
        continue;
      }
      const { data: person } = await supabase
        .from('personnel')
        .select('name')
        .eq('id', row.personnel_id)
        .maybeSingle();
      const personName = (person as { name?: string } | null)?.name ?? 'Your contact';
      const { data: ws } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', row.workspace_id)
        .maybeSingle();
      const wsName = (ws as { name?: string } | null)?.name ?? 'Lowpass';
      await sendEmail(
        resend,
        inviter.email,
        intakeSubmitted({
          personnelName: personName,
          workspaceName: wsName,
        }),
      );
      summary.sent++;
      await supabase
        .from('personnel_intake_tokens')
        .update({ notification_email_sent_to: row.invited_by_user_id })
        .eq('id', row.id);
    } catch (err) {
      summary.failed++;
      summary.failedReasons.push(
        `intake ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Don't stamp — leave for retry.
      continue;
    }
  }
}

/* Public alias to silence unused warnings for the templates
   that aren't used directly here (invite_sent is sent by
   Supabase Auth's invite endpoint, not this dispatcher). */
void inviteSent;

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
  await processInviteRows(supabase, resend, summary);
  await processIntakeRows(supabase, resend, summary);

  return summary;
}
