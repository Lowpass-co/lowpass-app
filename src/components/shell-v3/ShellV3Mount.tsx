/* ============================================
   LOWPASS — <ShellV3Mount> (S-1)

   The one-line mount. A server component that fetches what the top bar needs
   (the artist list for the picker, the profile for the avatar) and renders
   <AppShellV3> around a page's content.

   THIS is what makes S-2..S-5 mechanical: migrating a surface means replacing
   its old chrome with <ShellV3Mount pathname={…}>, and nothing else. All the
   nav knowledge lives in ia.ts; all the data-fetching for the chrome lives
   here; the page renders its body and knows nothing about either.

   It deliberately mirrors ProductHeader's own queries rather than inventing new
   ones, so the picker in the new shell is fed exactly what the picker in the old
   shell was fed — one control, one data shape, no drift while both exist.
   ============================================ */

import {
  getRequestSupabase,
  getRequestUser,
  getRequestProfile,
  getRequestWorkspaceName,
  getRequestVisibleResources,
} from '@/lib/server/requestContext';
import { ArtistTourSwitcherClientWrapper } from '@/components/shell-v2/ArtistTourSwitcherClientWrapper';
import { ProductHeaderAvatarMenu } from '@/components/shell-v2/ProductHeaderAvatarMenu';
import { WorkspaceSwitcher } from '@/components/shell-v2/WorkspaceSwitcher';
import { countReceiptsNeedingDetails } from '@/lib/budget/loadReceipts';
import { resolveScope } from '@/lib/nav/ia';
import { toTitleCase } from '@/lib/text/toTitleCase';
import { AppShellV3 } from './AppShellV3';

type SwitcherArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url?: string | null;
};

export interface ShellV3MountProps {
  /** The URL being rendered — the shell derives everything else from it. */
  pathname: string;
  search?: string;
  /** Known from server data at tour scope; the path carries only the tour id. */
  artistId?: string | null;
  /** S-2a — names the layout already loaded, so the picker never renders
   *  "Pick an artist…" on a URL where the server knew the answer. */
  artistName?: string | null;
  tourName?: string | null;
  badges?: Record<string, string | number | null | undefined>;
  /** Start the nav rail collapsed (pages that carry a day rail). Prefer
   *  `hasOwnRail(pathname)` from ia.ts over hand-picking this per layout. */
  denseRail?: boolean;
  /** S-3b — tourless product landing (greyed top bar, workspace rail). */
  landing?: boolean;
  children: React.ReactNode;
}

export async function ShellV3Mount({
  pathname, search, artistId, artistName, tourName, badges, denseRail, landing, children,
}: ShellV3MountProps) {
  /* Perf pass 1 (2026-08-04) — everything below rides the per-request cache
     (src/lib/server/requestContext.ts). The old shape was a serial chain —
     auth → artists → profile → workspace → permissions — REPEATING work the
     layout above had already done. Now: verify the user once (locally when the
     project's keys allow it), then fan out EVERYTHING in one Promise.all.
     Workspace name chains through the cached profile inside the same fan-out,
     so total depth is user → fan-out → render. */
  const supabase = await getRequestSupabase();
  const user = await getRequestUser();

  /* S-2b — the Receipts badge: work-still-to-do, the one number on the old tab
     band anybody acted on. Resolved here so every Money surface (Budget,
     Payroll, Settlement) shows the same figure. */
  const scope = resolveScope(pathname, search ?? '');
  const wantsReceiptBadge = scope.scope === 'tour' && scope.mode === 'money' && !!scope.tourId;

  const [{ data: artistsRes }, needsDetails, profile, workspaceName, visibleResources] =
    await Promise.all([
      supabase.from('artists').select('id, name, branding, spotify_image_url').order('name', { ascending: true }),
      wantsReceiptBadge ? countReceiptsNeedingDetails(supabase, scope.tourId as string) : Promise.resolve(0),
      getRequestProfile(),
      /* S-3b — the REAL workspace name, everywhere (WorkspaceTopBar showed it;
         the v3 bar hardcoded "Workspace"). Cached: if the layout above already
         resolved it, this is free. */
      getRequestWorkspaceName(),
      /* P-1 — the rail's access filter, once per request. Costs nothing extra
         for admin/manager — canAccess short-circuits on role. */
      getRequestVisibleResources(),
    ]);

  const initialArtists = (artistsRes ?? []) as SwitcherArtistMin[];

  const knownArtistId = artistId ?? scope.artistId ?? null;
  const resolvedArtistName =
    initialArtists.find((a) => a.id === knownArtistId)?.name ?? null;

  const isSiteAdmin = !!profile?.is_site_admin;
  const avatarUrl = profile?.avatar_url ?? null;
  const displayName = (profile?.full_name ?? '').trim();

  return (
    <AppShellV3
      visibleResources={visibleResources}
      pathname={pathname}
      search={search}
      artistId={artistId}
      /* Caller-supplied badges win; a zero is dropped downstream by
         resolveRailView, which is where the rule belongs. */
      badges={{ receiptsNeedingDetails: needsDetails, ...(badges ?? {}) }}
      denseRail={denseRail}
      landing={landing}
      workspaceName={workspaceName ? toTitleCase(workspaceName) : 'Workspace'}
      switcher={
        <ArtistTourSwitcherClientWrapper
          initialArtists={initialArtists}
          initialTours={null}
          initialArtistId={artistId ?? scope.artistId ?? null}
          /* S-3a — at artist scope the id IS in the path, and the artist list
             was already fetched for the picker, so the name is here for free.
             No layout needs to query for it, and none does. */
          fallbackArtistName={artistName ?? resolvedArtistName}
          fallbackTourName={tourName ?? null}
        />
      }
      headerRight={
        <>
          {/* S-3b — the wrong-workspace recovery control, on EVERY tier now.
              shell-v1's TopBar and shell-v2's ProductHeader both mounted it;
              the v3 bar didn't, which silently regressed recovery on every
              migrated surface. Single-workspace users see a plain label. */}
          <WorkspaceSwitcher />
          <ProductHeaderAvatarMenu
            user={{ name: displayName, email: user?.email ?? '', avatarUrl }}
            isSiteAdmin={isSiteAdmin}
          />
        </>
      }
    >
      {children}
    </AppShellV3>
  );
}
