/* ============================================
   LOWPASS — Product Split Phase 1 — <ProductHeader>
   (Sprint 5: chips replaced with <ArtistTourSwitcher>)
   (Sprint 8.5 §1: switcher hoisted out of ProductHeader to
    workspace-level <AppShell>; this header is now
    [product name] [search] [avatar] only)

   Top header that sits above the page body inside <ProductShell>.
   44-48px tall.

   Sprint 8.5 §1 — the artist/tour switcher used to live here on
   the left, but it remounted on every dynamic-segment change.
   The switcher is now mounted in <AppShell> (workspace level)
   inline above ProductHeader. ProductHeader keeps the per-product
   chrome: product name + search + avatar. The avatar still needs
   a server-side user/profile fetch, so this stays an async
   server component.

   API:
     <ProductHeader productName="Operations" />
   ============================================ */

import { Search } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductHeaderAvatarMenu } from './ProductHeaderAvatarMenu';

export type ProductName = 'Home' | 'Operations' | 'Budget' | 'Advance';

interface ProductHeaderProps {
  productName: ProductName;
}

export async function ProductHeader({ productName }: ProductHeaderProps) {
  const supabase = await createServerSupabaseClient();

  // Sprint 8.5 §1 — only user/profile fetch remains (for the
  // avatar menu). The Sprint 5 §2 initialArtists / initialTours
  // pre-fetch is gone — the workspace-level switcher mounts in
  // AppShell with initialArtists threaded through (app)/layout.tsx.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      {/* Left: product name */}
      <div className="flex items-center">
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

      {/* Right: search trigger + interactive avatar menu */}
      <div className="ml-auto flex items-center gap-2">
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
