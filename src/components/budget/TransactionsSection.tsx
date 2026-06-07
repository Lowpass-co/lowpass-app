'use client';

/* ============================================
   LOWPASS — <TransactionsSection> (Budget Phase A §A1)

   Vendor-breakdown editor mounted inside the line-item slide-
   over. Replaces / sits beside the single-entry actual_cost
   pattern so a line item like "$1000 audio" can break down
   into "$200 Lowpass Audio + $800 Clair Audio".

   Layout (per spec §A1):

     Transactions                       [+ Add transaction]

       ⠿ Lowpass Audio    £200.00    2026-04-15    📎   [×]
       ⠿ Clair Audio      £800.00    2026-04-20         [×]

                          ─────────
                          £1,000.00 (2 transactions)

   Each row: drag handle, vendor name input, amount input,
   paid_at date, receipt indicator, delete button on hover.
   Auto-save fires on each field blur (PATCH).

   API:
     GET    /api/budget/line-items/[id]/transactions
     POST   /api/budget/line-items/[id]/transactions
     PATCH  /api/budget/transactions/[id]
     DELETE /api/budget/transactions/[id]
     PATCH  /api/budget/transactions/[id]/reorder

   Token-clean: every visual value via var(--lp-…). No
   hardcoded hex / shadows / spacings.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react';
import { budgetCurrencySymbol } from '@/lib/budget-currency';
import { VendorCombobox } from '@/components/budget/cells/VendorCombobox';
import { useBudgetConfirm } from '@/components/budget/BudgetConfirmDialog';
import type { BudgetLineItemTransaction } from '@/lib/budget/transactions';

interface Props {
  lineItemId: string;
  /** Line item's currency; falls back to GBP. Transaction
   *  rows with a NULL currency inherit this. */
  currency?: string | null;
  /** Phase 4.3 — fired after every successful POST / PATCH(amount) /
   *  DELETE with the new transaction (sum, count). The host updates the
   *  line's actual optimistically — NO router.refresh, panel stays open. */
  onChange?: (sum: number, count: number) => void;
  /** §B3.2 — parent line item's vendor (from notes encoding
   *  "Vendor: <name>"). New transactions seed with this value;
   *  the per-row VendorCombobox surfaces it at the top of the
   *  autocomplete list. Empty string when the line has no
   *  vendor set. */
  defaultVendor?: string;
}

export function TransactionsSection({
  lineItemId,
  currency,
  onChange,
  defaultVendor,
}: Props) {
  const [rows, setRows] = useState<BudgetLineItemTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { requestConfirm, dialog: confirmDialog } = useBudgetConfirm();

  const tourCurrency = currency || 'GBP';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/budget/line-items/${encodeURIComponent(lineItemId)}/transactions`,
      );
      const json = (await res.json().catch(() => ({}))) as {
        transactions?: BudgetLineItemTransaction[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Could not load transactions.');
        setRows([]);
        return;
      }
      setRows(json.transactions ?? []);
    } catch {
      setError('Network error loading transactions.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [lineItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTransaction = useCallback(async () => {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/budget/line-items/${encodeURIComponent(lineItemId)}/transactions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          /* §B3.2 — seed the new transaction's vendor with
             the parent line's vendor when available. User
             can override via the combobox before save. */
          body: JSON.stringify({
            vendor_name: (defaultVendor ?? '').trim() || 'New vendor',
            amount: 0,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        transaction?: BudgetLineItemTransaction;
        error?: string;
      };
      if (!res.ok || !json.transaction) {
        setError(json.error ?? 'Could not add transaction.');
        return;
      }
      const next = [...rows, json.transaction];
      setRows(next);
      onChange?.(sumOf(next), next.length);
    } finally {
      setAdding(false);
    }
  }, [lineItemId, onChange, defaultVendor, rows]);

  /* Single PATCH for inline edits — optimistic local update
     then network. On failure, refetch to converge. */
  const patchRow = useCallback(
    async (id: string, patch: Partial<BudgetLineItemTransaction>) => {
      const next = rows.map((r) =>
        r.id === id ? ({ ...r, ...patch } as BudgetLineItemTransaction) : r,
      );
      setRows(next);
      // Optimistic actual sync (no router.refresh) when the amount moves.
      if (patch.amount !== undefined) onChange?.(sumOf(next), next.length);
      try {
        const res = await fetch(`/api/budget/transactions/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          setError(json.error ?? 'Save failed.');
          void load();
          return;
        }
      } catch {
        setError('Network error saving transaction.');
        void load();
      }
    },
    [load, onChange, rows],
  );

  const deleteRow = useCallback(
    (id: string) => {
      // Phase 4.3 / pitfall #10 — branded confirm, never window.confirm.
      requestConfirm({
        title: 'Delete transaction?',
        message: 'Remove this vendor breakdown line? This can’t be undone.',
        confirmLabel: 'Delete',
        onConfirm: () => {
          const prev = rows;
          const next = rows.filter((r) => r.id !== id);
          setRows(next);
          onChange?.(sumOf(next), next.length);
          void (async () => {
            try {
              const res = await fetch(
                `/api/budget/transactions/${encodeURIComponent(id)}`,
                { method: 'DELETE' },
              );
              if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                setError(json.error ?? 'Delete failed.');
                setRows(prev);
                onChange?.(sumOf(prev), prev.length);
                return;
              }
            } catch {
              setError('Network error deleting.');
              setRows(prev);
              onChange?.(sumOf(prev), prev.length);
            }
          })();
        },
      });
    },
    [rows, onChange, requestConfirm],
  );

  /* Reorder: optimistic local move + PATCH /reorder for each
     affected row. Simple O(n) — fine for the small lists
     (vendor breakdowns are typically 1–10 rows). */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIndex = rows.findIndex((r) => r.id === active.id);
      const newIndex = rows.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(rows, oldIndex, newIndex);
      setRows(next);
      /* Push the new sort_order for every row whose position
         changed. min(old,new) → max(old,new) inclusive. */
      const lo = Math.min(oldIndex, newIndex);
      const hi = Math.max(oldIndex, newIndex);
      const moves = next.slice(lo, hi + 1).map((row, i) => ({ id: row.id, sort_order: lo + i }));
      await Promise.all(
        moves.map((m) =>
          fetch(`/api/budget/transactions/${encodeURIComponent(m.id)}/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: m.sort_order }),
          }).catch(() => null),
        ),
      );
    },
    [rows],
  );

  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
          Transactions
        </h3>
        <button
          type="button"
          onClick={addTransaction}
          disabled={adding}
          className="inline-flex items-center gap-1 rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-xs font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add transaction
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-3 text-xs text-lp-text-tertiary">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-lp-border bg-lp-surface/50 p-4 text-center text-xs text-lp-text-secondary">
          Type an Actual cost directly in the grid for a quick entry, or add a vendor
          breakdown below.
        </div>
      ) : (
        <div className="rounded-xl border border-lp-border bg-lp-surface/50">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <TransactionRow
                  key={row.id}
                  row={row}
                  tourCurrency={tourCurrency}
                  onPatch={patchRow}
                  onDelete={deleteRow}
                  defaultVendor={defaultVendor}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div
            className="flex items-center justify-end gap-3 border-t border-lp-border px-3 py-2 text-sm"
            style={{ background: 'var(--lp-bg)' }}
          >
            <span className="text-lp-text-tertiary">
              {rows.length} transaction{rows.length === 1 ? '' : 's'}
            </span>
            <span className="font-mono font-semibold text-lp-text">
              {formatCurrency(total, tourCurrency)}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-lp-error">{error}</p>
      )}
      {confirmDialog}
    </div>
  );
}

function TransactionRow({
  row,
  tourCurrency,
  onPatch,
  onDelete,
  defaultVendor,
}: {
  row: BudgetLineItemTransaction;
  tourCurrency: string;
  onPatch: (id: string, patch: Partial<BudgetLineItemTransaction>) => void;
  onDelete: (id: string) => void;
  /** §B3.2 — parent line item's vendor, surfaced at the top
   *  of the per-row VendorCombobox autocomplete list. */
  defaultVendor?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  /* Local draft state per field so editing doesn't fight the
     parent's optimistic update. We commit on blur. */
  const [vendor, setVendor] = useState(row.vendor_name);
  const [amount, setAmount] = useState(String(row.amount ?? ''));
  const [paidAt, setPaidAt] = useState(row.paid_at ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync local draft from server when the row prop changes (matches §8b2 ChannelBlock/OutputBlock precedent) */
    setVendor(row.vendor_name);
    setAmount(String(row.amount ?? ''));
    setPaidAt(row.paid_at ?? '');
    setNotes(row.notes ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [row.vendor_name, row.amount, row.paid_at, row.notes]);

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const displayCurrency = row.currency || tourCurrency;

  return (
    <div
      ref={setNodeRef}
      style={rowStyle}
      className="group grid items-center gap-2 border-b border-lp-border px-2 py-2 last:border-b-0"
      // Tight layout — drag | vendor | amount | date | receipt-icon | delete
    >
      <div className="grid grid-cols-[16px_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_18px_18px] items-center gap-2">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="flex h-6 w-4 cursor-grab items-center justify-center text-lp-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>

        {/* §B3.2 — VendorCombobox with parent-vendor + workspace
            history autocomplete. Free-text typing still wins
            (the dropdown is non-modal); selecting an option
            commits via onChange. Commit-on-blur logic same as
            before via onCommit + the wrapper effect below. */}
        <VendorCombobox
          value={vendor}
          onChange={(next) => setVendor(next)}
          defaultVendor={defaultVendor}
          placeholder="Vendor"
          ariaLabel="Vendor name"
          onCommit={(committed) => {
            /* committed comes from the combobox so option
               picks ship the actual selected value (setState
               on `vendor` is async — closure-reading would
               miss the just-picked label). */
            const next = committed.trim();
            if (next && next !== row.vendor_name) {
              onPatch(row.id, { vendor_name: next });
            } else if (!next) {
              setVendor(row.vendor_name);
            }
          }}
        />

        {/* §B1.4 — currency-symbol prefix. Inlined here
            (instead of the CurrencyNumericInput wrapper) so
            the local string-state typing flow stays
            unchanged — the wrapper coerces onChange to a
            number, which breaks typing intermediate values
            like "0.5". */}
        <span className="relative inline-flex w-full items-center">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 text-lp-text-tertiary"
            style={{ fontSize: '11px' }}
          >
            {budgetCurrencySymbol(displayCurrency)}
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => {
              const v = Number(amount);
              if (!Number.isFinite(v) || v < 0) {
                setAmount(String(row.amount ?? ''));
                return;
              }
              if (v !== Number(row.amount)) onPatch(row.id, { amount: v });
            }}
            placeholder="0.00"
            className="min-w-0 w-full rounded border border-transparent bg-transparent pl-5 pr-1.5 py-1 text-right font-mono text-sm tabular-nums text-lp-text outline-none hover:border-lp-border focus:border-lp-orange/40 focus:bg-lp-surface"
            aria-label={`Amount in ${displayCurrency}`}
          />
        </span>

        <input
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          onBlur={() => {
            const next = paidAt || null;
            if (next !== row.paid_at) onPatch(row.id, { paid_at: next });
          }}
          className="min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-lp-text outline-none hover:border-lp-border focus:border-lp-orange/40 focus:bg-lp-surface"
        />

        {row.receipt_id ? (
          <span
            aria-label="Receipt attached"
            title="Receipt attached"
            className="inline-flex items-center justify-center text-lp-text-tertiary"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span aria-hidden />
        )}

        <button
          type="button"
          onClick={() => onDelete(row.id)}
          aria-label="Delete transaction"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-lp-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-lp-surface-hover hover:text-lp-error"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Notes line — full-width below the grid row when set
          or focused. Keeps the dense layout but allows free
          text without a separate panel. */}
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          const next = notes.trim() ? notes : null;
          if (next !== row.notes) onPatch(row.id, { notes: next });
        }}
        placeholder="Notes (optional)"
        className="ml-6 min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-lp-text-secondary outline-none hover:border-lp-border focus:border-lp-orange/40 focus:bg-lp-surface"
      />
    </div>
  );
}

const sumOf = (rs: BudgetLineItemTransaction[]): number =>
  rs.reduce((s, r) => s + Number(r.amount || 0), 0);

function formatCurrency(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
