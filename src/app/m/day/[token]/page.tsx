/* ============================================
   LOWPASS — Public tokenized Day  ·  /m/day/[token]  (D1-4)

   OUTSIDE the (app) auth shell — a per-person, role-scoped mobile Day reached by
   an opaque link (no signup), exactly like advance-intake/[token]. The token is
   resolved by the SERVICE-ROLE client (never RLS); the viewer's role drives the
   server-side slice, so a crew link's HTML carries NO money and NO internal note
   (they were never fetched). A revoked/expired/missing token 404s (ROLE-03).

   ?d=YYYY-MM-DD selects a day; default = today's show, else next, else last.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { resolveDayToken, pickDayRouting } from '@/lib/roles/token';
import { loadDay } from '@/lib/day/loadDay';
import { DayLayout, type RailDay } from '@/components/day/DayLayout';

export const dynamic = 'force-dynamic';

interface TokenDayPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ d?: string }>;
}

export default async function TokenDayPage({ params, searchParams }: TokenDayPageProps) {
  const { token } = await params;
  const { d } = await searchParams;
  const service = createServiceSupabaseClient();

  const resolved = await resolveDayToken(service, token);
  if (!resolved.ok) notFound(); // missing / revoked / expired

  const { role, tourId, workspaceId } = resolved;
  const today = new Date().toISOString().slice(0, 10);

  // Which show? explicit ?d= (validated against the tour's routing), else today/next/last.
  const { data: routingRows } = await service
    .from('routing')
    .select('id, date, day_type, city, venue_name')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  const rows = (routingRows ?? []) as Array<{ id: string; date: string | null; day_type: string | null; city: string | null; venue_name: string | null }>;
  let routingId: string | null = null;
  if (d) routingId = rows.find((r) => (r.date ?? '').slice(0, 10) === d)?.id ?? null;
  if (!routingId) routingId = pickDayRouting(rows, today);
  if (!routingId) notFound();

  // Touch last_viewed_at (best-effort; service-role write, token-scoped).
  await service.from('tour_role_links').update({ last_viewed_at: new Date().toISOString() }).eq('id', resolved.linkId);

  const day = await loadDay(service, { tourId, routingId, workspaceId, role, today });
  if (!day) notFound();

  // Rail: same tour days, switching via ?d= on the same token (no editHref /
  // routingHref / advanceHref — the crew/token view is read-only, no app links).
  const railDays: RailDay[] = rows.map((r) => ({
    routingId: r.id,
    date: r.date,
    dayType: r.day_type,
    city: r.city,
    venue: r.venue_name,
    href: `/m/day/${token}?d=${(r.date ?? '').slice(0, 10)}`,
  }));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 48px' }}>
      <DayLayout day={day} railDays={railDays} today={today} />
      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--lp-text-tertiary, #999)', textAlign: 'center' }}>
        Lowpass · shared day sheet · read-only
      </p>
    </div>
  );
}
