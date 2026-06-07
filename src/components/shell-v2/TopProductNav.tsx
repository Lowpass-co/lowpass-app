'use client';

/* ============================================
   LOWPASS — <TopProductNav> (two-bar shell, Bar 1)

   Horizontal product nav that replaces the 56px left ProductRail. Home ·
   Operations · Budget · Advance, entitlement-gated, with the same
   tour-scope dimming + homeHref behaviour the rail had.

   Each product reveals its sub-tabs as a hover/focus DROPDOWN so the
   user can jump straight to a sub-page in one load (hover "Operations" →
   click "Rooming"). Accessible: opens on hover AND keyboard focus;
   ArrowUp/Down moves through items; Escape closes; a caret button gives
   touch/no-hover users a tap target (the label still navigates to the
   product root). Token-clean.
   ============================================ */

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Settings } from 'lucide-react';
import { useEntitlements } from '@/lib/entitlements';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import {
  PRODUCTS,
  getProductSubItems,
  resolveProductHref,
  type ProductRailActive,
} from './productNav';

interface TopProductNavProps {
  active: ProductRailActive;
  homeHref?: string;
}

export function TopProductNav({ active, homeHref }: TopProductNavProps) {
  const entitlements = useEntitlements();
  const { selectedTourId } = useArtistTourContext();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback((key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenKey(key);
  }, []);
  const close = useCallback(() => setOpenKey(null), []);

  return (
    <nav
      className="flex items-stretch gap-0.5"
      aria-label="Product navigation"
    >
      {PRODUCTS.map((p) => {
        if (!entitlements[p.flag]) return null;
        const isActive = active === p.key;
        const { href, tourRequired } = resolveProductHref(p, {
          selectedTourId: selectedTourId ?? null,
          homeHref,
        });
        const subItems = tourRequired
          ? []
          : getProductSubItems(p.key, {
              selectedTourId: selectedTourId ?? null,
              homeHref,
            });
        const hasMenu = subItems.length > 0;
        const isOpen = openKey === p.key && hasMenu;

        return (
          <div
            key={p.key}
            className="relative flex items-center"
            onMouseEnter={() => hasMenu && open(p.key)}
            onMouseLeave={close}
            onBlur={(e) => {
              // Close when focus leaves the whole product group.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                close();
              }
            }}
            style={{
              borderRadius: 'var(--lp-radius-md)',
              background: isActive
                ? 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)'
                : 'transparent',
            }}
          >
            <Link
              href={href}
              className="btn-transition inline-flex items-center gap-1.5 rounded-md py-1.5 pl-2.5"
              style={{
                paddingRight: hasMenu ? 4 : 10,
                color: isActive ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                opacity: tourRequired ? 0.45 : 1,
              }}
              title={tourRequired ? `${p.label} — pick a tour first` : p.label}
              aria-disabled={tourRequired || undefined}
              aria-current={isActive ? 'page' : undefined}
              onFocus={() => hasMenu && open(p.key)}
              onKeyDown={(e) => {
                if (hasMenu && e.key === 'ArrowDown') {
                  e.preventDefault();
                  open(p.key);
                  requestAnimationFrame(() => {
                    document.getElementById(`topnav-${p.key}-item-0`)?.focus();
                  });
                } else if (e.key === 'Escape') {
                  close();
                }
              }}
            >
              <p.Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
              {p.label}
            </Link>
            {hasMenu ? (
              <button
                type="button"
                aria-label={`${p.label} menu`}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setOpenKey((cur) => (cur === p.key ? null : p.key))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                }}
                className="btn-transition inline-flex items-center rounded-md py-1.5 pr-2"
                style={{
                  color: isActive ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)',
                  opacity: tourRequired ? 0.45 : 1,
                }}
              >
                <ChevronDown
                  className="h-3 w-3"
                  style={{
                    transition: 'transform var(--lp-duration-fast) var(--lp-ease-standard)',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                  }}
                  aria-hidden
                />
              </button>
            ) : null}

            {isOpen ? (
              <div
                role="menu"
                aria-label={`${p.label} pages`}
                className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border py-1"
                style={{
                  background: 'var(--lp-surface)',
                  borderColor: 'var(--lp-border-strong)',
                  boxShadow: 'var(--lp-shadow-popover)',
                }}
                onKeyDown={(e) => {
                  const items = Array.from(
                    e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
                  );
                  const idx = items.indexOf(document.activeElement as HTMLElement);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    items[Math.min(items.length - 1, idx + 1)]?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (idx <= 0) {
                      close();
                    } else {
                      items[idx - 1]?.focus();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                  }
                }}
              >
                {subItems.map((s, i) => (
                  <Link
                    key={s.href}
                    id={`topnav-${p.key}-item-${i}`}
                    href={s.href}
                    role="menuitem"
                    onClick={close}
                    className="btn-transition block px-3 py-1.5"
                    style={{
                      fontSize: '13px',
                      color: 'var(--lp-text)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)';
                      e.currentTarget.style.color = 'var(--color-lp-orange)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--lp-text)';
                    }}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Settings — neutral corner destination (was at the rail bottom). */}
      <Link
        href="/settings"
        className="btn-transition inline-flex items-center justify-center rounded-md px-2 py-1.5"
        style={{ color: 'var(--lp-text-tertiary)' }}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" strokeWidth={2} aria-hidden />
      </Link>
    </nav>
  );
}
