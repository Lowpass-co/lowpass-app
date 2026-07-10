/* ============================================================
   LOWPASS — Intake reminders (P7 · Checkpoint E) — the SMALLEST notification
   lane. Pure scheduling + plain-text copy. NOT a general notification system.

   intake_reminders (migration 240): one row per (link × kind). t14/t7/t3 are
   seeded at link creation (send_at = show − N days, future only); 'tm_completed'
   is inserted when the venue finishes. A daily Vercel cron sends any DUE, UNSENT
   row and stamps sent_at — the idempotency guard (a guarded UPDATE ... WHERE
   sent_at IS NULL wins the race, so no double-send). No I/O here.
   ============================================================ */

export type ReminderKind = 't14' | 't7' | 't3' | 'tm_completed';

const VENUE_OFFSET_DAYS: Record<'t14' | 't7' | 't3', number> = { t14: 14, t7: 7, t3: 3 };

export interface ReminderSeed {
  kind: ReminderKind;
  send_at: string;
}

/** The T-14 / T-7 / T-3 venue reminder seeds for a show date. Only send_at values
 *  still in the future (relative to nowMs) are returned — a link created inside
 *  the window skips the reminders that would already be overdue. */
export function remindersForShow(showDate: string | null | undefined, nowMs: number): ReminderSeed[] {
  if (!showDate) return [];
  const show = new Date(`${showDate.slice(0, 10)}T12:00:00Z`).getTime();
  if (Number.isNaN(show)) return [];
  const out: ReminderSeed[] = [];
  for (const kind of ['t14', 't7', 't3'] as const) {
    const at = show - VENUE_OFFSET_DAYS[kind] * 86_400_000;
    if (at > nowMs) out.push({ kind, send_at: new Date(at).toISOString() });
  }
  return out;
}

export interface DueRow {
  id: string;
  kind: ReminderKind;
  send_at: string;
  sent_at: string | null;
}

/** Rows that are DUE (send_at ≤ now) and UNSENT (sent_at IS NULL). The cron's
 *  guarded UPDATE re-checks sent_at at write time, so this is just the pre-scan. */
export function dueReminders(rows: DueRow[], nowMs: number): DueRow[] {
  return rows.filter((r) => r.sent_at == null && new Date(r.send_at).getTime() <= nowMs);
}

const esc = (s: string | null | undefined) => (s ?? '').trim();

/** Plain-text venue reminder — one link, one opt-out link. */
export function venueReminderText(o: {
  venueName?: string | null;
  tourName?: string | null;
  dateLabel?: string | null;
  answered: number;
  total: number;
  link: string;
  optOut: string;
}): { subject: string; text: string } {
  const who = esc(o.tourName) || 'A tour';
  const subject = `Reminder: advance details for ${esc(o.tourName) || 'the show'}${o.dateLabel ? ` (${o.dateLabel})` : ''}`;
  const text =
    `Hi${o.venueName ? ` ${esc(o.venueName)}` : ''},\n\n` +
    `${who} is still waiting on a few advance details${o.dateLabel ? ` for the ${o.dateLabel} show` : ''}. ` +
    `You've answered ${o.answered} of ${o.total} — it takes a couple of minutes and saves as you go:\n\n` +
    `${o.link}\n\n` +
    `You can also upload your tech pack instead of filling the form.\n\n` +
    `Don't want these reminders? Opt out: ${o.optOut}\n\n` +
    `— Sent by Lowpass on behalf of ${who}`;
  return { subject, text };
}

/** Plain-text "venue completed" note to the TM. */
export function tmCompletedText(o: {
  venueName?: string | null;
  tourName?: string | null;
  dateLabel?: string | null;
  link: string;
}): { subject: string; text: string } {
  const venue = esc(o.venueName) || 'The venue';
  const subject = `${venue} completed the advance${o.dateLabel ? ` (${o.dateLabel})` : ''}`;
  const text =
    `${venue} has submitted their advance details${o.dateLabel ? ` for the ${o.dateLabel} show` : ''}.\n\n` +
    `Review their answers here:\n${o.link}\n\n` +
    `— Lowpass`;
  return { subject, text };
}
