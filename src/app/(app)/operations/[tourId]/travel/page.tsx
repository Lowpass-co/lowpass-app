/* ============================================
   LOWPASS — Operations · Travel (UX simplification, Oct 2026)

   /operations/[tourId]/travel — every flight on the tour, in one list, with
   one place to add one. Until this page existed a flight could only be
   reached through its budget line, so "where do I put the flights?" had no
   answer in the nav.

   The page loads the tour and its roster (names for the "Who" field); the
   flights themselves are fetched client-side through /api/flights so a save
   in the slide-over and the list always read the same route.

   Money: a flight's cost reaches the budget through the one derived-line
   writer — the create/edit/delete routes call refreshDerivedLines. This page
   never writes a budget line.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TravelView } from '@/components/travel/TravelView';

export const dynamic = 'force-dynamic';

export default async function OperationsTravelPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  if (!profile?.workspace_id) notFound();

  const { data: tour } = await supabase
    .from('tours')
    .select('id, currency')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!tour) notFound();

  // Roster names → suggestions for "Who". Free text is still allowed: people
  // fly who aren't on the roster (guests, label reps).
  const { data: roster } = await supabase
    .from('tour_personnel')
    .select('person_id')
    .eq('tour_id', tourId);
  const personIds = [...new Set((roster ?? []).map((r) => r.person_id as string | null).filter((x): x is string => !!x))];
  let names: string[] = [];
  if (personIds.length) {
    const { data: persons } = await supabase.from('persons').select('full_name, preferred_name').in('id', personIds);
    names = (persons ?? [])
      .map((p) => String(p.full_name ?? '').trim() || String(p.preferred_name ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  return (
    <TravelView
      tourId={tour.id}
      tourCurrency={String(tour.currency ?? 'GBP').toUpperCase()}
      crewNames={names}
    />
  );
}
