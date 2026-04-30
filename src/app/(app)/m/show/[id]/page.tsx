'use client';

import { MobileShowReader } from '@/components/mobile/MobileShowReader';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function MobileShowPage() {
  const params = useParams();
  const routingId = typeof params?.id === 'string' ? params.id : '';
  const { selectedTourId, hydrated } = useArtistTourContext();

  if (!hydrated || !routingId) {
    return <p className="px-4 py-16 text-center text-[16px] text-lp-text-secondary">Loading…</p>;
  }

  if (!selectedTourId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-[15px] text-lp-text-secondary">
        <p>Select a tour using the sidebar scope, then return here.</p>
        <Link href="/" className="mt-4 inline-block text-lp-orange">
          Dashboard
        </Link>
      </div>
    );
  }

  return <MobileShowReader tourId={selectedTourId} routingId={routingId} />;
}
