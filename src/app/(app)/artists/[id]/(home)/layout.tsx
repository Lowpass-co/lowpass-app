/* ============================================
   LOWPASS — Sprint 8.1 §2 — /artists/[id]/(home) layout

   Hoists <ProductShell active="home"> from the artist home
   page.tsx into this layout so the <ArtistTourSwitcher> wrapper
   persists across [id] changes. Without this, navigating
   /artists/A → /artists/B unmounts the page and re-instantiates
   the switcher with closed state, even if the user just had it
   open mid-flight.

   Route group `(home)` keeps the layout scoped to the artist
   landing only — /artists/[id]/edit sits outside this group and
   wraps its own <ProductShell active="home"> per-page (Nav & entry
   fixpack item 4), so it does not inherit this layout.
   ============================================ */

import type { ReactNode } from 'react';
import { ProductShell } from '@/components/shell-v2';

export default async function ArtistHomeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProductShell
      active="home"
      artistId={id}
      productName="Home"
      homeHref={`/artists/${id}`}
    >
      {children}
    </ProductShell>
  );
}
