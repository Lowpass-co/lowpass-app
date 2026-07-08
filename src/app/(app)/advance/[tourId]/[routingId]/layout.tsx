/* ============================================================
   LOWPASS — Advance per-show layout (P3 · B1)

   Mounts the Build / Advance / Share segmented switcher above every per-show
   surface so all three are reachable from one control. The switcher is a client
   component (pathname/searchParams-aware); this server layout just threads the
   route params to it.
   ============================================================ */

import type { ReactNode } from 'react';
import { AdvanceModeSwitcher } from '@/components/advance/AdvanceModeSwitcher';

export default async function AdvanceShowLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string; routingId: string }>;
}) {
  const { tourId, routingId } = await params;
  return (
    <>
      <AdvanceModeSwitcher tourId={tourId} routingId={routingId} />
      {children}
    </>
  );
}
