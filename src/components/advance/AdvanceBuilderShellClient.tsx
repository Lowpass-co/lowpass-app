/* ============================================
   LOWPASS — Advance · Builder Shell (Variant parity §D)

   Three-pane wrapper around the existing AdvanceSectionBuilder:
     [AdvanceSectionLibrary 280px]
     [TemplateMetaBar (sticky) + canvas + SectionDropZone]
     [AdvanceFieldPropertiesPanel 300px]

   Owns the small bits of client state needed for the new shell:
   - Section drop refresh (router.refresh after a server mutation
     surfaces the new section in the existing builder).
   - Surface "wiring TODO" for interactions the existing 5346-line
     AdvanceSectionBuilder owns internally (template name persistence,
     apply-to-tour slide-over, copy-from-show modal, per-field
     selection inspector). These are deliberately shallow so we don't
     touch the builder's internals — that's the prompt's hard rule
     "preserve every existing feature."
   ============================================ */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdvanceSectionLibrary } from './AdvanceSectionLibrary';
import { TemplateMetaBar } from './TemplateMetaBar';
import {
  AdvanceFieldPropertiesPanel,
} from './AdvanceFieldPropertiesPanel';
import { SectionDropZone } from './SectionDropZone';
import { AdvanceSectionBuilderDynamic } from './AdvanceSectionBuilderDynamic';

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
  const [dropToast, setDropToast] = useState<string | null>(null);

  const handleSectionDrop = (seedId: string, label: string) => {
    // Adding a section from the library to this advance touches the
    // existing AdvanceSectionBuilder's internal add-section flow.
    // Wiring the drop to a server mutation + refresh is left for a
    // follow-up; for now we surface a one-shot toast so the user
    // knows the drag was registered.
    setDropToast(`Drop received: ${label} — wiring to builder is a follow-up.`);
    setTimeout(() => setDropToast(null), 4000);
    void seedId;
    void router; // refresh hook stays imported for the wiring follow-up.
  };

  const handleAddBlank = () => {
    setDropToast(
      'Blank-section creation flow is owned by the existing builder — use its "Add custom section" affordance for now.',
    );
    setTimeout(() => setDropToast(null), 4500);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <AdvanceSectionLibrary onAddBlank={handleAddBlank} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TemplateMetaBar templateName={templateName} />
        <div className="flex-1 px-4 pb-12 pt-4">
          <AdvanceSectionBuilderDynamic tourId={tourId} routingId={routingId} />
          <div className="mt-4">
            <SectionDropZone onDrop={handleSectionDrop} />
          </div>
          {dropToast ? (
            <div
              className="mt-3 rounded-md border px-3 py-2"
              style={{
                borderColor: 'var(--lp-border-strong)',
                background: 'var(--lp-surface)',
                color: 'var(--lp-text-secondary)',
                fontSize: '12px',
              }}
            >
              {dropToast}
            </div>
          ) : null}
        </div>
      </main>
      <AdvanceFieldPropertiesPanel selected={null} />
    </div>
  );
}
