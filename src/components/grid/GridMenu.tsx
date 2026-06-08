'use client';

/* ============================================
   LOWPASS — Canonical Grid · <GridMenu>

   Styled popover (never native chrome), anchored to a cell/pill rect, with
   the current value ticked. Ports the playbox openMenu / openDayTypeMenu:
   plain options, optionally deletable (the day-type ✕) plus a footer action
   (＋ Add day type). Portaled to <body> so it escapes the grid's overflow.
   ============================================ */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  value: string;
  label?: string;
  deletable?: boolean;
}

export interface MenuConfig {
  /** anchor rect (getBoundingClientRect of the pill / cell). */
  anchor: { left: number; bottom: number };
  options: (string | MenuItem)[];
  current?: string;
  onPick: (value: string) => void;
  onDelete?: (value: string) => void;
  footer?: { label: string; onClick: () => void };
}

function norm(o: string | MenuItem): MenuItem {
  return typeof o === 'string' ? { value: o } : o;
}

export function GridMenu({ config, onClose }: { config: MenuConfig; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Defer so the opening pointerdown doesn't immediately close it.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const { anchor, options, current, onPick, onDelete, footer } = config;

  return createPortal(
    <div
      ref={ref}
      className="lp-grid-pop"
      style={{ left: anchor.left, top: anchor.bottom + 4 }}
      role="menu"
    >
      {options.map((o, i) => {
        const it = norm(o);
        const on = it.value === current;
        return (
          <div
            key={`${it.value}-${i}`}
            className={`mi${on ? ' on' : ''}`}
            role="menuitem"
            onClick={(e) => {
              if ((e.target as HTMLElement).dataset.del !== undefined) return;
              onPick(it.value);
            }}
          >
            <span style={{ flex: 1 }}>
              {on ? '✓ ' : ''}
              {it.label ?? it.value}
            </span>
            {it.deletable && onDelete ? (
              <span
                className="dtdel"
                data-del=""
                role="button"
                aria-label={`Delete ${it.value}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(it.value);
                }}
              >
                ✕
              </span>
            ) : null}
          </div>
        );
      })}
      {footer ? (
        <div
          className="mi"
          role="menuitem"
          style={{ color: 'var(--lp-orange)' }}
          onClick={footer.onClick}
        >
          {footer.label}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
