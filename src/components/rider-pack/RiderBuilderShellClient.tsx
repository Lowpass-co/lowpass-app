/* ============================================
   LOWPASS — Rider · Builder Shell (§RA6)

   Three-pane wrapper around the rider section builder, mirroring
   src/components/advance/AdvanceBuilderShellClient.tsx:74-281:

     [RiderSectionLibrary 280px]
     [RiderTemplateMetaBar (sticky) + hashed canvas + drop zone]
     [RiderFieldPropertiesPanel 300px]

   Owns the CustomEvent loop that the canvas (§RA7) and properties
   panel (§RA8) plug into — same interim seam Advance uses
   (AdvanceBuilderShellClient.tsx:146-235) so the large builder keeps
   its internal selection state instead of a prop-thread refactor:

   - rider:section-drop  — shell → canvas. Fired when a library card is
     dropped on the canvas drop zone (or "Blank custom section" CTA).
     The §RA7 canvas listens and adds the matching template / a blank.
   - rider:field-selected — canvas → shell. The canvas dispatches the
     selected field def; this shell re-renders the properties panel.
   - rider:field-updated — shell → canvas. The properties panel's
     onChange dispatches a patch the canvas applies (its autosave
     persists it). Closes the loop.
   - rider:field-add (from RiderSectionLibrary, §RA5) is consumed by the
     CANVAS, not this shell.

   §RA6 scaffolds the two not-yet-built panes with placeholders:
   - canvas slot → RA7Placeholder (replaced in §RA7).
   - properties slot → inline empty-state rail (replaced by
     RiderFieldPropertiesPanel in §RA8).
   ============================================ */

'use client';

import { useEffect, useState } from 'react';
import { MousePointerClick, Plus } from 'lucide-react';
import { RiderSectionLibrary, RIDER_SECTION_DRAG_TYPE } from './RiderSectionLibrary';
import { RiderTemplateMetaBar } from './RiderTemplateMetaBar';
import { RiderSectionBuilder } from './RiderSectionBuilder';
import { useToast } from '@/components/ui/Toast';

/** Field selection event (canvas → shell). Interim CustomEvent seam,
 *  mirroring ADVANCE_FIELD_SELECTED_EVENT. */
export const RIDER_FIELD_SELECTED_EVENT = 'rider:field-selected';
/** Field patch event (shell → canvas). */
export const RIDER_FIELD_UPDATED_EVENT = 'rider:field-updated';
/** Section drop event (shell → canvas). */
export const RIDER_SECTION_DROP_EVENT = 'rider:section-drop';

export type RiderFieldSelection = {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string | null;
};

interface RiderBuilderShellClientProps {
  /** Pack id the builder edits. */
  packId: string;
  /** Pack / template name shown in the meta bar. */
  templateName: string | null;
  /** Active tab for the meta-bar toggle. */
  activeTab: 'show' | 'builder';
  showHref: string;
  builderHref: string;
}

export function RiderBuilderShellClient({
  packId,
  templateName,
  activeTab,
  showHref,
  builderHref,
}: RiderBuilderShellClientProps) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<RiderFieldSelection | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Field-selection listener (canvas → shell).
  useEffect(() => {
    function onSelect(e: Event) {
      const ce = e as CustomEvent<RiderFieldSelection | null>;
      setSelected(ce.detail ?? null);
    }
    window.addEventListener(RIDER_FIELD_SELECTED_EVENT, onSelect);
    return () => window.removeEventListener(RIDER_FIELD_SELECTED_EVENT, onSelect);
  }, []);

  const dispatchSectionDrop = (templateId: string, label: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent(RIDER_SECTION_DROP_EVENT, { detail: { templateId, label } }),
    );
  };

  const handleAddBlank = () => dispatchSectionDrop('__blank__', 'Custom section');

  return (
    <div className="flex min-h-0 flex-1">
      <RiderSectionLibrary onAddBlank={handleAddBlank} />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <RiderTemplateMetaBar
          templateName={templateName}
          onApplyToTours={() =>
            showToast('Apply to tour(s) lands with the rider builder canvas (§RA7).')
          }
          activeTab={activeTab}
          showHref={showHref}
          builderHref={builderHref}
        />

        {/* Hashed builder-mode canvas — .lp-rider-builder-canvas on the
            canvas container ONLY (§RA6). */}
        <div className="lp-rider-builder-canvas flex-1 px-4 pb-12 pt-4">
          <RiderSectionBuilder packId={packId} />

          {/* Section drop zone — accepts a library card and dispatches
              rider:section-drop. */}
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(RIDER_SECTION_DRAG_TYPE)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (!dragOver) setDragOver(true);
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(RIDER_SECTION_DRAG_TYPE);
              if (id) {
                e.preventDefault();
                dispatchSectionDrop(id, e.dataTransfer.getData('text/plain') || 'Section');
              }
              setDragOver(false);
            }}
            className="btn-transition mt-4 flex items-center justify-center gap-2"
            style={{
              minHeight: 72,
              borderRadius: 8,
              border: `2px dashed ${dragOver ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
              background: dragOver
                ? 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)'
                : 'transparent',
              color: dragOver ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Plus className="h-4 w-4" />
            Drag a section here, or use the library on the left
          </div>
        </div>
      </main>

      {/* Properties rail — §RA8 swaps RiderFieldPropertiesPanel in here. */}
      <RA8PropertiesPlaceholder selected={selected} />
    </div>
  );
}

/** Temporary stand-in for RiderFieldPropertiesPanel (§RA8). Shows the
 *  selected-field summary so the CustomEvent loop is observable now. */
function RA8PropertiesPlaceholder({ selected }: { selected: RiderFieldSelection | null }) {
  return (
    <aside
      className="advance-read-no-print hidden shrink-0 flex-col lg:flex"
      style={{ width: 300, borderLeft: '1px solid var(--lp-border-strong)', background: 'var(--lp-panel)' }}
    >
      <div className="border-b p-4" style={{ borderColor: 'var(--lp-border-subtle)' }}>
        <span className="lp-label-caps" style={{ color: 'var(--lp-text-tertiary)' }}>
          Field properties
        </span>
      </div>
      {selected ? (
        <div className="flex flex-col gap-2 p-4">
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--lp-text)' }}>{selected.label}</div>
          <div className="lp-mono" style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            {selected.type}
            {selected.required ? ' · required' : ''}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)', marginTop: 8 }}>
            Full editor lands in §RA8.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <MousePointerClick className="h-5 w-5" style={{ color: 'var(--lp-text-tertiary)' }} />
          <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            Select a field to edit its properties.
          </p>
        </div>
      )}
    </aside>
  );
}
