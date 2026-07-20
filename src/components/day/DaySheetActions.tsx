'use client';

/* ============================================================
   LOWPASS — <DaySheetActions> (D1-2)

   Client island for the Day surface header: the "Day sheet…" button that opens
   the <DaySheetComposer> modal. Kept out of the server DaySheet so the page
   stays a server component.
   ============================================================ */

import { useState } from 'react';
import { DaySheetComposer } from '@/components/day/DaySheetComposer';

export function DaySheetActions({ routingId }: { routingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="daysheet-open-composer"
        className="btn-transition rounded-md border px-3 py-1.5 text-sm"
        style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
        title="Compose a Day Sheet PDF (Standard / Crew / Driver / Band / Compact)"
      >
        Day sheet…
      </button>
      {open ? <DaySheetComposer routingId={routingId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
