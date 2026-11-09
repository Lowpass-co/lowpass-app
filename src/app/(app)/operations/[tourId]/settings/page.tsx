/* ============================================
   LOWPASS — Tour settings › Details (Nov 2026, Adam)

   /operations/[tourId]/settings. The tour's own facts — name, artist, dates,
   currency, region — with Edit (the canonical EditTourSlideOver, whose date
   change lists any show that would fall outside the new dates) and Delete.
   Before this, nothing in the app linked to a tour editor at all.

   Sits under Tour settings with Dates & routing and Money (TourSettingsTabs).
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui/PageHeader';
import { TourSettingsTabs } from '@/components/tour-settings/TourSettingsTabs';
import { TourDetailsPanel } from '@/components/tour-settings/TourDetailsPanel';
import { canAccess, fetchActiveGrants, getActiveMembership } from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

export default async function TourSettingsDetailsPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/operations/${tourId}/settings`);

  const membership = await getActiveMembership(supabase, user.id);
  const grants = membership ? await fetchActiveGrants(supabase, membership, user.id) : [];
  const canWrite = !!membership && canAccess(membership, grants, 'page', 'operations.routing', 'write');

  const [{ data: tour }, { data: routing }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, start_date, end_date, currency, continent, artist_id, artist:artists(id, name)')
      .eq('id', tourId)
      .maybeSingle(),
    supabase.from('routing').select('id, date, city, venue_name').eq('tour_id', tourId).order('date'),
  ]);
  if (!tour) notFound();
  const t = tour as unknown as {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    currency: string | null;
    continent: string | null;
    artist_id: string | null;
    artist: { id: string; name: string } | null;
  };
  const rows = (routing ?? []) as Array<{ id: string; date: string; city: string | null; venue_name: string | null }>;

  return (
    <div className="space-y-6 px-4 pt-6" style={{ paddingBottom: 'var(--lp-space-8)' }}>
      <PageHeader
        title="Tour settings"
        subtitle="The tour’s name, dates and currency. Days and venues are under Dates & routing; approval, overheads and exchange rates under Money."
        actions={<TourSettingsTabs tourId={tourId} active="details" />}
      />
      <TourDetailsPanel
        tourId={t.id}
        artist={t.artist ? { id: t.artist.id, name: t.artist.name } : null}
        initial={{ name: t.name, start_date: t.start_date, end_date: t.end_date, currency: t.currency, continent: t.continent }}
        dayCount={rows.length}
        routingDates={rows}
        canWrite={canWrite}
      />
    </div>
  );
}
