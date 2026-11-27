/* ============================================
   LOWPASS — Riders: the notify email — pure

   Lowpass never emails venues (the advance's rule): it writes the email, the
   TM sends it from their own inbox, and Lowpass records that it was sent.
   One email per show — the show's own link, the version, what changed.
   ============================================ */

import { fmtDay } from './blocks';
import { changeLine } from './summary';
import type { RiderChange } from './types';

export interface NotifyInput {
  artist: string | null;
  version: string;
  publishedAt: string;
  venue: string | null;
  city: string | null;
  date: string;
  link: string;
  changes: readonly RiderChange[];
  note: string | null;
  recipientName: string | null;
  senderName: string | null;
  /** First time this show is sent the rider (no "what changed"). */
  first: boolean;
}

export function notifyEmail(i: NotifyInput): { subject: string; body: string } {
  const who = i.artist ? `${i.artist} ` : '';
  const where = [i.venue, i.city].filter(Boolean).join(', ') || 'your show';
  const day = fmtDay(i.date, true);
  const subject = i.first ? `${who}rider — ${where}, ${day}` : `${who}rider updated to v${i.version} — ${where}, ${day}`;
  const first = (i.recipientName ?? '').trim().split(/\s+/)[0];
  const lines: string[] = [`Hi${first ? ` ${first}` : ''},`, ''];
  if (i.first) {
    lines.push(`Here’s the ${who}rider for ${where} on ${day} (version ${i.version}).`, '');
  } else {
    lines.push(`The ${who}rider is now version ${i.version} (${fmtDay(i.publishedAt.slice(0, 10), true)}).`, '');
    if (i.note?.trim()) lines.push(i.note.trim(), '');
    const shown = i.changes.slice(0, 12);
    if (shown.length) {
      lines.push('What changed:');
      for (const c of shown) lines.push(`• ${changeLine(c)}`);
      if (i.changes.length > shown.length) lines.push(`• …and ${i.changes.length - shown.length} more on the page`);
      lines.push('');
    }
  }
  lines.push(
    'This link always shows the current version for your show, with a dated PDF to download:',
    i.link,
    '',
    'Please acknowledge on the page once you’ve read it — and reply on any line you can’t do, so we can sort it in advance.',
    '',
    'Thanks,',
    i.senderName?.trim() || '',
  );
  return { subject, body: lines.join('\n').trimEnd() };
}

export function gmailUrl(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
