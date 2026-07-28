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
  badges?: Record<string, string | number | null | undefined>;
  /** Start the nav rail collapsed (pages that carry a day rail). */
  denseRail?: boolean;
  children: React.ReactNode;
}

export async function ShellV3Mount({
  pathname, search, artistId, badges, denseRail, children,
}: ShellV3MountProps) {
  const supabase = await createServerSupabaseClient();

  const [{ data: userData }, { data: artistsRes }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('artists').select('id, name, branding, spotify_image_url').order('name', { ascending: true }),
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
      badges={badges}
      denseRail={denseRail}
      workspaceName="Workspace"
      switcher={
        <ArtistTourSwitcherClientWrapper
          initialArtists={initialArtists}
          initialTours={null}
          initialArtistId={artistId ?? null}
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
