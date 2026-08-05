/* ============================================
   LOWPASS — <StagePlotLibraryList> (§SP0 IA)

   Artist-library list of stage plots: create (POST
   /api/stage-plots → open editor), open, delete. Sibling to the
   riders / channel-lists library surfaces.
   ============================================ */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface StagePlotListRow {
  stagePlotId: string;
  title: string;
  updatedAt: string;
  /** Decouple B1 — the plot's rider_packs id, for version/attach controls on
   *  the tour surface. Optional: the artist-library list doesn't need it. */
  packId?: string;
}

export interface StagePlotLibraryListProps {
  artistId: string;
  rows: StagePlotListRow[];
}

export function StagePlotLibraryList({ artistId, rows }: StagePlotLibraryListProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(rows);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/stage-plots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId, name: 'Untitled stage plot' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Create ${res.status}`);
      const { id } = json;
      router.push(`/artists/${artistId}/stage-plots/${id}`);
    } catch (err) {
      alert(`Couldn't create: ${err instanceof Error ? err.message : 'unknown'}`);
      setBusy(false);
    }
  };

  const remove = async (stagePlotId: string) => {
    if (!confirm('Delete this stage plot?')) return;
    await fetch(`/api/stage-plots/${stagePlotId}`, { method: 'DELETE' });
    setList((prev) => prev.filter((r) => r.stagePlotId !== stagePlotId));
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 'var(--lp-text-xl)', fontWeight: 700, color: 'var(--lp-text)', margin: 0 }}>Stage plots</h1>
        <button
          type="button"
          onClick={create}
          disabled={busy}
          style={{ fontSize: 'var(--lp-text-sm)', padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--lp-orange)', color: '#fff', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}
        >
          {busy ? 'Creating…' : 'New stage plot'}
        </button>
      </div>

      {list.length === 0 ? (
        <p style={{ color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)' }}>
          No stage plots yet. Create your first one — it&apos;ll be assignable to every tour for this artist.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {list.map((r) => (
            <div key={r.stagePlotId} style={{ border: '1px solid var(--lp-border)', borderRadius: 10, padding: 14, background: 'var(--lp-surface)' }}>
              <a href={`/artists/${artistId}/stage-plots/${r.stagePlotId}`} style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)', textDecoration: 'none' }}>
                {r.title || 'Untitled stage plot'}
              </a>
              <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', marginTop: 4 }}>
                Updated {new Date(r.updatedAt).toLocaleDateString()}
              </div>
              <button
                type="button"
                onClick={() => remove(r.stagePlotId)}
                style={{ marginTop: 10, fontSize: 'var(--lp-text-2xs)', padding: '4px 8px', borderRadius: 5, border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
