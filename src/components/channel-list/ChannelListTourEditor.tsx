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
import type { SavePillState } from '@/components/rider-pack/SaveStatePill';
import type { RiderPack, ResolvedSection } from '@/lib/rider-packs/types';

export function ChannelListTourEditor({
  pack,
  section,
  tourId,
  packId,
}: {
  pack: RiderPack;
  section: ResolvedSection;
  tourId: string;
  packId: string;
}) {
  const router = useRouter();
  const [pill, setPill] = useState<{ state: SavePillState; error: string | null }>({
    state: 'idle',
    error: null,
  });

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
      <ChannelListEditor
        section={section}
        pack={pack}
        savePill={pill}
        onTitleCommit={(title) => void commitTitle(title)}
        onFieldBlur={() => setPill({ state: 'saved', error: null })}
        onRemove={() => {}}
        onOverride={() => router.push(`/tours/${tourId}/rider-packs/${packId}`)}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onStructureChange={() => router.refresh()}
      />
    </div>
  );
}
