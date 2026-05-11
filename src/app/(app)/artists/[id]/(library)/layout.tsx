/* ============================================
   LOWPASS — Sprint 12 §7 — Artist library layout

   Mirrors the (home) layout so the four library sub-routes
   (riders / channel-lists / financials / files) live under
   the same ProductShell with the rail still pointing at
   Home. Per Adam's decisions on §6, the rail stays on Home
   for artist-level surfaces — no separate "Library" entry.

   Each library page is workspace + artist scoped. The
   workspace gating is enforced by RLS on rider_packs /
   rider_folders; this layout just hands the artist id down.
   ============================================ */

import type { ReactNode } from 'react';
import { ProductShell } from '@/components/shell-v2';

export default async function ArtistLibraryLayout({
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
