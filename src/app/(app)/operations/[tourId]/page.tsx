/* ============================================
   LOWPASS — tour root redirect (Nov 2026 — tours open on the Overview)

   /operations/[tourId] (and every old /tours/[id] link, via next.config)
   resolves to where a tour opens — tourHomeHref, the same place every time.
   The Overview shows each viewer only the parts they can open, so it is a
   safe landing for every member.
   ============================================ */

import { redirect } from 'next/navigation';
import { tourHomeHref } from '@/lib/nav/ia';

export default async function OperationsTourRootPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  redirect(tourHomeHref(tourId));
}
