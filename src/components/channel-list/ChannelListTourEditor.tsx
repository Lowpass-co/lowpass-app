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
import { DocumentVersionControls } from '@/components/rider-pack/DocumentVersionControls';
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
  tourAttachmentId = null,
}: {
  pack: RiderPack;
  section: ResolvedSection;
  tourId: string;
  packId: string;
  /** B2 — stage-plot packs on the tour that can be paired with this channel list. */
  stagePlotCandidates?: LinkCandidate[];
  /** B2 — the stage-plot pack currently linked to this channel list, if any. */
  linkedStagePlotId?: string | null;
  /** Decouple B1 — set when this list reached the tour via a TOUR attachment
   *  (vs the legacy pack-scan). Enables Detach in the version controls. */
  tourAttachmentId?: string | null;
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

  /* 2026-08-06 (Adam's walk) — an INHERITED (artist-scope) list no longer
     dead-ends in the override wall. One click copies the section from its
     SOURCE pack into a standalone tour-attached document (convert-section
     with tour_id), and this surface re-resolves to an OWNED, editable list.
     The artist master is untouched. */
  if (section.inherited_from) {
    return (
      <div className="min-w-0">
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
        >
          <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', maxWidth: 560 }}>
            This channel list is inherited from the{' '}
            <span style={{ fontWeight: 600, color: 'var(--lp-text)' }}>{section.inherited_from}</span>-level
            rider, so it can’t be edited here directly. Make this tour its own copy to edit freely —
            the {section.inherited_from} master stays untouched.
          </p>
          <button
            type="button"
            disabled={pill.state === 'saving'}
            onClick={() => {
              void (async () => {
                setPill({ state: 'saving', error: null });
                try {
                  const res = await fetch(`/api/rider-packs/${section.source_pack_id}/convert-section`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ section_id: section.id, tour_id: tourId }),
                  });
                  const j = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : `Copy failed (${res.status})`);
                  setPill({ state: 'saved', error: null });
                  router.refresh();
                } catch (e) {
                  setPill({ state: 'error', error: e instanceof Error ? e.message : 'Copy failed' });
                }
              })();
            }}
            className="btn-transition rounded-lg px-4 py-2"
            style={{
              border: 'none',
              background: 'var(--lp-orange)',
              color: '#fff',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 600,
              cursor: pill.state === 'saving' ? 'default' : 'pointer',
            }}
          >
            {pill.state === 'saving' ? 'Copying…' : 'Create this tour’s editable copy'}
          </button>
          {pill.state === 'error' && pill.error ? (
            <p style={{ margin: 0, width: '100%', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-error, #f85149)' }}>{pill.error}</p>
          ) : null}
        </div>
        {/* The inherited rows, read-only, so the copy decision is informed. */}
        <div className="mt-3 pointer-events-none opacity-80">
          <ChannelListEditor
            section={section}
            pack={pack}
            savePill={{ state: 'idle', error: null }}
            onTitleCommit={() => {}}
            onFieldBlur={() => {}}
            onRemove={() => {}}
            onOverride={() => {}}
            onMoveUp={() => {}}
            onMoveDown={() => {}}
            onStructureChange={() => {}}
          />
        </div>
      </div>
    );
  }

  return (
    // revamp #17 — sits ON the page (Phase-1 chrome): no boxed panel; the editor
    // carries its own grid structure.
    <div className="min-w-0">
      {/* B1 versions/attachments + B2 stage-plot pairing, one control row. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <DocumentVersionControls
          packId={packId}
          tourId={tourId}
          kindLabel="channel list"
          tourAttachmentId={tourAttachmentId}
        />
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
