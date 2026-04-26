/* ============================================
   LOWPASS — Advance Overview Page

   Main advance management screen for a tour.
   Server: fetch tour for header/breadcrumbs; client: fetch advance data.
   ============================================ */

import Link from 'next/link';
import { docDaysAppPageShell } from '@/components/shell/app-page-shells';
import { getDocDaysLeftRail } from '@/lib/shell/rails/docDaysForTour';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AdvanceOverview } from './AdvanceOverview';
import { ChevronRight } from 'lucide-react';

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
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-lp-text-secondary">
        <Link href="/dashboard" className="hover:text-lp-text">
          Dashboard
        </Link>
        <ChevronRight size={14} className="text-lp-text-tertiary" />
        <Link href="/tours" className="hover:text-lp-text">
          Tours
        </Link>
        <ChevronRight size={14} className="text-lp-text-tertiary" />
        <Link href={`/tours/${id}`} className="hover:text-lp-text">
          {tour.name}
        </Link>
        <ChevronRight size={14} className="text-lp-text-tertiary" />
        <span className="text-lp-text">Advance</span>
      </nav>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-lp-text">
          Advance — {tour.name}
        </h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Manage advance forms and section progress for each show.
        </p>
      </div>

      <AdvanceOverview tourId={tour.id} tourName={tour.name} />
    </div>,
    dayRail
  );
}
