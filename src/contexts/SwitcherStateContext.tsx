/* ============================================
   LOWPASS — Sprint 8.3 §1 — <SwitcherStateContext>

   Holds the switcher-dropdown state (and the optimistic-prepend
   list of newly-created artists) at the workspace-level layout
   so it never unmounts on /artists/[id], /budget/[tourId],
   /advance/[tourId], /operations/[tourId] navigation.

   Sprint 8.1 §2 tried hoisting <ProductShell> + <ProductHeader>
   into per-product layouts; Next 16 RSC re-rendered the
   dynamic-segment subtree as a fresh React Element tree on
   params change anyway, dropping client-component instances
   inside despite same-position reconciliation. Sprint 8.2 §2
   patched with sessionStorage rehydration — works, but the
   wrapper still remounts and the user sees a close+reopen
   flash on artist switch. Adam's smoke: "still doesn't
   animate."

   Real fix: move the state ABOVE the dynamic segment.
   Mounted in src/app/(app)/layout.tsx alongside
   <ArtistTourProvider>. The (app) group has no dynamic
   segments at its level, so the provider's <useState> values
   live for the duration of the SPA session.

   Migrated state slices (per Adam's Sprint 8.3 §1 sign-off):
     - dropdownState, pane, exitingPane, paneDirection
       (from <ArtistTourSwitcher>'s local useState)
     - createdArtists
       (from <ArtistTourSwitcherClientWrapper>'s local useState)

   Left in the wrapper:
     - tours, toursLoading — keyed to selectedArtistId; the
       fetch effect re-fires on remount and is cheap. Lifting
       these would lose the fetch-cancel semantics on artist
       switch.
     - isCreateTourOpen / isCreateArtistOpen / tourToDelete —
       modal-open booleans. The modals mount inside the
       wrapper anyway; if the wrapper remounts mid-modal, the
       modal closes — that's desirable behavior on cross-
       product nav (don't carry a half-filled create form).

   sessionStorage from Sprint 8.2 §2 / §3: deleted entirely.
   With state in a never-unmounting provider, persistence is
   unnecessary. Tab close + reopen reverts to closed dropdown
   + empty createdArtists — acceptable per Adam's prompt.
   ============================================ */

'use client';

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { ArtistMin } from '@/components/shell-v2/ArtistTourSwitcherClientWrapper';

export type DropdownState = 'closed' | 'open' | 'closing';
export type Pane = 'artists' | 'tours';
export type PaneDirection = 'forward' | 'back';

interface SwitcherStateContextValue {
  dropdownState: DropdownState;
  setDropdownState: React.Dispatch<React.SetStateAction<DropdownState>>;
  pane: Pane;
  setPane: React.Dispatch<React.SetStateAction<Pane>>;
  exitingPane: Pane | null;
  setExitingPane: React.Dispatch<React.SetStateAction<Pane | null>>;
  paneDirection: PaneDirection;
  setPaneDirection: React.Dispatch<React.SetStateAction<PaneDirection>>;
  createdArtists: ArtistMin[];
  setCreatedArtists: React.Dispatch<React.SetStateAction<ArtistMin[]>>;
}

const SwitcherStateContext = createContext<SwitcherStateContextValue | null>(
  null,
);

export function SwitcherStateProvider({ children }: { children: ReactNode }) {
  const [dropdownState, setDropdownState] = useState<DropdownState>('closed');
  const [pane, setPane] = useState<Pane>('artists');
  const [exitingPane, setExitingPane] = useState<Pane | null>(null);
  const [paneDirection, setPaneDirection] =
    useState<PaneDirection>('forward');
  const [createdArtists, setCreatedArtists] = useState<ArtistMin[]>([]);

  return (
    <SwitcherStateContext.Provider
      value={{
        dropdownState,
        setDropdownState,
        pane,
        setPane,
        exitingPane,
        setExitingPane,
        paneDirection,
        setPaneDirection,
        createdArtists,
        setCreatedArtists,
      }}
    >
      {children}
    </SwitcherStateContext.Provider>
  );
}

/** Throws if called outside <SwitcherStateProvider>. */
export function useSwitcherState(): SwitcherStateContextValue {
  const ctx = useContext(SwitcherStateContext);
  if (!ctx) {
    throw new Error(
      'useSwitcherState must be used within <SwitcherStateProvider> ' +
        '(mounted in (app)/layout.tsx)',
    );
  }
  return ctx;
}
