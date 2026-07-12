'use client';

/* ============================================================
   LOWPASS — <StartAdvancePanel> (alignment Stage A · A2)

   The graceful empty/error state for a per-show advance surface. Advance
   instances are created LAZILY (not at tour creation — that's by design), so a
   day the user opens before anyone has started its advance has no
   `advance_instance` and the GET can 404 / return null. Instead of the raw
   "Failed to load: 404" / "Advance not found." strings, we show an invitation:
   one primary action, "Start this advance", which POSTs to the existing create
   endpoint (applies the tour's default template) then reloads.

   NO auto-seed on GET — seeding is an explicit user action, so the "should this
   day have an advance?" question stays visible rather than being masked.
   ============================================================ */

import { useState } from 'react';
import { ClipboardList, Loader2, ChevronRight } from 'lucide-react';

export function StartAdvancePanel({
  tourId,
  routingId,
  onStarted,
}: {
  tourId: string;
  routingId: string;
  /** Called after a successful seed so the host can reload its data. */
  onStarted: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      // Same create call AdvanceOverview uses: an empty sections array seeds the
      // instance + a form config from the tour's default_advance_template_id.
      const res = await fetch(`/api/tours/${tourId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_id: routingId, sections: [] }),
      });
      if (!res.ok) throw new Error('Could not start this advance. Please try again.');
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start this advance.');
      setStarting(false);
    }
  };

  return (
    <div
      className="mx-auto my-8 flex max-w-md flex-col items-center rounded-xl border border-dashed p-8 text-center"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      <ClipboardList size={28} style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden />
      <p className="mt-3 text-sm font-medium" style={{ color: 'var(--lp-text)' }}>
        This show doesn&apos;t have an advance yet.
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
        Start one to build sections and send the venue intake.
      </p>
      <button
        type="button"
        onClick={start}
        disabled={starting}
        className="btn-transition mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{ color: 'var(--lp-text-inverse, #fff)', background: 'var(--color-lp-orange)' }}
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Start this advance
        {!starting ? <ChevronRight className="h-4 w-4" /> : null}
      </button>
      {error ? (
        <p className="mt-3 text-xs" style={{ color: 'var(--color-lp-error)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
