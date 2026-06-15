/* ============================================
   LOWPASS — Rider · Per-pack page (§RA12)

   /rider-packs/[id] — the standalone rider editor. The body lives in the shared
   <RiderPackEditorView> (also used by /operations/[tourId]/riders/[id]); this
   route wraps it in its own shell (standalone). ?mode=edit → builder.
   ============================================ */

import { RiderPackEditorView } from '@/components/rider-pack/RiderPackEditorView';

export const dynamic = 'force-dynamic';

export default async function RiderPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  return <RiderPackEditorView packId={id} mode={mode} standalone />;
}
