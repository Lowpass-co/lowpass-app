'use client';

/* ============================================
   LOWPASS — EditTourSlideOver (Sprint 9 §13.C.1)

   Canonical tour-settings editor (per Q7). Supersedes the
   prior <ExtendTourSlideOver> single-purpose date editor —
   wraps name + start_date + end_date + currency + continent
   into one slide-over so the operator doesn't bounce between
   "Edit tour" and "Extend tour" surfaces.

   Behaviour parity with ExtendTourSlideOver for the date
   path: validates end_date >= start_date and surfaces a
   warning + confirmation modal when routing rows fall outside
   the new window (rows aren't auto-deleted — operator decides).

   The legacy /tours/[id]/edit route is intentionally untouched
   (Phase 4 of Operations migration formally retires it).

   API:
     <EditTourSlideOver
       open={...}
       tourId={...}
       initial={{ name, start_date, end_date, currency, continent }}
       routingDates={...}
       onClose={...}
       onSaved={...}
     />
   ============================================ */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';

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
   *  window. Same shape as ExtendTourSlideOver consumed. */
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

export function EditTourSlideOver({
  open,
  tourId,
  initial,
  routingDates,
  onClose,
  onSaved,
}: EditTourSlideOverProps) {
  const { showToast } = useToast();
  const router = useRouter();

  const [name, setName] = useState(initial.name ?? '');
  const [startDate, setStartDate] = useState(initial.start_date ?? '');
  const [endDate, setEndDate] = useState(initial.end_date ?? '');
  const [currency, setCurrency] = useState(initial.currency ?? 'GBP');
  const [continent, setContinent] = useState(initial.continent ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset local state whenever the slide-over reopens or the
  // server-provided initial values change.
  useEffect(() => {
    if (!open) return;
    setName(initial.name ?? '');
    setStartDate(initial.start_date ?? '');
    setEndDate(initial.end_date ?? '');
    setCurrency(initial.currency ?? 'GBP');
    setContinent(initial.continent ?? '');
    setError(null);
    setConfirmOpen(false);
  }, [open, initial.name, initial.start_date, initial.end_date, initial.currency, initial.continent]);

  const trimmedName = name.trim();
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

  async function commit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          start_date: startDate || null,
          end_date: endDate || null,
          currency: currency || null,
          continent: continent || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      showToast('Tour settings updated.');
      // Sprint 9 §13.A.9 — invalidate the route's server
      // components so TourHeader re-renders with the new
      // dates / name immediately.
      router.refresh();
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
    if (!trimmedName) {
      setError('Tour name is required.');
      return;
    }
    if (startDate || endDate) {
      if (!validRange) {
        setError('End date must be on or after start date.');
        return;
      }
    }
    if (outOfWindow.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void commit();
  }

  // Shared input style — kept inline to match the existing
  // ExtendTourSlideOver visual language without adding a
  // dependency on a new primitive.
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
      <SlideOver open={open} onClose={onClose} title="Edit tour" width="default">
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

          <div>
            <label htmlFor="lp-edit-tour-name" className="lp-label-caps" style={labelStyle}>
              Name
            </label>
            <input
              id="lp-edit-tour-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

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
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
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
                value={continent}
                onChange={(e) => setContinent(e.target.value)}
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
              disabled={saving || (!validRange && (!!startDate || !!endDate))}
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
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save
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
                  cursor: saving ? 'not-allowed' : 'pointer',
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
