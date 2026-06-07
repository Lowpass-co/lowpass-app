'use client';

/* ============================================
   LOWPASS — <ColumnResizeHandle> (shared)

   Discoverable per-column drag handle on a header cell's right edge.
   At rest: a faint vertical divider (reads as a gridline). On hover:
   thickens to a brand-orange bar with a grab (col-resize) cursor, so it's
   discoverable. Same affordance as the budget grid's BUD-17 handle.
   Token-clean. Place inside a `position: relative` <th>.
   ============================================ */

import { useState } from 'react';

export function ColumnResizeHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize column"
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        right: -4,
        height: '100%',
        width: 9,
        cursor: 'col-resize',
        touchAction: 'none',
        zIndex: 3,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <span
        aria-hidden
        style={{
          width: hover ? 2 : 1,
          margin: '5px 0',
          borderRadius: 2,
          background: hover ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)',
          opacity: hover ? 1 : 0.4,
          transition: 'width 120ms ease, opacity 120ms ease, background 120ms ease',
        }}
      />
    </span>
  );
}
