'use client';

/* ============================================
   LOWPASS — <SearchTriggerButton> (Sprint 10 §1.2)

   Client island for the ⌘K palette trigger inside the
   <UnifiedTopBar> server component. Reads useCommandPalette()
   so it can toggle the palette state — UnifiedTopBar stays
   server-side for auth + profile fetch.
   ============================================ */

import { Search } from 'lucide-react';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteContext';

export function SearchTriggerButton() {
  const palette = useCommandPalette();
  return (
    <button
      type="button"
      onClick={palette.show}
      aria-label="Open command palette"
      className="btn-transition flex min-w-0 max-w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left"
      style={{
        width: 'var(--lp-search-trigger-width)',
        borderColor: 'var(--lp-border)',
        color: 'var(--lp-text-secondary)',
        background: 'var(--lp-bg-secondary)',
      }}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm">Search…</span>
      </span>
      <kbd
        className="pointer-events-none hidden select-none rounded border px-1.5 py-0.5 font-mono sm:inline"
        style={{
          fontSize: 'var(--lp-text-2xs)',
          borderColor: 'var(--lp-border)',
          color: 'var(--lp-text-tertiary)',
          background: 'var(--lp-surface)',
        }}
      >
        ⌘K
      </kbd>
    </button>
  );
}
