/* ============================================
   LOWPASS — Public Advance Intake · form schema (T3)

   GET /api/public/advance-intake/[token]

   Token-gated, unauthenticated. Returns the venue-facing form schema
   (derived from the show's advance section templates) + minimal show
   context, plus the link's lifecycle state (pending / submitted /
   revoked / expired). Service-role client, resolved strictly by token
   — no workspace leakage, and the TM's already-entered advance data is
   NEVER returned (only the venue's own prior submission, if any).

   Stamps last_viewed_at best-effort.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import {
  buildIntakeFormSchema,
  type IntakeSection,
  type AdvanceData,
} from '@/lib/advance/intake';

export const dynamic = 'force-dynamic';

interface LinkRow {
  id: string;
  tour_id: string;
  routing_id: string;
  status: string;
  expires_at: string | null;
  revoked_at: string | null;
  recipient_name: string | null;
  submitted_data: AdvanceData | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const service = createServiceSupabaseClient();
  const { data: link } = await service
    .from('advance_intake_links')
    .select(
      'id, tour_id, routing_id, status, expires_at, revoked_at, recipient_name, submitted_data',
    )
    .eq('token', token)
    .maybeSingle<LinkRow>();

  if (!link || link.revoked_at || link.status === 'revoked') {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const expired = !!link.expires_at && new Date(link.expires_at).getTime() < Date.now();

  // Section templates live on the advance instance for this show.
  const { data: instance } = await service
    .from('advance_instances')
    .select('sections')
    .eq('routing_id', link.routing_id)
    .maybeSingle<{ sections: IntakeSection[] | null }>();

  const [{ data: routing }, { data: tour }] = await Promise.all([
    service
      .from('routing')
      .select('date, venue_name, city, address')
      .eq('id', link.routing_id)
      .maybeSingle<{
        date: string | null;
        venue_name: string | null;
        city: string | null;
        address: string | null;
      }>(),
    service
      .from('tours')
      .select('name')
      .eq('id', link.tour_id)
      .maybeSingle<{ name: string | null }>(),
  ]);

  const schema = buildIntakeFormSchema(instance?.sections);

  // Best-effort view stamp.
  try {
    const ipHeader =
      request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
    const ip = ipHeader ? ipHeader.split(',')[0].trim().slice(0, 64) : null;
    await service
      .from('advance_intake_links')
      .update({ last_viewed_at: new Date().toISOString(), last_viewer_ip: ip })
      .eq('id', link.id);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    status: link.status,
    expired,
    show: {
      venueName: routing?.venue_name ?? null,
      city: routing?.city ?? null,
      address: routing?.address ?? null,
      date: routing?.date ?? null,
      tourName: tour?.name ?? null,
    },
    recipientName: link.recipient_name,
    schema,
    // Venue's own prior answers only — never the TM's advance data.
    answers: link.submitted_data ?? {},
  });
}
