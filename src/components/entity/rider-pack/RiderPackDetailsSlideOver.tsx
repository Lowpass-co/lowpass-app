'use client';

import { SlideOver } from '@/components/shell/SlideOver';

export type RiderPackDetails = {
  id: string;
  title: string | null;
  status: 'draft' | 'sent' | 'signed';
  recipientLabel: string;
  lastSentRelative: string;
  updatedRelative: string;
};

export default function RiderPackDetailsSlideOver({
  pack,
  onClose,
}: {
  pack: RiderPackDetails;
  onClose: () => void;
}) {
  return (
    <SlideOver open onClose={onClose} title={pack.title || 'Untitled pack'} subtitle={pack.recipientLabel}>
      <div className="space-y-5 text-sm">
        <section className="space-y-1">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Status</h4>
          <p className="capitalize">{pack.status}</p>
        </section>
        <section className="space-y-1">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Sharing log</h4>
          <p>Last sent: {pack.lastSentRelative}</p>
          <p>Updated: {pack.updatedRelative}</p>
        </section>
        <section className="space-y-1">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Comments</h4>
          <p className="text-lp-text-secondary">Threaded comments for rider-pack delivery are shown in the full editor.</p>
        </section>
      </div>
    </SlideOver>
  );
}
