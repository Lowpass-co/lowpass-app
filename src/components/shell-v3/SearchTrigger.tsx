'use client';

/* ============================================
   LOWPASS — <SearchTrigger> (Nov 2026 nav audit)

   ⌘K has searched shows, people, flights… for months, but nothing on screen
   said so — the only button for it lived in the admin-only shell-v1 bar. This
   is that button, in the bar every page has. It opens the same palette, which
   now also finds pages and actions (src/lib/search/pages.ts).
   ============================================ */

import { useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteContext';

const noop = () => () => {};
/** "⌘K" on a Mac, "Ctrl K" elsewhere — "⌘K" on the server, so the first
 *  paint matches and the label settles on the client without an effect. */
function useShortcutLabel(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'),
    () => '⌘K',
  );
}

export function SearchTrigger() {
  const { show } = useCommandPalette();
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={show}
      data-testid="top-bar-search"
      aria-label={`Search and go to (${shortcut})`}
      className="inline-flex items-center btn-transition"
      style={{
        gap: 'var(--lp-space-2)',
        height: 30,
        padding: '0 var(--lp-space-2) 0 var(--lp-space-3)',
        fontSize: 'var(--lp-text-sm)',
        color: 'var(--lp-text-tertiary)',
        background: 'var(--lp-bg-secondary)',
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-md)',
        cursor: 'pointer',
      }}
    >
      <Search size={14} aria-hidden />
      <span className="hidden sm:inline" style={{ minWidth: 96, textAlign: 'left' }}>
        Search
      </span>
      <kbd
        className="hidden sm:inline"
        aria-hidden
        style={{
          fontFamily: 'inherit',
          fontSize: 'var(--lp-text-2xs)',
          padding: '0 var(--lp-space-1)',
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-sm)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {shortcut}
      </kbd>
    </button>
  );
}
