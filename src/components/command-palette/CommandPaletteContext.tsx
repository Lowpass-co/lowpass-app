'use client';

/* ============================================
   LOWPASS — CommandPaletteContext (UX08b)

   Single source of truth for the palette open/close state. Provided by
   AppShell (which mounts the global instance) and consumed by both the
   palette itself and the TopBar's ⌘K trigger button. Two-way binding
   without prop drilling.
   ============================================ */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type CommandPaletteContextValue = {
  open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, show, hide, toggle }),
    [open, show, hide, toggle],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    // Safe fallback so consumers (e.g. TopBar in isolation) don't crash
    // outside the provider; the no-op flow keeps the trigger button quiet.
    return {
      open: false,
      show: () => {},
      hide: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
