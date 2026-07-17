'use client';

/* ============================================
   LOWPASS — <ChannelListTourEditor> (revamp #17)

   Makes the standalone tour Channel-list tab EDITABLE in place by mounting the
   existing rider <ChannelListEditor> (canonical channel grid + dropdown cells +
   the StageBoxDialog patch grid) directly on the tour surface — instead of the
   read-only sheet + "Edit in rider pack" bounce.

   Composition only: ChannelListEditor already self-persists its row edits
   (queue → ch.updateRow) and self-fetches the mic library + gear, so this
   wrapper just supplies the section-level callbacks:

     - onFieldBlur / savePill  → a lightweight local save pill.
     - onTitleCommit           → PATCH the section title.
     - onOverride              → an INHERITED (artist-scope) list can't be edited
       in place without forking it (that fork = the deferred storage decouple);
       send the user to the rider editor where the tested override flow lives.
       An OWNED section edits directly here.
     - onRemove / onMoveUp / onMoveDown → inert on the tour tab (one section, no
       ordering); structure changes just refresh.
   ============================================ */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import ChannelListEditor from '@/components/rider-pack/ChannelListEditor';
import { LinkedRiderPackControl, type LinkCandidate } from '@/components/rider-pack/LinkedRiderPackControl';
import type { SavePillState } from '@/components/rider-pack/SaveStatePill';
import type { RiderPack, ResolvedSection } from '@/lib/rider-packs/types';

export function ChannelListTourEditor({
  pack,
  section,
  tourId,
  packId,
  stagePlotCandidates = [],
  linkedStagePlotId = null,
}: {
  pack: RiderPack;
  section: ResolvedSection;
  tourId: string;
  packId: string;
  /** B2 — stage-plot packs on the tour that can be paired with this channel list. */
  stagePlotCandidates?: LinkCandidate[];
  /** B2 — the stage-plot pack currently linked to this channel list, if any. */
  linkedStagePlotId?: string | null;
}) {
  const router = useRouter();
  const [pill, setPill] = useState<{ state: SavePillState; error: string | null }>({
    state: 'idle',
    error: null,
  });
  const [linkedPlot, setLinkedPlot] = useState<string | null>(linkedStagePlotId);

  // B2 — the FK lives on the stage-plot pack, so linking from this side edits
  // the CHOSEN stage-plot pack's linked_rider_pack_id (→ this channel list) and
  // clears the previous linker. Unlink clears whichever plot points here.
  const setStagePlotLink = useCallback(
    async (nextPlotId: string | null) => {
      const patch = async (plotPackId: string, value: string | null) => {
        const res = await fetch(`/api/rider-packs/${plotPackId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linked_rider_pack_id: value }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : 'Link failed');
        }
      };
      if (linkedPlot && linkedPlot !== nextPlotId) await patch(linkedPlot, null);
      if (nextPlotId) await patch(nextPlotId, packId);
      setLinkedPlot(nextPlotId);
    },
    [linkedPlot, packId],
  );

  const commitTitle = useCallback(
    async (title: string) => {
      setPill({ state: 'saving', error: null });
      try {
        const res = await fetch(`/api/rider-packs/${packId}/sections/${section.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setPill({ state: 'saved', error: null });
      } catch (e) {
        setPill({ state: 'error', error: e instanceof Error ? e.message : 'Save failed' });
      }
    },
    [packId, section.id],
  );

  return (
    // revamp #17 — sits ON the page (Phase-1 chrome): no boxed panel; the editor
    // carries its own grid structure.
    <div className="min-w-0">
      {/* B2 — pair this channel list with a stage plot on the tour. */}
      <div className="mb-2 flex justify-end print:hidden">
        <LinkedRiderPackControl
          label="Stage plot"
          value={linkedPlot}
          candidates={stagePlotCandidates}
          onCommit={setStagePlotLink}
        />
      </div>
      <ChannelListEditor
        section={section}
        pack={pack}
        savePill={pill}
        onTitleCommit={(title) => void commitTitle(title)}
        onFieldBlur={() => setPill({ state: 'saved', error: null })}
        onRemove={() => {}}
        /* A#8 — override opens the pack editor, which is kind-aware: for a
           channel_list pack RiderPackEditorView mounts the ChannelListEditor
           (RiderPackEditorView.tsx `kind === 'channel_list'` branch), NOT the
           generic rider shell — so this is a channel-list editor, not a dead end.
           Navigate to the canonical /operations URL directly (was the legacy
           /tours/[id]/rider-packs path that only resolved via a 301 redirect). */
        onOverride={() => router.push(`/operations/${tourId}/riders/${packId}`)}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        /* §CL-NORELOAD — the editor now reconciles structural changes locally
           (optimistic rows + a client-side refetch of stage boxes / sub-snakes /
           columns), so no server refetch is needed here. The previous
           router.refresh() re-ran this server page on every column toggle and
           every keystroke-triggered I/O save, which read as a full page reload
           and interrupted in-progress edits. A no-op is correct now. */
        onStructureChange={() => {}}
      />
    </div>
  );
}
