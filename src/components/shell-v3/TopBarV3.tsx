'use client';

/* ============================================
   LOWPASS — <TopBarV3> (S-1)

   workspace · artist · tour · avatar.

   THE MODE PILL IS GONE (UX simplification, Oct 2026). Tour / Money /
   Production was a second menu stacked on the sidebar; the tour now has ONE
   sidebar grouped by job (ia.ts TOUR_RAIL), so the bar only says where you are
   and lets you switch artist or tour.

   ONE PICKER, EVERYWHERE. The artist/tour switcher is <ArtistTourSwitcher> —
   the same component shell-v2 already uses — mounted here once and rendered
   identically at every scope. Two pickers that drift apart is precisely what
   this shell replaces, so this file does not roll its own; it hides the
   switcher at workspace and You scope (there is no artist or tour to pick) and
   otherwise shows exactly the control the rest of the app shows.
   ============================================ */

import Link from 'next/link';
import { PendingSwap, PendingLive } from './PendingNav';
import type { NavContext } from '@/lib/nav/ia';

export interface TopBarV3Props {
  ctx: NavContext;
  workspaceName: string;
  /** THE artist/tour picker. Supplied by the mounting layout, which already has
   *  the server data it needs — so this is literally the same
   *  <ArtistTourSwitcherClientWrapper> the rest of the app renders, not a
   *  second control that can drift from it. */
  switcher?: React.ReactNode;
  /** Rendered at the far right — the avatar menu the app already has. */
  right?: React.ReactNode;
  /** S-3b — the tourless product landings (/operations, /budget, /advance).
   *  Adam's call: the top bar reads GREYED OUT there — the tour chrome is
   *  present but inactive until a tour is picked — while the rail stays fully
   *  visible, because the workspace tier now carries real information. So:
   *  the mode pill renders disabled (grey, non-navigable, explains itself on
   *  hover) instead of absent, and the picker shows so the way forward is on
   *  the bar itself, not just in the prompt below. */
  landing?: boolean;
}

export function TopBarV3({ ctx, workspaceName, switcher, right, landing = false }: TopBarV3Props) {
  const showPicker = ctx.scope === 'tour' || ctx.scope === 'artist' || landing;

  return (
    <header
      data-testid="top-bar-v3"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 48, flex: '0 0 auto', padding: '0 14px',
        borderBottom: '1px solid var(--lp-border)',
        background: 'var(--lp-panel)',
      }}
    >
      {/* Workspace — always the way back to the top. */}
      <Link
        href="/artists"
        data-testid="top-bar-workspace"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}
      >
        {/* The mark is the spinner slot — same 8px either way, so the name
            doesn't shuffle sideways the moment you click it. */}
        <PendingSwap className="h-2 w-2">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--lp-orange)' }} aria-hidden />
        </PendingSwap>
        {workspaceName}
        <PendingLive label={workspaceName} />
      </Link>

      {showPicker ? (
        <>
          <span style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden>·</span>
          {/* THE picker — same component, same behaviour, every scope. */}
          {switcher}
        </>
      ) : null}

      <span style={{ marginLeft: 'auto' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
      </div>
    </header>
  );
}
