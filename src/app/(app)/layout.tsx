/* ============================================
   LOWPASS — App Layout

   Layout for authenticated pages.
   Global: toasts, artist/tour context, bug reporter.

   Sprint 8.5 §1 — server-prefetches initialArtists for the
   workspace-level switcher. The switcher itself is mounted
   inside <AppShell> (not per-product anymore) so its DOM
   persists across all (app)/* navigation. ProductHeader stops
   rendering the switcher.

   Per-route chrome: <PageShell> (TopBar + LeftRail) in each
   `page.tsx` (UX04).

   All pages under (app)/ get this layout.
   Auth pages under (auth)/ do NOT.
   ============================================ */

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { ArtistTourProvider } from '@/contexts/ArtistTourContext';
import { ProductProvider } from '@/contexts/ProductContext';
import { SwitcherStateProvider } from '@/contexts/SwitcherStateContext';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type SwitcherArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url: string | null;
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sprint 8.5 §1 — server-prefetch the artist list for the
  // workspace-level switcher. Lean projection: id + name + branding
  // + spotify_image_url (all the switcher trigger + artists pane
  // need). RLS scopes to the caller's workspace. When the user
  // isn't logged in (e.g. brief unauthenticated render), this
  // returns []; the wrapper renders an empty artists pane until
  // ArtistTourContext's client-side fetch hydrates.
  const supabase = await createServerSupabaseClient();
  const { data: artistsRes } = await supabase
    .from('artists')
    .select('id, name, branding, spotify_image_url')
    .order('name', { ascending: true });
  const initialArtists = (artistsRes ?? []) as SwitcherArtistMin[];

  // Post-merge fix-up §C — ArtistTourProvider uses useSearchParams
  // to read ?artist_id / ?tour_id from URL, so it needs Suspense
  // boundary above. (app) routes are all dynamic anyway (Supabase
  // auth) so the bailout has no SSG cost.
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={null}>
          <ArtistTourProvider>
            <ProductProvider>
              {/* Sprint 8.3 §1 — switcher dropdown + optimistic-
                  artist state lives here so it survives navigation
                  inside the dynamic-segment subtree (Next 16 RSC
                  remounts the wrapper/switcher on /artists/[id]
                  changes; the provider above the segment doesn't). */}
              <SwitcherStateProvider>
                <AppShell initialArtists={initialArtists}>
                  {children}
                </AppShell>
              </SwitcherStateProvider>
            </ProductProvider>
          </ArtistTourProvider>
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
}
