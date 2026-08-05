/* ============================================
   LOWPASS — (workspace) layout (S-3b)

   Shared chrome for the workspace tier: /artists, /personnel, /assets (and the
   retiring /equipment), plus /venues, which moved into this group in S-3b so
   every WORKSPACE_RAIL destination inherits one layout.

   S-3b — WorkspaceTopBar + WorkspaceTabs are gone; this tier now mounts the
   same <ShellV3Mount> as every other scope. The tabs' three destinations are
   the rail's items (ia.ts WORKSPACE_RAIL), so the horizontal tab strip is not
   replaced by nothing — it is replaced by the same control every other tier
   uses. The old "NO rail at the workspace tier" rule is REVERSED, deliberately:
   Adam's call (2026-08-04) — the workspace/user level carries real information
   now, so it gets the real rail.

   Route group stays transparent — URLs stay clean:
   /artists → (workspace)/artists/page.tsx, etc.

   Artist detail pages at /artists/[id]/* live OUTSIDE this group and mount the
   shell from their own layout (artist scope).
   ============================================ */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import {
  getRequestSupabase,
  getRequestUser,
  getRequestWorkspaceName,
} from '@/lib/server/requestContext';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { getLandingSuggestion } from '@/server/workspace/landingPreference';
import { EmptyWorkspacePrompt } from '@/components/shell-v2/EmptyWorkspacePrompt';

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  /* Perf pass 1 — the cached request context. The old shape verified the user
     and walked profile → workspace HERE, then ShellV3Mount repeated all three.
     Now both read the same per-request cache: the chain runs once. */
  const supabase = await getRequestSupabase();

  /* Unauthenticated / no workspace → /login. Same gate as ever. */
  const workspaceName = await getRequestWorkspaceName();
  if (workspaceName == null) redirect('/login');

  /* Landing preference (659890a, merged into S-3b) — the workspace tier is
     where a stranded member arrives, so the offer belongs here and nowhere
     deeper. Suggestion only: it never redirects and never writes. It renders
     inside the shell's <main>, above the page body. */
  const user = await getRequestUser();
  const suggestion = user ? await getLandingSuggestion(supabase, user.id) : null;

  const h = await headers();
  const pathname = h.get('x-pathname') ?? '/artists';
  const search = h.get('x-search') ?? '';

  return (
    <ShellV3Mount pathname={pathname} search={search}>
      {suggestion ? <EmptyWorkspacePrompt {...suggestion} /> : null}
      {children}
    </ShellV3Mount>
  );
}
