/* ============================================
   LOWPASS — Product Split Phase 1 — <ProductHeader>
   (Sprint 5: chips replaced with <ArtistTourSwitcher>)

   Top header that sits above the page body inside <ProductShell>.
   44-48px tall.

   API:
     <ProductHeader
       artistId={...}
       tourId={...}            // optional — used to scope the
                                  // initial-tours pre-fetch
       productName="Operations"
     />

   Layout:
     [ArtistTourSwitcher]      [product name]      [search] [avatar]

   The switcher reads the current selection from ArtistTourContext
   (which hydrates from URL → path-segment → localStorage per
   Sprint 4). Selection mutations flow back through the context's
   setters, which sync URL + localStorage automatically.
   ============================================ */

import { Search } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductHeaderAvatarMenu } from './ProductHeaderAvatarMenu';
import { ArtistTourSwitcherClientWrapper } from './ArtistTourSwitcherClientWrapper';

export type ProductName = 'Home' | 'Operations' | 'Budget' | 'Advance';

interface ProductHeaderProps {
  artistId: string | null;
  tourId?: string | null;
  productName: ProductName;
}

export async function ProductHeader({
  artistId,
  productName,
}: ProductHeaderProps) {
  const supabase = await createServerSupabaseClient();

  // Sprint 5 §2 — pre-fetch the lists the new <ArtistTourSwitcher>
  // needs for instant first open. Lean projection (id + name only
  // on artists; id + name + dates on tours) so the per-page cost is
  // negligible. Next dedups identical Supabase queries within a
  // request boundary; the switcher is mounted on every product
  // page so this is the canonical place to fetch.
  const [
    { data: { user } },
    artistsRes,
    initialToursRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('artists')
      .select('id, name, branding, spotify_image_url')
      .order('name', { ascending: true }),
    artistId
      ? supabase
          .from('tours')
          .select('id, name, start_date, end_date')
          .eq('artist_id', artistId)
          .order('start_date', { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const initialArtists = (artistsRes.data ?? []) as Array<{
    id: string;
    name: string;
    branding: unknown;
    spotify_image_url: string | null;
  }>;
  const initialTours = (initialToursRes.data ?? null) as Array<{
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  }> | null;

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
      {/* Left: combined hierarchical artist→tour switcher (Sprint 5).
          Replaces the static [Artist] · [Tour] chips. */}
      <div className="flex min-w-0 items-center">
        <ArtistTourSwitcherClientWrapper
          initialArtists={initialArtists}
          initialTours={initialTours}
        />
      </div>

      {/* Center: product name */}
      <div className="ml-2 flex items-center">
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
