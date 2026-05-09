/* ============================================
   LOWPASS — POST /api/admin/notifications/test-send
   (Sprint 10 §4.2 — manual cron trigger)

   Site-admin-only manual trigger for the dispatcher. Lets
   Adam fire a dispatch from /admin/audit without waiting for
   the 5-minute cron + without exposing the cron endpoint.

   Returns the same DispatchSummary shape as the cron route.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  adminErrorResponse,
  createServiceSupabaseAdminClient,
  requireSiteAdmin,
} from '@/lib/supabase-admin';
import { dispatchPendingNotifications } from '@/lib/notifications/dispatcher';

export async function POST(): Promise<NextResponse> {
  const userClient = await createServerSupabaseClient();
  try {
    await requireSiteAdmin(userClient);
  } catch (err) {
    const { status, message } = adminErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
  try {
    const service = createServiceSupabaseAdminClient();
    const summary = await dispatchPendingNotifications(service);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
