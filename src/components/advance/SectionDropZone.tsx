/* ============================================
   LOWPASS — Advance · Section Drop Zone (Variant parity §D.6)

   h-24 dashed-border drop target rendered below the last section
   card in builder mode. Accepts drags from AdvanceSectionLibrary
   (seed cards) — not from the existing builder's internal section
   reorder, which has its own DnD scoped to the canvas.

   On drop: invokes onDrop(seedId, label). The page wires this to
   either the builder's add-section flow (via router.refresh after
   a server mutation) or surfaces "wiring TODO" since the existing
   add-section endpoint is internal to AdvanceSectionBuilder.
   ============================================ */

'use client';

import { useState } from 'react';
import {
  SECTION_LIBRARY_DRAG_TYPE,
  FIELD_LIBRARY_DRAG_TYPE,
} from './AdvanceSectionLibrary';

interface SectionDropZoneProps {
  onDrop: (seedId: string, label: string) => void;
}

export function SectionDropZone({ onDrop }: SectionDropZoneProps) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        // Accept whole-section drags (group) OR single-field drags (§1).
        if (
          e.dataTransfer.types.includes(SECTION_LIBRARY_DRAG_TYPE) ||
          e.dataTransfer.types.includes(FIELD_LIBRARY_DRAG_TYPE)
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        // advance-builder-fixes §1 — single field dropped from the
        // library. Forward to the canvas via the window event the
        // builder listens on (same path as the click-to-add).
        const fieldRaw = e.dataTransfer.getData(FIELD_LIBRARY_DRAG_TYPE);
        if (fieldRaw) {
          try {
            const detail = JSON.parse(fieldRaw);
            window.dispatchEvent(
              new CustomEvent('advance:field-add', { detail }),
            );
          } catch {
            /* malformed payload — ignore */
          }
          return;
        }
        const seedId = e.dataTransfer.getData(SECTION_LIBRARY_DRAG_TYPE);
        const label = e.dataTransfer.getData('text/plain') ?? seedId;
        if (seedId) onDrop(seedId, label);
      }}
      className="advance-read-no-print flex items-center justify-center"
      style={{
        height: 96,
        border: `1px dashed ${over ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
        borderRadius: 4,
        background: over
          ? 'color-mix(in srgb, var(--color-lp-orange) 5%, transparent)'
          : 'transparent',
        color: over
          ? 'var(--color-lp-orange)'
          : 'var(--lp-text-tertiary)',
        fontSize: '13px',
        transition:
          'border-color 120ms ease, background-color 120ms ease, color 120ms ease',
      }}
    >
      Drop a section or field here
    </div>
  );
}
