/* ============================================
   LOWPASS — Tour Breadcrumb context (Phase D nav redesign)

   Resolves the identity strings the persistent TourBreadcrumb needs:
   { artistId, artistName, tourId, tourName }. Single small query
   joining tours → artists; returns null when the tour can't be
   resolved so the breadcrumb can render nothing rather than
   showing fallback labels.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type TourBreadcrumbContext = {
  artistId: string;
  artistName: string;
  tourId: string;
  tourName: string;
};

export async function getTourBreadcrumbContext(
  supabase: SupabaseClient,
  tourId: string,
): Promise<TourBreadcrumbContext | null> {
  const { data } = await supabase
    .from('tours')
    .select('id, name, artist:artists(id, name)')
    .eq('id', tourId)
    .maybeSingle();

  if (!data) return null;

  const artistRel = (data as { artist?: unknown }).artist;
  const artist = Array.isArray(artistRel) ? artistRel[0] : artistRel;
  if (!artist || typeof artist !== 'object') return null;
  const a = artist as { id?: string; name?: string | null };
  if (!a.id) return null;

  return {
    artistId: a.id,
    artistName: a.name ?? 'Artist',
    tourId: (data as { id: string }).id,
    tourName: (data as { name?: string | null }).name ?? 'Tour',
  };
}
