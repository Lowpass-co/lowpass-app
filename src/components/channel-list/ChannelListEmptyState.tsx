'use client';

/* ============================================
   LOWPASS — Channel-list empty state + create action (B1)

   The tour Channel-list tab used to dead-end when no rider pack carried a
   channel_list section. This adds the missing create path: if the tour already
   has a rider pack, POST a channel_list section to it (the endpoint auto-seeds
   16 blank channel rows) and refresh so the editable editor mounts. If there's
   no pack yet, we prompt to create one under Riders (pack creation needs the
   artist/folder context that lives there).
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

export function ChannelListEmptyState({
  tourId,
  packId,
}: {
  tourId: string;
  /** Most-recent rider pack on the tour, or null if the tour has none yet. */
  packId: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  const createChannelList = async () => {
    if (!packId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/rider-packs/${packId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_key: 'channel_list',
          title: 'Channel list',
          section_type: 'channel_list',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : 'Create failed');
      }
      showToast('Channel list created', 'success');
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Create failed', 'error');
      setCreating(false);
    }
  };

  if (!packId) {
    return (
      <p className="rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-8 text-center text-sm text-lp-text-secondary">
        No rider pack on this tour yet. Create one under{' '}
        <a className="text-lp-orange hover:underline" href={`/operations/${tourId}/riders`}>
          Riders →
        </a>{' '}
        then add a channel list here.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-12 text-center">
      <div>
        <p className="text-sm font-medium text-lp-text">No channel list yet</p>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Create one on this tour’s rider pack — it starts with 16 blank channels you can edit here.
        </p>
      </div>
      <button
        type="button"
        onClick={createChannelList}
        disabled={creating}
        style={{
          border: 0,
          borderRadius: 'var(--lp-radius-full)',
          padding: '8px 20px',
          fontSize: 13,
          fontWeight: 700,
          cursor: creating ? 'not-allowed' : 'pointer',
          background: 'var(--lp-orange)',
          color: 'var(--lp-text-inverse)',
          opacity: creating ? 0.65 : 1,
        }}
      >
        {creating ? 'Creating…' : '+ Create channel list'}
      </button>
    </div>
  );
}
