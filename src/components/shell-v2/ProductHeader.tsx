/* ============================================
   LOWPASS — Product Split Phase 1 — <ProductHeader>
   (Sprint 5: chips replaced with <ArtistTourSwitcher>)
   (Sprint 8.5 §1: switcher hoisted out of ProductHeader to
    workspace-level <AppShell>; this header was [product name]
    [search] [avatar] only)
   (Sprint 9 §13.A.2: switcher mount returns to ProductHeader.
    The AppShell hoist eliminated remount-flash on artist
    switch but produced a duplicate header bar above this one
    on every shell-v2 page — the "double TopBar" smoke
    complaint. Each shell now owns its complete chrome.)

   Top header that sits above the page body inside <ProductShell>.
   48px tall. Layout:

     [WorkspaceSwitcher] | [ArtistTourSwitcher] | [Product]
                                                ... [Search] [Avatar]

   The artist/tour switcher wrapper still lives inside
   SwitcherStateProvider (mounted in (app)/layout.tsx) so its
   open/close state and active selection survive the dynamic-
   segment remount. Visual flash on /artists/[A]→/artists/[B]
   navigation is acknowledged as a polish item, not 13.A scope.

   API:
     <ProductHeader productName="Operations" />
   ============================================ */

import { Search } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductHeaderAvatarMenu } from './ProductHeaderAvatarMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ArtistTourSwitcherClientWrapper } from './ArtistTourSwitcherClientWrapper';
import { ConnectionIndicator } from '@/components/realtime/ConnectionIndicator';

/* IA Cleanup §I4 — neutral-chrome surfaces (Settings, Venues,
 * Bugs) reuse ProductShell with active=null. They surface
 * their own display name here ("Settings" / "Venues" / "Bug
 * reports") so the header still reads as the user's
 * destination. */
export type ProductName =
  | 'Home'
  | 'Operations'
  | 'Budget'
  | 'Advance'
  | 'Settings'
  | 'Venues'
  | 'Bug reports'
  | 'AI Usage';

interface ProductHeaderProps {
  productName: ProductName;
}

type SwitcherArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url: string | null;
};

export async function ProductHeader({ productName }: ProductHeaderProps) {
  const supabase = await createServerSupabaseClient();

  // Sprint 9 §13.A.2 — fetch user/profile AND the workspace's
  // artist list in parallel. The artist list feeds the
  // ArtistTourSwitcher's initial render so the dropdown's
  // artists pane is never empty on first paint. RLS scopes
  // both queries to the caller's workspace.
  const [{ data: userData }, { data: artistsRes }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('artists')
      .select('id, name, branding, spotify_image_url')
      .order('name', { ascending: true }),
  ]);
  const user = userData?.user ?? null;
  const initialArtists = (artistsRes ?? []) as SwitcherArtistMin[];

  let isSiteAdmin = false;
  let avatarUrl: string | null = null;
  let displayName = '';
  const email = user?.email ?? '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, is_site_admin')
      .eq('id', user.id)
      .maybeSingle();
    const p = (profile ?? null) as {
      full_name?: string | null;
      avatar_url?: string | null;
      is_site_admin?: boolean | null;
    } | null;
    isSiteAdmin = !!p?.is_site_admin;
    avatarUrl = p?.avatar_url ?? null;
    displayName = (p?.full_name ?? '').trim();
  }

  return (
    <header
      className="lp-product-header flex h-12 shrink-0 items-center gap-3 border-b px-4"
      style={{
        background: 'var(--lp-panel)',
        borderColor: 'var(--lp-border-strong)',
      }}
    >
      {/* Left cluster: workspace + artist/tour scope, then a
          subtle separator, then the product name. */}
      <div className="flex min-w-0 items-center" style={{ gap: 'var(--lp-space-2)' }}>
        <WorkspaceSwitcher />
        <span
          aria-hidden
          style={{
            width: 1,
            height: 16,
            background: 'var(--lp-border-subtle)',
          }}
        />
        <ArtistTourSwitcherClientWrapper
          initialArtists={initialArtists}
          initialTours={null}
          initialArtistId={null}
        />
        <span
          aria-hidden
          style={{
            width: 1,
            height: 16,
            background: 'var(--lp-border-subtle)',
            marginInline: 'var(--lp-space-1)',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {productName}
        </span>
      </div>

      {/* Right: connection state + search trigger + avatar menu.
          Sprint 9 §13.A.14 — ConnectionIndicator persists status
          on Operations / Budget / Advance per Adam's spec
          (toast pattern doesn't fit — needs to be persistently
          visible). Provider lives in <AppShell>. */}
      <div className="ml-auto flex items-center gap-2">
        <ConnectionIndicator />
        <button
          type="button"
          className="btn-transition flex h-8 w-8 items-center justify-center rounded-md"
          style={{
            color: 'var(--lp-text-tertiary)',
            background: 'transparent',
          }}
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search className="h-4 w-4" strokeWidth={2} />
        </button>
        {user ? (
          <ProductHeaderAvatarMenu
            user={{
              name: displayName,
              email,
              avatarUrl,
            }}
            isSiteAdmin={isSiteAdmin}
          />
        ) : null}
      </div>
    </header>
  );
}
