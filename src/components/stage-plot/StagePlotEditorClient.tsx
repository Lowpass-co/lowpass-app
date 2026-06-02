/* ============================================
   LOWPASS — <StagePlotEditorClient> (§SP0 wiring)

   Loads a stage plot by id from the API and renders the editor
   with debounced whole-document PUT persistence. Used by the
   production editor route; the dev harness uses localStorage.
   ============================================ */
'use client';

import { useEffect, useRef, useState } from 'react';
import { StagePlotEditor } from '@/components/stage-plot/StagePlotEditor';
import type { EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';

export function StagePlotEditorClient({ plotId }: { plotId: string }) {
  const [data, setData] = useState<{ plot: EditorPlot; items: EditorItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/stage-plots/${plotId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Stage plot not found' : `Load failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        if (live) setData({ plot: d.plot, items: d.items });
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Load error'));
    return () => {
      live = false;
    };
  }, [plotId]);

  const persist = (plot: EditorPlot, items: EditorItem[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/stage-plots/${plotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plot, items }),
      }).catch(() => {
        /* surfaced on next save / reload */
      });
    }, 600);
  };

  if (error) {
    return <div style={{ padding: 32, color: 'var(--lp-text-secondary)' }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ padding: 32, color: 'var(--lp-text-tertiary)' }}>Loading…</div>;
  }
  return (
    <div style={{ height: 'calc(100vh - 64px)' }}>
      <StagePlotEditor initialPlot={data.plot} initialItems={data.items} onChange={persist} />
    </div>
  );
}
