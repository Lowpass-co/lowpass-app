import { GearLibraryClient } from '@/components/gear/GearLibraryClient';

export default async function TourHirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-lp-text">Tour Hire</h1>
      <GearLibraryClient tourId={id} />
    </div>
  );
}
