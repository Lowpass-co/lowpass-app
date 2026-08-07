'use client';

/* ============================================
   LOWPASS — <NavRail> (S-1)

   The left rail from the canonical mock: grouped items, per-item badges, and a
   Collapse control that shrinks it to 52px icons on every page and every scope.

   IT KNOWS NOTHING ABOUT PAGES. Everything it renders comes from
   src/lib/nav/ia.ts and the pathname — the whole point of S-1 is that adding a
   surface in S-2..S-5 is a line of config, not a component edit.

   THE NAV RAIL IS NOT THE ROUTING RAIL. <RoutingRail> navigates DAYS inside one
   tour and owns the R5 collapse transition; this navigates the APP. They are
   different jobs and stay different components. At 1440 with both present, this
   one collapses to icons (see AppShellV3) so the day rail keeps its width — the
   app rail is a "where am I" you glance at, the day rail is a surface you work
   in, and the one you work in should not be the one that shrinks.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpineNavigate, isSpineHop } from '@/lib/nav/viewTransitionNav';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PendingSwap, PendingTint, PendingLive } from './PendingNav';
import type { RailView } from '@/lib/nav/ia';

const STORAGE_KEY = 'lowpass:navrail:collapsed';
/* One height for a group slot in BOTH states, so nothing below it moves when
   the rail folds. See the note at the group render. */
const GROUP_H = 30;

export interface NavRailProps {
  /* PLAIN DATA ONLY. This crosses an RSC boundary, so it must contain no
     functions — see "THE SERIALISATION BOUNDARY" in ia.ts. Passing the raw
     config (whose hrefs and matchers ARE functions) is what took Routing down
     in the first S-1 push. Hrefs, badges and the active flag are all resolved
     on the server by resolveRailView(). */
  entries: RailView[];
  /** Scope label for the rail head ("TOUR", "ARTIST", …). */
  scopeLabel: string;
  /** The ↑ link — "Artist" / "Workspace". Plain strings. */
  up: { label: string; href: string } | null;
  /** Start collapsed — set when a day rail is present (see the header note). */
  defaultCollapsed?: boolean;
}

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : <Icons.Circle className={className} />;
}

export function NavRail({
  entries, scopeLabel, up, defaultCollapsed = false,
}: NavRailProps) {
  /* Server-renders at the default, then reconciles from localStorage.
     Reading storage during render would be a hydration mismatch; a lazy
     initialiser can't see storage on the server either. So: an initialiser that
     is correct on the client from the first paint, and falls back to the
     server's default during SSR. No effect, so no set-state-in-effect. */
  const spineNavigate = useSpineNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultCollapsed;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === null ? defaultCollapsed : stored === '1';
    } catch {
      return defaultCollapsed; // private mode / storage disabled
    }
  });

  /* S-3b fix — the shell is client-side now and `defaultCollapsed` changes on
     soft navigation (riders list → rider editor is a same-layout move). Follow
     it ONLY while the user has never toggled: an explicit preference is a
     preference, and a default must not fight it. The ref, not storage, is read
     per change — storage is checked once here and updated in toggle(). */
  const hasUserPref = useRef<boolean>(false);
  if (typeof window !== 'undefined' && !hasUserPref.current) {
    try {
      hasUserPref.current = window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch { /* storage disabled → behave as no preference */ }
  }
  useEffect(() => {
    if (hasUserPref.current) return;
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  /* A REAL tooltip, not the native `title`.

     S-1 shipped `title` and the smoke found nothing on hover, twice. Two reasons:
     the rail sets overflow:hidden for its width transition (which clips anything
     that would sit beside an icon), and a native tooltip needs a second of
     stillness to appear at all — no use to someone scanning a 52px icon strip.

     So: fixed-positioned, rendered outside the rail's clipping context, shown
     instantly on hover AND on keyboard focus. */
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const railRef = useRef<HTMLElement | null>(null);

  const showTip = useCallback((el: HTMLElement, label: string | null) => {
    if (!label) return setTip(null);
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 8 });
  }, []);

  const toggle = useCallback(() => {
    hasUserPref.current = true; // an explicit toggle IS the preference
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch { /* persistence is a nicety, not a requirement */ }
      return next;
    });
  }, []);

  return (
    <nav
      ref={railRef}
      onMouseLeave={() => setTip(null)}
      aria-label={`${scopeLabel} navigation`}
      data-testid="nav-rail"
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{
        width: collapsed ? 52 : 236,
        flex: '0 0 auto',
        borderRight: '1px solid var(--lp-border)',
        background: 'var(--lp-panel)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Scope head — which level you're at, and the way up. */}
      <div
        style={{
          padding: '12px 14px 9px',
          borderBottom: '1px solid var(--lp-hairline, rgba(255,255,255,.05))',
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
        }}
      >
        {!collapsed ? (
          <>
            <span
              className="lp-mono"
              style={{
                fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)', whiteSpace: 'nowrap',
              }}
            >
              {scopeLabel}
            </span>
            {up ? (
              <Link
                href={up.href}
                data-testid="nav-rail-up"
                style={{
                  marginLeft: 'auto', color: 'var(--lp-text-secondary)',
                  fontSize: 11, whiteSpace: 'nowrap', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                {/* The arrow doubles as the spinner slot — same width either
                    way, so the label doesn't jump when the load starts. */}
                <PendingSwap className="h-3 w-3">
                  <span aria-hidden>↑</span>
                </PendingSwap>
                {up.label}
              </Link>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>
        {entries.map((entry, i) =>
          entry.kind === 'group' ? (
            /* SAME HEIGHT in both states. The first version let a 30px heading
               collapse to a 17px hairline, so every icon below it slid upward by
               13px per group — the smoke's "icons move a handful of pixels when
               they fold away, hard to trace which is which". Muscle memory only
               works if a thing stays where it was, so the grouping changes
               APPEARANCE on collapse, never position. */
            <div
              key={`g${i}`}
              className={collapsed ? undefined : 'lp-label-caps'}
              aria-hidden={collapsed ? true : undefined}
              style={{
                height: GROUP_H,
                display: 'flex',
                alignItems: collapsed ? 'center' : 'flex-end',
                padding: collapsed ? '0 6px' : '0 8px 5px',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-tertiary)',
                letterSpacing: '.1em',
              }}
            >
              {collapsed ? (
                i === 0 ? null : <span style={{ flex: 1, height: 1, background: 'var(--lp-border)' }} />
              ) : (
                entry.label
              )}
            </div>
          ) : (
            (() => {
              const { active, href, badge } = entry;
              /* Inside a Link, <PendingSwap> turns this icon into a spinner
                 while that route loads; outside one (a dead item) it is a
                 plain icon and the hook never runs. */
              const icon = <Icon name={entry.icon} className="h-3.5 w-3.5" />;
              const body = (
                <>
                  {href ? <PendingSwap>{icon}</PendingSwap> : icon}
                  {!collapsed ? (
                    <>
                      <span style={{ flex: 1, minWidth: 0 }}>{entry.label}</span>
                      {badge != null && badge !== '' ? (
                        <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                          {badge}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </>
              );
              const style: React.CSSProperties = {
                display: 'flex', alignItems: 'center', gap: 9,
                position: 'relative', // anchors the pending overlay
                padding: collapsed ? '9px 0' : '7px 8px',
                justifyContent: collapsed ? 'center' : undefined,
                borderRadius: 'var(--lp-radius-md)',
                fontSize: 'var(--lp-text-sm)',
                color: active ? 'var(--lp-text)' : href ? 'var(--lp-text-secondary)' : 'var(--lp-text-tertiary)',
                background: active ? 'color-mix(in srgb, var(--lp-orange) 12%, transparent)' : 'transparent',
                borderLeft: active ? '2px solid var(--lp-orange)' : '2px solid transparent',
                textDecoration: 'none',
                cursor: href ? 'pointer' : 'default',
                opacity: href ? 1 : 0.45,
                marginBottom: 1,
              };
              /* What the tooltip says: the label when collapsed (the icon alone
                 isn't enough), and why an item is dead when it has no page —
                 that one matters expanded too, which is what SHELL-07 caught. */
              const tipText = !href
                ? `${entry.label} — no page yet`
                : collapsed
                  ? entry.label
                  : null;
              const hover = {
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, tipText),
                onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, tipText),
                onBlur: () => setTip(null),
              };

              return href ? (
                <Link
                  key={entry.id} href={href} style={style} {...hover}
                  data-testid={`nav-item-${entry.id}`}
                  data-active={active ? 'true' : undefined}
                  aria-current={active ? 'page' : undefined}
                  /* R5-3 completion — when BOTH ends of the hop are spine
                     surfaces (routing / day sheets / advance), the ledger
                     folds into the rail via a view transition. The morph IS
                     the pending feedback on these hops (PendingNav's spinner
                     never fires because we take over the navigation). */
                  onClick={(e) => {
                    if (
                      e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
                      typeof window !== 'undefined' && isSpineHop(window.location.pathname, href)
                    ) {
                      e.preventDefault();
                      spineNavigate(href);
                    }
                  }}
                >
                  {/* Optimistic active: the row takes the destination's look the
                      instant it's clicked, so the click is acknowledged even
                      when the page behind it takes a second to arrive.
                      left:-2 reaches back over the row's own transparent 2px
                      border, so the marker lands exactly where the real active
                      one does rather than 2px inside it. */}
                  <PendingTint
                    style={{
                      top: 0, bottom: 0, left: -2, right: 0,
                      borderLeft: '2px solid var(--lp-orange)',
                      borderRadius: 'var(--lp-radius-md)',
                      background: 'color-mix(in srgb, var(--lp-orange) 12%, transparent)',
                    }}
                  />
                  {body}
                  <PendingLive label={entry.label} />
                </Link>
              ) : (
                <span
                  key={entry.id} style={style} {...hover} tabIndex={0}
                  data-testid={`nav-item-${entry.id}`} aria-disabled="true"
                >
                  {body}
                </span>
              );
            })()
          ),
        )}
      </div>

      {/* Rendered LAST and fixed-positioned: the rail clips its own overflow, so
          anything beside an icon has to escape that box to be seen at all. */}
      {tip ? (
        <div
          role="tooltip"
          data-testid="nav-tooltip"
          style={{
            position: 'fixed',
            top: tip.top,
            left: tip.left,
            transform: 'translateY(-50%)',
            zIndex: 60,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            padding: '5px 9px',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text)',
            boxShadow: '0 6px 20px rgba(0,0,0,.45)',
          }}
        >
          {tip.label}
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid var(--lp-hairline, rgba(255,255,255,.05))', padding: 8 }}>
        <button
          type="button"
          onClick={toggle}
          data-testid="nav-rail-toggle"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="btn-transition"
          style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%',
            justifyContent: collapsed ? 'center' : undefined,
            padding: collapsed ? '8px 0' : '6px 8px',
            border: 0, background: 'transparent', cursor: 'pointer',
            color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-xs)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </nav>
  );
}
