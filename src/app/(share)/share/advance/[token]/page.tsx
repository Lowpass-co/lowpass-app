/* ============================================
   LOWPASS — Public Advance Share (UX17 §5)

   Read-only token-gated advance view. No PageShell — uses the dedicated
   (share)/layout.tsx (workspace logo + tour name only). EntityChip is
   neutered (no slide-overs, no entity routing) inside AdvanceShowReadView
   when publicReadOnly is true — that's the security boundary preventing
   public viewers from querying other workspace entities.

   Wrapped in <DocumentCanvas mode="prose" editable={false}> for the same
   prose chrome the logged-in advance gets, but with editing disabled.
   ============================================ */

import { notFound } from 'next/navigation';

import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { verifyAdvanceShareToken } from '@/lib/advance/publicShareToken';
import { getAdvanceBundleJson } from '@/server/advance/getAdvanceBundle';
import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { DocumentCanvas } from '@/components/document/DocumentCanvas';

const ADVANCE_SECTIONS = [
  { id: 'advance-overview', label: 'Overview' },
  { id: 'advance-travel', label: 'Travel' },
  { id: 'advance-hotel', label: 'Hotel' },
  { id: 'advance-venue', label: 'Venue' },
  { id: 'advance-schedule', label: 'Schedule' },
  { id: 'advance-tech', label: 'Tech' },
  { id: 'advance-catering', label: 'Catering' },
  { id: 'advance-settlement', label: 'Settlement' },
];

export const dynamic = 'force-dynamic';

export default async function ShareAdvancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;

  let supabase;
  try {
    supabase = createServiceSupabaseClient();
  } catch {
    notFound();
  }

  const verified = verifyAdvanceShareToken(decodeURIComponent(rawToken));
  if (!verified) notFound();

  const bundle = await getAdvanceBundleJson(supabase, verified.tourId, verified.routingId);
  if (!bundle) notFound();

  return (
    <DocumentCanvas
      mode="prose"
      sections={ADVANCE_SECTIONS}
      editable={false}
      maxHeight="calc(100vh - var(--lp-page-header-h, 64px))"
    >
      <AdvanceShowReadView
        tourId={verified.tourId}
        routingId={verified.routingId}
        publicReadOnly
        serverInitialJson={bundle as unknown}
      />
    </DocumentCanvas>
  );
}
