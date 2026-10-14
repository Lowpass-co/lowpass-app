/* ============================================
   LOWPASS — <StagePlotEditorClient> (§SP0 wiring)

   Loads a stage plot by id from the API and renders the editor
   with debounced whole-document PUT persistence. Used by the
   production editor route; the dev harness uses localStorage.
   ============================================ */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { StagePlotEditor } from '@/components/stage-plot/StagePlotEditor';
import { ExportButton } from '@/components/export/ExportButton';
import { LinkedRiderPackControl, type LinkCandidate } from '@/components/rider-pack/LinkedRiderPackControl';
import { registerCustomIcons } from '@/lib/stage-plot/icons';
import type { IconDescriptor } from '@/lib/stage-plot/icons/types';
import type { Channel, ChannelSource, EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';
import { createClient } from '@/lib/supabase-client';
import { appendRow, updateRow } from '@/lib/rider-packs/channel-list';

interface PlotLoad {
  plot: EditorPlot;
  items: EditorItem[];
  customs: IconDescriptor[];
  riderPackId: string;
  linkedRiderPackId: string | null;
  linkCandidates: LinkCandidate[];
}

export function StagePlotEditorClient({ plotId }: { plotId: string }) {
  const [data, setData] = useState<PlotLoad | null>(null);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  // Channels are host-owned: re-fetched after one is created here and after
  // the paired list changes (they used to stay stale until a page reload).
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelSource, setChannelSource] = useState<ChannelSource | null>(null);
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
        setData({
          plot: d.plot,
          items: d.items,
          customs,
          riderPackId: d.riderPackId as string,
          linkedRiderPackId: (d.linkedRiderPackId as string | null) ?? null,
          linkCandidates: (d.linkCandidates ?? []) as LinkCandidate[],
        });
        setLinkedId((d.linkedRiderPackId as string | null) ?? null);
        setChannels((d.channels ?? []) as Channel[]);
        setChannelSource((d.channelSource as ChannelSource | null) ?? null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Load error'));
    return () => {
      live = false;
    };
  }, [plotId]);

  const refreshChannels = useCallback(async () => {
    const r = await fetch(`/api/stage-plots/${plotId}`);
    if (!r.ok) return;
    const d = await r.json();
    setChannels((d.channels ?? []) as Channel[]);
    setChannelSource((d.channelSource as ChannelSource | null) ?? null);
  }, [plotId]);

  // A new channel is a REAL row on the paired list (same helpers + RLS as the
  // channel list editor), appended at the end and named.
  const createChannel = useCallback(
    async (label: string): Promise<string> => {
      if (!channelSource) throw new Error('No channel list is paired with this plot');
      const supabase = createClient();
      const { created } = await appendRow(supabase, { packId: channelSource.packId, sectionId: channelSource.sectionId });
      const id = created[0]?.id;
      if (!id) throw new Error('The channel list did not return the new row');
      await updateRow(supabase, id, { channel_name: label });
      await refreshChannels();
      return id;
    },
    [channelSource, refreshChannels],
  );

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
        channels={channels}
        onCreateChannel={channelSource ? createChannel : undefined}
        channelListHref={linkedId ? `/rider-packs/${linkedId}?mode=edit` : undefined}
        onChange={persist}
        actions={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {/* B2 — pair this stage plot with a tour channel-list pack; the
                editor's Channels section then reads from the linked list. */}
            <LinkedRiderPackControl
              label="Channel list"
              value={linkedId}
              candidates={data.linkCandidates}
              onCommit={async (next) => {
                const res = await fetch(`/api/rider-packs/${data.riderPackId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ linked_rider_pack_id: next }),
                });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error(typeof j.error === 'string' ? j.error : 'Link failed');
                }
                setLinkedId(next);
                await refreshChannels();
              }}
            />
            <ExportButton surface="stage-plot" tourId={plotId} title="Export a branded stage-plot PDF" />
          </div>
        }
      />
    </div>
  );
}
