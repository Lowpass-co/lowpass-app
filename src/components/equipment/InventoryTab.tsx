/* ============================================
   LOWPASS — Equipment / Inventory Tab
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Upload, SquarePen, Check, X as XIcon, ImageIcon, Loader2, Briefcase, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase-client';
import { InventoryModal } from './InventoryModal';
import { ImportModal } from './ImportModal';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { useToast } from '@/components/ui/Toast';
import { createGearFromRentalInventory } from '@/lib/api/gear';
import {
  dayRateFromPurchase,
  effectiveInventoryDayRate,
  isDayRateManual,
} from '@/lib/rental-pricing';
import {
  CATEGORIES,
  EQUIPMENT_TABLE_MIN_CLASS,
  INVENTORY_STATUS_OPTIONS,
  INVENTORY_STATUS_STYLES,
  fmtUSD,
  type InventoryStatus,
  type RentalInventoryItem,
} from './types';

/* ============================================
   Sprint 11 §5 — relative-time formatter for the "Last used"
   column. Returns "—" when never used (last_used_at is null),
   else a coarse relative window matching the personnel grid's
   activity dot semantics ("today" / "Xd ago" / etc.).
   ============================================ */
function fmtLastUsed(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'today';
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

type TourOpt = { id: string; name: string };

const INVENTORY_TOOLBAR_CLASS = 'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_10rem_minmax(5.5rem,auto)_auto] items-center gap-3';

/* Shared style for inline edit inputs */
const INLINE_INPUT =
  'w-full rounded-md border bg-transparent px-2 py-1 text-xs transition-colors outline-none';

/** Global brand checkbox — see `globals.css` `.lp-checkbox` */
const INVENTORY_CHECKBOX_CLASS = 'lp-checkbox';

interface Props {
  userId: string;
  /** Sprint 12 §1 — required so client-side INSERTs include the
   *  workspace_id column that migration 095's RLS WITH CHECK
   *  clause now demands. May be null in rare bootstrap cases
   *  (no workspace yet); the modal disables Add in that case. */
  workspaceId: string | null;
  inventory: RentalInventoryItem[];
  setInventory: (items: RentalInventoryItem[]) => void;
}

export function InventoryTab({ userId, workspaceId, inventory, setInventory }: Props) {
  const [search, setSearch]     = useState('');
  const [catFilter, setCat]     = useState('');
  /* Sprint 11 §5 — status filter as a chip-strip above the
     toolbar. Multi-select: empty set means "all statuses". */
  const [statusFilter, setStatusFilter] = useState<Set<InventoryStatus>>(new Set());
  const [modalOpen, setModal]   = useState(false);
  const [importOpen, setImport] = useState(false);
  const [editing, setEditing]   = useState<RentalInventoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  function toggleStatusFilter(status: InventoryStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  /* ── Bulk edit mode ── */
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts]     = useState<Record<string, Partial<RentalInventoryItem>>>({});
  const [saving, setSaving]     = useState(false);

  /* ── Auto image fill ── */
  const [imgFill, setImgFill] = useState<{ current: number; total: number; found: number } | null>(null);
  const imgFillStop = useRef(false);

  /* ── UX21: "Add to tour" modal state ── */
  const { showToast } = useToast();
  const [addToTourFor, setAddToTourFor] = useState<RentalInventoryItem | null>(null);
  const [tours, setTours] = useState<TourOpt[]>([]);
  const [toursLoaded, setToursLoaded] = useState(false);
  const [addingToTourId, setAddingToTourId] = useState<string | null>(null);

  const supabase = createClient();

  // Lazy-load active tours the first time the user opens the picker.
  useEffect(() => {
    if (!addToTourFor || toursLoaded) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.id)
        .single();
      if (!profile?.workspace_id) return;
      const { data } = await supabase
        .from('tours')
        .select('id, name, status')
        .eq('workspace_id', profile.workspace_id)
        .in('status', ['planning', 'active'])
        .order('start_date', { ascending: false });
      setTours(((data ?? []) as TourOpt[]).map((t) => ({ id: t.id, name: t.name })));
      setToursLoaded(true);
    })();
  }, [addToTourFor, toursLoaded, supabase]);

  const handleAddToTour = async (rentalInv: RentalInventoryItem, tourId: string, tourName: string) => {
    setAddingToTourId(tourId);
    try {
      await createGearFromRentalInventory(rentalInv.id, { tourId, ownership: 'owned' });
      showToast(`Added "${rentalInv.name}" to ${tourName}`);
      setAddToTourFor(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add to tour', 'error');
    } finally {
      setAddingToTourId(null);
    }
  };

  const categoryOptions: StyledSelectOption<string>[] = [
    { value: '', label: 'All categories' },
    ...CATEGORIES.map((c) => ({ value: c, label: c })),
  ];

  const filtered = inventory.filter(i => {
    const q = search.toLowerCase();
    const matchQ = !q || i.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q);
    const matchC = !catFilter || i.category === catFilter;
    /* Sprint 11 §5 — status chip filter. Empty set means "all".
       Untagged rows (status null) treat as 'available' so they
       still appear under the Available chip selection — old data
       predating the migration shouldn't drop out of view. */
    const itemStatus: InventoryStatus = (i.status ?? 'available') as InventoryStatus;
    const matchS = statusFilter.size === 0 || statusFilter.has(itemStatus);
    return matchQ && matchC && matchS;
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

  /* ── Auto image fill ──
     Walks every inventory row missing an image and asks
     `/api/equipment/find-image` for the top Google Custom Search hit.
     Two subtleties worth preserving:
       1. We keep a *local* running copy of inventory across the loop.
          `inventory` in this closure is captured at click time, so doing
          `setInventory(inventory.map(...))` on each iteration would clobber
          earlier successful updates with the original (stale) array — only
          the last image would visibly stick. The local `working` copy
          accumulates updates and is pushed to React state after each save.
       2. Configuration / API errors are surfaced to the user. We used to
          silently `break` on `CSE_NOT_CONFIGURED` / `GOOGLE_CSE_ERROR`,
          which made a misconfigured key indistinguishable from a working
          batch with zero matches — i.e. "Auto Images appears to do
          nothing". Now the message bubbles up in a single alert at the
          end so the user knows whether to fix env vars, enable the
          Custom Search JSON API on their key, or just try a better query.
  */
  async function autoFillImages() {
    const targets = inventory.filter(i => !i.image_url);
    if (!targets.length) { alert('All items already have images.'); return; }
    imgFillStop.current = false;
    setImgFill({ current: 0, total: targets.length, found: 0 });

    let found = 0;
    let savedFailures = 0;          // Supabase update failures
    let firstApiError: string | null = null;
    let fatalCode: string | null = null; // CSE_NOT_CONFIGURED stops the batch
    let working = inventory;        // running snapshot, threaded through setInventory

    for (let i = 0; i < targets.length; i++) {
      if (imgFillStop.current) break;
      const item = targets[i];
      setImgFill({ current: i + 1, total: targets.length, found });

      let data: { imageUrl?: string | null; code?: string; message?: string } | null = null;
      try {
        const res = await fetch(`/api/equipment/find-image?q=${encodeURIComponent(item.name)}`);
        try { data = await res.json(); } catch { data = null; }
      } catch {
        // Network error — record once and keep trying so a single blip
        // doesn't kill the whole run.
        if (!firstApiError) firstApiError = 'Network error reaching the image search API.';
        continue;
      }

      if (!data) continue;
      const { imageUrl, code, message } = data;

      // Hard-stop: the server isn't configured at all. No point hammering it.
      if (code === 'CSE_NOT_CONFIGURED') {
        fatalCode = code;
        if (!firstApiError) firstApiError = message || 'Image search is not configured on the server.';
        break;
      }
      // Soft errors (quota, key missing Custom Search API, transient Google
      // failures) — record the first one but keep going; some queries may
      // still hit cache or recover.
      if (code === 'GOOGLE_CSE_ERROR') {
        if (!firstApiError) firstApiError = message || 'Google Custom Search returned an error.';
        continue;
      }
      if (code === 'BAD_REQUEST') continue;

      if (imageUrl) {
        const { error: updErr } = await supabase
          .from('rental_inventory')
          .update({ image_url: imageUrl })
          .eq('id', item.id);
        if (updErr) {
          savedFailures++;
          if (!firstApiError) firstApiError = `Database update failed: ${updErr.message}`;
          continue;
        }
        // Thread the update through our running copy so later iterations
        // (and the final setInventory call) see every previous match.
        working = working.map(inv =>
          inv.id === item.id ? { ...inv, image_url: imageUrl } : inv,
        );
        setInventory(working);
        found++;
        setImgFill({ current: i + 1, total: targets.length, found });
      }
    }

    setImgFill(null);

    // Final user-visible summary. Quiet success when at least one image
    // landed and nothing went wrong; otherwise tell the user what
    // happened so they can act on it.
    const stopped = imgFillStop.current;
    if (fatalCode === 'CSE_NOT_CONFIGURED') {
      alert(
        `Auto Images can't run — image search isn't configured.\n\n${firstApiError}\n\n` +
          `Set GOOGLE_CSE_CX and either GOOGLE_CUSTOM_SEARCH_API_KEY or GOOGLE_PLACES_API_KEY (with the Custom Search JSON API enabled) in .env.local, then restart the dev server.`,
      );
      return;
    }
    if (firstApiError && found === 0 && !stopped) {
      alert(
        `Auto Images finished with no matches.\n\nFirst error: ${firstApiError}\n\n` +
          `If this is a Google API key error, check that the Custom Search JSON API is enabled on the key and that billing is active in Google Cloud.`,
      );
      return;
    }
    if (firstApiError && found > 0) {
      alert(
        `Auto Images: matched ${found} of ${targets.length} item${targets.length !== 1 ? 's' : ''}.\n\n` +
          `Some lookups failed — first error: ${firstApiError}` +
          (savedFailures ? `\n\n${savedFailures} database update${savedFailures !== 1 ? 's' : ''} also failed.` : ''),
      );
      return;
    }
    if (stopped && found === 0) {
      alert('Auto Images stopped — no matches were saved.');
    }
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

      {/* Sprint 11 §5 — status filter chips. Multi-select.
          Click toggles; "All" clears the filter. Hidden in edit
          mode because filtering during a bulk edit is confusing
          (rows disappear under the editor's feet). */}
      {!editMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter(new Set())}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 6,
              padding: '4px 10px',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              color:
                statusFilter.size === 0
                  ? 'var(--lp-text-inverse)'
                  : 'var(--lp-text-secondary)',
              background:
                statusFilter.size === 0
                  ? 'var(--color-lp-orange)'
                  : 'transparent',
              border:
                statusFilter.size === 0
                  ? '1px solid transparent'
                  : '1px solid var(--lp-border-strong)',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            All ({inventory.length})
          </button>
          {INVENTORY_STATUS_OPTIONS.map((opt) => {
            const active = statusFilter.has(opt.value);
            const tone = INVENTORY_STATUS_STYLES[opt.value];
            const count = inventory.filter(
              (i) => (i.status ?? 'available') === opt.value,
            ).length;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatusFilter(opt.value)}
                className="btn-transition inline-flex items-center"
                style={{
                  gap: 6,
                  padding: '4px 10px',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: active ? tone.text : 'var(--lp-text-secondary)',
                  background: active ? tone.bg : 'transparent',
                  border: `1px solid ${active ? tone.border : 'var(--lp-border)'}`,
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: tone.text,
                  }}
                />
                {opt.label} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

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
            {/* Sprint 12 §2 — bulk QR print. Surfaces only when
                rows are selected. Routes to the print-labels
                page with the ids in the URL; that page renders
                the grid + fires window.print() on click. */}
            {selectedIds.size > 0 && (
              <a
                href={`/rental/print-labels?ids=${encodeURIComponent(Array.from(selectedIds).join(','))}`}
                target="_blank"
                rel="noopener"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
                style={{
                  borderColor: 'var(--lp-border)',
                  color: 'var(--lp-text-secondary)',
                  backgroundColor: 'transparent',
                  textDecoration: 'none',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#FF4500';
                  e.currentTarget.style.color = '#FF4500';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--lp-border)';
                  e.currentTarget.style.color = 'var(--lp-text-secondary)';
                }}
                title="Open the print sheet for the selected items"
              >
                <Printer size={13} strokeWidth={2.5} />
                Print {selectedIds.size} label{selectedIds.size === 1 ? '' : 's'}
              </a>
            )}
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
                  {(['Name', 'Category', 'Status', 'Last used', 'Serial No.', 'Origin', 'Weight (kg)', 'Purchase Cost', 'Day Rate', ''] as const).map((h, i, arr) => (
                    <th
                      key={h || `col-${i}`}
                      className={cn(
                        'px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider',
                        i === arr.length - 1 && 'w-20 text-right'
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
                          <BrandedSelect
                            value={String(getDraft(item, 'category') ?? '')}
                            onChange={(v) => updateDraft(item.id, 'category', v || null)}
                            options={[
                              { value: '', label: '— none —' },
                              ...CATEGORIES.map((c) => ({ value: c, label: c })),
                            ]}
                            ariaLabel="Category"
                            size="sm"
                            className="w-full"
                            minWidth={140}
                          />
                        ) : (
                          item.category
                            ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'rgba(255,69,0,0.08)', color: '#FF4500' }}>{item.category}</span>
                            : <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Sprint 11 §5 — Status pill. Inline edit
                          uses BrandedSelect (Category pattern);
                          read-mode renders the tone-coded pill
                          from INVENTORY_STATUS_STYLES. Untagged
                          rows fall back to 'available' so old
                          data predating migration 091 reads
                          sensibly. */}
                      <td className="px-4 py-2.5">
                        {editMode ? (
                          <BrandedSelect
                            value={String(getDraft(item, 'status') ?? 'available')}
                            onChange={(v) => updateDraft(item.id, 'status', (v || 'available') as InventoryStatus)}
                            options={INVENTORY_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                            ariaLabel="Status"
                            size="sm"
                            className="w-full"
                            minWidth={130}
                          />
                        ) : (() => {
                          const s = (item.status ?? 'available') as InventoryStatus;
                          const tone = INVENTORY_STATUS_STYLES[s];
                          const label = INVENTORY_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
                          return (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                gap: 6,
                                backgroundColor: tone.bg,
                                color: tone.text,
                                border: `1px solid ${tone.border}`,
                              }}
                            >
                              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: tone.text }} />
                              {label}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Sprint 11 §5 — Last used relative time.
                          Read-only — the column is server-stamped
                          when an item lands on a confirmed job. */}
                      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                        {fmtLastUsed(item.last_used_at)}
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
                            <button onClick={() => setAddToTourFor(item)} className="rounded-md p-1.5 transition-colors" style={{ color: 'var(--lp-text-tertiary)' }}
                              onMouseOver={e => (e.currentTarget.style.color = '#FF4500')}
                              onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
                              title="Add to tour">
                              <Briefcase size={14} />
                            </button>
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
          workspaceId={workspaceId}
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

      {/* UX21 — "Add to tour" picker. Calls createGearFromRentalInventory which
          promotes the row to canonical Gear (or reuses an existing link) and
          inserts a tour_gear join row in the same call. Default ownership: owned. */}
      {addToTourFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => addingToTourId === null && setAddToTourFor(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-lp-text">Add to tour</h3>
                <p className="mt-0.5 truncate text-xs text-lp-text-secondary">
                  {addToTourFor.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => addingToTourId === null && setAddToTourFor(null)}
                className="rounded-md p-1 text-lp-text-tertiary hover:text-lp-text"
                title="Close"
              >
                <XIcon size={16} />
              </button>
            </div>

            {!toursLoaded ? (
              <div className="flex items-center gap-2 px-1 py-3 text-sm text-lp-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tours…
              </div>
            ) : tours.length === 0 ? (
              <p className="px-1 py-3 text-sm text-lp-text-secondary">
                No active tours. Create a tour first.
              </p>
            ) : (
              <ul className="max-h-72 divide-y divide-lp-border overflow-y-auto rounded-md border border-lp-border">
                {tours.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={addingToTourId !== null}
                      onClick={() => void handleAddToTour(addToTourFor, t.id, t.name)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-lp-bg-tertiary/40 disabled:opacity-50"
                    >
                      <span className="truncate text-lp-text">{t.name}</span>
                      {addingToTourId === t.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-lp-text-tertiary" />
                      ) : (
                        <Plus size={14} className="shrink-0 text-lp-text-tertiary" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
