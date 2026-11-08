/* ============================================
   LOWPASS — GET/POST /api/cron/upload-sweep (Nov 2026)

   Daily (vercel.json). Direct uploads are two steps; if the browser never
   calls "finish" (tab closed, connection gone for good), the object sits in
   Storage with no file row. This deletes every object whose grant
   (storage_upload_grants, migration 282) is still open after 24 h, then the
   grant. Finished uploads are never touched.

   Auth mirrors intake-reminders: CRON_SECRET Bearer, fail-closed in prod,
   allowed in local dev. Service-role client (no auth user).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { supabaseGrantStorage, sweepStale } from '@/server/uploads/grants';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

async function run(): Promise<NextResponse> {
  try {
    const service = createServiceSupabaseClient();
    const removed = await sweepStale(service, supabaseGrantStorage(service));
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}
