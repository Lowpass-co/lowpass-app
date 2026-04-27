'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { deletePack, exportGoogleDoc } from '@/lib/rider-packs/client';
import { Trash2, Link2, FileOutput, UserRoundCog, ExternalLink } from 'lucide-react';
import { BrandedSelect } from '@/components/ui/BrandedSelect';

type Pack = {
  id: string;
  title: string | null;
  scope: string;
  updated_at: string;
};

type Artist = { id: string; name: string };

export function RiderPackGridCard({
  pack,
  showArtist,
  artistName,
  artists,
  contextArtistId,
}: {
  pack: Pack;
  showArtist: boolean;
  artistName?: string;
  artists: Artist[];
  /** When filtering by an artist, exclude them from "move" targets. */
  contextArtistId?: string | null;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetArtist, setTargetArtist] = useState('');
  const [busy, setBusy] = useState(false);

  const targetOptions = artists.filter((a) => a.id !== contextArtistId);

  const runMove = async () => {
    if (!targetArtist) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rider-packs/${pack.id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: targetArtist }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error ?? 'Move failed');
      setMoveOpen(false);
      setTargetArtist('');
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  };

  const menuItems: ContextMenuItem[] = [
    {
      label: 'Open',
      icon: ExternalLink,
      onClick: () => {
        window.location.href = `/rider-packs/${pack.id}`;
      },
    },
    {
      label: 'Copy rider link',
      icon: Link2,
      onClick: async () => {
        const url = `${window.location.origin}/rider-packs/${pack.id}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt('Copy link:', url);
        }
      },
    },
    {
      label: 'Export to Google Doc',
      icon: FileOutput,
      onClick: async () => {
        setBusy(true);
        try {
          await exportGoogleDoc(pack.id);
          try {
            await navigator.clipboard.writeText(`${window.location.origin}/rider-packs/${pack.id}`);
          } catch {
            /* ignore */
          }
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Export failed');
        } finally {
          setBusy(false);
        }
      },
    },
    {
      label: 'Move to other artist…',
      icon: UserRoundCog,
      onClick: () => {
        if (targetOptions.length === 0) {
          alert('Add another act under Artists, or use “All workspace packs” to see all bands.');
          return;
        }
        setMoveOpen(true);
      },
    },
    {
      label: 'Delete rider',
      icon: Trash2,
      variant: 'danger',
      onClick: async () => {
        if (!confirm(`Delete “${pack.title || 'Untitled pack'}”? This cannot be undone.`)) return;
        setBusy(true);
        try {
          await deletePack(pack.id);
          window.location.reload();
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Delete failed');
        } finally {
          setBusy(false);
        }
      },
    },
  ];

  return (
    <div
      className="group relative block rounded-xl border p-4 transition-colors hover:bg-lp-surface-hover"
      style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
    >
      <div
        className="absolute right-2 top-2 z-10"
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ContextMenu items={menuItems} align="right" />
      </div>
      <Link href={`/rider-packs/${pack.id}`} className="block pr-10">
        <div className="truncate text-sm font-semibold text-lp-text">{pack.title || '(untitled)'}</div>
        {showArtist && (
          <div className="mt-0.5 truncate text-xs text-lp-text-secondary">
            {artistName ?? 'Unknown artist'}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{
              backgroundColor: '#FF45001a',
              color: '#FF4500',
              border: '1px solid #FF450033',
            }}
          >
            {pack.scope}
          </span>
          <span className="text-[11px] text-lp-text-tertiary tabular-nums">
            {new Date(pack.updated_at).toLocaleDateString()}
          </span>
        </div>
      </Link>

      {moveOpen && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMoveOpen(false)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-xl border border-lp-border bg-lp-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-lp-text">Move to artist</h3>
            <p className="text-xs text-lp-text-secondary">
              Puts this rider under another act in your workspace. Best for artist-level packs.
            </p>
            <BrandedSelect
              value={targetArtist}
              onChange={(v) => setTargetArtist(v)}
              options={targetOptions.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Select act…"
              ariaLabel="Target artist"
              className="w-full"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-lp-border px-3 py-1.5 text-sm"
                onClick={() => setMoveOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={!targetArtist || busy}
                onClick={() => void runMove()}
              >
                {busy ? '…' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
