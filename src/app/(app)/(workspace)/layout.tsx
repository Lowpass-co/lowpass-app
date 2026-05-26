/* ============================================
   LOWPASS — (workspace) layout (IA Cleanup §I2)

   Shared chrome for the three workspace dashboard tabs:
   /artists, /personnel, /equipment. Renders the
   WorkspaceTopBar (workspace name + avatar + gear) above
   the WorkspaceTabs (Artists / Personnel / Equipment), then
   the active tab's page below.

   IMPORTANT: NO ProductRail here. The workspace tier is
   the only place in the authenticated app that doesn't
   render the rail — the rail is tour/artist scoped. The
   absence of ProductShell here is what enforces that.

   Route group is "transparent" — URLs stay clean:
   /artists → src/app/(app)/(workspace)/artists/page.tsx
   /personnel → (workspace)/personnel/page.tsx (in §I3)
   /equipment → (workspace)/equipment/page.tsx (in §I3)

   Artist detail pages at /artists/[id]/* live OUTSIDE this
   group (src/app/(app)/artists/[id]/...) — they use the
   ProductShell layout because they're artist-scoped, not
   workspace-scoped.
   ============================================ */

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { WorkspaceTopBar } from '@/components/shell-v2/WorkspaceTopBar';
import { WorkspaceTabs } from '@/components/shell-v2/WorkspaceTabs';
import { getWorkspaceName } from '@/server/workspace/getWorkspaceName';

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const workspaceName = await getWorkspaceName(supabase);
  /* Unauthenticated / no workspace → /login. Matches the
     pre-§I2 redirect at the top of /artists/page.tsx. */
  if (workspaceName == null) redirect('/login');

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--lp-bg)' }}
    >
      <WorkspaceTopBar workspaceName={workspaceName} />
      <WorkspaceTabs />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
