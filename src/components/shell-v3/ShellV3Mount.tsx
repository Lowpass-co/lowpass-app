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

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistTourSwitcherClientWrapper } from '@/components/shell-v2/ArtistTourSwitcherClientWrapper';
import { ProductHeaderAvatarMenu } from '@/components/shell-v2/ProductHeaderAvatarMenu';
import { countReceiptsNeedingDetails } from '@/lib/budget/loadReceipts';
import { resolveScope } from '@/lib/nav/ia';
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
  children: React.ReactNode;
}

export async function ShellV3Mount({
  pathname, search, artistId, artistName, tourName, badges, denseRail, children,
}: ShellV3MountProps) {
  const supabase = await createServerSupabaseClient();

  /* S-2b — the Receipts badge. It existed in the budget tab band, and the band's
     tabs are retired on Money surfaces now that the rail carries them, so the
     count has to move rather than disappear: it's work-still-to-do, which is
     the one number on that bar anybody acts on.

     Resolved here rather than in each layout so every Money surface shows the
     same figure — the rail is on Payroll and Settlement too, not just Budget.
     It rides the same Promise.all as the artist list, so it costs no extra
     round-trip depth on a cold lambda. */
  const scope = resolveScope(pathname, search ?? '');
  const wantsReceiptBadge = scope.scope === 'tour' && scope.mode === 'money' && !!scope.tourId;

  const [{ data: userData }, { data: artistsRes }, needsDetails] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('artists').select('id, name, branding, spotify_image_url').order('name', { ascending: true }),
    wantsReceiptBadge ? countReceiptsNeedingDetails(supabase, scope.tourId as string) : Promise.resolve(0),
  ]);
  const user = userData?.user ?? null;
  const initialArtists = (artistsRes ?? []) as SwitcherArtistMin[];

  let isSiteAdmin = false;
  let avatarUrl: string | null = null;
  let displayName = '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, is_site_admin')
      .eq('id', user.id)
      .maybeSingle();
    const p = (profile ?? null) as {
      full_name?: string | null; avatar_url?: string | null; is_site_admin?: boolean | null;
    } | null;
    isSiteAdmin = !!p?.is_site_admin;
    avatarUrl = p?.avatar_url ?? null;
    displayName = (p?.full_name ?? '').trim();
  }

  return (
    <AppShellV3
      pathname={pathname}
      search={search}
      artistId={artistId}
      /* Caller-supplied badges win; a zero is dropped downstream by
         resolveRailView, which is where the rule belongs. */
      badges={{ receiptsNeedingDetails: needsDetails, ...(badges ?? {}) }}
      denseRail={denseRail}
      workspaceName="Workspace"
      switcher={
        <ArtistTourSwitcherClientWrapper
          initialArtists={initialArtists}
          initialTours={null}
          initialArtistId={artistId ?? null}
          fallbackArtistName={artistName ?? null}
          fallbackTourName={tourName ?? null}
        />
      }
      headerRight={
        <ProductHeaderAvatarMenu
          user={{ name: displayName, email: user?.email ?? '', avatarUrl }}
          isSiteAdmin={isSiteAdmin}
        />
      }
    >
      {children}
    </AppShellV3>
  );
}
