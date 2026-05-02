/* ============================================
   LOWPASS — Advance · Builder Shell (Variant parity §D + followup §G)

   Three-pane wrapper around the existing AdvanceSectionBuilder:
     [AdvanceSectionLibrary 280px]
     [TemplateMetaBar (sticky) + canvas + SectionDropZone]
     [AdvanceFieldPropertiesPanel 300px]

   Owns:
   - Copy-from-show modal (lazy-fetches /api/tours/[id]/advance?all=true
     on first open, mounts CopyAdvanceModal with the current routingId
     pre-selected as the destination — source picker is the modal's job).
   - Field-properties selection via CustomEvent interim. The existing
     5346-line AdvanceSectionBuilder owns its own internal field-def
     selection state; lifting it for a clean prop-thread is a separate
     refactor. This shell listens for `advance:field-selected` events
     dispatched by the canvas and re-renders the properties panel.
     Passing edits BACK requires a corresponding event the canvas
     listens to — out of scope here; the panel's onChange currently
     stubs.
   - Apply-to-tours: surfaced-but-unwired. The slide-over needs both
     a dates list AND a templates list; the templates fetch path
     isn't reachable from this shell without touching the builder.
     Surfaces a toast for now.
   ============================================ */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdvanceSectionLibrary } from './AdvanceSectionLibrary';
import { TemplateMetaBar } from './TemplateMetaBar';
import { AdvanceFieldPropertiesPanel } from './AdvanceFieldPropertiesPanel';
import { SectionDropZone } from './SectionDropZone';
import { AdvanceSectionBuilderDynamic } from './AdvanceSectionBuilderDynamic';
import {
  CopyAdvanceModal,
  type AdvanceDateItem,
} from './CopyAdvanceModal';
import { useToast } from '@/components/ui/Toast';

/** Field selection event payload — Phase G.4 CustomEvent interim.
 *  The canvas's field-def row dispatches this on click; this shell
 *  listens and re-renders the FieldPropertiesPanel with the payload. */
export const ADVANCE_FIELD_SELECTED_EVENT = 'advance:field-selected';

type FieldSelectionDetail = {
  id: string;
  type: 'text' | 'checkbox' | 'number' | 'dropdown' | 'file';
  label: string;
  required: boolean;
  helpText?: string;
  defaultAssigneeId?: string | null;
  dueOffsetDays?: number | null;
};

interface AdvanceBuilderShellClientProps {
  tourId: string;
  routingId: string;
  templateName: string | null;
}

export function AdvanceBuilderShellClient({
  tourId,
  routingId,
  templateName,
}: AdvanceBuilderShellClientProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [copyOpen, setCopyOpen] = useState(false);
  const [dates, setDates] = useState<AdvanceDateItem[] | null>(null);
  const [selected, setSelected] = useState<FieldSelectionDetail | null>(null);

  // Lazy-fetch dates the first time Copy opens. The `dates !== null`
  // guard alone is the de-dupe — no separate loading-flag state, which
  // avoids react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!copyOpen || dates !== null) return;
    let cancelled = false;
    fetch(`/api/tours/${tourId}/advance?all=true`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: { dates?: AdvanceDateItem[]; items?: AdvanceDateItem[] }) => {
        if (cancelled) return;
        setDates(data.dates ?? data.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        showToast('Failed to load tour dates for copy', 'error');
        setCopyOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copyOpen, dates, tourId, showToast]);

  // Field-selection CustomEvent listener (Phase G.4 interim).
  useEffect(() => {
    function onSelect(e: Event) {
      const ce = e as CustomEvent<FieldSelectionDetail | null>;
      setSelected(ce.detail ?? null);
    }
    window.addEventListener(ADVANCE_FIELD_SELECTED_EVENT, onSelect);
    return () => window.removeEventListener(ADVANCE_FIELD_SELECTED_EVENT, onSelect);
  }, []);

  const handleSectionDrop = (seedId: string, label: string) => {
    // G.3 — adding a section from the library to this advance touches
    // the existing AdvanceSectionBuilder's internal add-section flow.
    // Wiring the drop to a server mutation + refresh is left for a
    // follow-up PR (the add-section endpoint is not reusable from
    // outside the builder without a refactor).
    showToast(
      `Section "${label}" — drag wired, server add-section endpoint not yet reusable from outside the builder. Use the in-canvas "+ Add Section" trigger inside the existing setup mode for now.`,
    );
    void seedId;
    void router;
  };

  const handleAddBlank = () => {
    showToast(
      'Blank-section creation flow lives inside the existing builder — open Setup Mode and use its "Add custom section".',
    );
  };

  const handleApplyToTours = () => {
    showToast(
      'Apply-to-tours flow needs the templates list endpoint — wiring deferred to a follow-up. Use the existing Templates page for now.',
    );
  };

  return (
    <div className="flex min-h-0 flex-1">
      <AdvanceSectionLibrary onAddBlank={handleAddBlank} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TemplateMetaBar
          templateName={templateName}
          onApplyToTours={handleApplyToTours}
          onCopyFromShow={() => setCopyOpen(true)}
        />
        <div className="flex-1 px-4 pb-12 pt-4">
          <AdvanceSectionBuilderDynamic tourId={tourId} routingId={routingId} />
          <div className="mt-4">
            <SectionDropZone onDrop={handleSectionDrop} />
          </div>
        </div>
      </main>
      <AdvanceFieldPropertiesPanel
        selected={selected}
        onChange={(next) => {
          // Optimistic — panel re-renders with the new value immediately.
          setSelected(next);
          // Tell the canvas to apply the patch to its internal field-def
          // state. The canvas's autosave will pick it up. This is the
          // panel → canvas direction of the G.4 dispatch loop.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('advance:field-updated', {
                detail: {
                  fieldId: next.id,
                  patch: {
                    label: next.label,
                    required: next.required,
                    type: next.type,
                  },
                },
              }),
            );
          }
        }}
      />

      {/* Copy-from-show modal — current routing is the destination,
          source is picked inside the modal. */}
      {copyOpen && dates ? (
        <CopyAdvanceModal
          tourId={tourId}
          dates={dates}
          initialSourceRoutingId={null}
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          onSuccess={(copiedCount) => {
            setCopyOpen(false);
            showToast(`Copied ${copiedCount} show${copiedCount === 1 ? '' : 's'}.`);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
