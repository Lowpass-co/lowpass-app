/* ============================================
   LOWPASS — notification templates (Sprint 10 §4.2)

   Email subject + HTML body templates per dispatch trigger.
   Pure data — no Resend client, no Supabase. The dispatcher
   composes the template with concrete values (workspace name,
   tour name, etc.) and hands the result to Resend.

   Triggers (matches §4.1 spec):

     - assignment_cancelled : tour_personnel.status changed
                              from confirmed → cancelled.
                              Recipient: personnel.user_id (if
                              the personnel row links to an
                              authed user).
     - invite_sent          : workspace_invites row created.
                              Recipient: invited_email.
                              Body includes the accept link.
     - invite_accepted      : an invite was accepted.
                              Recipient: inviter.
     - intake_submitted     : a personnel intake form was
                              submitted. Recipient: token's
                              invited_by_user_id.
     - conflict_detected    : an assignment overlaps another
                              tour. Recipient: managers of
                              both tours.

   Each template returns { subject, html }. HTML is intentionally
   minimal (no full layout) — the dispatcher wraps it in a
   shared shell so brand changes happen in one place.
   ============================================ */

export interface NotificationTemplate {
  subject: string;
  html: string;
}

const ESC_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_LOOKUP[c] ?? c);
}

interface AssignmentCancelledFields {
  personnelName: string;
  tourName: string;
  startDate: string | null;
  endDate: string | null;
  workspaceName: string;
}
export function assignmentCancelled(f: AssignmentCancelledFields): NotificationTemplate {
  const window = f.startDate && f.endDate ? ` (${esc(f.startDate)} – ${esc(f.endDate)})` : '';
  return {
    subject: `Your assignment for ${f.tourName} has been cancelled`,
    html: `
      <p>Hi ${esc(f.personnelName)},</p>
      <p>Your assignment for <strong>${esc(f.tourName)}</strong>${window} has been cancelled by the ${esc(f.workspaceName)} team.</p>
      <p>If this is unexpected, reply to this email or contact your tour manager directly.</p>
      <p>— Lowpass</p>
    `,
  };
}

interface InviteSentFields {
  workspaceName: string;
  inviterName: string;
  inviteUrl: string;
  invitedRole: string;
}
export function inviteSent(f: InviteSentFields): NotificationTemplate {
  return {
    subject: `${f.inviterName} invited you to ${f.workspaceName} on Lowpass`,
    html: `
      <p>You've been invited to join <strong>${esc(f.workspaceName)}</strong> on Lowpass as <strong>${esc(f.invitedRole)}</strong>.</p>
      <p><a href="${esc(f.inviteUrl)}">Accept the invite →</a></p>
      <p>If the link doesn't work, paste this URL into your browser:</p>
      <p><code>${esc(f.inviteUrl)}</code></p>
      <p>This invite expires in 14 days.</p>
    `,
  };
}

interface InviteAcceptedFields {
  acceptedByName: string;
  workspaceName: string;
}
export function inviteAccepted(f: InviteAcceptedFields): NotificationTemplate {
  return {
    subject: `${f.acceptedByName} accepted your invite to ${f.workspaceName}`,
    html: `
      <p><strong>${esc(f.acceptedByName)}</strong> accepted your invitation and is now a member of <strong>${esc(f.workspaceName)}</strong>.</p>
      <p>You can manage their role and permissions from the Members panel in Settings.</p>
    `,
  };
}

interface IntakeSubmittedFields {
  personnelName: string;
  workspaceName: string;
}
export function intakeSubmitted(f: IntakeSubmittedFields): NotificationTemplate {
  return {
    subject: `${f.personnelName} filled in their intake form`,
    html: `
      <p><strong>${esc(f.personnelName)}</strong> has filled in their intake form for ${esc(f.workspaceName)}.</p>
      <p>Their passport, emergency contact, and touring extras are now on file. Review and edit from the Personnel page.</p>
    `,
  };
}

interface ConflictDetectedFields {
  personnelName: string;
  tourAName: string;
  tourBName: string;
  overlapDates: string;
}
export function conflictDetected(f: ConflictDetectedFields): NotificationTemplate {
  return {
    subject: `${f.personnelName} is double-booked`,
    html: `
      <p><strong>${esc(f.personnelName)}</strong> has been assigned to overlapping tours:</p>
      <ul>
        <li>${esc(f.tourAName)}</li>
        <li>${esc(f.tourBName)}</li>
      </ul>
      <p>Overlap: ${esc(f.overlapDates)}.</p>
      <p>One of the assignments needs to change before the dates conflict.</p>
    `,
  };
}

export function wrapShell(content: string): string {
  /* Minimal email shell. Inline styles only — most email
     clients strip <head><style>. Width capped at 540 because
     Outlook + Gmail max layout widths sit there. */
  return `
    <html>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;padding:24px 0;">
          <tr>
            <td align="center">
              <table cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;padding:24px;">
                <tr><td style="font-size:14px;line-height:1.5;color:#111;">
                  ${content}
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
