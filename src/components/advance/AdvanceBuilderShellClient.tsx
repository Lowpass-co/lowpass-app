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
import {
  ApplyAdvanceTemplateSlideOver,
  type FormTemplate,
  type AdvanceDateItem as ApplyAdvanceDateItem,
} from './ApplyAdvanceTemplateSlideOver';
import { useToast } from '@/components/ui/Toast';

/** Field selection event payload — Phase G.4 CustomEvent interim.
 *  The canvas's field-def row dispatches this on click; this shell
 *  listens and re-renders the FieldPropertiesPanel with the payload. */
export const ADVANCE_FIELD_SELECTED_EVENT = 'advance:field-selected';

type FieldSelectionDetail = {
  id: string;
  /** VIS-AB-03 — any of the 12 model.tsx field types. */
  type: string;
  label: string;
  required: boolean;
  helpText?: string;
  placeholder?: string;
  readOnly?: boolean;
  /** VIS-AB-03 — TM-only (hidden from the venue intake form). */
  tmOnly?: boolean;
  defaultAssigneeId?: string | null;
  dueOffsetDays?: number | null;
};

interface AdvanceBuilderShellClientProps {
  tourId: string;
  routingId: string;
  templateName: string | null;
  /** Active tab for the toggle inside TemplateMetaBar (Hotfix 3 §3
   *  — moved here from the retired AdvanceSubHeader). */
  activeTab: 'show' | 'builder';
  /** Hrefs for the Show/Builder toggle inside TemplateMetaBar. */
  showHref: string;
  builderHref: string;
}

export function AdvanceBuilderShellClient({
  tourId,
  routingId,
  templateName,
  activeTab,
  showHref,
  builderHref,
}: AdvanceBuilderShellClientProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [copyOpen, setCopyOpen] = useState(false);
  const [dates, setDates] = useState<AdvanceDateItem[] | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selected, setSelected] = useState<FieldSelectionDetail | null>(null);

  // Lazy-fetch dates the first time Copy or Apply opens. The
  // `dates !== null` guard alone is the de-dupe — no separate
  // loading-flag state, which avoids react-hooks/set-state-in-effect.
  useEffect(() => {
    if ((!copyOpen && !applyOpen) || dates !== null) return;
    let cancelled = false;
    fetch(`/api/tours/${tourId}/advance?all=true`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: { dates?: AdvanceDateItem[]; items?: AdvanceDateItem[] }) => {
        if (cancelled) return;
        setDates(data.dates ?? data.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        showToast('Failed to load tour dates', 'error');
        setCopyOpen(false);
        setApplyOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copyOpen, applyOpen, dates, tourId, showToast]);

  // Lazy-fetch templates the first time Apply opens. Dedupe via
  // `templates !== null`. The `templatesLoading` state is set inside
  // `.then()` / `.finally()` so all setStates happen async, satisfying
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!applyOpen || templates !== null) return;
    let cancelled = false;
    fetch('/api/advance/layout-templates')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: { templates?: FormTemplate[] }) => {
        if (cancelled) return;
        setTemplates(data.templates ?? []);
        setTemplatesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        showToast('Failed to load layout templates', 'error');
        setApplyOpen(false);
        setTemplatesLoading(false);
      });
    // Show the loading flag eagerly so the slide-over's `loading` prop
    // is true while the request is in flight. Deferred to a microtask
    // to avoid the lint rule.
    queueMicrotask(() => {
      if (!cancelled) setTemplatesLoading(true);
    });
    return () => {
      cancelled = true;
    };
  }, [applyOpen, templates, showToast]);

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
    // G.3 — dispatch to the canvas. AdvanceSectionBuilder listens
    // for advance:section-drop and either matches an existing
    // workspace template by label (= addAllFields) or creates a
    // blank section with that label.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('advance:section-drop', {
          detail: { seedId, label },
        }),
      );
    }
  };

  const handleAddBlank = () => {
    // Blank custom section = drop with no label match → builder creates
    // an empty "Custom Section" via the same dispatch path.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('advance:section-drop', {
          detail: { seedId: '__blank__', label: 'Custom Section' },
        }),
      );
    }
  };

  const handleApplyToTours = () => {
    setApplyOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <AdvanceSectionLibrary onAddBlank={handleAddBlank} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TemplateMetaBar
          templateName={templateName}
          onApplyToTours={handleApplyToTours}
          onCopyFromShow={() => setCopyOpen(true)}
          activeTab={activeTab}
          showHref={showHref}
          builderHref={builderHref}
        />
        <div className="flex-1 px-4 pb-12 pt-4">
          {/* Hotfix 3 §2 — wrappedInShell tells the embedded
              AdvanceSectionBuilder's SetupMode to suppress its own
              Template Library column. The shell's
              AdvanceSectionLibrary on the left already provides one. */}
          <AdvanceSectionBuilderDynamic
            tourId={tourId}
            routingId={routingId}
            wrappedInShell
          />
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
                    tm_only: next.tmOnly ?? false,
                    placeholder: next.placeholder,
                    helpText: next.helpText,
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

      {/* Apply-to-tour slide-over (G.5). Same /api/advance/layout-templates
          fetch the AdvanceOverview surface uses. dates list is the same
          /api/tours/[id]/advance?all=true endpoint Copy uses; both
          load lazily on first open. */}
      {applyOpen ? (
        <ApplyAdvanceTemplateSlideOver
          open={applyOpen}
          tourId={tourId}
          // Same shape at runtime — CopyAdvanceModal's AdvanceDateItem
          // types `advance.sections.fields[]` as unknown[] while
          // ApplyAdvanceTemplateSlideOver types it more strictly. Both
          // come from the same /api/tours/[id]/advance?all=true response,
          // so this cast is safe.
          dates={(dates ?? []) as unknown as ApplyAdvanceDateItem[]}
          templates={templates ?? []}
          loading={dates === null || templatesLoading}
          initialTemplateId={null}
          onClose={() => setApplyOpen(false)}
          onDone={() => {
            setApplyOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
