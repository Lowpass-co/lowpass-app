/* ============================================
   LOWPASS — Advance · Section Library (Variant parity §D)

   280px left rail in builder mode. Search input + scrollable list
   of LibraryCards (drag-source) + bottom CTA for blank custom
   sections. Each card represents a section template the user can
   drag onto the canvas drop zone.

   The seed library is hardcoded for now — these names mirror the
   defaults in advance_templates seeding (003_seed_advance_templates.sql).
   Workspace-custom templates and per-tour overrides are NOT shown
   here yet; that's a follow-up that requires loading from
   advance_form_configs / advance_layout_templates.

   Drag mechanism: cards expose draggable="true" + write the section
   id into the dataTransfer payload. The SectionDropZone sibling
   reads it on drop. Touching the existing AdvanceSectionBuilder's
   internal add-section flow is out of scope; on drop, the page
   triggers a router.refresh() so any server mutation is reflected.
   ============================================ */

'use client';

import { useState } from 'react';
import {
  Search,
  GripVertical,
  Plus,
  UtensilsCrossed,
  Speaker,
  ShieldCheck,
  Truck,
  ShoppingBag,
  MapPin,
  Banknote,
  ClipboardList,
} from 'lucide-react';

type LibrarySectionSeed = {
  id: string;
  label: string;
  fieldCount: number;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
};

const LIBRARY_SEEDS: LibrarySectionSeed[] = [
  { id: 'hospitality', label: 'Hospitality', fieldCount: 8, Icon: UtensilsCrossed },
  { id: 'tech_power', label: 'Technical & Power', fieldCount: 12, Icon: Speaker },
  { id: 'security_labor', label: 'Security & Labor', fieldCount: 6, Icon: ShieldCheck },
  { id: 'load_in', label: 'Load-in', fieldCount: 10, Icon: Truck },
  { id: 'load_out', label: 'Load-out', fieldCount: 10, Icon: Truck },
  { id: 'merchandise', label: 'Merchandise', fieldCount: 6, Icon: ShoppingBag },
  { id: 'logistics', label: 'Logistics', fieldCount: 15, Icon: MapPin },
  { id: 'settlement', label: 'Settlement', fieldCount: 10, Icon: Banknote },
];

export const SECTION_LIBRARY_DRAG_TYPE = 'application/x-lp-section-library-id';

export function AdvanceSectionLibrary({
  onAddBlank,
}: {
  /** Optional: invoked when the user clicks "+ Blank Custom Section".
   *  Wiring is left to the page; the existing builder owns the
   *  internal add-section endpoint. */
  onAddBlank?: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? LIBRARY_SEEDS.filter((s) =>
        s.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : LIBRARY_SEEDS;

  return (
    <aside
      className="advance-read-no-print flex shrink-0 flex-col"
      style={{
        width: 280,
        borderRight: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-panel)',
      }}
    >
      {/* Search */}
      <div
        className="shrink-0"
        style={{
          padding: 12,
          borderBottom: '1px solid var(--lp-border-subtle)',
        }}
      >
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{
              width: 14,
              height: 14,
              color: 'var(--lp-text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sections…"
            aria-label="Filter sections"
            style={{
              width: '100%',
              padding: '6px 8px 6px 26px',
              fontSize: '13px',
              background: 'var(--lp-bg-deep)',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 2,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Scrollable library list */}
      <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        <ul className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <li
              style={{
                fontSize: '12px',
                color: 'var(--lp-text-tertiary)',
                padding: 6,
                fontStyle: 'italic',
              }}
            >
              No matches.
            </li>
          ) : (
            filtered.map((seed) => (
              <li key={seed.id}>
                <LibraryCard seed={seed} />
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Bottom CTA — blank custom section */}
      <div
        className="shrink-0"
        style={{
          padding: 12,
          borderTop: '1px solid var(--lp-border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={onAddBlank}
          className="btn-transition flex w-full items-center justify-center gap-1.5"
          style={{
            height: 36,
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--lp-text-secondary)',
            background: 'transparent',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Blank custom section
        </button>
      </div>
    </aside>
  );
}

function LibraryCard({ seed }: { seed: LibrarySectionSeed }) {
  const Icon = seed.Icon;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SECTION_LIBRARY_DRAG_TYPE, seed.id);
        e.dataTransfer.setData('text/plain', seed.label);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="btn-transition flex items-center gap-2"
      style={{
        background: 'var(--lp-bg-deep)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 4,
        padding: '8px 10px',
        cursor: 'grab',
      }}
    >
      <GripVertical
        className="h-4 w-4 shrink-0"
        style={{ color: 'var(--color-lp-orange)' }}
        aria-hidden
      />
      <span
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 28,
          height: 28,
          background: 'var(--lp-surface)',
          color: 'var(--color-lp-orange)',
          borderRadius: 4,
        }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--lp-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {seed.label}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {seed.fieldCount} fields
        </div>
      </div>
      {/* Default-icons grid placeholder for the iconBar utility import */}
      <ClipboardList
        className="hidden h-3 w-3"
        aria-hidden
        style={{ color: 'var(--lp-text-tertiary)' }}
      />
    </div>
  );
}
