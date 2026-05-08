'use client';

/* ============================================
   LOWPASS — ExtendTourSlideOver (Sprint 9 §8)

   Adjusts tours.start_date / tours.end_date via PATCH /api/tours/[id].
   Validation: end_date >= start_date. Doesn't auto-delete routing
   rows that fall outside the new window — instead, surfaces a
   warning + confirmation modal listing the affected rows so the
   user makes the call.

   Used from the Operations summary page's Quick actions row.
   ============================================ */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';

interface OutOfWindowRow {
  id: string;
  date: string;
  city: string | null;
  venue_name: string | null;
}

interface ExtendTourSlideOverProps {
  open: boolean;
  tourId: string;
  /** Existing tour window. */
  initialStartDate: string | null;
  initialEndDate: string | null;
  /** Routing rows for this tour — used to warn about out-of-window dates. */
  routingDates: ReadonlyArray<OutOfWindowRow>;
  onClose: () => void;
  onSaved: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ExtendTourSlideOver({
  open,
  tourId,
  initialStartDate,
  initialEndDate,
  routingDates,
  onClose,
  onSaved,
}: ExtendTourSlideOverProps) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(initialStartDate ?? '');
  const [endDate, setEndDate] = useState(initialEndDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStartDate(initialStartDate ?? '');
    setEndDate(initialEndDate ?? '');
    setError(null);
    setConfirmOpen(false);
  }, [open, initialStartDate, initialEndDate]);

  const validRange = startDate && endDate && new Date(endDate) >= new Date(startDate);

  // Routing rows that would fall outside the proposed new window.
  const outOfWindow = (() => {
    if (!validRange) return [] as OutOfWindowRow[];
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return routingDates.filter((r) => {
      const t = new Date(r.date).getTime();
      return t < start || t > end;
    });
  })();

  async function commit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      showToast('Tour window updated.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function handleSaveClick() {
    if (!validRange) {
      setError('End date must be on or after start date.');
      return;
    }
    if (outOfWindow.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void commit();
  }

  return (
    <>
      <SlideOver open={open} onClose={onClose} title="Extend tour" width="default">
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
            Adjust the tour&apos;s start and end dates. Routing rows
            outside the new window stay in the database but won&apos;t
            appear in default views.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--lp-space-3)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="lp-extend-start"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                Start date
              </label>
              <input
                id="lp-extend-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  minWidth: 0,
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="lp-extend-end"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                End date
              </label>
              <input
                id="lp-extend-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  minWidth: 0,
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {!validRange && startDate && endDate ? (
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

          {error ? (
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
              {error}
            </div>
          ) : null}

          <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
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
              onClick={handleSaveClick}
              disabled={saving || !validRange}
              className="btn-transition btn-primary-press inline-flex items-center"
              style={{
                gap: 6,
                padding: 'var(--lp-space-2) var(--lp-space-4)',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: validRange ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
                background: validRange ? 'var(--color-lp-orange)' : 'var(--lp-surface-hover)',
                border: '1px solid transparent',
                borderRadius: 'var(--lp-radius-md)',
                cursor: validRange ? 'pointer' : 'not-allowed',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      </SlideOver>

      {/* Out-of-window confirmation modal */}
      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[3500] flex items-center justify-center p-4"
          style={{ background: 'color-mix(in srgb, black 55%, transparent)' }}
          onClick={() => !saving && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border shadow-xl animate-scale-in"
            style={{
              background: 'var(--lp-surface)',
              borderColor: 'var(--lp-border-strong)',
              padding: 'var(--lp-space-5)',
            }}
          >
            <h3
              className="lp-h3"
              style={{ margin: 0, color: 'var(--lp-text)' }}
            >
              Some routing rows fall outside the new window
            </h3>
            <p
              style={{
                marginTop: 'var(--lp-space-2)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              <strong>{outOfWindow.length}</strong> routing row
              {outOfWindow.length === 1 ? '' : 's'} will remain in the
              database but won&apos;t appear in default views. Nothing
              is deleted.
            </p>
            <ul
              style={{
                margin: 'var(--lp-space-2) 0 0 0',
                padding: 0,
                listStyle: 'none',
                maxHeight: 180,
                overflowY: 'auto',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {outOfWindow.slice(0, 8).map((r) => (
                <li
                  key={r.id}
                  style={{
                    padding: '4px 0',
                    borderBottom: '1px solid var(--lp-border-subtle)',
                  }}
                >
                  {formatDate(r.date)}
                  {r.venue_name ? ` · ${r.venue_name}` : r.city ? ` · ${r.city}` : ''}
                </li>
              ))}
              {outOfWindow.length > 8 ? (
                <li style={{ padding: '4px 0', fontStyle: 'italic' }}>
                  …and {outOfWindow.length - 8} more
                </li>
              ) : null}
            </ul>
            <div
              className="mt-5 flex justify-end"
              style={{ gap: 'var(--lp-space-2)' }}
            >
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
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
                onClick={() => void commit()}
                disabled={saving}
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
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
