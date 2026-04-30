/* ============================================
   LOWPASS — Previously Played trigger button (Phase 2 §C)

   Thin client wrapper: renders the "Previously played" button + the
   <PreviouslyPlayedSlideOver>. Fetches the current advance's section
   list lazily on first open so we can label past-show section_ids
   against this advance's section labels.
   ============================================ */

'use client';

import { useCallback, useState } from 'react';
import { History } from 'lucide-react';
import { PreviouslyPlayedSlideOver } from './PreviouslyPlayedSlideOver';

type SectionDef = {
  template_id: string;
  label: string;
  order?: number;
};

interface PreviouslyPlayedButtonProps {
  tourId: string;
  routingId: string;
}

export function PreviouslyPlayedButton({
  tourId,
  routingId,
}: PreviouslyPlayedButtonProps) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<SectionDef[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const handleOpen = useCallback(() => {
    setOpen(true);
    if (loadedFor === routingId) return;
    fetch(`/api/tours/${tourId}/advance/${routingId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: { instance?: { sections?: SectionDef[] } }) => {
        const list = (data?.instance?.sections ?? []) as SectionDef[];
        setSections(list);
        setLoadedFor(routingId);
      })
      .catch(() => {
        // Non-fatal — the slide-over still works using raw section_ids
        // as labels. Mark loaded so we don't retry on every open.
        setLoadedFor(routingId);
      });
  }, [tourId, routingId, loadedFor]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
        style={{
          fontSize: '13px',
          fontWeight: 500,
          borderColor: 'var(--lp-border)',
          background: 'var(--lp-surface)',
          color: 'var(--lp-text-secondary)',
        }}
        aria-label="Open previously-played sidebar"
      >
        <History className="h-3.5 w-3.5" />
        Previously played
      </button>
      <PreviouslyPlayedSlideOver
        open={open}
        onClose={() => setOpen(false)}
        routingId={routingId}
        currentSections={sections}
      />
    </>
  );
}
