'use client';

/* ============================================
   LOWPASS — <NewChannelListButton> (Adam, 2026-08-07)

   "there's no reason we should have to go to riders to then add a channel
   list" — create a standalone channel-list document straight from the tour
   Channel-list tab. Three calls, verified against the routes' contracts:

     1. POST /api/rider-packs
          { scope:'tour', artist_id, tour_id, kind:'channel_list', title,
            inherit_from_folder_id: null }
        inherit_from_folder_id is EXPLICITLY null: tour scope otherwise
        auto-inherits the artist rider folder, and an inherited channel_list
        section would re-engage the "override to edit" lock this standalone
        document exists to avoid.
     2. POST /api/rider-packs/[id]/sections
          { section_key:'channel_list', title:'Channel list',
            section_type:'channel_list' }
        A fresh pack has no sections and the tour tab resolves by section,
        so we seed the one channel_list section (endpoint adds 16 blank rows).
     3. POST /api/rider-pack-attachments { document_pack_id, tour_id }
        Tour-wide attachment: every show on the tour sees it, and the tour's
        rider surfaces pick it up automatically (attach REPLACES any existing
        channel-list attachment on the tour — that's what "fresh one" means).

   Variants: 'primary' (orange, empty state) and 'compact' (quiet bordered,
   header when a list already exists).
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

export const NEW_CHANNEL_LIST_NOTE =
  'Assigned to every show on this tour — it will appear in the tour’s rider automatically.';

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json.error === 'string' ? json.error : `Request failed (${res.status})`,
    );
  }
  return json;
}

export function NewChannelListButton({
  tourId,
  artistId,
  tourName,
  variant = 'primary',
}: {
  tourId: string;
  artistId: string;
  tourName: string;
  /** 'primary' — orange, for the empty state. 'compact' — quiet bordered
   *  header affordance for creating a fresh list when one already exists. */
  variant?: 'primary' | 'compact';
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  const createChannelList = async () => {
    setCreating(true);
    try {
      const pack = await postJson('/api/rider-packs', {
        scope: 'tour',
        artist_id: artistId,
        tour_id: tourId,
        kind: 'channel_list',
        title: `${tourName} — Channel list`,
        inherit_from_folder_id: null,
      });
      const packId = pack.id as string | undefined;
      if (!packId) throw new Error('Create failed — no pack id returned');

      await postJson(`/api/rider-packs/${packId}/sections`, {
        section_key: 'channel_list',
        title: 'Channel list',
        section_type: 'channel_list',
      });

      await postJson('/api/rider-pack-attachments', {
        document_pack_id: packId,
        tour_id: tourId,
      });

      showToast(`Channel list created. ${NEW_CHANNEL_LIST_NOTE}`, 'success');
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Create failed', 'error');
      setCreating(false);
    }
  };

  const compact = variant === 'compact';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: compact ? 'flex-end' : 'center',
      }}
    >
      <button
        type="button"
        onClick={() => void createChannelList()}
        disabled={creating}
        className="btn-transition"
        style={
          compact
            ? {
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--lp-text-secondary)',
                background: 'transparent',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.65 : 1,
              }
            : {
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--lp-text-inverse)',
                background: 'var(--lp-orange)',
                border: 0,
                borderRadius: 'var(--lp-radius-md)',
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.65 : 1,
              }
        }
      >
        {creating ? 'Creating…' : '+ New channel list'}
      </button>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--lp-text-tertiary)',
          maxWidth: 360,
          textAlign: compact ? 'right' : 'center',
        }}
      >
        {NEW_CHANNEL_LIST_NOTE}
      </p>
    </div>
  );
}
