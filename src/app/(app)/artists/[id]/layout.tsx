/* ============================================
   LOWPASS — /artists/[id] layout (S-3a)

   ONE mount for the whole artist subtree: the landing and its Production hub,
   every library surface, and Edit.

   It replaces three separate wrappers — `(home)/layout.tsx`,
   `(library)/layout.tsx` and a per-page <ProductShell> inside `edit/page.tsx`.
   Those existed because a route-group layout can only wrap its own group, so
   Edit (which sits outside both) had to carry its own chrome and could drift
   from the other two. Sitting above the groups fixes that by construction, and
   it also does what the old (home) layout was written for: the picker stays
   mounted across /artists/A → /artists/B.

   No data fetch. The artist id is in the path, and ShellV3Mount already loads
   the artist list for the picker — so the name for the top bar comes out of
   data it was fetching anyway.
   ============================================ */

import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';

export default async function ArtistLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const h = await headers();
  const pathname = h.get('x-pathname') ?? `/artists/${id}`;
  const search = h.get('x-search') ?? '';

  return (
    <ShellV3Mount pathname={pathname} search={search} artistId={id}>
      {children}
    </ShellV3Mount>
  );
}
