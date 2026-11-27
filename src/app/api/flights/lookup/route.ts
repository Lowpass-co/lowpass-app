/* ============================================
   POST /api/flights/lookup  { flight: "BA117", date: "2026-12-01" }
   (Nov 2026, Adam) — fill a flight in from its number + date.

   Who: anyone who can ADD flights on this tour (Logistics edit — admin /
   manager / its Tour manager / a Member with Logistics edit). Read-only crew
   can't spend the month's searches. The cost is guarded in
   src/server/flights/lookup.ts (cache, plan window, monthly cap in the
   database). 503 NOT_CONFIGURED until AVIATIONSTACK_KEY is set.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { ISO_DATE, normaliseFlightNumber } from '@/lib/flights/lookup';
import { lookupConfig, lookupFlight } from '@/server/flights/lookup';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = {
  NOT_CONFIGURED: 503,
  OUT_OF_RANGE: 422,
  CAP_REACHED: 429,
  NOT_FOUND: 404,
  PROVIDER_ERROR: 502,
  BUSY: 409,
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const body = (await request.json().catch(() => null)) as { flight?: unknown; date?: unknown; tourId?: unknown } | null;
  const tourId = typeof body?.tourId === 'string' ? body.tourId : null;
  const auth = await requireWrite(supabase, { area: 'logistics', tourId });
  if ('error' in auth) return auth.error;
  const flight = normaliseFlightNumber(typeof body?.flight === 'string' ? body.flight : '');
  const date = typeof body?.date === 'string' ? body.date : '';
  if (!flight) return NextResponse.json({ error: 'That isn’t a flight number (e.g. BA117).', code: 'BAD_FLIGHT' }, { status: 400 });
  if (!ISO_DATE.test(date)) return NextResponse.json({ error: 'Pick the date of the flight.', code: 'BAD_DATE' }, { status: 400 });

  const cfg = lookupConfig();
  if (!cfg.key) return NextResponse.json({ error: 'Flight search isn’t set up yet.', code: 'NOT_CONFIGURED' }, { status: 503 });
  const r = await lookupFlight(createServiceSupabaseClient(), cfg, {
    flightIata: flight,
    flightDate: date,
    workspaceId: auth.workspaceId,
    userId: auth.user.id,
  });
  if (r.ok) return NextResponse.json({ flight: r.flight, cached: r.cached });
  return NextResponse.json({ error: r.message, code: r.code }, { status: STATUS[r.code] ?? 500 });
}
