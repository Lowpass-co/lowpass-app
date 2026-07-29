/* ============================================
   LOWPASS — /operations/[tourId] layout (S-2d)

   Chrome for every Operations-tree surface. The layout owns it so the picker
   and the rail survive navigation between sub-routes and between tours; each
   page.tsx renders only its body.

   S-2d — the <ProductShell> branch is gone. Every tour-scoped URL is on the
   canonical shell (isShelledPath in ia.ts, asserted by test), so the old
   two-bar nav, the Operations sub-nav strip and the tour identity band had no
   reachable caller left.

   The shell now renders UNCONDITIONALLY here rather than behind an
   isShelledPath() check. The check would be a runtime assertion of something
   the tests already pin, and its failure mode — a 404, or a page with no
   navigation — is worse than the thing it guards against. The boundary belongs
   in ia.ts and in the test that reads it; this layout just mounts.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { HydrateTourArtist } from '@/components/shell-v2/HydrateTourArtist';
import { loadTourIdentity } from '@/lib/shell/tourIdentity';
import { hasOwnRail } from '@/lib/nav/ia';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export default async function OperationsTourLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  /* The pathname comes from the request headers because layouts are server
     components and there is no usePathname here — and because the shell must
     derive scope from the URL, not from anything ambient. */
  const h = await headers();
  const pathname = h.get('x-pathname') ?? `/operations/${tourId}/routing`;
  const search = h.get('x-search') ?? '';

  /* G2-4 — identity comes from the ONE shared loader and uses the DB-only logo
     resolver, so this never blocks on a live Spotify fetch.

     S-2d dropped the membership + grants fetch that ran beside it: its only
     consumer was the sub-nav's per-link visibility filter, which no longer
     exists. See the S-2d entry in the running report — the rail does not yet
     filter by resource access, and that gap is logged rather than papered over. */
  const identity = await loadTourIdentity(supabase, tourId);
  if (!identity) notFound();

  return (
    <ShellV3Mount
      pathname={pathname}
      search={search}
      artistId={identity.artistId}
      artistName={identity.artistName}
      tourName={identity.tourName}
      /* Collapse only where the PAGE already has a left rail of its own — see
         hasOwnRail(), which names the three and explains why Routing and
         Rooming are not among them. Both were my guesses, and both were wrong;
         the list is checked against the components now. */
      denseRail={hasOwnRail(pathname)}
    >
      <HydrateTourArtist tourId={tourId} artistId={identity.artistId} />
      <TourVisitTracker tourId={tourId} />
      {children}
    </ShellV3Mount>
  );
}
