'use client';

/* ============================================
   LOWPASS — <TopBarV3> (S-1)

   workspace · artist · tour · mode pill · avatar. The mock's top bar.

   ONE PICKER, EVERYWHERE. The artist/tour switcher is <ArtistTourSwitcher> —
   the same component shell-v2 already uses — mounted here once and rendered
   identically at every scope. Two pickers that drift apart is precisely what
   this shell replaces, so this file does not roll its own; it hides the
   switcher at workspace and You scope (there is no artist or tour to pick) and
   otherwise shows exactly the control the rest of the app shows.

   THE MODE PILL EXISTS ONLY AT TOUR SCOPE. Not disabled, not empty — absent.
   Money and Production are properties of a tour; showing the pill at artist or
   workspace scope would imply you could be in "Money mode" for a workspace,
   which is not a thing.

   Every mode href comes from ia.ts (modeLandingHref), so clicking Money lands on
   Budget summary and clicking Production lands on Assets because the CONFIG says
   so, not because this component knows any URLs.
   ============================================ */

import Link from 'next/link';
import { DollarSign, Route, Package } from 'lucide-react';
import { PendingSwap, PendingTint, PendingLive } from './PendingNav';
import { modeLandingHref, MODE_LABEL, TOUR_MODES, type NavContext, type TourMode } from '@/lib/nav/ia';

const MODE_ICON: Record<TourMode, React.ComponentType<{ className?: string }>> = {
  tour: Route,
  money: DollarSign,
  production: Package,
};

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
}

export function TopBarV3({ ctx, workspaceName, switcher, right }: TopBarV3Props) {
  const showPicker = ctx.scope === 'tour' || ctx.scope === 'artist';
  const showModes = ctx.scope === 'tour' && !!ctx.tourId;

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

      {showModes ? (
        <div
          data-testid="mode-pill"
          role="tablist"
          aria-label="Tour modes"
          style={{
            margin: '0 auto', display: 'flex', gap: 2, padding: 3,
            background: 'var(--lp-surface)', border: '1px solid var(--lp-border)',
            borderRadius: 'var(--lp-radius-pill)',
          }}
        >
          {TOUR_MODES.map((m) => {
            const on = ctx.mode === m;
            const MIcon = MODE_ICON[m];
            return (
              <Link
                key={m}
                href={modeLandingHref(m, ctx.tourId as string)}
                role="tab"
                aria-selected={on}
                data-testid={`mode-${m}`}
                data-active={on ? 'true' : undefined}
                className="btn-transition"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  position: 'relative', // anchors the pending overlay
                  padding: '6px 18px', borderRadius: 'var(--lp-radius-pill)',
                  fontSize: 'var(--lp-text-xs)', fontWeight: 'var(--lp-weight-semibold)',
                  letterSpacing: '.06em', textTransform: 'uppercase',
                  textDecoration: 'none',
                  background: on ? 'var(--lp-orange)' : 'transparent',
                  color: on ? '#fff' : 'var(--lp-text-secondary)',
                }}
              >
                {/* Translucent, not the full orange the selected pill wears —
                    an opaque overlay would paint over the label. This says
                    "arming", the swapped icon says "working". */}
                <PendingTint
                  style={{
                    inset: 0, borderRadius: 'var(--lp-radius-pill)',
                    background: 'color-mix(in srgb, var(--lp-orange) 32%, transparent)',
                  }}
                />
                <PendingSwap className="h-3 w-3">
                  <MIcon className="h-3 w-3" />
                </PendingSwap>
                {MODE_LABEL[m]}
                <PendingLive label={MODE_LABEL[m]} />
              </Link>
            );
          })}
        </div>
      ) : (
        <span style={{ marginLeft: 'auto' }} />
      )}

      <div style={{ marginLeft: showModes ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
      </div>
    </header>
  );
}
