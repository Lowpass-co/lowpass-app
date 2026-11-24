'use client';

/* ============================================
   LOWPASS — Canonical Grid · <GridMenu>

   Styled popover (never native chrome), anchored to a cell/pill rect, with
   the current value ticked. Ports the playbox openMenu / openDayTypeMenu:
   plain options, optionally deletable (the day-type ✕) plus a footer action
   (＋ Add day type). Portaled to <body> so it escapes the grid's overflow.

   Also the grid's right-click menu (Nov 2026): items can carry a shortcut
   hint, be disabled (with the reason as the hint), be dangerous (red), and
   start a new group (a hairline above). It opens at the pointer and is kept
   on screen — flipped above / pulled left when it would run off the edge.
   ============================================ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  value: string;
  label?: string;
  deletable?: boolean;
  /** Greyed, not pickable, skipped by the arrow keys. */
  disabled?: boolean;
  /** Right-aligned hint: a shortcut (⌘C) or why it's disabled. */
  hint?: string;
  /** Destructive (Delete …) — drawn in the error colour. */
  danger?: boolean;
  /** Starts a new group — a hairline above it. */
  sep?: boolean;
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
  /** Small caption above the items (e.g. the section's name). */
  title?: string;
  /** Gap between the anchor and the menu's top, px. Default 4; a right-click
   *  menu opens AT the pointer (0). */
  gap?: number;
}

function norm(o: string | MenuItem): MenuItem {
  return typeof o === 'string' ? { value: o } : o;
}

export function GridMenu({ config, onClose }: { config: MenuConfig; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { anchor, options, current, optColors, onPick, onDelete, footer, title, gap = 4 } = config;

  // G1-C keyboard contract — the menu is focus-managed: arrows rove options,
  // Enter selects, Esc exits (returns to the grid), Tab closes and lets focus
  // move to the next entry (never traps). activeIndex starts on the current
  // value, else the first item that can be picked. Disabled items are skipped.
  const total = options.length + (footer ? 1 : 0);
  const enabled = (i: number) => i >= options.length || !norm(options[i]).disabled;
  const firstEnabled = (() => {
    for (let i = 0; i < total; i++) if (enabled(i)) return i;
    return 0;
  })();
  const currentIdx = options.findIndex((o) => norm(o).value === current && !norm(o).disabled);
  const [activeIndex, setActiveIndex] = useState(currentIdx >= 0 ? currentIdx : firstEnabled);
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < total; i += dir) if (enabled(i)) return i;
    return from;
  };

  // Keep it on screen: measure once laid out, then flip above the anchor /
  // pull left if it would cross the viewport edge.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + gap });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const M = 8;
    let left = anchor.left;
    let top = anchor.bottom + gap;
    if (r.width && left + r.width > window.innerWidth - M) left = Math.max(M, window.innerWidth - M - r.width);
    if (r.height && top + r.height > window.innerHeight - M) top = Math.max(M, anchor.bottom - gap - r.height);
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.left, anchor.bottom, gap]);

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
    if (!enabled(i)) return;
    if (i < options.length) onPick(norm(options[i]).value);
    else if (footer) footer.onClick();
  };

  return createPortal(
    <div
      ref={ref}
      className="lp-grid-pop"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((i) => step(i, 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((i) => step(i, -1));
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
      {title ? <div className="ttl">{title}</div> : null}
      {options.map((o, i) => {
        const it = norm(o);
        const on = it.value === current;
        const active = i === activeIndex && !it.disabled;
        return (
          <div
            key={`${it.value}-${i}`}
            className={`mi${on ? ' on' : ''}${it.disabled ? ' dis' : ''}${it.danger ? ' danger' : ''}${it.sep && i > 0 ? ' sep' : ''}`}
            role="menuitem"
            aria-selected={active}
            aria-disabled={it.disabled || undefined}
            onMouseEnter={() => {
              if (!it.disabled) setActiveIndex(i);
            }}
            style={active ? { background: 'var(--lp-surface-hover)' } : undefined}
            onClick={(e) => {
              if (it.disabled) return;
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
            {it.hint ? <span className="hint">{it.hint}</span> : null}
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
