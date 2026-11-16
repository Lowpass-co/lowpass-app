/* /crew/[tourId]/[routingId] — one show day on a phone: where, the advance
   info (read-only), and the parking map. Everything read through the
   Member's own access; sections they can't open simply aren't there. */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getRequestViewerAccess } from '@/lib/server/requestContext';
import { viewerCan } from '@/lib/permissions/tourAccess';
import { loadAdvanceShow } from '@/server/advance/show';
import { loadCrewParking } from '@/server/crew/load';
import { answerText, dayLabel } from '@/components/crew/format';
import { dayTypeLabel } from '@/components/advance/format';
import { PublicParkingView } from '@/components/parking/PublicParkingView';
import { ROUTING_VENUE_SELECT } from '@/server/advance/board';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import '@/components/crew/crew.css';

export const dynamic = 'force-dynamic';

export default async function CrewDay({ params, searchParams }: {
  params: Promise<{ tourId: string; routingId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { tourId, routingId } = await params;
  const { view } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/crew/${tourId}/${routingId}`);
  const access = await getRequestViewerAccess(tourId);

  const [{ data: tour }, { data: row }] = await Promise.all([
    supabase.from('tours').select('id, name, workspace_id').eq('id', tourId).maybeSingle(),
    supabase.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('id', routingId).eq('tour_id', tourId).maybeSingle(),
  ]);
  if (!tour || !row) notFound();
  const t = tour as { id: string; name: string; workspace_id: string };
  const r = row as unknown as RoutingVenueSource & { id: string; date: string; day_type: string | null; city: string | null };
  const venue = resolveVenue(r);

  /* The parking map gets the whole screen: ?view=parking. */
  if (view === 'parking' && viewerCan(access, 'parking')) {
    const payload = await loadCrewParking(supabase, t.workspace_id, tourId, routingId);
    if (!payload) notFound();
    return (
      <>
        <div className="crew" style={{ paddingBottom: 0 }}>
          <Link href={`/crew/${tourId}/${routingId}`} className="crew-back">
            ← {dayLabel(r.date)}
          </Link>
        </div>
        <PublicParkingView initial={payload} />
      </>
    );
  }

  const [advance, { data: map }] = await Promise.all([
    viewerCan(access, 'advance') ? loadAdvanceShow(supabase, tourId, routingId) : Promise.resolve(null),
    viewerCan(access, 'parking')
      ? supabase.from('parking_maps').select('routing_id').eq('routing_id', routingId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sections = (advance?.sections ?? [])
    .filter((s) => !s.tm_only)
    .map((s) => ({
      label: s.label,
      rows: s.fields
        .map((f) => ({ id: f.id, label: f.label, text: answerText(advance?.data?.[s.template_id]?.[f.id]) }))
        .filter((x): x is { id: string; label: string; text: string } => !!x.text),
    }))
    .filter((s) => s.rows.length > 0);

  const where = [venue.name, venue.city ?? r.city].filter(Boolean).join(' · ');

  return (
    <main className="crew">
      <div className="crew-top">
        <Link href={`/crew/${tourId}`} className="crew-back">
          ← {t.name}
        </Link>
      </div>
      <h1 className="crew-title">{dayLabel(r.date)}</h1>
      <div className="crew-sub">
        {where || dayTypeLabel(r.day_type ?? 'show')}
        {r.day_type && r.day_type !== 'show' && where ? ` · ${dayTypeLabel(r.day_type)}` : ''}
      </div>

      {venue.address || venue.phone ? (
        <>
          <div className="crew-h2">Venue</div>
          {venue.address ? (
            <a className="crew-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.name, venue.address].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">
              {venue.address}
            </a>
          ) : null}
          {venue.phone ? (
            <a className="crew-btn" href={`tel:${venue.phone.replace(/\s+/g, '')}`}>
              Call {venue.phone}
            </a>
          ) : null}
        </>
      ) : null}

      {map ? (
        <a className="crew-btn crew-btn-primary" href={`/crew/${tourId}/${routingId}?view=parking`}>
          Parking map
        </a>
      ) : null}

      {viewerCan(access, 'advance') ? (
        sections.length ? (
          sections.map((s) => (
            <section key={s.label}>
              <div className="crew-h2">{s.label}</div>
              {s.rows.map((f) => (
                <div key={f.id} className="crew-field">
                  <div className="crew-field-label">{f.label}</div>
                  <div className="crew-field-value">{f.text}</div>
                </div>
              ))}
            </section>
          ))
        ) : (
          <p className="crew-empty">Nothing advanced for this day yet.</p>
        )
      ) : null}
    </main>
  );
}
