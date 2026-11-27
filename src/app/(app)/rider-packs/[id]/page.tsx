/* ============================================
   LOWPASS — /rider-packs/[id] — a channel-list document (PackEditor).
   An old rider pack or stage-plot pack redirects to its new home; see
   <RiderPackEditorView>.
   ============================================ */

import { RiderPackEditorView } from '@/components/rider-pack/RiderPackEditorView';

export const dynamic = 'force-dynamic';

export default async function RiderPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RiderPackEditorView packId={id} standalone />;
}
