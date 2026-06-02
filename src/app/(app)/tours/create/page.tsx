/* ============================================
   LOWPASS — Create Tour

   Clean wizard: artist, tour details, counts.
   ============================================ */

import Link from 'next/link';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { TourWizard } from '@/components/tours/TourWizard';
import { PageHeader } from '@/components/ui/PageHeader';
import { ArrowLeft } from 'lucide-react';

export default async function CreateTourPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;
  const editTourId = params?.edit?.trim() || null;
  const isEdit = !!editTourId;

  return listAppPageShell(
    <div className="mx-auto max-w-2xl px-2">
      <nav className="mb-8 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-lp-text-secondary hover:text-lp-text transition-colors"
        >
          <ArrowLeft size={18} />
          Dashboard
        </Link>
        <span className="text-lp-text-tertiary">/</span>
        <Link
          href="/tours"
          className="text-sm text-lp-text-secondary hover:text-lp-text transition-colors"
        >
          Tours
        </Link>
        <span className="text-lp-text-tertiary">/</span>
        <span className="text-sm font-medium text-lp-text">{isEdit ? 'Edit tour' : 'New tour'}</span>
      </nav>

      <PageHeader
        title={isEdit ? 'Edit tour' : 'New tour'}
        subtitle="Choose an artist, set dates and region. You’ll add routing next."
        className="mb-10"
      />

      <TourWizard initialTourId={editTourId ?? undefined} />
    </div>
  );
}
