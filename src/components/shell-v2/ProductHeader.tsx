/* ============================================
   LOWPASS — Product Split Phase 1 — <ProductHeader>

   Top header that sits above the page body inside <ProductShell>.
   44-48px tall. Replaces the existing TopBar conceptually but lives
   alongside until Phases 2-4 cut each product over.

   API:
     <ProductHeader
       artistId={...}
       tourId={...}            // optional — only shown for tour-scoped products
       productName="Operations"
     />

   Layout:
     [artist switcher] [tour switcher when tourId]      [product name]      [search] [avatar]

   Phase 1 stays minimal — the switchers are read-only chips that
   show the current artist/tour name and link to the picker pages.
   Real interactive switchers (with dropdowns) land in Phase 2 or 3
   when the first product migrates onto these shells.
   ============================================ */

import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductHeaderAvatarMenu } from './ProductHeaderAvatarMenu';

export type ProductName = 'Home' | 'Operations' | 'Budget' | 'Advance';

interface ProductHeaderProps {
  artistId: string | null;
  tourId?: string | null;
  productName: ProductName;
}

export async function ProductHeader({
  artistId,
  tourId,
  productName,
}: ProductHeaderProps) {
  const supabase = await createServerSupabaseClient();

  // Phase 2 §F1.2 — fetch user + admin status alongside artist/tour
  // names so the avatar menu has what it needs.
  const [
    { data: { user } },
    artistRes,
    tourRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    artistId
      ? supabase.from('artists').select('name').eq('id', artistId).maybeSingle()
      : Promise.resolve({ data: null }),
    tourId
      ? supabase.from('tours').select('name').eq('id', tourId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const artistName =
    (artistRes.data as { name?: string } | null)?.name ?? null;
  const tourName = (tourRes.data as { name?: string } | null)?.name ?? null;

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
      {/* Left: artist + tour switcher chips */}
      <div className="flex min-w-0 items-center gap-1.5">
        {artistId ? (
          <Link
            href={`/artists/${artistId}`}
            className="btn-transition truncate rounded-md px-2 py-1"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--lp-text)',
              background: 'transparent',
            }}
          >
            {artistName ?? 'Artist'}
          </Link>
        ) : (
          <Link
            href="/"
            className="btn-transition rounded-md px-2 py-1"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--lp-text-secondary)',
            }}
          >
            Pick artist
          </Link>
        )}

        {tourId && (
          <>
            <ChevronRight
              className="h-3.5 w-3.5"
              style={{ color: 'var(--lp-text-tertiary)' }}
              strokeWidth={2}
            />
            <span
              className="truncate rounded-md px-2 py-1"
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--lp-text)',
              }}
            >
              {tourName ?? 'Tour'}
            </span>
          </>
        )}
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
