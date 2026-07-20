'use client';

/* ============================================================
   LOWPASS — <AssetsClient> (S1 Stage C2)

   The one Assets surface over the unified Spaces → Containers → Items model.
   KPIs (spaces / containers / items / total weight) + an Unassigned bucket;
   a space/container filter tree; the item DataTable (registry-routed gear API);
   and the MOVE flow — select items → move to a space / container / tour (the
   "populate a locker then move it to the tour" flow), via /api/gear/move.

   Fixes the GearLibraryClient rough edges: live search, real quantity picker,
   StyledSelect (no window.prompt), placement filter server-agnostic.
   ============================================================ */

import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { StyledSelect } from '@/components/ui/StyledSelect';
import GearSlideOver from '@/components/entity/gear/GearSlideOver';
import type { AssetsData, AssetItem, AssetSpace, AssetContainer } from '@/lib/spaces/loadAssets';

const OWNERSHIPS = ['owned', 'sub_hired', 'hired_to_client'] as const;

type Filter = { kind: 'all' } | { kind: 'unassigned' } | { kind: 'space'; id: string } | { kind: 'container'; id: string };

export function AssetsClient({ initial, tours }: { initial: AssetsData; tours: { id: string; label: string }[] }) {
  const [data, setData] = useState<AssetsData>(initial);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, c, g] = await Promise.all([
      fetch('/api/spaces').then((r) => r.json()).catch(() => ({})),
      fetch('/api/containers').then((r) => r.json()).catch(() => ({})),
      fetch('/api/gear?limit=300').then((r) => r.json()).catch(() => ({})),
    ]);
    const items = ((g.gear ?? []) as AssetItem[]);
    setData({
      spaces: s.spaces ?? [],
      containers: c.containers ?? [],
      items,
      kpis: {
        spaceCount: (s.spaces ?? []).length,
        containerCount: (c.containers ?? []).length,
        itemCount: items.length,
        totalWeightKg: items.reduce((n, i) => n + (Number(i.weight_kg) || 0), 0),
        unassignedCount: items.filter((i) => !i.space_id && !i.container_id).length,
      },
    });
  }, []);

  const filtered = useMemo(() => {
    if (filter.kind === 'all') return data.items;
    if (filter.kind === 'unassigned') return data.items.filter((i) => !i.space_id && !i.container_id);
    if (filter.kind === 'space') return data.items.filter((i) => i.space_id === filter.id);
    return data.items.filter((i) => i.container_id === filter.id);
  }, [data.items, filter]);

  const containersInSpace = useCallback((spaceId: string) => data.containers.filter((c) => c.space_id === spaceId), [data.containers]);
  const looseContainers = useMemo(() => data.containers.filter((c) => !c.space_id), [data.containers]);

  async function setOwnership(value: string) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => fetch(`/api/gear/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownership: value }) })));
      await refresh();
    } finally { setBusy(false); }
  }

  const columns = useMemo<ColumnDef<AssetItem>[]>(() => [
    { id: 'name', header: 'Item', accessor: 'name', sortable: true, frozen: true },
    { id: 'category', header: 'Category', accessor: (r) => r.category ?? '', sortable: true, cell: (v) => String(v || '—') },
    { id: 'status', header: 'Status', accessor: (r) => r.status ?? 'available', sortable: true, cell: (v) => String(v).replaceAll('_', ' ') },
    { id: 'ownership', header: 'Ownership', accessor: (r) => String(r.ownership), sortable: true, cell: (v) => String(v).replaceAll('_', '-') },
    { id: 'weight', header: 'Weight', accessor: (r) => r.weight_kg ?? 0, align: 'right', sortable: true, cell: (_, r) => (r.weight_kg == null ? '—' : `${r.weight_kg} kg`) },
    { id: 'place', header: 'Placed in', accessor: (r) => placeLabel(r, data.spaces, data.containers), cell: (v) => String(v) },
  ], [data.spaces, data.containers]);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1200, padding: 'var(--lp-space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="lp-page-title" style={{ margin: 0, fontSize: 'var(--lp-text-2xl)', color: 'var(--lp-text)' }}>Assets</h1>
        <div className="flex gap-2">
          <CreateButton label="New space" onCreate={(name, kind) => fetch('/api/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) }).then(refresh)} kinds={['warehouse', 'vehicle', 'locker', 'venue', 'other']} testid="assets-new-space" />
          <CreateButton label="New container" onCreate={(name, kind) => fetch('/api/containers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) }).then(refresh)} kinds={['case', 'cart', 'box', 'bag', 'other']} testid="assets-new-container" />
        </div>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--lp-space-3)' }}>
        <Kpi label="Spaces" value={data.kpis.spaceCount} />
        <Kpi label="Containers" value={data.kpis.containerCount} />
        <Kpi label="Items" value={data.kpis.itemCount} />
        <Kpi label="Total weight" value={`${data.kpis.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`} />
        <Kpi label="Unassigned" value={data.kpis.unassignedCount} accent={data.kpis.unassignedCount > 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', gap: 'var(--lp-space-4)', alignItems: 'start' }}>
        {/* Tree */}
        <aside style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)', background: 'var(--lp-panel)', padding: 'var(--lp-space-3)', display: 'grid', gap: 4 }}>
          <TreeRow label={`All items · ${data.items.length}`} active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })} />
          <TreeRow label={`Unassigned · ${data.kpis.unassignedCount}`} active={filter.kind === 'unassigned'} onClick={() => setFilter({ kind: 'unassigned' })} accent />
          <div style={{ height: 1, background: 'var(--lp-border-subtle)', margin: '4px 0' }} />
          {data.spaces.map((s) => (
            <div key={s.id}>
              <TreeRow label={`${s.name}`} sub={s.kind} active={filter.kind === 'space' && filter.id === s.id} onClick={() => setFilter({ kind: 'space', id: s.id })} count={data.items.filter((i) => i.space_id === s.id).length} />
              {containersInSpace(s.id).map((c) => (
                <TreeRow key={c.id} label={c.name} indent active={filter.kind === 'container' && filter.id === c.id} onClick={() => setFilter({ kind: 'container', id: c.id })} count={data.items.filter((i) => i.container_id === c.id).length} />
              ))}
            </div>
          ))}
          {looseContainers.length > 0 ? <div style={{ height: 1, background: 'var(--lp-border-subtle)', margin: '4px 0' }} /> : null}
          {looseContainers.map((c) => (
            <TreeRow key={c.id} label={c.name} sub={c.kind} active={filter.kind === 'container' && filter.id === c.id} onClick={() => setFilter({ kind: 'container', id: c.id })} count={data.items.filter((i) => i.container_id === c.id).length} />
          ))}
        </aside>

        {/* Item table */}
        <div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={columns}
            searchPlaceholder="Search items…"
            searchable
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            selectionActions={
              <div className="flex items-center gap-2">
                <button type="button" data-testid="assets-move" disabled={busy} className="rounded border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text)', background: 'transparent' }} onClick={() => setMoveOpen(true)}>Move {selectedIds.length}…</button>
                <div style={{ minWidth: 150 }} data-testid="assets-ownership">
                  <StyledSelect value="" onChange={(v) => void setOwnership(v)} options={OWNERSHIPS.map((o) => ({ value: o, label: `Set ${o.replaceAll('_', '-')}` }))} placeholder="Set ownership…" size="sm" />
                </div>
              </div>
            }
            onRowClick={(r) => setOpenId(r.id)}
            emptyState="No items here"
          />
        </div>
      </div>

      {moveOpen ? (
        <MoveDialog
          count={selectedIds.length}
          spaces={data.spaces}
          containers={data.containers}
          tours={tours}
          onClose={() => setMoveOpen(false)}
          onMove={async (dest) => {
            setBusy(true);
            try {
              await fetch('/api/gear/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds, ...dest }) });
              setMoveOpen(false);
              setSelectedIds([]);
              await refresh();
            } finally { setBusy(false); }
          }}
        />
      ) : null}

      {openId ? (
        <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-[95vw] border-l bg-lp-surface shadow-2xl" style={{ borderColor: 'var(--lp-border)' }}>
          <GearSlideOver id={openId} onClose={() => { setOpenId(null); void refresh(); }} />
        </div>
      ) : null}
    </div>
  );
}

function placeLabel(item: AssetItem, spaces: AssetSpace[], containers: AssetContainer[]): string {
  if (item.container_id) return containers.find((c) => c.id === item.container_id)?.name ?? 'Container';
  if (item.space_id) return spaces.find((s) => s.id === item.space_id)?.name ?? 'Space';
  return 'Unassigned';
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ border: `1px solid ${accent ? 'var(--color-lp-orange)' : 'var(--lp-border)'}`, borderRadius: 'var(--lp-radius-lg)', background: 'var(--lp-panel)', padding: 'var(--lp-space-3)' }}>
      <div className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)' }}>{label}</div>
      <div className="lp-mono" style={{ fontSize: 'var(--lp-text-xl)', fontWeight: 'var(--lp-weight-bold)', color: accent ? 'var(--color-lp-orange)' : 'var(--lp-text)' }}>{value}</div>
    </div>
  );
}

function TreeRow({ label, sub, count, active, accent, indent, onClick }: { label: string; sub?: string; count?: number; active?: boolean; accent?: boolean; indent?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-transition flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left" style={{ paddingLeft: indent ? 20 : 8, background: active ? 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)' : 'transparent', color: 'var(--lp-text)', border: 0, cursor: 'pointer' }}>
      <span className="min-w-0 truncate" style={{ fontSize: 'var(--lp-text-sm)', color: accent && (count ?? 0) > 0 ? 'var(--color-lp-orange)' : 'var(--lp-text)' }}>
        {label}{sub ? <span style={{ color: 'var(--lp-text-tertiary)', fontSize: 11 }}> · {sub}</span> : null}
      </span>
      {count != null ? <span className="lp-mono shrink-0" style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>{count}</span> : null}
    </button>
  );
}

function CreateButton({ label, kinds, onCreate, testid }: { label: string; kinds: string[]; onCreate: (name: string, kind: string) => Promise<unknown>; testid: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState(kinds[0]);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" data-testid={testid} onClick={() => setOpen(true)} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent' }}>{label}</button>
      {open ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(400px,96vw)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-lg)', padding: 'var(--lp-space-4)', display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>{label}</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus style={{ padding: '6px 10px', borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)' }} />
            <StyledSelect value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: k }))} size="sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent' }}>Cancel</button>
              <button type="button" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); try { await onCreate(name.trim(), kind); setOpen(false); setName(''); } finally { setBusy(false); } }} className="rounded-md px-3 py-1.5 text-sm" style={{ background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse)', border: 0, fontWeight: 'var(--lp-weight-semibold)', opacity: busy || !name.trim() ? 0.5 : 1 }}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MoveDialog({ count, spaces, containers, tours, onClose, onMove }: {
  count: number;
  spaces: AssetSpace[];
  containers: AssetContainer[];
  tours: { id: string; label: string }[];
  onClose: () => void;
  onMove: (dest: { space_id?: string | null; container_id?: string | null; tour_id?: string; quantity?: number }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'space' | 'container' | 'tour' | 'unassign'>('space');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const options = mode === 'space' ? spaces.map((s) => ({ value: s.id, label: s.name }))
    : mode === 'container' ? containers.map((c) => ({ value: c.id, label: c.name }))
    : mode === 'tour' ? tours.map((t) => ({ value: t.id, label: t.label }))
    : [];

  async function go() {
    setBusy(true);
    try {
      if (mode === 'space') await onMove({ space_id: target || null, container_id: null });
      else if (mode === 'container') await onMove({ container_id: target || null, space_id: null });
      else if (mode === 'tour') await onMove({ tour_id: target, quantity: Math.max(1, qty) });
      else await onMove({ space_id: null, container_id: null });
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px,96vw)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-lg)', padding: 'var(--lp-space-4)', display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>Move {count} item{count === 1 ? '' : 's'}</h2>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          {(['space', 'container', 'tour', 'unassign'] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setTarget(''); }} data-testid={`assets-move-${m}`} className="rounded-md px-2.5 py-1 text-xs" style={{ border: `1px solid ${mode === m ? 'var(--color-lp-orange)' : 'var(--lp-border)'}`, background: mode === m ? 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)' : 'transparent', color: 'var(--lp-text)' }}>
              {m === 'unassign' ? 'Unassign' : `To ${m}`}
            </button>
          ))}
        </div>
        {mode !== 'unassign' ? (
          <StyledSelect value={target} onChange={setTarget} options={options} placeholder={`Choose ${mode}…`} size="sm" />
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>Clears space + container — the items return to the Unassigned bucket.</p>
        )}
        {mode === 'tour' ? (
          <label className="flex items-center gap-2" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            Quantity per item
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} data-testid="assets-move-qty" style={{ width: 72, padding: '4px 8px', borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }} />
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent' }}>Cancel</button>
          <button type="button" disabled={busy || (mode !== 'unassign' && !target)} onClick={() => void go()} data-testid="assets-move-confirm" className="rounded-md px-3 py-1.5 text-sm" style={{ background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse)', border: 0, fontWeight: 'var(--lp-weight-semibold)', opacity: busy || (mode !== 'unassign' && !target) ? 0.5 : 1 }}>Move</button>
        </div>
      </div>
    </div>
  );
}
