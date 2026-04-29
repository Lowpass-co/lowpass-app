/* ============================================
   LOWPASS — Switch tour dropdown (Phase C nav redesign)

   Top-right pill on the Tour Hub. Lists this artist's other tours
   so operators can hop sideways without going up to the artist
   level. The TopBar's tour switcher (cross-page) stays — this is
   an in-page convenience that mirrors it.

   z-index: --lp-z-dropdown (1000) so it floats above the page
   surface. Uses the same outside-click-closes pattern the TopBar
   menus use.
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import type { TourHubSiblingTour } from '@/server/tours/getTourHubData';

export function TourSwitchDropdown({
  currentTourId,
  currentTourName,
  siblings,
}: {
  currentTourId: string;
  currentTourName: string;
  siblings: TourHubSiblingTour[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (siblings.length === 0) {
    // No siblings → nothing to switch to. Render an inert label so
    // the right-hand slot stays balanced visually with the back link
    // on the left.
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
        style={{
          borderColor: 'var(--lp-border)',
          background: 'var(--lp-surface)',
          color: 'var(--lp-text-tertiary)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
        }}
        aria-label="Only tour for this artist"
      >
        Only tour
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
        style={{
          borderColor: 'var(--lp-border)',
          background: 'var(--lp-surface)',
          color: 'var(--lp-text)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        Switch tour
        <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
      </button>
      {open ? (
        <div
          className="absolute right-0 mt-1 max-h-80 min-w-64 overflow-y-auto rounded-xl border py-1 shadow-lg"
          role="listbox"
          style={{
            zIndex: 'var(--lp-z-dropdown)',
            background: 'var(--lp-surface)',
            borderColor: 'var(--lp-border)',
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2 text-sm"
            role="option"
            aria-selected
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            <Check
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--color-lp-orange)' }}
            />
            <span className="truncate font-medium" style={{ color: 'var(--lp-text)' }}>
              {currentTourName}
            </span>
          </div>
          <div
            className="my-1"
            style={{ borderTop: '1px solid var(--lp-border)' }}
          />
          {siblings.map((t) => (
            <Link
              key={t.id}
              href={`/tours/${t.id}`}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm"
              role="option"
              aria-selected={t.id === currentTourId}
              onClick={() => setOpen(false)}
              style={{ color: 'var(--lp-text)' }}
            >
              <span aria-hidden className="block h-4 w-4 shrink-0" />
              <span className="truncate">{t.name}</span>
              {t.status !== 'active' ? (
                <span
                  className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                  style={{
                    background: 'color-mix(in srgb, var(--color-lp-status-not-started) 15%, transparent)',
                    color: 'var(--color-lp-status-not-started)',
                    letterSpacing: 'var(--lp-tracking-caps)',
                  }}
                >
                  {t.status}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
