/* ============================================
   LOWPASS — Advance Overview Page (UX22 phase 1)

   Server: fetch tour for breadcrumbs/header; the redesigned
   AdvanceOverview client owns the show list, filters, and modals.

   The legacy AdvanceFlightsPanel that lived above the show list has
   been retired here — flights belong in /budget (Travel section, UX09
   derives those rows) and on per-show advance pages (UX17 surfaces
   them via EntityChip references). Showing them at the top of /advance
   was redundant.
   ============================================ */

import { docDaysAppPageShell } from '@/components/shell/app-page-shells';
import { getDocDaysLeftRail } from '@/lib/shell/rails/docDaysForTour';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AdvanceOverview } from './AdvanceOverview';
import { TourBreadcrumbServer } from '@/components/tours/TourBreadcrumbServer';

export default async function TourAdvancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, name')
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  const dayRail = await getDocDaysLeftRail(id);

  return docDaysAppPageShell(
    <div className="mx-auto max-w-6xl space-y-6">
      <TourBreadcrumbServer tourId={id} />

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Advance — {tour.name}</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Manage advance forms and section progress for each show.
        </p>
      </div>

      <AdvanceOverview tourId={tour.id} />
    </div>,
    dayRail,
  );
}
