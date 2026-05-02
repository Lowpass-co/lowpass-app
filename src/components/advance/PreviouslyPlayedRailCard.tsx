/* ============================================
   LOWPASS — Advance · Previously Played rail card (Variant parity §B)

   Client island inside AdvanceShowRightRail's "PREVIOUSLY PLAYED"
   card. Lazy-fetches /api/advance/previously-played on mount so the
   card can show the most recent prior advance for the same venue
   (date + tour name) plus a "View past advance →" link that opens
   the existing PreviouslyPlayedSlideOver — which in turn lets the
   user pick + import sections.

   Replaces the floating PreviouslyPlayedButton at the top of the
   read view (Adam: "Being able to copy/preview that advance to
   import would be sick" — yes, that flow now lives in the rail).
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PreviouslyPlayedSlideOver } from './PreviouslyPlayedSlideOver';

type SectionDef = {
  template_id: string;
  label: string;
  order?: number;
};

type Preview = {
  date: string;
  tourName: string;
};

type ApiShape = {
  shows: { date: string; tourName: string }[];
  match: 'venue_id' | 'name_city' | 'none';
};

interface PreviouslyPlayedRailCardProps {
  routingId: string;
  /** Section list of the CURRENT advance, used by the slide-over to
   *  label sections in the past show's data. */
  currentSections: SectionDef[];
}

function formatPreviewDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
}

export function PreviouslyPlayedRailCard({
  routingId,
  currentSections,
}: PreviouslyPlayedRailCardProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedFor.current === routingId) return;
    fetchedFor.current = routingId;
    fetch(`/api/advance/previously-played?routingId=${encodeURIComponent(routingId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<ApiShape>) : Promise.reject(res.statusText)))
      .then((data) => {
        const first = data.shows[0];
        setPreview(first ? { date: first.date, tourName: first.tourName } : null);
      })
      .catch(() => {
        // Non-fatal — rail just shows the empty state.
        setPreview(null);
      })
      .finally(() => setLoaded(true));
  }, [routingId]);

  if (!loaded) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Looking up past shows…
      </div>
    );
  }

  return (
    <>
      {preview ? (
        <div className="flex flex-col gap-1.5">
          <span
            className="lp-mono"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--lp-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {formatPreviewDate(preview.date)}
          </span>
          <div
            style={{ fontSize: '13px', color: 'var(--lp-text-secondary)' }}
          >
            {preview.tourName}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-transition mt-1 w-fit text-left"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--color-lp-orange)',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            View past advance →
          </button>
        </div>
      ) : (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--lp-text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          No prior advance for this venue.
        </p>
      )}
      <PreviouslyPlayedSlideOver
        open={open}
        onClose={() => setOpen(false)}
        routingId={routingId}
        currentSections={currentSections}
      />
    </>
  );
}
