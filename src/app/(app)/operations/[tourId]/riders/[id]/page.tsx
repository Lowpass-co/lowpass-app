/* ============================================
   LOWPASS — Operations · Rider editor (Riders fix Stage B)

   /operations/[tourId]/riders/[id] — opens a rider pack INSIDE the Operations
   product. Renders the shared <RiderPackEditorView> as INNER content; the
   Operations layout (/operations/[tourId]/layout.tsx) supplies the ProductShell
   + TourHeader, so the editor keeps the SAME shell as the riders LIST (D2).

   This page existing is what makes Open work: the row click pushes here directly,
   AND the legacy /tours/[id]/rider-packs/[packId] → /operations/[id]/riders/[id]
   redirect (next.config.ts) now resolves here instead of 404ing.

   `tourId` is unused for data — the pack row carries its own tour_id; the segment
   only scopes the URL inside Operations.
   ============================================ */

import { RiderPackEditorView } from '@/components/rider-pack/RiderPackEditorView';

export const dynamic = 'force-dynamic';

export default async function OperationsRiderEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string; id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  return <RiderPackEditorView packId={id} mode={mode} standalone={false} />;
}
