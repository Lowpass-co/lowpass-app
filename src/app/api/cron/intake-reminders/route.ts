/* ============================================
   LOWPASS — POST/GET /api/cron/intake-reminders (P7 · Checkpoint E)

   Vercel cron endpoint. Runs daily (configured in vercel.json).
   Scans intake_reminders for DUE + UNSENT rows and sends each once:
     - t14/t7/t3 → the venue contact, only while the intake is live
       (not revoked/expired) AND < 100% answered,
     - tm_completed → the TM, one "venue finished" note.

   Idempotency: dispatchDueIntakeReminders claims each row with a
   guarded UPDATE … WHERE sent_at IS NULL before sending, so a second
   run (or a concurrent worker) sends nothing. Auth mirrors
   dispatch-notifications: CRON_SECRET Bearer, fail-closed in prod,
   allowed in local dev. Service-role client (no auth user).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { dispatchDueIntakeReminders } from '@/lib/intake/reminders-server';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed in production; only local dev runs without a secret.
    return process.env.NODE_ENV !== 'production';
  }
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

async function run(): Promise<NextResponse> {
  try {
    const service = createServiceSupabaseClient();
    const summary = await dispatchDueIntakeReminders(service);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}
