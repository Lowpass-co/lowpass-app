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
  let artistName: string | null = null;
  let tourName: string | null = null;

  if (artistId || tourId) {
    const supabase = await createServerSupabaseClient();
    const [artistRes, tourRes] = await Promise.all([
      artistId
        ? supabase.from('artists').select('name').eq('id', artistId).maybeSingle()
        : Promise.resolve({ data: null }),
      tourId
        ? supabase.from('tours').select('name').eq('id', tourId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    artistName = (artistRes.data as { name?: string } | null)?.name ?? null;
    tourName = (tourRes.data as { name?: string } | null)?.name ?? null;
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
              fontSize: '13px',
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
              fontSize: '13px',
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
                fontSize: '13px',
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

      {/* Right: search trigger + avatar slot. Phase 1 placeholder — the
          real ⌘K palette wiring + AccountAvatar mount happen when the
          first product migrates onto these shells. */}
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
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background:
              'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
            color: 'var(--color-lp-orange)',
            fontSize: '11px',
            fontWeight: 600,
          }}
          aria-hidden="true"
        >
          {/* Static placeholder avatar mark — wired up in Phase 2+. */}
          ·
        </div>
      </div>
    </header>
  );
}
