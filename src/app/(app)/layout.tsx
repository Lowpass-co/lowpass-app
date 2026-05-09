/* ============================================
   LOWPASS — App Layout (Sprint 10 §1.6)

   Layout for authenticated pages. Owns:

     - Global providers (Toast, ErrorBoundary, ArtistTourContext,
       ProductContext, SwitcherStateProvider; AppShell adds
       EntityRouting / CommandPalette / ConnectionStatus)
     - Top-level chrome: <UnifiedTopBar> + <ScopeNavStripWrapper>
     - Sub-nav (<SubNavStrip>) is mounted by per-product layouts
       (operations/[tourId]/layout.tsx, budget/[tourId]/...,
       advance/[tourId]/[routingId]/...) — they fetch their own
       grants per Sprint 10 Q5 option (a).

   Sprint 10 §1.6 — replaces the per-shell mount pattern. The
   old listAppPageShell / ProductShell wrappers are now thin
   pass-throughs (kept for backward compat); chrome lives at
   the layout level for every (app) page automatically.

   Pre-fetches user/profile/initialArtists once + threads them
   to <UnifiedTopBar> as plain props (the TopBar is a client
   component to support usePathname-driven scope detection).
   ============================================ */

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { ArtistTourProvider } from '@/contexts/ArtistTourContext';
import { ProductProvider } from '@/contexts/ProductContext';
import { SwitcherStateProvider } from '@/contexts/SwitcherStateContext';
import { UnifiedTopBar } from '@/components/shell/UnifiedTopBar';
import { ScopeNavStripWrapper } from '@/components/shell/ScopeNavStripWrapper';
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
  /* Sprint 10 §1.2 — single auth + workspace fetch at the
     layout level. The artist list seeds the BreadcrumbPill
     avatar dropdown's first paint. Skip both fetches when
     unauth — the TopBar's user=null branch hides the avatar
     menu so partially-rendered chrome still looks intentional. */
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userPill: { name: string; email: string; avatarUrl: string | null } | null = null;
  let isSiteAdmin = false;
  let initialArtists: SwitcherArtistMin[] = [];
  if (user) {
    const [{ data: profile }, { data: artistsRes }] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, avatar_url, is_site_admin')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('artists')
        .select('id, name, branding, spotify_image_url')
        .order('name', { ascending: true }),
    ]);
    const p = (profile ?? null) as {
      full_name?: string | null;
      avatar_url?: string | null;
      is_site_admin?: boolean | null;
    } | null;
    isSiteAdmin = !!p?.is_site_admin;
    userPill = {
      name: (p?.full_name ?? '').trim(),
      email: user.email ?? '',
      avatarUrl: p?.avatar_url ?? null,
    };
    initialArtists = (artistsRes ?? []) as SwitcherArtistMin[];
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={null}>
          <ArtistTourProvider>
            <ProductProvider>
              <SwitcherStateProvider>
                <AppShell>
                  <UnifiedTopBar
                    user={userPill}
                    isSiteAdmin={isSiteAdmin}
                    initialArtists={initialArtists}
                  />
                  <ScopeNavStripWrapper isSiteAdmin={isSiteAdmin} />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {children}
                  </div>
                </AppShell>
              </SwitcherStateProvider>
            </ProductProvider>
          </ArtistTourProvider>
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
}
