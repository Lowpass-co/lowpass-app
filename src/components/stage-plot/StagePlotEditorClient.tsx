/* ============================================
   LOWPASS — <StagePlotEditorClient> (§SP0 wiring)

   Loads a stage plot by id from the API and renders the editor
   with debounced whole-document PUT persistence. Used by the
   production editor route; the dev harness uses localStorage.
   ============================================ */
'use client';

import { useEffect, useRef, useState } from 'react';
import { StagePlotEditor } from '@/components/stage-plot/StagePlotEditor';
import { ExportButton } from '@/components/export/ExportButton';
import { registerCustomIcons } from '@/lib/stage-plot/icons';
import type { IconDescriptor } from '@/lib/stage-plot/icons/types';
import type { Channel, EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';

export function StagePlotEditorClient({ plotId }: { plotId: string }) {
  const [data, setData] = useState<{ plot: EditorPlot; items: EditorItem[]; customs: IconDescriptor[]; channels: Channel[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    // Load the plot + the workspace custom-icon library together, and
    // register the customs BEFORE mounting the editor so getIcon
    // resolves any custom_<id> items on the very first render.
    Promise.all([
      fetch(`/api/stage-plots/${plotId}`).then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Stage plot not found' : `Load failed (${r.status})`);
        return r.json();
      }),
      fetch('/api/stage-plot/icons').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ])
      .then(([d, custom]) => {
        if (!live) return;
        const customs = (custom.items ?? []) as IconDescriptor[];
        registerCustomIcons(customs);
        setData({ plot: d.plot, items: d.items, customs, channels: (d.channels ?? []) as Channel[] });
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
      <StagePlotEditor
        initialPlot={data.plot}
        initialItems={data.items}
        initialCustomIcons={data.customs}
        channels={data.channels}
        onChange={persist}
        actions={<ExportButton surface="stage-plot" tourId={plotId} title="Export a branded stage-plot PDF" />}
      />
    </div>
  );
}
