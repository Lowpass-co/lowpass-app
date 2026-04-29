/* ============================================
   LOWPASS — Artist Picker (post-auth landing)

   The canonical artist picker. Workspaces with multiple artists
   land here after auth (single-artist workspaces auto-skip via
   /auth/landing → /artists/[id]).

   Layout: header ("Artists" + subtitle + "+ Add new artist") on
   top, then a card grid with one card per artist. Each card shows
   the artist's image (or initials chip in --color-lp-orange) plus
   tour + upcoming-show counts. Clicking a card routes to that
   artist's hub (/artists/[id]).

   The LeftRail uses the empty list variant — UX13's fix sprint
   already hides it when there are no filters or saved views, so
   the picker reads as a clean, single-column page.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { ArtistsList } from '@/components/artists/ArtistsList';

type ArtistPickerCount = { tours: number; shows: number };

export default async function ArtistsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">Please sign in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  // Pull artists + the data we need to compute per-artist counts in
  // a single round of parallel queries. Aggregating in JS is cheaper
  // than N+1 count() queries for what is typically <50 artists.
  const today = new Date().toISOString().slice(0, 10);
  const [artistsRes, toursRes] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, slug, spotify_image_url, branding')
      .eq('workspace_id', profile.workspace_id)
      .order('name'),
    supabase
      .from('tours')
      .select('id, artist_id')
      .eq('workspace_id', profile.workspace_id),
  ]);

  const artists = artistsRes.data ?? [];
  const tours = toursRes.data ?? [];

  // Build tour → artist map and seed counts. Artists with no tours
  // still appear in the picker, just with `0 tours · 0 shows`.
  const tourIdToArtistId = new Map<string, string>();
  const counts = new Map<string, ArtistPickerCount>();
  for (const a of artists) counts.set(a.id, { tours: 0, shows: 0 });
  for (const t of tours) {
    if (!t.artist_id) continue;
    tourIdToArtistId.set(t.id, t.artist_id);
    const c = counts.get(t.artist_id);
    if (c) c.tours += 1;
  }

  // Upcoming shows — only fetch routing rows for tours that belong
  // to one of this workspace's artists, and only those on/after
  // today. day_type is a comma-separated string ("show", "show,press",
  // "festival,radio"…), so we filter to rows that mention show/festival
  // in JS rather than building a complex `or` clause.
  const tourIds = Array.from(tourIdToArtistId.keys());
  if (tourIds.length > 0) {
    const { data: routing } = await supabase
      .from('routing')
      .select('tour_id, day_type, date')
      .in('tour_id', tourIds)
      .gte('date', today);
    for (const r of routing ?? []) {
      const dt = (r.day_type ?? '').toLowerCase();
      if (!dt.includes('show') && !dt.includes('festival')) continue;
      const artistId = tourIdToArtistId.get(r.tour_id);
      if (!artistId) continue;
      const c = counts.get(artistId);
      if (c) c.shows += 1;
    }
  }

  const artistsWithCounts = artists.map((a) => ({
    ...a,
    tourCount: counts.get(a.id)?.tours ?? 0,
    showCount: counts.get(a.id)?.shows ?? 0,
  }));

  return listAppPageShell(
    <div className="mx-auto w-full max-w-7xl">
      <ArtistsList artists={artistsWithCounts} />
    </div>,
  );
}
