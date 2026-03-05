/* ============================================
   LOWPASS — Edit Tour Page

   Edit tour details (name, dates, continent, etc.).
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArrowLeft } from 'lucide-react';
import { TourEditForm } from '@/components/tours/TourEditForm';

export default async function TourEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/tours/${id}`}
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
