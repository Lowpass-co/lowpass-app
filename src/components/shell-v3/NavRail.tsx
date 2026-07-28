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

import { useCallback, useState } from 'react';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { NavContext, RailEntry } from '@/lib/nav/ia';

const STORAGE_KEY = 'lowpass:navrail:collapsed';

export interface NavRailProps {
  entries: RailEntry[];
  ctx: NavContext;
  /** id from activeItemFor() — server-derived, never guessed on the client. */
  activeId: string | null;
  /** Scope label for the rail head ("TOUR", "ARTIST", …). */
  scopeLabel: string;
  /** The ↑ link — "Artist" / "Workspace". */
  up: { label: string; href: string } | null;
  /** Counts by badge key, supplied by the page's server data. */
  badges?: Record<string, string | number | null | undefined>;
  /** Start collapsed — set when a day rail is present (see the header note). */
  defaultCollapsed?: boolean;
}

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : <Icons.Circle className={className} />;
}

export function NavRail({
  entries, ctx, activeId, scopeLabel, up, badges = {}, defaultCollapsed = false,
}: NavRailProps) {
  /* Server-renders at the default, then reconciles from localStorage.
     Reading storage during render would be a hydration mismatch; a lazy
     initialiser can't see storage on the server either. So: an initialiser that
     is correct on the client from the first paint, and falls back to the
     server's default during SSR. No effect, so no set-state-in-effect. */
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultCollapsed;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === null ? defaultCollapsed : stored === '1';
    } catch {
      return defaultCollapsed; // private mode / storage disabled
    }
  });

  const toggle = useCallback(() => {
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
                }}
              >
                ↑ {up.label}
              </Link>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>
        {entries.map((entry, i) =>
          entry.kind === 'group' ? (
            collapsed ? (
              // Collapsed: a hairline stands in for the heading, so the grouping
              // survives without the words.
              i === 0 ? null : (
                <div key={`g${i}`} style={{ height: 1, background: 'var(--lp-border)', margin: '8px 6px' }} />
              )
            ) : (
              <div
                key={`g${i}`}
                className="lp-label-caps"
                style={{
                  fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)',
                  padding: '12px 8px 5px', letterSpacing: '.1em',
                }}
              >
                {entry.label}
              </div>
            )
          ) : (
            (() => {
              const active = entry.id === activeId;
              const href = entry.href?.(ctx) ?? null;
              const badge = entry.badge ? badges[entry.badge] : null;
              const body = (
                <>
                  <Icon name={entry.icon} className="h-3.5 w-3.5" />
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
              // Tooltip carries the label when collapsed, and explains a
              // disabled item either way.
              const title = href
                ? collapsed ? entry.label : undefined
                : `${entry.label} — no page yet`;

              return href ? (
                <Link
                  key={entry.id} href={href} style={style} title={title}
                  data-testid={`nav-item-${entry.id}`}
                  data-active={active ? 'true' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  {body}
                </Link>
              ) : (
                <span
                  key={entry.id} style={style} title={title}
                  data-testid={`nav-item-${entry.id}`} aria-disabled="true"
                >
                  {body}
                </span>
              );
            })()
          ),
        )}
      </div>

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
