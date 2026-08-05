/* ============================================
   LOWPASS — <OperationsStagePlotClient>

   Tour Operations stage-plot surface. Three states, no extra route:
   - 0 plots → empty state + "Create stage plot" CTA (POST
     /api/stage-plots with tour_id → tour-scoped pack).
   - 1 plot → editor mounted inline.
   - 2+ plots → list; pick one to open the editor inline ("← All
     stage plots" returns to the list).
   ============================================ */
'use client';

import { useEffect, useState } from 'react';
import { StagePlotEditorClient } from './StagePlotEditorClient';
import { DocumentVersionControls } from '@/components/rider-pack/DocumentVersionControls';
import type { StagePlotListRow } from './StagePlotLibraryList';
import { PageTitle } from '@/components/ui/PageHeader';

export interface OperationsStagePlotClientProps {
  tourId: string;
  artistId: string | null;
  rows: StagePlotListRow[];
  /** Decouple B1 — the tour-default stage-plot attachment, if one exists.
   *  Enables Detach when the OPEN plot is the attached one. */
  tourAttachment?: { packId: string; attachmentId: string } | null;
}

export function OperationsStagePlotClient({ tourId, artistId, rows, tourAttachment = null }: OperationsStagePlotClientProps) {
  const [list, setList] = useState(rows);
  const [selected, setSelected] = useState<string | null>(rows.length === 1 ? rows[0].stagePlotId : null);
  const [busy, setBusy] = useState(false);

  /* B1 — versions created / attachments switched trigger router.refresh(),
     which re-renders the server page with fresh rows. Merge them in (server
     wins; optimistic entries not yet in the server list are kept) so the
     list and the open editor's controls track reality without a remount.
     queueMicrotask keeps the set-state out of the effect's render pass
     (repo convention — see ArtistTourSwitcherClientWrapper). */
  useEffect(() => {
    queueMicrotask(() => {
      setList((prev) => {
        const incoming = new Set(rows.map((r) => r.stagePlotId));
        const optimisticOnly = prev.filter((r) => !incoming.has(r.stagePlotId));
        return [...optimisticOnly, ...rows];
      });
    });
  }, [rows]);

  const create = async () => {
    if (!artistId) {
      alert('This tour has no artist set, so a stage plot can’t be created.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/stage-plots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, artist_id: artistId, name: 'Untitled stage plot' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Create ${res.status}`);
      const { id } = json;
      setList((prev) => [{ stagePlotId: id, title: 'Untitled stage plot', updatedAt: new Date().toISOString() }, ...prev]);
      setSelected(id);
    } catch (err) {
      alert(`Couldn't create: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    /* B1 — the open plot's PACK id (rows carry it since B1; a plot created
       this session and not yet refreshed has none → controls wait). */
    const openRow = list.find((r) => r.stagePlotId === selected);
    const openPackId = openRow?.packId ?? null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '10px 16px 0' }}>
          {list.length > 1 ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{ alignSelf: 'flex-start', fontSize: 'var(--lp-text-xs)', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}
            >
              ← All stage plots
            </button>
          ) : <span />}
          {openPackId ? (
            <DocumentVersionControls
              packId={openPackId}
              tourId={tourId}
              kindLabel="stage plot"
              tourAttachmentId={tourAttachment && tourAttachment.packId === openPackId ? tourAttachment.attachmentId : null}
            />
          ) : null}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <StagePlotEditorClient plotId={selected} />
        </div>
      </div>
    );
  }

  const createBtn = (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      style={{ fontSize: 'var(--lp-text-sm)', padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--lp-orange)', color: '#fff', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}
    >
      {busy ? 'Creating…' : list.length === 0 ? 'Create stage plot' : 'New stage plot'}
    </button>
  );

  if (list.length === 0) {
    return (
      <div style={{ padding: 32, maxWidth: 560 }}>
        <PageTitle style={{ fontSize: 22, margin: '0 0 8px' }}>Stage plot</PageTitle>
        <p style={{ color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)', margin: '0 0 18px' }}>
          No stage plot for this tour yet. Create one to lay out the stage — instruments, amps, monitors, mics and power — and link it to the channel list.
        </p>
        {createBtn}
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <PageTitle style={{ fontSize: 22, margin: 0 }}>Stage plots</PageTitle>
        {createBtn}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {list.map((r) => (
          <button
            key={r.stagePlotId}
            type="button"
            onClick={() => setSelected(r.stagePlotId)}
            style={{ textAlign: 'left', border: '1px solid var(--lp-border)', borderRadius: 10, padding: 14, background: 'var(--lp-surface)', cursor: 'pointer' }}
          >
            <div style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)' }}>{r.title || 'Untitled stage plot'}</div>
            <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', marginTop: 4 }}>
              Updated {new Date(r.updatedAt).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
