'use client';

/* ============================================
   LOWPASS — Canonical Grid · <GridMenu>

   Styled popover (never native chrome), anchored to a cell/pill rect, with
   the current value ticked. Ports the playbox openMenu / openDayTypeMenu:
   plain options, optionally deletable (the day-type ✕) plus a footer action
   (＋ Add day type). Portaled to <body> so it escapes the grid's overflow.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
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
  /** colour-code each option (dropdown columns) by its optColor. */
  optColors?: Record<string, string>;
  onPick: (value: string) => void;
  onDelete?: (value: string) => void;
  footer?: { label: string; onClick: () => void };
}

function norm(o: string | MenuItem): MenuItem {
  return typeof o === 'string' ? { value: o } : o;
}

export function GridMenu({ config, onClose }: { config: MenuConfig; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { anchor, options, current, optColors, onPick, onDelete, footer } = config;

  // G1-C keyboard contract — the menu is focus-managed: arrows rove options,
  // Enter selects, Esc exits (returns to the grid), Tab closes and lets focus
  // move to the next entry (never traps). activeIndex starts on the current value.
  const total = options.length + (footer ? 1 : 0);
  const currentIdx = Math.max(0, options.findIndex((o) => norm(o).value === current));
  const [activeIndex, setActiveIndex] = useState(currentIdx);

  useEffect(() => {
    // Focus the menu so it captures keys (the grid stops handling them while a
    // menu is open). Deferred so the opening keystroke doesn't leak through.
    const f = setTimeout(() => ref.current?.focus(), 0);
    // Defer outside-close so the opening pointerdown doesn't immediately close it.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      clearTimeout(f);
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const fireIndex = (i: number) => {
    if (i < options.length) onPick(norm(options[i]).value);
    else if (footer) footer.onClick();
  };

  return createPortal(
    <div
      ref={ref}
      className="lp-grid-pop"
      style={{ left: anchor.left, top: anchor.bottom + 4 }}
      role="menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, total - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          fireIndex(activeIndex);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'Tab') {
          // Never trap — close and let focus move to the next entry point.
          onClose();
        }
      }}
    >
      {options.map((o, i) => {
        const it = norm(o);
        const on = it.value === current;
        const active = i === activeIndex;
        return (
          <div
            key={`${it.value}-${i}`}
            className={`mi${on ? ' on' : ''}`}
            role="menuitem"
            aria-selected={active}
            onMouseEnter={() => setActiveIndex(i)}
            style={active ? { background: 'var(--lp-surface-hover)' } : undefined}
            onClick={(e) => {
              if ((e.target as HTMLElement).dataset.del !== undefined) return;
              onPick(it.value);
            }}
          >
            <span style={{ flex: 1, color: optColors?.[it.value] }}>
              {optColors?.[it.value] ? (
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: optColors[it.value],
                    marginRight: 7,
                    verticalAlign: 'middle',
                  }}
                />
              ) : null}
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
          aria-selected={activeIndex === options.length}
          onMouseEnter={() => setActiveIndex(options.length)}
          style={{
            color: 'var(--lp-orange)',
            ...(activeIndex === options.length ? { background: 'var(--lp-surface-hover)' } : {}),
          }}
          onClick={footer.onClick}
        >
          {footer.label}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
