import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { ShellData, ShellTopBarTour } from '@/lib/shell/types';
import type { TourStatus } from '@/types';

function mapTourStatus(s: TourStatus | string): 'active' | 'archived' {
  if (s === 'archived' || s === 'completed') return 'archived';
  return 'active';
}

/**
 * Server-only: current user, profile display fields, and workspace tours for the TopBar tour menu.
 * Pure given the same session + database state; safe to call from any app route layout/page.
 */
export async function getShellData(): Promise<ShellData> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, tours: [], isSiteAdmin: false };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id, name, avatar_url, is_site_admin')
    .eq('id', user.id)
    .maybeSingle();

  const email = user.email ?? '';
  const name = (profile?.name as string | null)?.trim() || email || 'Account';

  let tours: ShellTopBarTour[] = [];
  if (profile?.workspace_id) {
    const { data: tourRows } = await supabase
      .from('tours')
      .select('id, name, status, artist_id, artists(name)')
      .eq('workspace_id', profile.workspace_id)
      .order('start_date', { ascending: false });
    type TourRow = {
      id: string;
      name: string;
      status: string;
      artist_id: string | null;
      // Supabase embeds can come back as a single-element array or an
      // object depending on the inferred relationship cardinality.
      artists: { name: string | null } | { name: string | null }[] | null;
    };
    tours = (tourRows ?? []).map((r) => {
      const row = r as TourRow;
      const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists;
      return {
        id: row.id,
        name: row.name,
        status: mapTourStatus(row.status),
        artistId: row.artist_id ?? null,
        artistName: artist?.name ?? null,
      };
    });
  }

  return {
    user: {
      name,
      email,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
    },
    tours,
    isSiteAdmin: !!(profile?.is_site_admin as boolean | null),
  };
}
