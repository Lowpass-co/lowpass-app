'use client';

/* ============================================
   LOWPASS — EditTourSlideOver
   (Sprint 9 §13.C.1 baseline; Sprint 11 §4c hybrid auto-save)

   Canonical tour-settings editor (per Q7). Wraps name +
   start_date + end_date + currency + continent into one
   slide-over so the operator doesn't bounce between "Edit
   tour" and "Extend tour" surfaces.

   Sprint 11 §4c — HYBRID auto-save pattern. Two field groups:

     Safe fields (auto-saved, debounced 600ms):
       - name
       - currency
       - continent
     These all have one-shot effects. Auto-saving them matches
     the pattern from §4a/§4b.

     Destructive fields (explicit Save, gated by confirmation):
       - start_date
       - end_date
     Narrowing the window can ORPHAN routing rows (rows fall
     outside the new window and won't appear in default views).
     The Save flow surfaces a confirmation modal listing every
     out-of-window row before committing. Auto-save would
     bypass that gate — typing "06" while editing a date would
     fire a PATCH at the half-typed value.

   Footer in edit mode:
     [SaveStatus pill]  [Cancel]  [Save dates]
     - SaveStatus reflects only the auto-saved subset.
     - Cancel restores BOTH groups (snapshot for safe fields
       via the hook; explicit reset for date fields).
     - "Save dates" is enabled when start_date / end_date
       differs from the open-time snapshot. Triggers the
       existing out-of-window confirmation when needed.

   Hybrid pattern documented in CLAUDE.md so future slide-overs
   with destructive paths know how to opt out of full auto-save.

   Behaviour parity with the original ExtendTourSlideOver date
   path: validates end_date >= start_date and surfaces a
   warning + confirmation modal when routing rows fall outside
   the new window (rows aren't auto-deleted — operator decides).

   The legacy /tours/[id]/edit route is intentionally untouched
   (Phase 4 of Operations migration formally retires it).
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/ui/SlideOver';
import { useAutoSave } from '@/lib/forms/useAutoSave';
import { SaveStatus } from '@/components/forms/SaveStatus';

interface OutOfWindowRow {
  id: string;
  date: string;
  city: string | null;
  venue_name: string | null;
}

export interface EditTourInitial {
  name: string;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  continent: string | null;
}

interface EditTourSlideOverProps {
  open: boolean;
  tourId: string;
  initial: EditTourInitial;
  /** Routing rows for this tour — used to warn about
   *  out-of-window dates when the operator narrows the
   *  window. */
  routingDates: ReadonlyArray<OutOfWindowRow>;
  onClose: () => void;
  onSaved: () => void;
}

const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD'] as const;
const CONTINENTS = [
  { value: '', label: '—' },
  { value: 'Europe', label: 'Europe' },
  { value: 'North America', label: 'North America' },
  { value: 'South America', label: 'South America' },
  { value: 'Asia', label: 'Asia' },
  { value: 'Africa', label: 'Africa' },
  { value: 'Oceania', label: 'Oceania' },
] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Auto-saved subset. */
interface SafeFields {
  name: string;
  currency: string;
  continent: string;
}

function initialSafeFields(initial: EditTourInitial): SafeFields {
  return {
    name: initial.name ?? '',
    currency: initial.currency ?? 'GBP',
    continent: initial.continent ?? '',
  };
}

export function EditTourSlideOver({
  open,
  tourId,
  initial,
  routingDates,
  onClose,
  onSaved,
}: EditTourSlideOverProps) {
  /* The hook captures `initialState` once. Remount the editor
     via key= whenever the slide-over opens or the initial
     props change so the snapshot reflects the freshly-loaded
     server state. */
  return (
    <EditTourSlideOverInner
      key={`${tourId}:${open ? 'open' : 'closed'}:${initial.start_date ?? ''}:${initial.end_date ?? ''}`}
      open={open}
      tourId={tourId}
      initial={initial}
      routingDates={routingDates}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function EditTourSlideOverInner({
  open,
  tourId,
  initial,
  routingDates,
  onClose,
  onSaved,
}: EditTourSlideOverProps) {
  const { showToast } = useToast();
  const router = useRouter();

  /* Date fields stay in conventional state — destructive
     narrowing path uses an explicit Save with confirmation
     modal (see top-of-file comment). */
  const [startDate, setStartDate] = useState(initial.start_date ?? '');
  const [endDate, setEndDate] = useState(initial.end_date ?? '');
  const [datesSaving, setDatesSaving] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  /* Safe fields auto-save via the hook. onSave PATCHes only
     these three fields — the date fields go through the
     explicit save path so they're omitted here. */
  const {
    state: safe,
    set: setSafe,
    status,
    lastSavedAt,
    errorMessage,
    cancel: cancelSafe,
    flushSave: flushSafe,
  } = useAutoSave<SafeFields>({
    initialState: initialSafeFields(initial),
    onSave: async (s) => {
      const trimmedName = s.name.trim();
      if (!trimmedName) {
        setValidationError('Tour name is required.');
        // Don't throw — soft validation while user keeps typing.
        return;
      }
      setValidationError(null);
      const res = await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          currency: s.currency || null,
          continent: s.continent || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      router.refresh();
      onSaved();
    },
  });

  const validRange =
    !!startDate && !!endDate && new Date(endDate) >= new Date(startDate);
  const datesChanged =
    startDate !== (initial.start_date ?? '') ||
    endDate !== (initial.end_date ?? '');

  // Routing rows that would fall outside the proposed new
  // window (only relevant when the dates changed).
  const outOfWindow: OutOfWindowRow[] = (() => {
    if (!datesChanged || !validRange) return [];
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return routingDates.filter((r) => {
      const t = new Date(r.date).getTime();
      return t < start || t > end;
    });
  })();

  async function commitDates() {
    setDatesSaving(true);
    setDatesError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setDatesError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      showToast('Tour dates updated.');
      // Sprint 9 §13.A.9 — invalidate the route's server
      // components so TourHeader re-renders with the new
      // dates immediately.
      router.refresh();
      onSaved();
      onClose();
    } catch (err) {
      setDatesError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setDatesSaving(false);
      setConfirmOpen(false);
    }
  }

  function handleSaveDatesClick() {
    setDatesError(null);
    if (startDate || endDate) {
      if (!validRange) {
        setDatesError('End date must be on or after start date.');
        return;
      }
    }
    if (outOfWindow.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void commitDates();
  }

  /* Close path: flush any pending safe-fields save so the
     last keystroke isn't lost. Date changes that haven't been
     explicitly saved are abandoned (the explicit-Save flow
     gates them by design). */
  const handleClose = async () => {
    await flushSafe();
    onClose();
  };

  const handleCancel = async () => {
    // Restore safe fields via hook snapshot.
    await cancelSafe();
    // Reset dates locally — no PATCH needed because the user
    // never explicitly saved them.
    setStartDate(initial.start_date ?? '');
    setEndDate(initial.end_date ?? '');
    showToast('Changes reverted.');
    onClose();
  };

  // Shared input style.
  const inputStyle: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
    padding: 'var(--lp-space-2) var(--lp-space-3)',
    fontSize: 'var(--lp-text-sm)',
    color: 'var(--lp-text)',
    background: 'var(--lp-bg)',
    border: '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 'var(--lp-space-1)',
    fontSize: 'var(--lp-text-xs)',
    fontWeight: 'var(--lp-weight-semibold)',
    color: 'var(--lp-text)',
  };

  return (
    <>
      <SlideOver open={open} onClose={() => void handleClose()} title="Edit tour" width="default">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--lp-space-4)',
            padding: 'var(--lp-space-4)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            Update the tour&apos;s name, window, and base settings.
            Routing rows outside a narrowed window stay in the
            database but won&apos;t appear in default views.
          </p>

          {/* Auto-saved field: name */}
          <div>
            <label htmlFor="lp-edit-tour-name" className="lp-label-caps" style={labelStyle}>
              Name
            </label>
            <input
              id="lp-edit-tour-name"
              type="text"
              value={safe.name}
              onChange={(e) => setSafe((p) => ({ ...p, name: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Explicit-save fields: dates. The "Save dates"
              button at the bottom of the date block is enabled
              when the dates differ from the open-time snapshot;
              clicking commits via the same out-of-window
              confirmation flow as the original Save button. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--lp-space-3)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lp-edit-tour-start" className="lp-label-caps" style={labelStyle}>
                Start date
              </label>
              <input
                id="lp-edit-tour-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lp-edit-tour-end" className="lp-label-caps" style={labelStyle}>
                End date
              </label>
              <input
                id="lp-edit-tour-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {!validRange && (startDate || endDate) ? (
            <div
              role="alert"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--color-lp-error)',
                background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              End date must be on or after start date.
            </div>
          ) : null}

          {/* Save-dates button — only appears when dates have
              been edited. Auto-saved fields don't need a
              button. */}
          {datesChanged ? (
            <div
              className="flex items-center justify-between"
              style={{
                gap: 'var(--lp-space-2)',
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                background: 'color-mix(in srgb, var(--color-lp-warning, #c97a1d) 6%, transparent)',
                border:
                  '1px solid color-mix(in srgb, var(--color-lp-warning, #c97a1d) 25%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                Date changes need explicit Save — the orphan-row
                check runs first.
              </p>
              <button
                type="button"
                onClick={handleSaveDatesClick}
                disabled={datesSaving || (!validRange && (!!startDate || !!endDate))}
                className="btn-transition btn-primary-press inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text-inverse)',
                  background: 'var(--color-lp-orange)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: datesSaving ? 'not-allowed' : 'pointer',
                  opacity: datesSaving ? 0.7 : 1,
                }}
              >
                {datesSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save dates
              </button>
            </div>
          ) : null}

          {/* Auto-saved fields: currency + continent */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--lp-space-3)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lp-edit-tour-currency" className="lp-label-caps" style={labelStyle}>
                Currency
              </label>
              <select
                id="lp-edit-tour-currency"
                value={safe.currency}
                onChange={(e) => setSafe((p) => ({ ...p, currency: e.target.value }))}
                style={inputStyle}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lp-edit-tour-continent" className="lp-label-caps" style={labelStyle}>
                Continent
              </label>
              <select
                id="lp-edit-tour-continent"
                value={safe.continent}
                onChange={(e) => setSafe((p) => ({ ...p, continent: e.target.value }))}
                style={inputStyle}
              >
                {CONTINENTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {validationError ? (
            <div
              role="alert"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--color-lp-error)',
                background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              {validationError}
            </div>
          ) : null}

          {datesError ? (
            <div
              role="alert"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--color-lp-error)',
                background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              {datesError}
            </div>
          ) : null}

          {/* Footer: SaveStatus pill (auto-saved fields) +
              Cancel + Done. The "Save dates" button lives
              inline next to the date inputs since it's a
              field-group-specific action. */}
          <div className="flex items-center justify-end" style={{ gap: 'var(--lp-space-2)' }}>
            <SaveStatus
              status={status}
              lastSavedAt={lastSavedAt}
              errorMessage={errorMessage}
              onRetry={() => void flushSafe()}
            />
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={datesSaving}
              className="btn-transition"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-4)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
                background: 'transparent',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                cursor: 'pointer',
              }}
              title="Discard auto-saved changes (and abandon any unsaved date edits)."
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleClose()}
              disabled={datesSaving}
              className="btn-transition btn-primary-press inline-flex items-center"
              style={{
                gap: 6,
                padding: 'var(--lp-space-2) var(--lp-space-4)',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text-inverse)',
                background: 'var(--color-lp-orange)',
                border: '1px solid transparent',
                borderRadius: 'var(--lp-radius-md)',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </SlideOver>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--lp-z-modal)',
            display: 'grid',
            placeItems: 'center',
            background: 'color-mix(in srgb, black 40%, transparent)',
          }}
        >
          <div
            style={{
              maxWidth: '32rem',
              width: '90vw',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 'var(--lp-space-4)',
              background: 'var(--lp-surface)',
              borderRadius: 'var(--lp-radius-lg)',
              border: '1px solid var(--lp-border-strong)',
              boxShadow: 'var(--lp-shadow-lg)',
            }}
          >
            <h2
              style={{
                margin: 0,
                marginBottom: 'var(--lp-space-2)',
                fontSize: 'var(--lp-text-lg)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text)',
              }}
            >
              {outOfWindow.length} routing {outOfWindow.length === 1 ? 'row falls' : 'rows fall'} outside the new window
            </h2>
            <p
              style={{
                margin: 0,
                marginBottom: 'var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              These rows stay in the database but won&apos;t appear in default
              tour views. You can still find them via /operations/{tourId}/routing
              with date filters off.
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                marginBottom: 'var(--lp-space-3)',
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid var(--lp-border)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              {outOfWindow.slice(0, 25).map((r) => (
                <li
                  key={r.id}
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    borderBottom: '1px solid var(--lp-border-subtle)',
                  }}
                >
                  <strong>{formatDate(r.date)}</strong> — {r.city ?? '—'}
                  {r.venue_name ? ` · ${r.venue_name}` : ''}
                </li>
              ))}
              {outOfWindow.length > 25 ? (
                <li
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    fontSize: 'var(--lp-text-xs)',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  …and {outOfWindow.length - 25} more.
                </li>
              ) : null}
            </ul>
            <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={datesSaving}
                className="btn-transition"
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void commitDates()}
                disabled={datesSaving}
                className="btn-transition btn-primary-press inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text-inverse)',
                  background: 'var(--color-lp-orange)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: datesSaving ? 'not-allowed' : 'pointer',
                  opacity: datesSaving ? 0.7 : 1,
                }}
              >
                {datesSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
