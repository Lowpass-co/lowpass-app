'use client';

/* ============================================
   LOWPASS — <TopBarV3> (S-1)

   workspace · artist · tour · avatar.

   THE MODE PILL IS GONE (UX simplification, Oct 2026). Tour / Money /
   Production was a second menu stacked on the sidebar; the tour now has ONE
   sidebar grouped by job (ia.ts TOUR_RAIL), so the bar only says where you are
   and lets you switch artist or tour.

   ONE PICKER, EVERYWHERE. The artist/tour picker is <ArtistTourPicker>
   (src/components/picker, Oct 2026 redesign), mounted here once and rendered
   identically at every scope. Two pickers that drift apart is precisely what
   this shell replaces, so this file does not roll its own; it hides the
   switcher at workspace and You scope (there is no artist or tour to pick) and
   otherwise shows exactly the control the rest of the app shows.
   ============================================ */

import Image from 'next/image';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PendingSwap, PendingLive } from './PendingNav';
import { SearchTrigger } from './SearchTrigger';
import type { NavContext } from '@/lib/nav/ia';

export interface TopBarV3Props {
  ctx: NavContext;
  workspaceName: string;
  /** The workspace control (the switcher — a dropdown for people in 2+
   *  workspaces, a plain label otherwise). Shown ONCE, here, beside the logo
   *  (Nov 2026, Adam: "it says my workspace twice"). Absent → a plain link. */
  workspace?: React.ReactNode;
  /** THE artist/tour picker. Supplied by the mounting layout, which already has
   *  the server data it needs — the one <ArtistTourPicker>, not a second
   *  control that can drift from it. */
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

export function TopBarV3({ ctx, workspaceName, workspace, switcher, right, landing = false }: TopBarV3Props) {
  // Nov 2026: on the workspace pages too — the home page is where you start,
  // and the fastest way into a tour was hidden exactly there. (Not on the You
  // pages: settings aren't about a tour.)
  const showPicker = ctx.scope === 'tour' || ctx.scope === 'artist' || ctx.scope === 'workspace' || landing;

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
      {/* The logo, top left on every page (Nov 2026, Adam — it replaced an
          orange square). Home = the workspace's artists. */}
      <Link
        href="/artists"
        aria-label="Lowpass — home"
        data-testid="top-bar-logo"
        style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}
      >
        <Image src="/lowpass-logo.png" alt="" width={36} height={28} className="h-7 w-auto" priority />
        {/* Loading home: a small spinner on the logo's corner, so the bar
            doesn't shift. */}
        <span style={{ position: 'absolute', right: -6, bottom: -2, display: 'inline-flex' }}>
          <PendingSwap className="h-3 w-3">
            <></>
          </PendingSwap>
        </span>
        <PendingLive label="home" />
      </Link>

      {workspace ?? (
        <Link
          href="/artists"
          data-testid="top-bar-workspace"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)',
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          {/* The icon is the spinner slot — same size either way, so the name
              doesn't shuffle sideways the moment you click it. */}
          <PendingSwap className="h-3.5 w-3.5">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
          </PendingSwap>
          {workspaceName}
          <PendingLive label={workspaceName} />
        </Link>
      )}

      {showPicker ? (
        <>
          <span style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden>·</span>
          {/* THE picker — same component, same behaviour, every scope. */}
          {switcher}
        </>
      ) : null}

      <span style={{ marginLeft: 'auto' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SearchTrigger />
        {right}
      </div>
    </header>
  );
}
