/* ============================================
   LOWPASS — loadTourIdentity (G2-4)

   ONE server-side loader for the identity lockup that every grouped tour surface
   (Operations, Budget, Advance) renders, so the avatar · artist · tour · status
   band is identical everywhere — no per-layout variation (Adam: "changes on every
   single menu; 0 consistency"). Uses the SYNC (DB-only) logo resolver — never a
   live Spotify fetch — because this runs in a layout that wraps every page (a
   blocking external fetch here would stall the whole product section).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrlSync } from '@/lib/artists/imageUrl';
import { tourPhase } from '@/lib/derive/tourStatus';

export interface TourIdentity {
  artistId: string | null;
  artistName: string;
  avatarUrl: string | null;
  tourName: string;
  statusLabel: string;
  statusKey: string;
}

const STATUS_LABEL: Record<string, string> = {
  on_tour: 'On tour',
  upcoming: 'Upcoming',
  planning: 'Planning',
  ended: 'Ended',
};

/** Load the identity lockup fields for a tour. Returns null if the tour is gone
 *  (callers already notFound() on a missing tour, so this stays lightweight). */
export async function loadTourIdentity(
  supabase: SupabaseClient,
  tourId: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<TourIdentity | null> {
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_id, start_date, end_date, status')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) return null;
  const t = tour as { name: string; artist_id: string | null; start_date: string | null; end_date: string | null; status: string | null };

  const { data: artist } = t.artist_id
    ? await supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', t.artist_id).maybeSingle()
    : { data: null };
  const artistRow = artist as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;

  const phase = tourPhase({ start_date: t.start_date, end_date: t.end_date, status: t.status }, today);
  return {
    artistId: t.artist_id,
    artistName: artistRow?.name ?? 'Artist',
    avatarUrl: artistRow ? resolveArtistLogoUrlSync(artistRow) : null,
    tourName: t.name,
    statusLabel: STATUS_LABEL[phase] ?? '',
    statusKey: phase,
  };
}
