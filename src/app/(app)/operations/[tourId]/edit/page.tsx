/* ============================================
   LOWPASS — Operations · Edit Tour (Phase 4 unblock)

   /operations/[tourId]/edit — live tour-details edit form. Ports
   /tours/[id]/edit, inner content only (ProductShell + TourHeader come
   from /operations/[tourId]/layout.tsx).
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourEditForm } from '@/components/tours/TourEditForm';

export const dynamic = 'force-dynamic';

export default async function OperationsTourEditPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select(`
      *,
      artist:artists(*)
    `)
    .eq('id', tourId)
    .single();

  if (error || !tour) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pt-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/operations/${tourId}`}
          className="flex items-center gap-1 text-sm text-lp-text-secondary hover:text-lp-text"
        >
          <ArrowLeft size={16} />
          Back to tour
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Edit tour</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Update tour details. Routing is edited on the tour page.
        </p>
      </div>
      <TourEditForm tour={tour} />
    </div>
  );
}
