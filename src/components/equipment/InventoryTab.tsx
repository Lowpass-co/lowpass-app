/* ============================================
   LOWPASS — Equipment / Inventory Tab
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Upload, SquarePen, Check, X as XIcon, ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase-client';
import { InventoryModal } from './InventoryModal';
import { ImportModal } from './ImportModal';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import {
  dayRateFromPurchase,
  effectiveInventoryDayRate,
  isDayRateManual,
} from '@/lib/rental-pricing';
import {
  CATEGORIES,
  EQUIPMENT_TABLE_MIN_CLASS,
  fmtUSD,
  type RentalInventoryItem,
} from './types';

const INVENTORY_TOOLBAR_CLASS = 'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_10rem_minmax(5.5rem,auto)_auto] items-center gap-3';

/* Shared style for inline edit inputs */
const INLINE_INPUT =
  'w-full rounded-md border bg-transparent px-2 py-1 text-xs transition-colors outline-none';

/** Matches Lowpass form controls (see AdvanceSectionBuilder, StyledSelect accent) */
const INVENTORY_CHECKBOX_CLASS = cn(
  'h-4 w-4 shrink-0 cursor-pointer rounded-md border-2 border-lp-border bg-lp-surface',
  'text-lp-orange accent-lp-orange',
  'transition-[border-color,box-shadow] duration-150',
  'hover:border-lp-orange/50',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange/35 focus-visible:ring-offset-0'
);

interface Props {
  userId: string;
  inventory: RentalInventoryItem[];
  setInventory: (items: RentalInventoryItem[]) => void;
}

export function InventoryTab({ userId, inventory, setInventory }: Props) {
  const [search, setSearch]     = useState('');
  const [catFilter, setCat]     = useState('');
  const [modalOpen, setModal]   = useState(false);
  const [importOpen, setImport] = useState(false);
  const [editing, setEditing]   = useState<RentalInventoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  /* ── Bulk edit mode ── */
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts]     = useState<Record<string, Partial<RentalInventoryItem>>>({});
  const [saving, setSaving]     = useState(false);

  /* ── Auto image fill ── */
  const [imgFill, setImgFill] = useState<{ current: number; total: number; found: number } | null>(null);
  const imgFillStop = useRef(false);

  const supabase = createClient();

  const categoryOptions: StyledSelectOption<string>[] = [
    { value: '', label: 'All categories' },
    ...CATEGORIES.map((c) => ({ value: c, label: c })),
  ];

  const filtered = inventory.filter(i => {
    const q = search.toLowerCase();
    const matchQ = !q || i.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q);
    const matchC = !catFilter || i.category === catFilter;
    return matchQ && matchC;
  });

  const dirtyCount = Object.keys(drafts).length;

  const selectedFilteredCount = filtered.filter((i) => selectedIds.has(i.id)).length;
  const allFilteredSelected =
    filtered.length > 0 && selectedFilteredCount === filtered.length;
  const someFilteredSelected =
    selectedFilteredCount > 0 && selectedFilteredCount < filtered.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((i) => next.delete(i.id));
      } else {
        filtered.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }

  /* ── Helpers ── */
  function getDraft<K extends keyof RentalInventoryItem>(item: RentalInventoryItem, field: K): RentalInventoryItem[K] {
    return item.id in drafts && field in (drafts[item.id] ?? {})
      ? (drafts[item.id] as RentalInventoryItem)[field]
      : item[field];
  }

  function updateDraft(id: string, field: keyof RentalInventoryItem, value: RentalInventoryItem[keyof RentalInventoryItem]) {
    setDrafts((prev) => {
      const item = inventory.find((i) => i.id === id);
      if (!item) return prev;
      const patch: Partial<RentalInventoryItem> = { ...(prev[id] ?? {}), [field]: value };

      if (field === 'day_rate') {
        patch.day_rate_manual = true;
      }

      if (field === 'purchase_cost') {
        const mergedForManual: RentalInventoryItem = { ...item, ...patch };
        if (!isDayRateManual(mergedForManual)) {
          const p = typeof value === 'number' && value > 0 ? value : null;
          patch.day_rate = p != null ? dayRateFromPurchase(p) : null;
          patch.day_rate_manual = false;
        }
      }

      return { ...prev, [id]: patch };
    });
  }

  function mergedRow(item: RentalInventoryItem): RentalInventoryItem {
    return { ...item, ...(drafts[item.id] ?? {}) };
  }

  function dayRateCellValue(item: RentalInventoryItem): string {
    const m = mergedRow(item);
    if (isDayRateManual(m)) {
      return m.day_rate != null ? String(m.day_rate) : '';
    }
    const p = m.purchase_cost;
    if (p != null && p > 0) {
      const dr = dayRateFromPurchase(p);
      return dr != null ? dr.toFixed(2) : '';
    }
    return m.day_rate != null ? String(m.day_rate) : '';
  }

  function enterEditMode() {
    setDrafts({});
    setSelectedIds(new Set());
    setEditMode(true);
  }
  function cancelEdit()    { setDrafts({}); setEditMode(false); }

  async function saveAll() {
    const dirtyIds = Object.keys(drafts);
    if (!dirtyIds.length) { setEditMode(false); return; }
    setSaving(true);
    let errors = 0;
    const saved: RentalInventoryItem[] = [];
    for (const id of dirtyIds) {
      const orig = inventory.find((i) => i.id === id)!;
      const patch: Partial<RentalInventoryItem> = { ...drafts[id] };
      const merged: RentalInventoryItem = { ...orig, ...patch };
      if (!isDayRateManual(merged)) {
        const p = merged.purchase_cost;
        if (p != null && p > 0) {
          patch.day_rate = dayRateFromPurchase(p) ?? null;
        } else {
          patch.day_rate = null;
        }
        patch.day_rate_manual = false;
      } else {
        patch.day_rate_manual = true;
        patch.day_rate = merged.day_rate;
      }
      const { error } = await supabase.from('rental_inventory').update(patch).eq('id', id);
      if (error) { errors++; }
      else {
        saved.push({ ...orig, ...patch });
      }
    }
    if (errors) alert(`${errors} item${errors !== 1 ? 's' : ''} failed to save.`);
    setInventory(inventory.map(item => saved.find(s => s.id === item.id) ?? item));
    setDrafts({});
    setSaving(false);
    setEditMode(false);
  }

  /* ── Auto image fill ── */
  async function autoFillImages() {
    const targets = inventory.filter(i => !i.image_url);
    if (!targets.length) { alert('All items already have images.'); return; }
    imgFillStop.current = false;
    setImgFill({ current: 0, total: targets.length, found: 0 });
    let found = 0;
    for (let i = 0; i < targets.length; i++) {
      if (imgFillStop.current) break;
      const item = targets[i];
      setImgFill({ current: i + 1, total: targets.length, found });
      try {
        const res = await fetch(`/api/equipment/find-image?q=${encodeURIComponent(item.name)}`);
        const data = await res.json();
        const { imageUrl, code } = data as {
          imageUrl?: string | null;
          code?: string;
        };
        // Image search not configured — silently stop, no alert
        if (code === 'CSE_NOT_CONFIGURED') break;
        if (imageUrl) {
          await supabase.from('rental_inventory').update({ image_url: imageUrl }).eq('id', item.id);
          setInventory(inventory.map(inv => inv.id === item.id ? { ...inv, image_url: imageUrl } : inv));
          found++;
          setImgFill({ current: i + 1, total: targets.length, found });
        }
      } catch { /* skip item on network error */ }
    }
    setImgFill(null);
  }

  /* ── Single-item handlers ── */
  function openAdd()  { setEditing(null); setModal(true); }
  function openEdit(item: RentalInventoryItem) { setEditing(item); setModal(true); }

  async function handleDelete(item: RentalInventoryItem) {
    if (!confirm(`Delete "${item.name}"?\n\nItems in use on a job cannot be deleted.`)) return;
    const { error } = await supabase.from('rental_inventory').delete().eq('id', item.id);
    if (error) {
      if (error.code === '23503') alert('This item is currently assigned to a job. Remove it from all jobs first.');
      else alert('Delete failed: ' + error.message);
      return;
    }
    setInventory(inventory.filter(i => i.id !== item.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (
      !confirm(
        `Delete ${ids.length} selected item${ids.length !== 1 ? 's' : ''}?\n\nItems in use on a job cannot be deleted.`
      )
    ) {
      return;
    }
    const deletedIds: string[] = [];
    let inUse = 0;
    let otherErr = 0;
    for (const id of ids) {
      const { error } = await supabase.from('rental_inventory').delete().eq('id', id);
      if (!error) deletedIds.push(id);
      else if (error.code === '23503') inUse++;
      else otherErr++;
    }
    if (deletedIds.length) {
      setInventory(inventory.filter((i) => !deletedIds.includes(i.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
    }
    const parts: string[] = [];
    if (deletedIds.length) parts.push(`${deletedIds.length} deleted`);
    if (inUse) parts.push(`${inUse} skipped (assigned to a job)`);
    if (otherErr) parts.push(`${otherErr} failed`);
    if (parts.length) alert(parts.join('. ') + '.');
  }

  function onSave(saved: RentalInventoryItem) {
    const existing = inventory.find(i => i.id === saved.id);
    if (existing) setInventory(inventory.map(i => i.id === saved.id ? saved : i));
    else setInventory([...inventory, saved].sort((a, b) => a.name.localeCompare(b.name)));
    setModal(false);
  }

  /* ── Inline input style helpers ── */
  const inlineInputStyle = {
    borderColor: 'var(--lp-border)',
    color: 'var(--lp-text)',
  };
  const inlineFocusHandlers = (e: React.FocusEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = '#FF4500';
  };
  const inlineBlurHandlers = (e: React.FocusEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--lp-border)';
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">

      {/* ── Controls row ── */}
      {!editMode ? (
        <div className={INVENTORY_TOOLBAR_CLASS}>
          <div className="relative min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lp-text-tertiary)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search inventory…"
              className="w-full min-w-0 rounded-lg border py-2 pl-8 pr-3 text-sm"
              style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
            />
          </div>
          <div className="w-[160px] shrink-0 justify-self-stretch">
            <StyledSelect size="sm" value={catFilter} onChange={setCat} options={categoryOptions} placeholder="All categories" />
          </div>
          <span className="text-right text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--lp-text-tertiary)' }}>
            {inventory.length} item{inventory.length !== 1 ? 's' : ''}
            {selectedIds.size > 0 && (
              <span className="ml-2 font-semibold" style={{ color: '#FF4500' }}>
                · {selectedIds.size} selected
              </span>
            )}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
                style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.06)' }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.06)';
                }}
              >
                <Trash2 size={13} strokeWidth={2.5} />
                Delete {selectedIds.size}
              </button>
            )}
            <button
              type="button"
              onClick={() => setImport(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#FF4500'; e.currentTarget.style.color = '#FF4500'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--lp-border)'; e.currentTarget.style.color = 'var(--lp-text-secondary)'; }}
            >
              <Upload size={13} strokeWidth={2.5} /> Import
            </button>
            <button
              type="button"
              onClick={autoFillImages}
              disabled={!!imgFill}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
              onMouseOver={e => { if (!imgFill) { e.currentTarget.style.borderColor = '#FF4500'; e.currentTarget.style.color = '#FF4500'; } }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--lp-border)'; e.currentTarget.style.color = 'var(--lp-text-secondary)'; }}
              title="Auto-fill missing product images using Google image search"
            >
              {imgFill ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} strokeWidth={2.5} />}
              {imgFill ? `${imgFill.current}/${imgFill.total}` : 'Auto Images'}
            </button>
            <button
              type="button"
              onClick={enterEditMode}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#FF4500'; e.currentTarget.style.color = '#FF4500'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--lp-border)'; e.currentTarget.style.color = 'var(--lp-text-secondary)'; }}
            >
              <SquarePen size={13} strokeWidth={2.5} /> Edit All
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors"
              style={{ backgroundColor: '#FF4500' }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = '#E63E00')}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
            >
              <Plus size={14} strokeWidth={2.5} /> Add Item
            </button>
          </div>
        </div>
      ) : (
        /* Edit mode toolbar */
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
              Editing {filtered.length} item{filtered.length !== 1 ? 's' : ''}
            </span>
            {dirtyCount > 0 && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ backgroundColor: 'rgba(255,69,0,0.12)', color: '#FF4500' }}
              >
                {dirtyCount} change{dirtyCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>Tab to move between cells</p>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
            >
              <XIcon size={13} /> Cancel
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || dirtyCount === 0}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#FF4500' }}
              onMouseOver={e => { if (!saving && dirtyCount > 0) e.currentTarget.style.backgroundColor = '#E63E00'; }}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
            >
              <Check size={13} strokeWidth={2.5} />
              {saving ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount !== 1 ? 's' : ''}` : 'No changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Auto-image progress bar ── */}
      {imgFill && (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
          style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}
        >
          <Loader2 size={13} className="shrink-0 animate-spin" style={{ color: '#FF4500' }} />
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--lp-text-secondary)' }}>
                Finding images… {imgFill.current} / {imgFill.total}
              </span>
              <span className="font-semibold" style={{ color: '#FF4500' }}>
                {imgFill.found} found
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--lp-border)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(imgFill.current / imgFill.total) * 100}%`, backgroundColor: '#FF4500' }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => { imgFillStop.current = true; }}
            className="shrink-0 text-xs font-semibold"
            style={{ color: 'var(--lp-text-tertiary)' }}
            onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
          >
            Stop
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div
        className={cn('flex flex-col overflow-hidden rounded-xl border', EQUIPMENT_TABLE_MIN_CLASS)}
        style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
            <div className="text-3xl">📦</div>
            <p className="text-sm font-medium" style={{ color: 'var(--lp-text-secondary)' }}>
              {inventory.length === 0 ? 'No inventory yet' : 'No items match that search'}
            </p>
            {inventory.length === 0 && (
              <button onClick={openAdd} className="mt-1 text-xs font-semibold" style={{ color: '#FF4500' }}>
                Add your first item →
              </button>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}>
                  <th className="w-10 px-2 py-3 text-center" style={{ color: 'var(--lp-text-tertiary)' }}>
                    {!editMode && filtered.length > 0 ? (
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        className={cn(INVENTORY_CHECKBOX_CLASS, 'align-middle')}
                        title={allFilteredSelected ? 'Deselect all visible' : 'Select all visible'}
                        aria-label="Select all visible rows"
                      />
                    ) : null}
                  </th>
                  <th className="w-14 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }} />
                  {(['Name', 'Category', 'Serial No.', 'Origin', 'Weight (kg)', 'Purchase Cost', 'Day Rate', ''] as const).map((h, i) => (
                    <th
                      key={h || `col-${i}`}
                      className={cn(
                        'px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider',
                        i === 7 && 'w-20 text-right'
                      )}
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const isDirty = item.id in drafts;
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors"
                      style={{
                        borderBottom: idx < filtered.length - 1 ? '1px solid var(--lp-border-light)' : 'none',
                        backgroundColor: isDirty ? 'rgba(255,69,0,0.03)' : undefined,
                      }}
                      onMouseOver={e => { if (!editMode) (e.currentTarget.style.backgroundColor = 'var(--lp-surface-hover)'); }}
                      onMouseOut={e => { if (!editMode) (e.currentTarget.style.backgroundColor = isDirty ? 'rgba(255,69,0,0.03)' : 'transparent'); }}
                    >
                      {/* Select */}
                      <td className="w-10 px-2 py-2.5 text-center align-middle">
                        {!editMode ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(INVENTORY_CHECKBOX_CLASS, 'align-middle')}
                            aria-label={`Select ${item.name}`}
                          />
                        ) : null}
                      </td>
                      {/* Thumbnail */}
                      <td className="px-4 py-2.5">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" style={{ border: '1px solid var(--lp-border)' }}
                            onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex'; }}
                          />
                        ) : null}
                        <div className="h-10 w-10 rounded-lg items-center justify-center text-base"
                          style={{ backgroundColor: 'var(--lp-bg-secondary)', display: item.image_url ? 'none' : 'flex', border: '1px solid var(--lp-border)' }}>
                          📦
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-2.5 max-w-[200px]">
                        {editMode ? (
                          <input
                            className={INLINE_INPUT}
                            style={inlineInputStyle}
                            value={String(getDraft(item, 'name') ?? '')}
                            onChange={e => updateDraft(item.id, 'name', e.target.value)}
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          />
                        ) : (
                          <>
                            <div className="font-semibold" style={{ color: 'var(--lp-text)' }}>{item.name}</div>
                            {item.notes && <div className="mt-0.5 text-xs truncate max-w-[220px]" style={{ color: 'var(--lp-text-tertiary)' }}>{item.notes}</div>}
                          </>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-2.5">
                        {editMode ? (
                          <select
                            className={INLINE_INPUT}
                            style={inlineInputStyle}
                            value={String(getDraft(item, 'category') ?? '')}
                            onChange={e => updateDraft(item.id, 'category', e.target.value || null)}
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          >
                            <option value="">— none —</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          item.category
                            ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'rgba(255,69,0,0.08)', color: '#FF4500' }}>{item.category}</span>
                            : <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Serial */}
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                        {editMode ? (
                          <input
                            className={cn(INLINE_INPUT, 'font-mono')}
                            style={inlineInputStyle}
                            value={String(getDraft(item, 'serial_number') ?? '')}
                            onChange={e => updateDraft(item.id, 'serial_number', e.target.value || null)}
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          />
                        ) : (
                          item.serial_number || <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Origin */}
                      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                        {editMode ? (
                          <input
                            className={INLINE_INPUT}
                            style={inlineInputStyle}
                            value={String(getDraft(item, 'country_of_origin') ?? '')}
                            onChange={e => updateDraft(item.id, 'country_of_origin', e.target.value || null)}
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          />
                        ) : (
                          item.country_of_origin || <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Weight */}
                      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                        {editMode ? (
                          <input
                            type="number" step="0.01" min="0"
                            className={INLINE_INPUT}
                            style={inlineInputStyle}
                            value={getDraft(item, 'weight_kg') ?? ''}
                            onChange={e => updateDraft(item.id, 'weight_kg', e.target.value === '' ? null : parseFloat(e.target.value))}
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          />
                        ) : (
                          item.weight_kg != null ? `${item.weight_kg} kg` : <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Purchase cost */}
                      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                        {editMode ? (
                          <input
                            type="number" step="0.01" min="0"
                            className={INLINE_INPUT}
                            style={inlineInputStyle}
                            value={getDraft(item, 'purchase_cost') ?? ''}
                            onChange={e => updateDraft(item.id, 'purchase_cost', e.target.value === '' ? null : parseFloat(e.target.value))}
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          />
                        ) : (
                          fmtUSD(item.purchase_cost)
                        )}
                      </td>

                      {/* Day rate */}
                      <td className="px-4 py-2.5">
                        {editMode ? (
                          <input
                            type="number" step="0.01" min="0"
                            className={INLINE_INPUT}
                            style={inlineInputStyle}
                            value={dayRateCellValue(item)}
                            readOnly={
                              (() => {
                                const m = mergedRow(item);
                                return m.purchase_cost != null && m.purchase_cost > 0 && !isDayRateManual(m);
                              })()
                            }
                            onChange={e =>
                              updateDraft(
                                item.id,
                                'day_rate',
                                e.target.value === '' ? null : parseFloat(e.target.value)
                              )
                            }
                            onFocus={inlineFocusHandlers}
                            onBlur={inlineBlurHandlers}
                          />
                        ) : (
                          <span className="font-semibold" style={{ color: 'var(--lp-text)' }}>
                            {fmtUSD(effectiveInventoryDayRate(item))}
                            <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--lp-text-tertiary)' }}>/day</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2.5 text-right">
                        {!editMode && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openEdit(item)} className="rounded-md p-1.5 transition-colors" style={{ color: 'var(--lp-text-tertiary)' }}
                              onMouseOver={e => (e.currentTarget.style.color = 'var(--lp-text)')}
                              onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
                              title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(item)} className="rounded-md p-1.5 transition-colors" style={{ color: 'var(--lp-text-tertiary)' }}
                              onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
                              onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
                              title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                        {editMode && isDirty && (
                          <span className="text-xs font-semibold" style={{ color: '#FF4500' }}>●</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <InventoryModal
          key={editing?.id ?? 'new'}
          userId={userId}
          editing={editing}
          onSave={onSave}
          onClose={() => setModal(false)}
        />
      )}

      {importOpen && (
        <ImportModal
          userId={userId}
          onImported={newItems => {
            setInventory(
              [...inventory, ...newItems].sort((a, b) => a.name.localeCompare(b.name))
            );
          }}
          onClose={() => setImport(false)}
        />
      )}
    </div>
  );
}
