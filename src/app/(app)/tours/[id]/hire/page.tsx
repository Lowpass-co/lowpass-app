import { listAppPageShell } from '@/components/shell/app-page-shells';
import { GearLibraryClient } from '@/components/gear/GearLibraryClient';
import { TourBreadcrumbServer } from '@/components/tours/TourBreadcrumbServer';

export default async function TourHirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return listAppPageShell(
    <div className="mx-auto max-w-6xl space-y-4">
      <TourBreadcrumbServer tourId={id} />
      <h1 className="text-2xl font-bold text-lp-text">Tour Hire</h1>
      <GearLibraryClient tourId={id} />
    </div>
  );
}
