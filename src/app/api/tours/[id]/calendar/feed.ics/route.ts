/* ============================================
   LOWPASS — iCal Feed for Tour

   GET: Returns .ics calendar for tour routing.
   Auth: ?token= (calendar_token) OR session. ?download=true adds attachment header.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';

function escapeIcal(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const download = searchParams.get('download') === 'true';

  let tour: { id: string; name: string; start_date: string; end_date: string } | null = null;
  let db: ReturnType<typeof createServiceSupabaseClient> | Awaited<ReturnType<typeof createServerSupabaseClient>>;

  if (token) {
    try {
      db = createServiceSupabaseClient();
      const { data } = await db
        .from('tours')
        .select('id, name, start_date, end_date')
        .eq('calendar_token', token)
        .single();
      tour = data;
    } catch {
      tour = null;
    }
  }

  if (!tour) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const { id: tourId } = await params;
    const { data } = await supabase
      .from('tours')
      .select('id, name, start_date, end_date')
      .eq('id', tourId)
      .single();
    tour = data;
    db = supabase;
  }

  if (!tour) {
    return new NextResponse('Tour not found', { status: 404 });
  }

  const tourId = tour.id;

  const { data: routing } = await db!
    .from('routing')
    .select('date, day_type, city, venue_name, notes')
    .eq('tour_id', tourId)
    .order('date');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lowpass//Tour Calendar//EN',
    'CALSCALE:GREGORIAN',
    'X-PUBLISHED-TTL:PT1H',
    'X-WR-CALNAME:' + escapeIcal(tour.name),
  ];

  for (const r of routing ?? []) {
    const dateStr = r.date.replace(/-/g, '');
    const summary = [r.city, r.venue_name].filter(Boolean).join(' — ') || r.day_type;
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + tourId + '-' + r.date + '@lowpass');
    lines.push('DTSTART;VALUE=DATE:' + dateStr);
    lines.push('DTEND;VALUE=DATE:' + dateStr);
    lines.push('SUMMARY:' + escapeIcal(summary));
    if (r.notes) lines.push('DESCRIPTION:' + escapeIcal(r.notes));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  const ics = lines.join('\r\n');

  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
  };
  if (download) {
    headers['Content-Disposition'] = 'attachment; filename="tour-calendar.ics"';
  }

  return new NextResponse(ics, { headers });
}
