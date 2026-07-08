/* ============================================
   LOWPASS — Operations · Tour root redirect (Design pass §9 · TR-01)

   Routing is now the tour landing. The old summary surface moved to
   /operations/[tourId]/summary (reachable via the "Summary" sub-nav tab) so no
   content is lost. This root resolves to the right landing:

   - caller can read operations.routing  → /routing (the new landing, with the
     de-boxed readiness rail above the grid)
   - otherwise (e.g. personnel-only read) → /summary, so they keep the surface
     they had before instead of hitting Routing's no-access panel.

   Permission-aware on purpose: a naïve redirect straight to /routing would
   regress access for personnel-only users.
   ============================================ */

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  canAccess,
  fetchActiveGrants,
  getActiveMembership,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface OperationsTourRootProps {
  params: Promise<{ tourId: string }>;
}

export default async function OperationsTourRootPage({
  params,
}: OperationsTourRootProps) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/operations/${tourId}/routing`);
  }

  const membership = await getActiveMembership(supabase, user.id);
  // No membership → let the routing landing render its own no-workspace state.
  if (!membership) {
    redirect(`/operations/${tourId}/routing`);
  }

  const grants = await fetchActiveGrants(supabase, membership, user.id);
  const canReadRouting = canAccess(
    membership,
    grants,
    'page',
    'operations.routing',
    'read',
  );

  redirect(
    canReadRouting
      ? `/operations/${tourId}/routing`
      : `/operations/${tourId}/summary`,
  );
}
