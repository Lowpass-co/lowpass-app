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
import { CurrencyNumericInput } from '@/components/budget/cells/CurrencyNumericInput';
import { CategoryChipDropdown } from '@/components/budget/cells/CategoryChip';
import { getActualState } from '@/lib/budget/transactions';
import { isIncomeRow, varianceColor } from '@/lib/budget/income-rows';
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
/* §B3.1 — CATEGORY_OPTIONS list retired here; canonical
   source is now lib/budget/category-colors.ts (used by
   <CategoryChipDropdown>). */

type DraftFields = {
  label: string;
  category: string;
  /** Phase 3 §D — pre_prod / rehearsals / show_days / wrap, or '' (unscoped). */
  phase_tag: string;
  vendor: string;
  quantity: number;
  proposed_cost: number;
  actual_cost: number;
  /** Phase B §B0 — explicit override flag mirroring the row's
   *  actual_cost_override column (migration 105). Diff'd against
   *  the baseline so the PATCH only carries it when the user
   *  changed override state. */
  actual_cost_override: boolean;
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
    actual_cost_override: actualState.isOverride,
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
  /* §B0 — explicit override flag. Only ship when it changes
     so a quantity-only edit doesn't accidentally flip the
     server flag. Slide-over edit handler computes the desired
     flag from (txnCount, newValue, transactionSum) before
     calling setField — see actualEditHandlers below. */
  if (current.actual_cost_override !== initial.actual_cost_override) {
    out.actual_cost_override = current.actual_cost_override;
  }
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
  /** Drives the SlideOver enter/exit animation. Optional + defaults
   *  to `true` so older callers (BudgetMainTable, TourBudgetRebuild)
   *  that mount/unmount conditionally keep working unchanged. New
   *  callers thread a boolean and pair it with `onExitComplete` to
   *  let the panel slide out before unmounting. */
  open?: boolean;
  /** Forwarded to SlideOver — fires once the exit transform finishes
   *  so the parent can drop the cached line and unmount. */
  onExitComplete?: () => void;
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
  open = true,
  onExitComplete,
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
    // Re-seed ONLY when the row identity (id) or fallback currency
    // changes — NOT on every fresh `line` object. The parent hands us
    // a new `line` reference each render via its optimistic overlay;
    // including `line` here re-ran this effect mid-edit and clobbered
    // the value the user had just picked (the persist bug). Keying on
    // `line.id` keeps the snapshot stable across those identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id, fallbackCurrency]);

  const variancePct = useMemo(() => {
    if (fields.proposed_cost <= 0) return null;
    return (
      ((fields.actual_cost - fields.proposed_cost) / fields.proposed_cost) *
      100
    );
  }, [fields.actual_cost, fields.proposed_cost]);

  /* §B0 — actualState reads the LIVE override flag from the
     fields draft (which the actual-edit handler keeps in sync
     with the value-vs-sum rule). transaction_sum +
     transaction_count come from the line prop (server-attached
     at page-fetch time, refreshed via router.refresh() after
     any transaction CRUD below). */
  const actualState = useMemo(
    () =>
      getActualState({
        actual_cost: fields.actual_cost,
        actual_cost_override: fields.actual_cost_override,
        transaction_sum: line.transaction_sum,
        transaction_count: line.transaction_count,
      }),
    [
      fields.actual_cost,
      fields.actual_cost_override,
      line.transaction_sum,
      line.transaction_count,
    ],
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

  /* Flush-on-close. The debounced auto-save (600ms) means a fast
     change-then-close could unmount before the timer fires, dropping
     the edit. Intercept every close path (X, overlay, Escape, footer
     Close) here: cancel the pending debounce and await one final
     flush BEFORE asking the parent to dismiss, so the panel only
     starts sliding out once the PATCH has landed. Create mode has no
     debounced PATCH to flush, so it closes immediately. */
  const handleClose = useCallback(() => {
    if (isCreate) {
      onClose();
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    void (async () => {
      await flushExistingPatch(fields);
      onClose();
    })();
  }, [isCreate, fields, flushExistingPatch, onClose]);

  /* §B1.1 — debounced auto-save for CREATE mode. Same 600ms
     window as the edit effect above. Fires submitCreate as
     soon as the user types a label (the only required field
     at create time). Parent's onSaved swaps openLine to the
     real server row → isCreate flips to false → this effect
     deregisters and the existing-row debounce takes over.
     Slide-over stays open through the transition; the
     Transactions placeholder below becomes interactive once
     line.id is no longer pending-. */
  const createAttemptInFlightRef = useRef(false);
  useEffect(() => {
    if (!isCreate) return;
    if (!fields.label.trim()) return;
    if (createAttemptInFlightRef.current) return;
    const t = setTimeout(() => {
      createAttemptInFlightRef.current = true;
      void submitCreate().finally(() => {
        createAttemptInFlightRef.current = false;
      });
    }, 600);
    return () => clearTimeout(t);
    // submitCreate is intentionally NOT in deps — it changes
    // every render via useCallback's fields deps, which would
    // reset this timer on every keystroke and never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, fields.label]);

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
      /* §B1.1 — leave the slide-over open after create.
         Parent's onSaved swaps openLine to the real server
         row, isCreate flips to false, the Transactions
         section unlocks in place. */
      onSaved?.({ ...created, status: fields.status } as BudgetLineItem);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setSaveState('error');
      setErrorMessage(msg);
      showToast(msg, 'error');
    }
    /* §B1.1 — no onClose dep since submitCreate no longer
       dismisses the slide-over (transitions in place). */
  }, [fields, tourId, router, showToast, onSaved]);

  const setField = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) =>
    setFields((cur) => ({ ...cur, [key]: value }));

  /* §B0 — edit handler for the ACTUAL field. Computes the
     override flag per the spec rules in one atomic setFields
     so the diff sender ships actual_cost + actual_cost_override
     together (avoids a transient state where the value changed
     but the flag hasn't caught up — would cause a brief
     marker flicker).

     Rules:
       - 0 transactions: override concept doesn't apply; flag false.
       - N>0 transactions AND newValue === sum: clear override.
       - N>0 transactions AND newValue !== sum: set override. */
  const applyActualEdit = (rawValue: number): void => {
    setFields((cur) => {
      const next: DraftFields = { ...cur, actual_cost: rawValue };
      const sum = Number(line.transaction_sum ?? 0);
      const count = Number(line.transaction_count ?? 0);
      if (count === 0) {
        next.actual_cost_override = false;
      } else {
        /* fixed-2 compare to match numericEqual on the server. */
        next.actual_cost_override = rawValue.toFixed(2) !== sum.toFixed(2);
      }
      return next;
    });
  };

  /* §B0 — Sync button: set actual_cost = transaction_sum AND
     clear the override flag. Shipped as one PATCH via the
     debounced auto-save. */
  const applySyncToSum = (): void => {
    setFields((cur) => ({
      ...cur,
      actual_cost: Number(line.transaction_sum ?? 0),
      actual_cost_override: false,
    }));
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
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
    borderRadius: 'var(--lp-radius-md)',
    padding: 'var(--lp-space-2) var(--lp-space-3)',
    fontSize: 'var(--lp-text-base)',
    width: '100%',
    outline: 'none',
  };
  /* Selects keep their native dropdown arrow (no appearance reset) but
     inherit the tokenised border/background/padding so they line up
     with the text inputs. */
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };
  // Section heading — the spine of the new grouped layout.
  const sectionHeadingStyle: React.CSSProperties = {
    color: 'var(--lp-text-secondary)',
    fontSize: 'var(--lp-text-2xs)',
    fontWeight: 'var(--lp-weight-bold)',
    letterSpacing: 'var(--lp-tracking-caps)',
    textTransform: 'uppercase',
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

  /* §B3.1 — categoryOptions memo retired with the select.
     <CategoryChipDropdown> handles the (custom) legacy-value
     surfacing internally via lib/budget/category-colors. */

  /* Section divider — applied to every group below the first so the
     form reads as labelled bands rather than one undifferentiated
     stack of inputs. Token-only. */
  const sectionDivider: React.CSSProperties = {
    borderTop: '1px solid var(--lp-border)',
    paddingTop: 'var(--lp-space-5)',
  };

  const saveStatusNode = (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        fontSize: 'var(--lp-text-xs)',
        color:
          saveState === 'error'
            ? 'var(--color-lp-status-needs-review)'
            : saveState === 'saved'
              ? 'var(--color-lp-status-complete)'
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
  );

  const footerNode = (
    <div className="flex items-center justify-between gap-3">
      {saveStatusNode}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md"
          style={{
            color: 'var(--lp-text-secondary)',
            background: 'transparent',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
          }}
        >
          {isCreate ? 'Cancel' : 'Close'}
        </button>
        {isCreate ? (
          <button
            type="button"
            onClick={() => void submitCreate()}
            disabled={saveState === 'saving'}
            className="inline-flex items-center gap-1.5 rounded-md"
            style={{
              background: 'var(--color-lp-orange)',
              color: 'var(--lp-text-inverse)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              padding: 'var(--lp-space-2) var(--lp-space-4)',
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
  );

  return (
    <SlideOver
      open={open}
      backdrop
      onClose={handleClose}
      onExitComplete={onExitComplete}
      title=""
      width="wide"
      subtitle={subtitleSummary}
      footer={footerNode}
    >
      <div className="space-y-5">
        {derived ? (
          <section
            className="rounded-md border"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-bg-secondary)',
              padding: 'var(--lp-space-3)',
            }}
          >
            <h3 style={sectionHeadingStyle}>Source</h3>
            <p
              className="mt-2"
              style={{
                color: 'var(--lp-text-secondary)',
                fontSize: 'var(--lp-text-sm)',
              }}
            >
              {ux14BudgetLineDerivedHint(line)}
            </p>
            <p
              className="mt-2"
              style={{
                color: 'var(--lp-text-tertiary)',
                fontSize: 'var(--lp-text-xs)',
              }}
            >
              Canonical rows refresh from flights, hotels, rooming and hire — overwrite amounts via those entities whenever possible.
            </p>
          </section>
        ) : null}

        {/* The Item input IS the canonical title — large + prominent. */}
        <label className="block space-y-1.5">
          <span style={labelStyle}>Item</span>
          <input
            type="text"
            value={fields.label}
            onChange={(e) => setField('label', e.target.value)}
            placeholder="e.g. Hotel block — Manchester"
            style={{
              ...inputStyle,
              fontSize: 'var(--lp-text-xl)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          />
        </label>

        {/* Classification — what kind of line this is. */}
        <section className="space-y-3" style={sectionDivider}>
          <h3 style={sectionHeadingStyle}>Classification</h3>
          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1.5">
              <span style={labelStyle}>Category</span>
              {/* §B3.1 — chip + dropdown replaces the plain
                  select. Legacy / custom categories surface at
                  the top of the menu as "(custom)" options so
                  the row's stored value isn't clobbered. */}
              <CategoryChipDropdown
                value={fields.category || 'misc'}
                onChange={(v) => setField('category', v)}
                size="md"
              />
            </label>
            <label className="block space-y-1.5">
              {/* Phase 3 §D — phase tag dropdown. '' (Unscoped) maps
                  to NULL on the server; valid values mirror migration
                  064's CHECK constraint. */}
              <span style={labelStyle}>Phase</span>
              <select
                value={fields.phase_tag}
                onChange={(e) => setField('phase_tag', e.target.value)}
                style={selectStyle}
              >
                {PHASE_TAG_OPTIONS.map((opt) => (
                  <option key={opt.value || 'unscoped'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span style={labelStyle}>Vendor</span>
              <input
                type="text"
                value={fields.vendor}
                onChange={(e) => setField('vendor', e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
            </label>
          </div>
        </section>

        {/* Costs — quantities, money, and the live variance read-out. */}
        <section className="space-y-3" style={sectionDivider}>
          <h3 style={sectionHeadingStyle}>Costs</h3>
          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1.5">
              <span style={labelStyle}>Quantity</span>
              <input
                type="number"
                min={1}
                value={fields.quantity}
                onChange={(e) => setField('quantity', Number(e.target.value) || 1)}
                style={inputStyle}
              />
            </label>
            <label className="block space-y-1.5">
              <span style={labelStyle}>Estimated</span>
              {/* §B1.4 — currency-symbol prefix. Quantity above
                  stays a plain numeric (not a money field). */}
              <CurrencyNumericInput
                value={fields.proposed_cost}
                onChange={(v) => setField('proposed_cost', v)}
                currency={fields.currency}
                className="block"
                style={inputStyle}
                ariaLabel="Estimated cost"
              />
            </label>
            <label className="block space-y-1.5">
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
                    style={{ fontSize: 'var(--lp-text-2xs)' }}
                  >
                    <span
                      title={`Manual override — does not match transactions sum (${actualState.transactionSum.toFixed(2)})`}
                      aria-label="Manual override"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--color-lp-status-needs-review)',
                        fontWeight: 'var(--lp-weight-semibold)',
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Override
                    </span>
                    <button
                      type="button"
                      onClick={applySyncToSum}
                      className="underline"
                      style={{
                        color: 'var(--color-lp-orange)',
                        fontWeight: 'var(--lp-weight-medium)',
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      Sync to {actualState.transactionSum.toFixed(2)}
                    </button>
                  </span>
                ) : null}
              </span>
              {/* §B1.4 — currency-symbol prefix. Same override
                  border tint applied via inputStyle merge. */}
              <CurrencyNumericInput
                value={fields.actual_cost}
                onChange={(v) => applyActualEdit(v)}
                currency={fields.currency}
                className="block"
                style={{
                  ...inputStyle,
                  borderColor: actualState.isOverride
                    ? 'var(--color-lp-status-needs-review)'
                    : (inputStyle as { borderColor?: string }).borderColor,
                }}
                ariaLabel="Actual cost"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1.5">
              <span style={labelStyle}>Currency</span>
              <select
                value={fields.currency}
                onChange={(e) => setField('currency', e.target.value)}
                style={selectStyle}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span style={labelStyle}>Status</span>
              <select
                value={fields.status}
                onChange={(e) => setField('status', e.target.value)}
                style={selectStyle}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1.5">
              <span style={labelStyle}>Variance</span>
              <div
                className="inline-flex items-center rounded-md tabular-nums"
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-base)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  /* §B1.3 — colour via the shared income-aware
                     helper so the rule lives in one place. */
                  color: varianceColor(variancePct, isIncomeRow(line)),
                }}
              >
                {variancePct === null ? '—' : `${variancePct.toFixed(1)}%`}
              </div>
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-3" style={sectionDivider}>
          <label className="block space-y-1.5">
            <span style={labelStyle}>Notes</span>
            <textarea
              value={fields.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>
        </section>

        {/* Transactions. §A1 — vendor-breakdown rows. §A3 — onChange
            triggers router.refresh() so the slide-over's `line` prop
            refetches after every txn write; the new value carries the
            auto-synced actual_cost + updated transaction_sum, which
            re-derives the override marker. §B1.1 — in create mode
            (pending- id) we show a placeholder so the user sees the
            section is coming; the label field auto-saves and flips the
            slide-over to edit mode in place, unlocking it. */}
        <section className="space-y-3" style={sectionDivider}>
          <h3 style={sectionHeadingStyle}>Transactions</h3>
          {isCreate ? (
            <div
              className="rounded-lg border text-center"
              style={{
                borderStyle: 'dashed',
                borderColor: 'var(--lp-border)',
                background: 'var(--lp-bg-secondary)',
                color: 'var(--lp-text-secondary)',
                fontSize: 'var(--lp-text-xs)',
                padding: 'var(--lp-space-5) var(--lp-space-4)',
              }}
            >
              Save the line item to start adding vendor breakdowns. The label
              field auto-saves after a moment of inactivity.
            </div>
          ) : (
            <TransactionsSection
              lineItemId={line.id}
              currency={line.currency ?? null}
              onChange={() => router.refresh()}
              /* §B3.2 — parent line item's vendor (from notes
                 "Vendor: <name>" encoding) seeds new
                 transactions and surfaces at the top of each
                 row's autocomplete. */
              defaultVendor={fields.vendor}
            />
          )}
        </section>
      </div>
    </SlideOver>
  );
}
