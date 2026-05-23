/* ============================================
   LOWPASS — Budget line edit slide-over
   Round 2 fix-up (F1.1 + F2.3 + F2.4): status enum aligned with API,
   only-changed-fields PATCH, category dropdown, single canonical
   title (the prominent Item input) instead of duplicating it in the
   SlideOver header + a redundant ITEM input.

   Two modes:
     - EXISTING row → debounced auto-save (600ms); diff-only PATCH
       so a single bad field never blocks others
     - NEW row (Quick Add) → POST on explicit submit, then onSaved
       fires so BudgetMainTable can prepend it without waiting for
       router.refresh()
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useToast } from '@/components/ui/Toast';
import {
  isUx14DerivedBudgetLine,
  ux14BudgetLineDerivedHint,
} from '@/lib/budget/budgetUx14Derived';
import { TransactionsSection } from '@/components/budget/TransactionsSection';
import { getActualState } from '@/lib/budget/transactions';
import type { BudgetLineItem } from '@/types';

// Status enum MUST match /api/budget/line-items PATCH validation.
// Mismatches cause a 400 response that fails the entire batched
// auto-save, blocking all other field updates in the same request.
// Spec round 2 F1.1 surfaced this exact bug.
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

const CURRENCY_OPTIONS = ['GBP', 'USD', 'EUR', 'CAD', 'AUD'] as const;

// Curated category list. Free-text inputs are still allowed for
// existing rows whose category isn't in the list — those render as
// a one-off option at the top of the dropdown so the row's current
// value isn't silently overwritten on save.
const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'production', label: 'Production' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'travel', label: 'Travel' },
  { value: 'crew', label: 'Crew' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'catering', label: 'Catering' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'misc', label: 'Misc' },
];

type DraftFields = {
  label: string;
  category: string;
  /** Phase 3 §D — pre_prod / rehearsals / show_days / wrap, or '' (unscoped). */
  phase_tag: string;
  vendor: string;
  quantity: number;
  proposed_cost: number;
  actual_cost: number;
  currency: string;
  status: string;
  notes: string;
};

/** Phase 3 §D — phase-tag dropdown options, mirrors migration 064 enum. */
const PHASE_TAG_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Unscoped' },
  { value: 'pre_prod', label: 'Pre-prod' },
  { value: 'rehearsals', label: 'Rehearsals' },
  { value: 'show_days', label: 'Show days' },
  { value: 'wrap', label: 'Wrap' },
];

function fieldsFromLine(line: BudgetLineItem, fallbackCurrency: string): DraftFields {
  // Vendor is mirrored through `notes` first line as "Vendor: <name>"
  // until the schema gets a real vendor column.
  const rawNotes = line.notes ?? '';
  const [maybeVendor, ...rest] = rawNotes.split('\n');
  const isVendorPrefix =
    maybeVendor.startsWith('Vendor: ') && maybeVendor.length < 80;
  /* §A3 — pull the displayed actual from getActualState so the
     field reflects the effective value (sum when no override,
     override when set). value === actual_cost after the
     server-side auto-sync; the helper just keeps the rule in
     one place. */
  const actualState = getActualState(line);
  return {
    label: line.label ?? '',
    category: (line.category ?? '').toString(),
    phase_tag: (line.phase_tag ?? '').toString(),
    vendor: isVendorPrefix ? maybeVendor.slice('Vendor: '.length) : '',
    quantity: Number(line.quantity ?? 1),
    proposed_cost: Number(line.proposed_cost ?? 0),
    actual_cost: actualState.value,
    currency: (line.currency || fallbackCurrency).toUpperCase(),
    status: (line.status ?? 'draft').toString(),
    notes: isVendorPrefix ? rest.join('\n') : rawNotes,
  };
}

function notesFromFields(fields: DraftFields): string {
  const trimmedVendor = fields.vendor.trim();
  const baseNotes = fields.notes.trim();
  if (!trimmedVendor) return baseNotes;
  return baseNotes ? `Vendor: ${trimmedVendor}\n${baseNotes}` : `Vendor: ${trimmedVendor}`;
}

/** Compute the diff between current and initial; returns just the
 *  PATCH-shape keys that actually changed. Defensive against future
 *  API constraints that might reject one field's value while accepting
 *  others — sending only the changed fields lets unrelated saves
 *  succeed independently. */
function diffPatchPayload(
  current: DraftFields,
  initial: DraftFields,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (current.label !== initial.label) out.label = current.label;
  if (current.category !== initial.category) out.category = current.category || 'misc';
  // Phase 3 §D — '' (empty string in the dropdown) maps to NULL on the
  // server (= unscoped). Matches migration 064's CHECK constraint.
  if (current.phase_tag !== initial.phase_tag) {
    out.phase_tag = current.phase_tag || null;
  }
  if (current.quantity !== initial.quantity) out.quantity = current.quantity;
  if (current.proposed_cost !== initial.proposed_cost) out.proposed_cost = current.proposed_cost;
  if (current.actual_cost !== initial.actual_cost) out.actual_cost = current.actual_cost;
  if (current.currency !== initial.currency) out.currency = current.currency;
  if (current.status !== initial.status) out.status = current.status;
  // Notes ↔ vendor: surface as `notes` because that's the underlying
  // column. Ship a notes-only PATCH whenever vendor or notes changed.
  if (current.notes !== initial.notes || current.vendor !== initial.vendor) {
    out.notes = notesFromFields(current);
  }
  return out;
}

type BudgetLineSlideOverProps = {
  line: BudgetLineItem;
  tourId: string;
  tourCurrency: string;
  onClose: () => void;
  /** F1.2 round 2: emitted after a successful create or save so the
   *  parent (BudgetMainTable) can prepend the new row optimistically.
   *  router.refresh() still fires for canonical sync. */
  onSaved?: (line: BudgetLineItem) => void;
  /** kept for backwards-compat with older callers; no-ops on save now. */
  onApplyAmount?: (amount: number) => void;
};

export function BudgetLineSlideOver({
  line,
  tourId,
  tourCurrency,
  onClose,
  onSaved,
}: BudgetLineSlideOverProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const isCreate = line.id.startsWith('pending-');
  const fallbackCurrency = (tourCurrency || 'GBP').toUpperCase();

  const [fields, setFields] = useState<DraftFields>(() =>
    fieldsFromLine(line, fallbackCurrency),
  );
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track the snapshot we last saved (for new rows the initial state
  // is the seed values; for existing rows it's the row as fetched).
  // diffPatchPayload(current, baseline) returns just the changed keys.
  const baselineRef = useRef<DraftFields>(fieldsFromLine(line, fallbackCurrency));

  useEffect(() => {
    const next = fieldsFromLine(line, fallbackCurrency);
    setFields(next);
    baselineRef.current = next;
    setSaveState('idle');
    setErrorMessage(null);
  }, [line.id, fallbackCurrency, line]);

  const variancePct = useMemo(() => {
    if (fields.proposed_cost <= 0) return null;
    return (
      ((fields.actual_cost - fields.proposed_cost) / fields.proposed_cost) *
      100
    );
  }, [fields.actual_cost, fields.proposed_cost]);

  /* §A3 — derive the actual state from the LIVE fields draft so
     the marker reacts to the user typing (live override
     detection) without waiting for the next line prop refresh.
     transaction_sum + transaction_count come from the line prop
     (server-attached at page-fetch time, refreshed via
     router.refresh() after any transaction CRUD below). */
  const actualState = useMemo(
    () =>
      getActualState({
        actual_cost: fields.actual_cost,
        transaction_sum: line.transaction_sum,
        transaction_count: line.transaction_count,
      }),
    [fields.actual_cost, line.transaction_sum, line.transaction_count],
  );

  // Derived rows reject edits to label/cost/currency at the API level
  // — surface that hint inline rather than letting the auto-save fail
  // 409 every keystroke.
  const derived = !isCreate && isUx14DerivedBudgetLine(line);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushExistingPatch = useCallback(
    async (next: DraftFields) => {
      const diff = diffPatchPayload(next, baselineRef.current);
      if (Object.keys(diff).length === 0) {
        // Nothing to send.
        return;
      }
      setSaveState('saving');
      setErrorMessage(null);
      try {
        const res = await fetch('/api/budget/line-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: line.id, ...diff }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Save failed (${res.status})`);
        }
        const updatedRow = (await res.json()) as BudgetLineItem;
        // Move the baseline forward — the next diff measures against
        // what the server now has.
        baselineRef.current = next;
        setSaveState('saved');
        setTimeout(
          () => setSaveState((cur) => (cur === 'saved' ? 'idle' : cur)),
          1200,
        );
        onSaved?.(updatedRow);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed';
        setSaveState('error');
        setErrorMessage(msg);
        showToast(msg, 'error');
      }
    },
    [line.id, router, showToast, onSaved],
  );

  // Schedule a debounced save when fields change (existing rows only).
  useEffect(() => {
    if (isCreate) return;
    // Skip the very first effect run after mount.
    const diff = diffPatchPayload(fields, baselineRef.current);
    if (Object.keys(diff).length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushExistingPatch(fields);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [fields, isCreate, flushExistingPatch]);

  const submitCreate = useCallback(async () => {
    setSaveState('saving');
    setErrorMessage(null);
    if (!fields.label.trim()) {
      setSaveState('error');
      setErrorMessage('Item name is required');
      return;
    }
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          label: fields.label.trim(),
          category: fields.category || 'misc',
          quantity: fields.quantity,
          proposed_cost: fields.proposed_cost,
          actual_cost: fields.actual_cost,
          currency: fields.currency,
          notes: notesFromFields(fields),
          // Phase 3 §D — '' (Unscoped) maps to NULL on the server.
          phase_tag: fields.phase_tag || null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Create failed (${res.status})`);
      }
      const created = (await res.json()) as BudgetLineItem & { id?: string };
      // Status isn't part of POST shape; PATCH it after create when the
      // user picked something other than the default.
      if (created.id && fields.status && fields.status !== 'draft') {
        await fetch('/api/budget/line-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: created.id, status: fields.status }),
        }).catch(() => undefined);
      }
      setSaveState('saved');
      showToast(`Created ${fields.label}`);
      onSaved?.({ ...created, status: fields.status } as BudgetLineItem);
      router.refresh();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setSaveState('error');
      setErrorMessage(msg);
      showToast(msg, 'error');
    }
  }, [fields, tourId, router, showToast, onClose, onSaved]);

  const setField = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) =>
    setFields((cur) => ({ ...cur, [key]: value }));

  const labelStyle: React.CSSProperties = {
    color: 'var(--lp-text-tertiary)',
    fontSize: 'var(--lp-text-2xs)',
    fontWeight: 'var(--lp-weight-semibold)',
    letterSpacing: 'var(--lp-tracking-caps)',
    textTransform: 'uppercase',
  };
  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--lp-border)',
    background: 'var(--lp-surface)',
    color: 'var(--lp-text)',
    borderRadius: 'var(--lp-radius-md, 6px)',
    padding: 'var(--lp-space-2) var(--lp-space-3)',
    fontSize: 'var(--lp-text-base)',
    width: '100%',
    outline: 'none',
  };

  // F2.3: drop the redundant header title. The big label input below
  // IS the canonical title — passing an empty string + the live
  // category/cost as the only header line keeps context without
  // showing the same name twice.
  const subtitleSummary = (
    <>
      {isCreate ? 'New line item' : (fields.category || '—').replace(/_/g, ' ')}
      {' · '}
      {Number(fields.proposed_cost ?? 0).toLocaleString('en-GB', {
        style: 'currency',
        currency: fields.currency,
        maximumFractionDigits: 0,
      })}
    </>
  );

  // If the row's current category isn't in the curated list (legacy
  // values like prod_audio, transport_taxis), include it as a one-off
  // option so saving doesn't silently change it to a curated value.
  const categoryOptions = useMemo(() => {
    const cur = (fields.category || '').trim();
    if (!cur || CATEGORY_OPTIONS.some((o) => o.value === cur)) return CATEGORY_OPTIONS;
    return [
      { value: cur, label: `${cur} (custom)` },
      ...CATEGORY_OPTIONS,
    ];
  }, [fields.category]);

  return (
    <SlideOver
      open
      backdrop
      onClose={onClose}
      title=""
      width="wide"
      subtitle={subtitleSummary}
    >
      {derived ? (
        <section
          className="rounded-md border p-3"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg-secondary)',
          }}
        >
          <h3 style={labelStyle}>Source</h3>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            {ux14BudgetLineDerivedHint(line)}
          </p>
          <p
            className="mt-2 text-xs"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            Canonical rows refresh from flights, hotels, rooming and hire — overwrite amounts via those entities whenever possible.
          </p>
        </section>
      ) : null}

      <div className="space-y-4">
        {/* The Item input IS the canonical title — large + prominent. */}
        <label className="block">
          <span style={labelStyle}>Item</span>
          <input
            type="text"
            value={fields.label}
            onChange={(e) => setField('label', e.target.value)}
            placeholder="e.g. Hotel block — Manchester"
            className="mt-1.5"
            style={{
              ...inputStyle,
              fontSize: 'var(--lp-text-xl)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span style={labelStyle}>Category</span>
            <select
              value={fields.category || 'misc'}
              onChange={(e) => setField('category', e.target.value)}
              className="mt-1.5"
              style={inputStyle}
            >
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {/* Phase 3 §D — phase tag dropdown. '' (Unscoped) maps
                to NULL on the server; valid values mirror migration
                064's CHECK constraint. */}
            <span style={labelStyle}>Phase</span>
            <select
              value={fields.phase_tag}
              onChange={(e) => setField('phase_tag', e.target.value)}
              className="mt-1.5"
              style={inputStyle}
            >
              {PHASE_TAG_OPTIONS.map((opt) => (
                <option key={opt.value || 'unscoped'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span style={labelStyle}>Vendor</span>
            <input
              type="text"
              value={fields.vendor}
              onChange={(e) => setField('vendor', e.target.value)}
              placeholder="Optional"
              className="mt-1.5"
              style={inputStyle}
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span style={labelStyle}>Quantity</span>
            <input
              type="number"
              min={1}
              value={fields.quantity}
              onChange={(e) => setField('quantity', Number(e.target.value) || 1)}
              className="mt-1.5"
              style={inputStyle}
            />
          </label>
          <label className="block">
            <span style={labelStyle}>Estimated</span>
            <input
              type="number"
              step="0.01"
              value={fields.proposed_cost}
              onChange={(e) =>
                setField('proposed_cost', Number(e.target.value) || 0)
              }
              className="mt-1.5"
              style={inputStyle}
            />
          </label>
          <label className="block">
            <span
              style={labelStyle}
              className="flex items-center justify-between gap-2"
            >
              <span>Actual</span>
              {/* §A3 — override marker + one-click Sync. Shown
                  only when transactions exist AND the displayed
                  value diverges from their sum. Clicking Sync
                  pushes the txn sum into the field, which the
                  debounced auto-save sends as actual_cost
                  PATCH — clearing the override. */}
              {actualState.isOverride ? (
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ fontSize: '10px' }}
                >
                  <span
                    title={`Manual override — does not match transactions sum (${actualState.transactionSum.toFixed(2)})`}
                    aria-label="Manual override"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: 'var(--color-lp-status-needs-review)',
                      fontWeight: 600,
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Override
                  </span>
                  <button
                    type="button"
                    onClick={() => setField('actual_cost', actualState.transactionSum)}
                    className="underline"
                    style={{
                      color: 'var(--color-lp-orange)',
                      fontWeight: 500,
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    Sync to {actualState.transactionSum.toFixed(2)}
                  </button>
                </span>
              ) : null}
            </span>
            <input
              type="number"
              step="0.01"
              value={fields.actual_cost}
              onChange={(e) =>
                setField('actual_cost', Number(e.target.value) || 0)
              }
              className="mt-1.5"
              style={{
                ...inputStyle,
                /* Slight orange-tinted border when override is
                   active so the field reads as "modified" even
                   without scrolling to the marker. */
                borderColor: actualState.isOverride
                  ? 'var(--color-lp-status-needs-review)'
                  : (inputStyle as { borderColor?: string }).borderColor,
              }}
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span style={labelStyle}>Currency</span>
            <select
              value={fields.currency}
              onChange={(e) => setField('currency', e.target.value)}
              className="mt-1.5"
              style={inputStyle}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span style={labelStyle}>Status</span>
            <select
              value={fields.status}
              onChange={(e) => setField('status', e.target.value)}
              className="mt-1.5"
              style={inputStyle}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span style={labelStyle}>Variance</span>
            <div
              className="mt-1.5 inline-flex items-center rounded-md px-3 py-2 text-base tabular-nums"
              style={{
                color:
                  variancePct === null
                    ? 'var(--lp-text-tertiary)'
                    : variancePct > 10
                      ? 'var(--color-lp-error, #EF4444)'
                      : variancePct > 5
                        ? 'var(--color-lp-status-needs-review)'
                        : variancePct < -5
                          ? 'var(--color-lp-status-complete)'
                          : 'var(--lp-text-secondary)',
              }}
            >
              {variancePct === null ? '—' : `${variancePct.toFixed(1)}%`}
            </div>
          </div>
        </div>

        <label className="block">
          <span style={labelStyle}>Notes</span>
          <textarea
            value={fields.notes}
            onChange={(e) => setField('notes', e.target.value)}
            rows={4}
            className="mt-1.5"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        {/* Budget Phase A §A1 — vendor-breakdown transactions.
            Only mount once the row exists server-side; create
            mode has a pending- prefixed id with no transactions
            to load.
            §A3 — onChange triggers router.refresh() so the
            slide-over's `line` prop refetches after every txn
            write. The new prop value carries the
            auto-synced actual_cost + updated transaction_sum,
            which re-derives the override marker. */}
        {!isCreate && (
          <TransactionsSection
            lineItemId={line.id}
            currency={line.currency ?? null}
            onChange={() => router.refresh()}
          />
        )}

        <div
          className="flex items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <span
            className="inline-flex items-center gap-1.5 text-xs"
            style={{
              color:
                saveState === 'error'
                  ? 'var(--color-lp-status-needs-review)'
                  : 'var(--lp-text-tertiary)',
            }}
          >
            {saveState === 'saving' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Saving…
              </>
            ) : saveState === 'saved' ? (
              <>✓ Saved</>
            ) : saveState === 'error' ? (
              <>{errorMessage ?? 'Save failed'}</>
            ) : isCreate ? (
              <>Will create on save</>
            ) : (
              <>Auto-saves on change</>
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm"
              style={{
                color: 'var(--lp-text-secondary)',
                background: 'transparent',
              }}
            >
              {isCreate ? 'Cancel' : 'Close'}
            </button>
            {isCreate ? (
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={saveState === 'saving'}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium"
                style={{
                  background: 'var(--color-lp-orange)',
                  color: 'var(--lp-text-inverse, #FFFFFF)',
                  opacity: saveState === 'saving' ? 0.7 : 1,
                }}
              >
                {saveState === 'saving' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                Create line
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </SlideOver>
  );
}
