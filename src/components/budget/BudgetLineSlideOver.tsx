/* ============================================
   LOWPASS — Budget line edit slide-over
   Rewritten in the budget redesign fix-up sprint (X1.1 + X1.2).

   Previously the slide-over was a "context panel only" view that
   rendered stub sections and a math scratchpad. The new
   BudgetMainTable opens the slide-over on row click expecting an
   actual edit form, which is what this rewrite provides.

   Two modes:
     - EXISTING row → fields render with the row's current values,
       edits debounce-PATCH against /api/budget/line-items
     - NEW row (Quick Add)  → mode="create"; fields seed from
       template defaults, save POSTs against /api/budget/line-items
       and the parent reloads via router.refresh()

   Auto-save runs 600ms after the last change so accidental tabs
   between fields don't fire a save per keystroke. Status indicator
   in the footer surfaces saving / saved / error states.
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useToast } from '@/components/ui/Toast';
import {
  isUx14DerivedBudgetLine,
  ux14BudgetLineDerivedHint,
} from '@/lib/budget/budgetUx14Derived';
import type { BudgetLineItem } from '@/types';

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];

const CURRENCY_OPTIONS = ['GBP', 'USD', 'EUR', 'CAD', 'AUD'] as const;

type DraftFields = {
  label: string;
  category: string;
  vendor: string;
  quantity: number;
  proposed_cost: number;
  actual_cost: number;
  currency: string;
  status: string;
  notes: string;
};

function fieldsFromLine(line: BudgetLineItem, fallbackCurrency: string): DraftFields {
  // Vendor isn't a first-class column on budget_line_items; we mirror
  // it through `notes` first line as a convention until the schema
  // catches up. Display layer normalises both ways: any line with a
  // single-line notes prefix that looks like a vendor name surfaces
  // there, else it stays in notes.
  const rawNotes = line.notes ?? '';
  const [maybeVendor, ...rest] = rawNotes.split('\n');
  const isVendorPrefix =
    maybeVendor.startsWith('Vendor: ') && maybeVendor.length < 80;
  return {
    label: line.label ?? '',
    category: (line.category ?? '').toString(),
    vendor: isVendorPrefix ? maybeVendor.slice('Vendor: '.length) : '',
    quantity: Number(line.quantity ?? 1),
    proposed_cost: Number(line.proposed_cost ?? 0),
    actual_cost: Number(line.actual_cost ?? 0),
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

type BudgetLineSlideOverProps = {
  line: BudgetLineItem;
  tourId: string;
  tourCurrency: string;
  onClose: () => void;
  /** kept for backwards-compat with older callers; no-ops on save now. */
  onApplyAmount?: (amount: number) => void;
};

export function BudgetLineSlideOver({
  line,
  tourId,
  tourCurrency,
  onClose,
}: BudgetLineSlideOverProps) {
  const router = useRouter();
  const { showToast } = useToast();

  // Quick Add seed lines use a `pending-…` id prefix; treat those as
  // create-mode. Real rows have a UUID.
  const isCreate = line.id.startsWith('pending-');
  const fallbackCurrency = (tourCurrency || 'GBP').toUpperCase();

  const [fields, setFields] = useState<DraftFields>(() =>
    fieldsFromLine(line, fallbackCurrency),
  );
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset draft when the parent swaps the line out without unmounting
  // the component (rare, but defensive).
  useEffect(() => {
    setFields(fieldsFromLine(line, fallbackCurrency));
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

  // Debounced auto-save (existing rows only — create requires explicit
  // submit because POST returns the new id we need to swap in.)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFieldsRef = useRef<DraftFields>(fields);
  useEffect(() => {
    initialFieldsRef.current = fieldsFromLine(line, fallbackCurrency);
  }, [line.id, fallbackCurrency, line]);

  const flushExistingPatch = useCallback(
    async (next: DraftFields) => {
      setSaveState('saving');
      setErrorMessage(null);
      try {
        const res = await fetch('/api/budget/line-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: line.id,
            label: next.label || line.label || '(untitled)',
            category: next.category || 'misc',
            quantity: next.quantity,
            proposed_cost: next.proposed_cost,
            actual_cost: next.actual_cost,
            currency: next.currency,
            status: next.status,
            notes: notesFromFields(next),
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Save failed (${res.status})`);
        }
        setSaveState('saved');
        // Settle the "saved" indicator after a short interval so it
        // doesn't linger forever between edits.
        setTimeout(() => setSaveState((cur) => (cur === 'saved' ? 'idle' : cur)), 1200);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed';
        setSaveState('error');
        setErrorMessage(msg);
        showToast(msg, 'error');
      }
    },
    [line.id, line.label, router, showToast],
  );

  // Schedule a debounced save when fields change (existing rows only).
  useEffect(() => {
    if (isCreate) return;
    // Skip the very first effect run after mount.
    if (
      JSON.stringify(fields) === JSON.stringify(initialFieldsRef.current)
    ) {
      return;
    }
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
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Create failed (${res.status})`);
      }
      // Status isn't part of the POST shape; PATCH it after create
      // so the new row picks up the user's chosen draft/pending.
      const created = (await res.json()) as { id?: string };
      if (created.id && fields.status && fields.status !== 'draft') {
        await fetch('/api/budget/line-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: created.id, status: fields.status }),
        }).catch(() => undefined);
      }
      setSaveState('saved');
      showToast(`Created ${fields.label}`);
      router.refresh();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setSaveState('error');
      setErrorMessage(msg);
      showToast(msg, 'error');
    }
  }, [fields, tourId, router, showToast, onClose]);

  const derived = !isCreate && isUx14DerivedBudgetLine(line);

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

  const subtitle = (
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

  return (
    <SlideOver
      open
      backdrop
      onClose={onClose}
      title={isCreate ? 'New budget line' : fields.label?.trim() || 'Budget line'}
      width="wide"
      subtitle={subtitle}
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
        <label className="block">
          <span style={labelStyle}>Item</span>
          <input
            type="text"
            value={fields.label}
            onChange={(e) => setField('label', e.target.value)}
            placeholder="e.g. Hotel block — Manchester"
            className="mt-1.5"
            style={inputStyle}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span style={labelStyle}>Category</span>
            <input
              type="text"
              value={fields.category}
              onChange={(e) => setField('category', e.target.value)}
              placeholder="e.g. accommodation"
              className="mt-1.5"
              style={inputStyle}
            />
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
            <span style={labelStyle}>Actual</span>
            <input
              type="number"
              step="0.01"
              value={fields.actual_cost}
              onChange={(e) =>
                setField('actual_cost', Number(e.target.value) || 0)
              }
              className="mt-1.5"
              style={inputStyle}
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

        {/* Footer — sticky-ish action area inside the slide-over body. */}
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
