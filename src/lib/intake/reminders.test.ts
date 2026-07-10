/* Intake reminders test.
   Run: node --experimental-strip-types src/lib/intake/reminders.test.ts */
import assert from 'node:assert';
import { remindersForShow, dueReminders, type DueRow } from './reminders.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const DAY = 86_400_000;
const show = '2026-06-01';
const showMs = new Date('2026-06-01T12:00:00Z').getTime();

// 1. A link created 30 days out seeds all three (t14/t7/t3), dated show − N days.
{
  const seeds = remindersForShow(show, showMs - 30 * DAY);
  check('three seeds when far out', seeds.length === 3);
  const t7 = seeds.find((s) => s.kind === 't7');
  check('t7 send_at = show − 7d', !!t7 && Math.abs(new Date(t7!.send_at).getTime() - (showMs - 7 * DAY)) < DAY);
}

// 2. A link created inside the window skips already-overdue reminders.
{
  const seeds = remindersForShow(show, showMs - 5 * DAY); // 5 days out → only t3 is future
  check('only future reminders seeded', seeds.length === 1 && seeds[0].kind === 't3');
}

// 3. dueReminders selects DUE + UNSENT only.
{
  const rows: DueRow[] = [
    { id: 'a', kind: 't14', send_at: new Date(showMs - 14 * DAY).toISOString(), sent_at: null },
    { id: 'b', kind: 't7', send_at: new Date(showMs - 7 * DAY).toISOString(), sent_at: null },
    { id: 'c', kind: 't3', send_at: new Date(showMs - 3 * DAY).toISOString(), sent_at: null },
  ];
  const now = showMs - 8 * DAY; // t14 due, t7/t3 not yet
  const due = dueReminders(rows, now);
  check('only past-due unsent selected', due.length === 1 && due[0].id === 'a');
}

// 4. sent_at GUARD / idempotency — a second run sends NOTHING.
{
  const rows: DueRow[] = [
    { id: 'a', kind: 't14', send_at: new Date(showMs - 14 * DAY).toISOString(), sent_at: null },
    { id: 'b', kind: 't7', send_at: new Date(showMs - 7 * DAY).toISOString(), sent_at: null },
  ];
  const now = showMs; // both due
  // Run 1: pick due, "send", stamp sent_at (models the guarded UPDATE ... WHERE sent_at IS NULL).
  const run1 = dueReminders(rows, now);
  check('run 1 sends both', run1.length === 2);
  for (const r of run1) {
    const row = rows.find((x) => x.id === r.id)!;
    if (row.sent_at == null) row.sent_at = new Date(now).toISOString(); // claim wins only when null
  }
  // Run 2: all stamped → none selected → no double-send.
  const run2 = dueReminders(rows, now);
  check('run 2 sends nothing (sent_at guard)', run2.length === 0);
}

// 5. No reminders without a show date.
check('no show date → no seeds', remindersForShow(null, Date.now()) .length === 0);

console.log(`reminders.test.ts — ${pass} assertions passed`);
