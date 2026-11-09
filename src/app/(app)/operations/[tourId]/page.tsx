/* ============================================
   LOWPASS — tour root redirect (Nov 2026 — tours open on Advance)

   /operations/[tourId] (and every old /tours/[id] link, via next.config)
   resolves to where a tour opens — tourHomeHref, the same place every time.

   Permission-aware on purpose: someone who can't read the advance (e.g. a
   crew-list-only member) lands on Crew instead of a no-access panel, and
   anyone else on Tour settings.
   ============================================ */

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canAccess, fetchActiveGrants, getActiveMembership } from '@/lib/permissions/server';
import { tourHomeHref } from '@/lib/nav/ia';

export const dynamic = 'force-dynamic';

export default async function OperationsTourRootPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(tourHomeHref(tourId))}`);

  const membership = await getActiveMembership(supabase, user.id);
  // No membership → let the landing render its own no-workspace state.
  if (!membership) redirect(tourHomeHref(tourId));

  const grants = await fetchActiveGrants(supabase, membership, user.id);
  if (canAccess(membership, grants, 'page', 'advance', 'read')) redirect(tourHomeHref(tourId));
  if (canAccess(membership, grants, 'page', 'operations.personnel', 'read')) redirect(`/operations/${tourId}/personnel`);
  redirect(`/operations/${tourId}/settings`);
}
