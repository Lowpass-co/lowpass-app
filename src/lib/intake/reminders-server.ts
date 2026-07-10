/* ============================================================
   LOWPASS — Intake reminders · server dispatch (P7 · Checkpoint E)

   The DB + email side of the smallest-possible intake reminder lane.
   Pure scheduling/copy lives in ./reminders.ts; this file does I/O.

   seedShowReminders()  — called at link creation. Inserts the future
                          t14/t7/t3 rows (send_at = show − N days).
   markVenueCompleted() — called on final (non-draft) submit. Inserts a
                          tm_completed row (send_at = now) so the SAME cron
                          + SAME sent_at guard sends the TM its one email.
   dispatchDueIntakeReminders() — the cron body. Claim-then-send:
     1. pre-scan DUE + UNSENT rows,
     2. CLAIM each via UPDATE … WHERE id = X AND sent_at IS NULL (the
        atomic guard — only one runner wins; a second run claims nothing),
     3. send after claiming. A claimed row is resolved even if we decide
        NOT to send (revoked / expired / already complete / opted-out) —
        it simply won't fire again. Claim-first means we may drop a
        reminder on a send failure, which is the correct trade for the
        hard NO-DOUBLE-SEND requirement.

   Opt-out is modelled without a schema change: the per-link opt-out route
   DELETEs a link's remaining UNSENT reminder rows (see the opt-out route).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildIntakeFormSchema, type IntakeSection, type IntakeFormSchema } from '@/lib/advance/intake';
import {
  remindersForShow,
  dueReminders,
  venueReminderText,
  tmCompletedText,
  type DueRow,
} from './reminders';

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'Lowpass <notifications@lowpass.co>';

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  ).replace(/\/$/, '');
}

const intakeUrl = (token: string) => `${baseUrl()}/advance-intake/${token}`;
const optOutUrl = (token: string) => `${baseUrl()}/api/public/intake-reminders/${token}/opt-out`;
const reviewUrl = (tourId: string, routingId: string) => `${baseUrl()}/advance/${tourId}/${routingId}`;

function dateLabel(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* ── Seed t14/t7/t3 at link creation ─────────────────────── */
export async function seedShowReminders(
  service: SupabaseClient,
  args: { linkId: string; workspaceId: string; showDate: string | null; nowMs?: number },
): Promise<number> {
  const seeds = remindersForShow(args.showDate, args.nowMs ?? Date.now());
  if (seeds.length === 0) return 0;
  const rows = seeds.map((s) => ({
    workspace_id: args.workspaceId,
    link_id: args.linkId,
    kind: s.kind,
    send_at: s.send_at,
  }));
  // UNIQUE(link_id, kind) → a re-seed is a no-op.
  const { error } = await service.from('intake_reminders').upsert(rows, { onConflict: 'link_id,kind' });
  return error ? 0 : rows.length;
}

/* ── tm_completed row on final submit ────────────────────── */
export async function markVenueCompleted(
  service: SupabaseClient,
  args: { linkId: string; workspaceId: string; nowIso: string },
): Promise<void> {
  await service.from('intake_reminders').upsert(
    { workspace_id: args.workspaceId, link_id: args.linkId, kind: 'tm_completed', send_at: args.nowIso },
    { onConflict: 'link_id,kind' },
  );
}

export interface DispatchSummary {
  scanned: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: string[];
}

interface LinkRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  advance_instance_id: string | null;
  token: string;
  status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  created_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

async function answeredRatio(
  service: SupabaseClient,
  instanceId: string | null,
  routingId: string,
): Promise<{ answered: number; total: number }> {
  let q = service.from('advance_instances').select('id, sections');
  q = instanceId ? q.eq('id', instanceId) : q.eq('routing_id', routingId);
  const { data: inst } = await q.maybeSingle<{ id: string; sections: IntakeSection[] | null }>();
  if (!inst) return { answered: 0, total: 0 };
  const schema: IntakeFormSchema = buildIntakeFormSchema(inst.sections);
  const total = schema.sections.reduce((n, s) => n + s.fields.length, 0);
  const { data: pend } = await service
    .from('intake_pending_answers')
    .select('section_id, field_id')
    .eq('advance_instance_id', inst.id)
    .neq('status', 'rejected');
  const seen = new Set((pend ?? []).map((r) => `${r.section_id}::${r.field_id}`));
  return { answered: seen.size, total };
}

/**
 * The cron body. Claim-then-send with the sent_at guard. Pass `nowMs` +
 * `send` (an injected sender) in tests; production uses Resend + real time.
 */
export async function dispatchDueIntakeReminders(
  service: SupabaseClient,
  opts?: {
    nowMs?: number;
    limit?: number;
    send?: (to: string, subject: string, text: string) => Promise<void>;
  },
): Promise<DispatchSummary> {
  const now = opts?.nowMs ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const limit = opts?.limit ?? 200;
  const summary: DispatchSummary = { scanned: 0, claimed: 0, sent: 0, skipped: 0, failed: 0, reasons: [] };

  // A sender: injected (tests) or Resend plain-text. No key → send nothing,
  // and (critically) claim nothing, so reminders survive until configured.
  let send = opts?.send;
  if (!send) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      summary.reasons.push('RESEND_API_KEY not set — nothing claimed or sent');
      return summary;
    }
    const resend = new Resend(key);
    send = async (to, subject, text) => {
      const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, text });
      if (error) throw new Error(error.message ?? 'Resend error');
    };
  }

  // 1. Pre-scan due + unsent (partial index intake_reminders_due_idx).
  const { data: rows } = await service
    .from('intake_reminders')
    .select('id, link_id, kind, send_at, sent_at')
    .is('sent_at', null)
    .lte('send_at', nowIso)
    .order('send_at', { ascending: true })
    .limit(limit);
  const due = dueReminders((rows ?? []) as DueRow[], now);
  summary.scanned = due.length;

  for (const r of due) {
    // 2. CLAIM — the atomic guard. Only the runner whose UPDATE matches the
    //    still-NULL sent_at wins; concurrent/second runs get no row back.
    const { data: claimed } = await service
      .from('intake_reminders')
      .update({ sent_at: nowIso })
      .eq('id', r.id)
      .is('sent_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) {
      summary.skipped++;
      continue;
    }
    summary.claimed++;

    // 3. Resolve the link and send (or resolve silently).
    const { data: link } = await service
      .from('advance_intake_links')
      .select(
        'id, workspace_id, tour_id, routing_id, advance_instance_id, token, status, recipient_name, recipient_email, created_by, expires_at, revoked_at',
      )
      .eq('id', (r as DueRow & { link_id: string }).link_id)
      .maybeSingle<LinkRow>();
    if (!link) {
      summary.skipped++;
      continue;
    }

    try {
      if (r.kind === 'tm_completed') {
        // One "venue completed" email to the TM (the link creator).
        if (!link.created_by) {
          summary.skipped++;
          continue;
        }
        const { data: u } = await service.auth.admin.getUserById(link.created_by);
        const tmEmail = u?.user?.email;
        if (!tmEmail) {
          summary.skipped++;
          continue;
        }
        const { data: routing } = await service
          .from('routing')
          .select('date, venue_name, city')
          .eq('id', link.routing_id)
          .maybeSingle<{ date: string | null; venue_name: string | null; city: string | null }>();
        const { subject, text } = tmCompletedText({
          venueName: routing?.venue_name ?? routing?.city ?? link.recipient_name,
          dateLabel: dateLabel(routing?.date),
          link: reviewUrl(link.tour_id, link.routing_id),
        });
        await send(tmEmail, subject, text);
        summary.sent++;
        continue;
      }

      // Venue reminder (t14/t7/t3): gate on live/incomplete.
      if (link.revoked_at || link.status === 'revoked' || link.status === 'submitted') {
        summary.skipped++; // resolved: revoked or already finished
        continue;
      }
      if (link.expires_at && new Date(link.expires_at).getTime() < now) {
        summary.skipped++; // don't remind a dead link
        continue;
      }
      if (!link.recipient_email) {
        summary.skipped++;
        continue;
      }
      const { answered, total } = await answeredRatio(service, link.advance_instance_id, link.routing_id);
      if (total > 0 && answered >= total) {
        summary.skipped++; // 100% answered — no reminder needed
        continue;
      }
      const { data: routing } = await service
        .from('routing')
        .select('date, venue_name, city, tour_id')
        .eq('id', link.routing_id)
        .maybeSingle<{ date: string | null; venue_name: string | null; city: string | null; tour_id: string | null }>();
      const { data: tour } = await service
        .from('tours')
        .select('name')
        .eq('id', link.tour_id)
        .maybeSingle<{ name: string | null }>();
      const { subject, text } = venueReminderText({
        venueName: link.recipient_name ?? routing?.venue_name ?? routing?.city,
        tourName: tour?.name,
        dateLabel: dateLabel(routing?.date),
        answered,
        total,
        link: intakeUrl(link.token),
        optOut: optOutUrl(link.token),
      });
      await send(link.recipient_email, subject, text);
      summary.sent++;
    } catch (err) {
      summary.failed++;
      summary.reasons.push(`${r.kind} ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return summary;
}
