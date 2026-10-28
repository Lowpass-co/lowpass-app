/* ============================================
   LOWPASS — Advance · one show (Oct 2026 rebuild)

   /advance/[tourId]/[routingId] — the show's advance, read and answered in
   place, with the tour's shows down the side. Opening it writes nothing; the
   first answer / customisation / request starts it from its template.
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadAdvanceBoard } from '@/server/advance/board';
import { loadAdvanceShow } from '@/server/advance/show';
import { AdvanceShowPage, type RailShow } from '@/components/advance/AdvanceShowPage';

export const dynamic = 'force-dynamic';

export default async function AdvanceShowRoute({ params }: { params: Promise<{ tourId: string; routingId: string }> }) {
  const { tourId, routingId } = await params;
  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const [show, board] = await Promise.all([loadAdvanceShow(supabase, tourId, routingId), loadAdvanceBoard(supabase, tourId)]);
  if (!show || !board) notFound();
  const rail: RailShow[] = board.rows.flatMap((r) =>
    r.kind === 'show'
      ? [{
          routingId: r.routingId,
          date: r.date,
          venue: r.venue ?? r.city,
          state: r.toReview > 0 ? 'review' : r.request.kind === 'done' ? 'done' : r.request.kind === 'sent' || r.request.kind === 'opened' ? 'waiting' : 'none',
        } satisfies RailShow]
      : [],
  );
  return <AdvanceShowPage show={show} rail={rail} templates={board.templates} />;
}
