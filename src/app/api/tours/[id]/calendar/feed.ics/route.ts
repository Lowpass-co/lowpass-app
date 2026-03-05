/* ============================================
   LOWPASS — iCal Feed for Tour

   GET: Returns .ics calendar for tour routing.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

function escapeIcal(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id: tourId } = await params;
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date')
    .eq('id', tourId)
    .single();

  if (!tour) {
    return new NextResponse('Tour not found', { status: 404 });
  }

  const { data: routing } = await supabase
    .from('routing')
    .select('date, day_type, city, venue_name, notes')
    .eq('tour_id', tourId)
    .order('date');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lowpass//Tour Calendar//EN',
    'CALSCALE:GREGORIAN',
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

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tour-calendar.ics"',
    },
  });
}
