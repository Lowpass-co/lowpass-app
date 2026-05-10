/* ============================================
   LOWPASS — POST/GET /api/cron/dispatch-notifications
   (Sprint 10 §4.2)

   Vercel cron endpoint. Runs every 5 minutes (configured in
   vercel.json). Dispatches the next batch of un-notified
   audit_log rows via Resend.

   Authorization: Vercel Cron sends the configured
   CRON_SECRET in the Authorization header. We require it
   on the POST/GET path so a public attacker can't drain the
   queue by hammering the endpoint. In dev, both POST + GET
   work; in prod, set CRON_SECRET in Vercel env.

   Returns the dispatch summary as JSON for cron logs.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { dispatchPendingNotifications } from '@/lib/notifications/dispatcher';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    /* No secret configured — local dev. Allow. Production
       Vercel deploys MUST set CRON_SECRET. */
    return true;
  }
  const header = request.headers.get('authorization');
  return header === `Bearer ${expected}`;
}

async function run(): Promise<NextResponse> {
  try {
    const supabase = createServiceSupabaseClient();
    const summary = await dispatchPendingNotifications(supabase);
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
