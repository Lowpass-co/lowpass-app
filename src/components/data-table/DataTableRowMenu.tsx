'use client';

/* ============================================
   LOWPASS — a DataTable row's right-click menu (Nov 2026, Adam: "the
   tables need right click menus")

   Opt-in through DataTable's `rowMenu`. Opens at the pointer, pulls itself
   back on screen, closes on a pick, a click elsewhere, Escape or a scroll.
   ============================================ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** A thin line above this item. */
  sep?: boolean;
  /** A short note on the right (a shortcut or the current value). */
  hint?: string;
}

export function DataTableRowMenu({ x, y, items, onClose }: { x: number; y: number; items: RowMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const ny = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y;
    if (nx !== x || ny !== y) setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed min-w-52 rounded-xl border p-1"
      style={{
        top: pos.y,
        left: pos.x,
        zIndex: 'var(--lp-z-dropdown)',
        borderColor: 'var(--lp-border)',
        backgroundColor: 'var(--lp-surface)',
        boxShadow: 'var(--lp-shadow-lg)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`}>
          {it.sep && i > 0 ? <div className="my-1 h-px" style={{ backgroundColor: 'var(--lp-border)' }} /> : null}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-lp-surface-hover"
            style={{ color: it.danger ? 'var(--color-lp-error)' : 'var(--lp-text)' }}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.hint ? <span className="shrink-0 text-xs text-lp-text-tertiary">{it.hint}</span> : null}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
