'use client';

/* ============================================================
   LOWPASS — Gear & rentals (rebuilt Nov 2026, Adam: "visually this isn't
   good… table too narrow for columns")

   Full width. Title + one facts line; New item / Import up top. Search,
   status chips and the place filter in one row (spaces + containers live in
   the place menu, with New space / New container). Items grouped by category
   (or by place) — one flat DataTable per group, a shared selection, ONE
   selection bar (Move… · Mark … · Clear). Right-click any item. The item
   panel is <GearSlideOver> (add + edit).
   ============================================================ */

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, MapPin, Package, Plus, Search, Upload } from 'lucide-react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import type { RowMenuItem } from '@/components/data-table/DataTableRowMenu';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FilterChips } from '@/components/ui/FilterChips';
import { StyledSelect } from '@/components/ui/StyledSelect';
import { NumberField } from '@/components/ui/NumberField';
import { useToast } from '@/components/ui/Toast';
import GearSlideOver from '@/components/entity/gear/GearSlideOver';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { compareCategories, NO_CATEGORY } from '@/lib/rental/quote';
import { MenuItem, Popover, Thumb } from '@/components/equipment/rentalUi';
import { StatusPill, STOCK_STATUS_TONE } from '@/components/equipment/StatusPill';
import { fmtMoney } from '@/components/equipment/types';
import type { AssetsData, AssetItem, AssetSpace, AssetContainer } from '@/lib/spaces/loadAssets';
import { ImportStockPanel } from './ImportStockPanel';

type Status = 'available' | 'in_use' | 'maintenance' | 'retired';
const STATUS_LABEL: Record<Status, string> = { available: 'Available', in_use: 'In use', maintenance: 'Maintenance', retired: 'Retired' };
const STATUS_ORDER: Status[] = ['available', 'in_use', 'maintenance', 'retired'];
const OWNERSHIP_LABEL: Record<string, string> = { sub_hired: 'Sub-hired in', hired_to_client: 'Hired out' };

type Place = { kind: 'all' } | { kind: 'unassigned' } | { kind: 'space'; id: string } | { kind: 'container'; id: string };
type Grouping = 'category' | 'place';
const GROUP_KEY = 'lowpass:stock:group';

const statusOf = (i: AssetItem): Status => (STATUS_ORDER.includes(i.status as Status) ? (i.status as Status) : 'available');
const rateOf = (i: AssetItem) =>
  effectiveInventoryDayRate({ purchase_cost: i.purchase_cost ?? null, day_rate: i.day_rate ?? null, day_rate_manual: i.day_rate_manual ?? false }) ?? 0;

export function AssetsClient({ initial, tours }: { initial: AssetsData; tours: { id: string; label: string }[] }) {
  const { showToast } = useToast();
  const [data, setData] = useState<AssetsData>(initial);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [place, setPlace] = useState<Place>({ kind: 'all' });
  const [placeOpen, setPlaceOpen] = useState(false);
  const [grouping, setGroupingState] = useState<Grouping>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(GROUP_KEY) === 'place' ? 'place' : 'category';
    } catch {
      return 'category';
    }
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [panel, setPanel] = useState<{ id: string | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [create, setCreate] = useState<'space' | 'container' | null>(null);

  function setGrouping(g: Grouping) {
    setGroupingState(g);
    try { window.localStorage.setItem(GROUP_KEY, g); } catch { /* private mode */ }
  }

  const refresh = useCallback(async () => {
    const [s, c, g] = await Promise.all([
      fetch('/api/spaces').then((r) => r.json()).catch(() => ({})),
      fetch('/api/containers').then((r) => r.json()).catch(() => ({})),
      fetch('/api/gear?limit=300').then((r) => r.json()).catch(() => ({})),
    ]);
    const items = (g.gear ?? []) as AssetItem[];
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

  const placeName = useCallback(
    (i: AssetItem) => {
      if (i.container_id) return data.containers.find((c) => c.id === i.container_id)?.name ?? 'Container';
      if (i.space_id) return data.spaces.find((s) => s.id === i.space_id)?.name ?? 'Space';
      return 'Unassigned';
    },
    [data.containers, data.spaces],
  );

  const inPlace = useCallback(
    (i: AssetItem) => {
      if (place.kind === 'all') return true;
      if (place.kind === 'unassigned') return !i.space_id && !i.container_id;
      if (place.kind === 'space') return i.space_id === place.id || data.containers.some((c) => c.id === i.container_id && c.space_id === place.id);
      return i.container_id === place.id;
    },
    [place, data.containers],
  );

  const placed = useMemo(() => data.items.filter(inPlace), [data.items, inPlace]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of placed) c[statusOf(i)] = (c[statusOf(i)] ?? 0) + 1;
    return c;
  }, [placed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return placed.filter((i) => {
      if (status !== 'all' && statusOf(i) !== status) return false;
      if (!q) return true;
      return [i.name, i.category, i.manufacturer, i.model, i.serial_number].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [placed, search, status]);

  const groups = useMemo(() => {
    const map = new Map<string, AssetItem[]>();
    for (const i of filtered) {
      const key = grouping === 'place' ? placeName(i) : i.category?.trim() || NO_CATEGORY;
      (map.get(key) ?? map.set(key, []).get(key)!).push(i);
    }
    const keys = [...map.keys()];
    keys.sort(grouping === 'place' ? (a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)) : compareCategories);
    return keys.map((k) => ({ key: k, items: map.get(k)!.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [filtered, grouping, placeName]);

  async function setItemsStatus(ids: string[], next: Status) {
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/gear/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })),
    );
    if (results.some((r) => !r.ok)) showToast('Some items didn’t change.', 'error');
    await refresh();
  }

  async function deleteItem(item: AssetItem) {
    const res = await fetch(`/api/gear/${item.id}`, { method: 'DELETE' });
    if (res.status === 204) {
      showToast(`${item.name} deleted`, 'success');
      setSelectedIds((s) => s.filter((x) => x !== item.id));
      await refresh();
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    showToast(j.error ?? 'Couldn’t delete it.', 'error');
  }

  const itemMenu = (r: AssetItem): RowMenuItem[] => [
    { label: 'Open', onSelect: () => setPanel({ id: r.id }) },
    { label: 'Move…', onSelect: () => { setSelectedIds([r.id]); setMoveOpen(true); } },
    ...STATUS_ORDER.filter((s) => s !== statusOf(r)).map((s, i) => ({
      label: s === 'retired' ? 'Retire' : `Mark ${STATUS_LABEL[s].toLowerCase()}`,
      sep: i === 0,
      onSelect: () => void setItemsStatus([r.id], s),
    })),
    { label: 'Delete', danger: true, sep: true, onSelect: () => void deleteItem(r) },
  ];

  const columns = useMemo<ColumnDef<AssetItem>[]>(
    () => [
      {
        id: 'name', header: 'Item', accessor: 'name', sortable: true, flex: true, minWidth: 280,
        cell: (_, r) => {
          const sub = [[r.manufacturer, r.model].filter(Boolean).join(' '), r.serial_number ? `S/N ${r.serial_number}` : null, OWNERSHIP_LABEL[r.ownership] ?? null]
            .filter(Boolean)
            .join(' · ');
          return (
            <span className="flex min-w-0 items-center gap-3">
              <Thumb src={r.image_url} size={36} icon={<Package size={15} strokeWidth={1.75} aria-hidden />} />
              <span className="min-w-0">
                <span className="block truncate text-lp-text">{r.name}</span>
                {sub ? <span className="block truncate text-xs text-lp-text-tertiary">{sub}</span> : null}
              </span>
            </span>
          );
        },
      },
      { id: 'quantity', header: 'Owned', accessor: (r) => Number(r.quantity) || 1, align: 'right', sortable: true, width: 90 },
      {
        id: 'rate', header: 'Day rate', accessor: rateOf, align: 'right', sortable: true, width: 120,
        cell: (v) => <span className="tabular-nums">{Number(v) > 0 ? fmtMoney(Number(v), 'USD') : '—'}</span>,
      },
      {
        id: 'value', header: 'Value', accessor: (r) => Number(r.value_amount) || 0, align: 'right', sortable: true, width: 130,
        cell: (_, r) => <span className="tabular-nums text-lp-text-secondary">{r.value_amount ? fmtMoney(Number(r.value_amount), r.value_currency || 'USD') : '—'}</span>,
      },
      {
        id: 'status', header: 'Status', accessor: statusOf, sortable: true, width: 150,
        cell: (v) => <StatusPill tone={STOCK_STATUS_TONE[String(v)] ?? 'neutral'}>{STATUS_LABEL[v as Status]}</StatusPill>,
      },
      { id: 'place', header: 'Place', accessor: placeName, sortable: true, width: 180, cell: (v) => <span className="truncate text-lp-text-secondary">{String(v)}</span> },
    ],
    [placeName],
  );

  const totalPieces = data.items.reduce((n, i) => n + (Number(i.quantity) || 1), 0);
  const facts = [
    `${data.items.length} item${data.items.length === 1 ? '' : 's'}`,
    totalPieces !== data.items.length ? `${totalPieces} pieces` : null,
    data.kpis.totalWeightKg ? `${data.kpis.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg` : null,
    data.spaces.length ? `${data.spaces.length} space${data.spaces.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  const placeLabel =
    place.kind === 'all' ? 'All places'
      : place.kind === 'unassigned' ? 'Unassigned'
        : place.kind === 'space' ? data.spaces.find((s) => s.id === place.id)?.name ?? 'Space'
          : data.containers.find((c) => c.id === place.id)?.name ?? 'Container';

  return (
    <div className="mx-auto flex w-full flex-col gap-5" style={{ maxWidth: 1400, padding: 'var(--lp-space-6)' }}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="lp-page-title" style={{ margin: 0, color: 'var(--lp-text)' }}>Gear &amp; rentals</h1>
          {facts.length ? <p className="mt-1 text-sm text-lp-text-secondary">{facts.join(' · ')}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <a href="/equipment" className="px-2 text-sm text-lp-text-secondary hover:text-lp-text" data-testid="assets-jobs-link">Rental jobs →</a>
          <Button variant="secondary" size="sm" leadingIcon={<Upload size={14} aria-hidden />} onClick={() => setImportOpen(true)}>Import</Button>
          <Button variant="primary" size="sm" leadingIcon={<Plus size={14} aria-hidden />} onClick={() => setPanel({ id: null })}>New item</Button>
        </div>
      </header>

      {data.items.length === 0 ? (
        <div className="rounded-xl border px-6 py-16 text-center" style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}>
          <p className="text-base font-medium text-lp-text">Start your stock</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-lp-text-tertiary">Add an item and look it up online, or paste a list to add many at once.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" size="sm" leadingIcon={<Upload size={14} aria-hidden />} onClick={() => setImportOpen(true)}>Import a list</Button>
            <Button variant="primary" size="sm" leadingIcon={<Plus size={14} aria-hidden />} onClick={() => setPanel({ id: null })}>New item</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lp-text-tertiary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, make, model, serial"
                aria-label="Search stock"
                className="h-9 w-full rounded-lg border bg-lp-surface pl-8 pr-3 text-sm text-lp-text outline-none placeholder:text-lp-text-tertiary focus-visible:border-[var(--color-lp-orange)]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </div>
            <Popover
              open={placeOpen}
              onOpenChange={setPlaceOpen}
              width={260}
              trigger={({ toggle }) => (
                <Button variant="secondary" size="sm" leadingIcon={<MapPin size={14} aria-hidden />} trailingIcon={<ChevronDown size={13} aria-hidden />} onClick={toggle}>
                  {placeLabel}
                </Button>
              )}
            >
              {(close) => (
                <PlaceMenu
                  data={data}
                  place={place}
                  onPick={(p) => { setPlace(p); close(); }}
                  onCreate={(k) => { setCreate(k); close(); }}
                />
              )}
            </Popover>
            <FilterChips
              options={[{ value: 'all' as const, label: 'All', count: placed.length }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] ?? 0 }))]}
              value={status}
              onChange={setStatus}
              ariaLabel="Filter by status"
            />
            <div className="ml-auto flex items-center gap-2 text-xs text-lp-text-tertiary">
              Group by
              <FilterChips
                options={[{ value: 'category' as const, label: 'Category' }, { value: 'place' as const, label: 'Place' }]}
                value={grouping}
                onChange={setGrouping}
                ariaLabel="Group stock by"
              />
            </div>
          </div>

          {selectedIds.length > 0 ? (
            <div
              className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-sm"
              style={{ borderColor: 'color-mix(in srgb, var(--lp-orange) 35%, var(--lp-border))', backgroundColor: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow-md)' }}
            >
              <span className="font-medium text-lp-text">{selectedIds.length} selected</span>
              <span className="mx-1 h-4 w-px" style={{ backgroundColor: 'var(--lp-border)' }} />
              <Button size="sm" variant="ghost" onClick={() => setMoveOpen(true)}>Move…</Button>
              {STATUS_ORDER.map((s) => (
                <Button key={s} size="sm" variant="ghost" onClick={() => void setItemsStatus(selectedIds, s)}>
                  {s === 'retired' ? 'Retire' : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds([])}>Clear</Button>
            </div>
          ) : null}

          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-lp-text-tertiary">Nothing matches that.</p>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 px-1">
                  <h2 className="text-sm font-medium text-lp-text">{g.key}</h2>
                  <span className="text-xs tabular-nums text-lp-text-tertiary">
                    {g.items.length} item{g.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <DataTable<AssetItem>
                  rows={g.items}
                  columns={columns}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setPanel({ id: r.id })}
                  rowMenu={itemMenu}
                  selectable
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  searchable={false}
                  toolbar={false}
                  pagination="none"
                  stickyHeader={false}
                  density="comfortable"
                  ariaLabel={`Stock — ${g.key}`}
                />
              </section>
            ))
          )}
        </>
      )}

      {panel ? (
        <GearSlideOver
          key={panel.id ?? 'new'}
          id={panel.id}
          onClose={() => setPanel(null)}
          onChanged={() => void refresh()}
          onCreated={(id) => { void refresh(); setPanel({ id }); }}
        />
      ) : null}

      <ImportStockPanel
        open={importOpen}
        existingNames={data.items.map((i) => i.name)}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
      />

      {moveOpen ? (
        <MoveDialog
          count={selectedIds.length}
          spaces={data.spaces}
          containers={data.containers}
          tours={tours}
          onClose={() => setMoveOpen(false)}
          onMove={async (dest) => {
            const res = await fetch('/api/gear/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds, ...dest }) });
            if (!res.ok) {
              showToast('Couldn’t move them.', 'error');
              return;
            }
            setMoveOpen(false);
            setSelectedIds([]);
            await refresh();
          }}
        />
      ) : null}

      {create ? (
        <CreatePlace
          kind={create}
          onClose={() => setCreate(null)}
          onCreate={async (name, kind) => {
            const res = await fetch(create === 'space' ? '/api/spaces' : '/api/containers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, kind }),
            });
            if (!res.ok) {
              showToast('Couldn’t create it.', 'error');
              return;
            }
            setCreate(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function PlaceMenu({ data, place, onPick, onCreate }: { data: AssetsData; place: Place; onPick: (p: Place) => void; onCreate: (k: 'space' | 'container') => void }) {
  const count = (pred: (i: AssetItem) => boolean) => data.items.filter(pred).length;
  const loose = data.containers.filter((c) => !c.space_id);
  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <MenuItem active={place.kind === 'all'} hint={String(data.items.length)} onClick={() => onPick({ kind: 'all' })}>All places</MenuItem>
      <MenuItem active={place.kind === 'unassigned'} hint={String(data.kpis.unassignedCount)} onClick={() => onPick({ kind: 'unassigned' })}>Unassigned</MenuItem>
      {data.spaces.length || loose.length ? <div className="my-1 h-px" style={{ backgroundColor: 'var(--lp-border)' }} /> : null}
      {data.spaces.map((s) => (
        <div key={s.id}>
          <MenuItem active={place.kind === 'space' && place.id === s.id} hint={String(count((i) => i.space_id === s.id))} onClick={() => onPick({ kind: 'space', id: s.id })}>
            {s.name} <span className="text-xs text-lp-text-tertiary">· {s.kind}</span>
          </MenuItem>
          {data.containers.filter((c) => c.space_id === s.id).map((c) => (
            <MenuItem key={c.id} active={place.kind === 'container' && place.id === c.id} hint={String(count((i) => i.container_id === c.id))} onClick={() => onPick({ kind: 'container', id: c.id })}>
              <span className="pl-4">{c.name}</span>
            </MenuItem>
          ))}
        </div>
      ))}
      {loose.map((c) => (
        <MenuItem key={c.id} active={place.kind === 'container' && place.id === c.id} hint={String(count((i) => i.container_id === c.id))} onClick={() => onPick({ kind: 'container', id: c.id })}>
          {c.name} <span className="text-xs text-lp-text-tertiary">· {c.kind}</span>
        </MenuItem>
      ))}
      <div className="my-1 h-px" style={{ backgroundColor: 'var(--lp-border)' }} />
      <MenuItem onClick={() => onCreate('space')}>New space…</MenuItem>
      <MenuItem onClick={() => onCreate('container')}>New container…</MenuItem>
    </div>
  );
}

const KINDS: Record<'space' | 'container', string[]> = {
  space: ['warehouse', 'vehicle', 'locker', 'venue', 'other'],
  container: ['case', 'cart', 'box', 'bag', 'other'],
};

function CreatePlace({ kind, onClose, onCreate }: { kind: 'space' | 'container'; onClose: () => void; onCreate: (name: string, kind: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [sub, setSub] = useState(KINDS[kind][0]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'space' ? 'New space' : 'New container'}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={busy} disabled={!name.trim()} onClick={async () => { setBusy(true); await onCreate(name.trim(), sub); setBusy(false); }}>Create</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'space' ? 'Adam’s basement' : 'Mic case 1'}
          autoFocus
          aria-label="Name"
          className="h-9 w-full rounded-lg border bg-lp-surface px-3 text-sm text-lp-text outline-none focus-visible:border-[var(--color-lp-orange)]"
          style={{ borderColor: 'var(--lp-border)' }}
        />
        <StyledSelect value={sub} onChange={setSub} options={KINDS[kind].map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} size="sm" />
      </div>
    </Modal>
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
    if (mode === 'space') await onMove({ space_id: target || null, container_id: null });
    else if (mode === 'container') await onMove({ container_id: target || null, space_id: null });
    else if (mode === 'tour') await onMove({ tour_id: target, quantity: Math.max(1, qty) });
    else await onMove({ space_id: null, container_id: null });
    setBusy(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move ${count} item${count === 1 ? '' : 's'}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={busy} disabled={mode !== 'unassign' && !target} onClick={() => void go()} data-testid="assets-move-confirm">Move</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FilterChips
          options={[
            { value: 'space' as const, label: 'To a space' },
            { value: 'container' as const, label: 'Into a container' },
            { value: 'tour' as const, label: 'Onto a tour' },
            { value: 'unassign' as const, label: 'Unassign' },
          ]}
          value={mode}
          onChange={(m) => { setMode(m); setTarget(''); }}
          ariaLabel="Move to"
        />
        {mode !== 'unassign' ? (
          <StyledSelect value={target} onChange={setTarget} options={options} placeholder={`Choose a ${mode}…`} size="sm" />
        ) : (
          <p className="m-0 text-sm text-lp-text-tertiary">They’ll show under Unassigned.</p>
        )}
        {mode === 'tour' ? (
          <label className="flex items-center gap-2 text-sm text-lp-text-secondary">
            How many of each
            <NumberField
              min={1}
              value={qty}
              blank={null}
              onValue={(n) => setQty(Math.max(1, Math.trunc(n)))}
              data-testid="assets-move-qty"
              className="h-8 w-20 rounded-lg border bg-lp-surface px-2 text-sm text-lp-text"
              style={{ borderColor: 'var(--lp-border)' }}
            />
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
