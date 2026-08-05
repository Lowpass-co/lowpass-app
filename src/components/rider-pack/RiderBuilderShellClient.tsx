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

/* B2 (rider decouple) — the left RiderSectionLibrary pane + the drag-drop
   zone are RETIRED: the builder now carries its own grouped navigation
   (fixed group tabs + per-group section rail + "Add section" from templates
   filtered by group — see RiderSectionBuilder + lib/rider-packs/groups.ts).
   This shell keeps the meta bar, the properties rail, and the CustomEvent
   seams (field-selected / field-updated / field-delete) unchanged. */

import { useEffect, useState } from 'react';
import { RiderTemplateMetaBar } from './RiderTemplateMetaBar';
import { RiderSectionBuilder } from './RiderSectionBuilder';
import { RiderFieldPropertiesPanel } from './RiderFieldPropertiesPanel';
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

  // Field-selection listener (canvas → shell).
  useEffect(() => {
    function onSelect(e: Event) {
      const ce = e as CustomEvent<RiderFieldSelection | null>;
      setSelected(ce.detail ?? null);
    }
    window.addEventListener(RIDER_FIELD_SELECTED_EVENT, onSelect);
    return () => window.removeEventListener(RIDER_FIELD_SELECTED_EVENT, onSelect);
  }, []);

  return (
    <div className="flex min-h-0 flex-1">
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
            canvas container ONLY (§RA6). B2: the builder owns group tabs,
            section rail and single-section canvas; the drop zone went with
            the library pane. */}
        <div className="lp-rider-builder-canvas flex min-h-0 flex-1 flex-col px-4 pb-12 pt-4">
          <RiderSectionBuilder packId={packId} />
        </div>
      </main>

      {/* Properties rail (§RA8). onChange → rider:field-updated;
          onDelete → rider:field-delete (both consumed by the canvas). */}
      <RiderFieldPropertiesPanel
        selected={selected}
        onChange={(next) => {
          // Optimistic — the panel reflects the edit immediately.
          setSelected((prev) => (prev ? { ...prev, type: next.type, label: next.label } : prev));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(RIDER_FIELD_UPDATED_EVENT, {
                detail: { id: next.id, patch: { label: next.label, type: next.type } },
              }),
            );
          }
        }}
        onDelete={(id) => {
          setSelected(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('rider:field-delete', { detail: { id } }));
          }
        }}
      />
    </div>
  );
}
