/* ============================================
   LOWPASS — Sprint 5 §3 — <TourCreateSlideOver>

   In-context quick-create flow for a new tour, opened from the
   "+ Create new tour" CTA in <ArtistTourSwitcher>. Posts to the
   existing /api/tours route (no new API surface). Required fields
   per the schema: name, artist_id, start_date, end_date. Currency
   defaults to GBP. continent / counts use the API's defaults
   (UK / 0).

   On success: closes, re-selects the new tour via context (URL +
   localStorage sync flow inherits Sprint 4 hydration).

   The full-page <TourWizard> stays for the all-fields creation
   flow; this slide-over is the quick path.
   ============================================ */

'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SlideOver } from '@/components/shell/SlideOver';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useToast } from '@/components/ui/Toast';
import {
  TOUR_CURRENCIES,
  DEFAULT_TOUR_CURRENCY,
} from '@/lib/currencies';

interface TourCreateSlideOverProps {
  open: boolean;
  onClose: () => void;
  /** Artist this tour belongs to. Required by the API. Default
   *  comes from ArtistTourContext (currently selected artist).
   *  If both are null, the form surfaces a "pick an artist first"
   *  state — no insert is attempted. */
  artistId?: string | null;
}

function todayIsoDate(): string {
  // YYYY-MM-DD in local time. The DATE column is stored as plain
  // date (no TZ) — local-day matches user expectation.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function TourCreateSlideOver({
  open,
  onClose,
  artistId,
}: TourCreateSlideOverProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { selectedArtistId, setSelectedTourId } = useArtistTourContext();
  const effectiveArtistId = artistId ?? selectedArtistId ?? null;

  const formId = useId();
  const today = useMemo(() => todayIsoDate(), []);

  /* -------- form state -------- */
  // Re-mount the form-state when `open` flips false→true by keying
  // a sub-component on `open`. That gives us per-open state reset
  // without the react-hooks/set-state-in-effect violation that a
  // useEffect-based reset would trip. While `open === false` we
  // render no form, so its state is naturally GC'd.
  return (
    <TourCreateSlideOverInner
      key={open ? 'open' : 'closed'}
      open={open}
      onClose={onClose}
      effectiveArtistId={effectiveArtistId}
      formId={formId}
      today={today}
      router={router}
      showToast={showToast}
      setSelectedTourId={setSelectedTourId}
    />
  );
}

interface InnerProps {
  open: boolean;
  onClose: () => void;
  effectiveArtistId: string | null;
  formId: string;
  today: string;
  router: ReturnType<typeof useRouter>;
  showToast: ReturnType<typeof useToast>['showToast'];
  setSelectedTourId: (id: string | null) => void;
}

function TourCreateSlideOverInner({
  open,
  onClose,
  effectiveArtistId,
  formId,
  today,
  router,
  showToast,
  setSelectedTourId,
}: InnerProps) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [currency, setCurrency] = useState<string>(DEFAULT_TOUR_CURRENCY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const datesValid = !!startDate && !!endDate && startDate <= endDate;
  const canSubmit =
    !!effectiveArtistId &&
    !!trimmedName &&
    datesValid &&
    !submitting;

  /* -------- submit -------- */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: effectiveArtistId,
          name: trimmedName,
          start_date: startDate,
          end_date: endDate,
          currency,
          // continent + counts left to API defaults (UK / 0).
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; id?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Create failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const newTourId = body?.id;
      if (newTourId) {
        // Auto-select the new tour. The setter syncs URL +
        // localStorage. router.refresh() re-runs the server
        // header fetches so the switcher's tours list picks up
        // the new row.
        setSelectedTourId(newTourId);
      }
      showToast('Tour created');
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="New tour"
      subtitle={
        effectiveArtistId
          ? null
          : (
              <span
                style={{
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--color-lp-error)',
                }}
              >
                Pick an artist first.
              </span>
            )
      }
      footer={
        <div
          className="flex items-center justify-end"
          style={{ gap: 'var(--lp-space-3)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
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
            type="submit"
            form={formId}
            disabled={!canSubmit}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: canSubmit
                ? 'var(--lp-text-inverse)'
                : 'var(--lp-text-tertiary)',
              background: canSubmit
                ? 'var(--color-lp-orange)'
                : 'var(--lp-surface-hover)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.7,
            }}
          >
            {submitting ? 'Creating…' : 'Create tour'}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lp-space-4)',
        }}
      >
        {error ? (
          <div
            role="alert"
            style={{
              padding: 'var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-error)',
              background:
                'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
              border:
                '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)',
              borderRadius: 'var(--lp-radius-md)',
            }}
          >
            {error}
          </div>
        ) : null}

        <Field label="Name" htmlFor={`${formId}-name`} required>
          <input
            id={`${formId}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. World Tour 2026"
            autoFocus
            data-autofocus
            required
            style={inputStyle()}
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--lp-space-3)',
          }}
        >
          <Field label="Start date" htmlFor={`${formId}-start`} required>
            <input
              id={`${formId}-start`}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              style={inputStyle()}
            />
          </Field>
          <Field label="End date" htmlFor={`${formId}-end`} required>
            <input
              id={`${formId}-end`}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              style={inputStyle()}
            />
          </Field>
        </div>

        {!datesValid && startDate && endDate ? (
          <div
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--color-lp-error)',
            }}
          >
            End date must be on or after start date.
          </div>
        ) : null}

        <Field label="Currency" htmlFor={`${formId}-currency`}>
          <select
            id={`${formId}-currency`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={inputStyle()}
          >
            {TOUR_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <p
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Need region, crew counts, or a new artist? Use the{' '}
          <Link
            href="/tours/create"
            style={{ color: 'var(--color-lp-orange)' }}
          >
            full tour wizard
          </Link>
          .
        </p>
      </form>
    </SlideOver>
  );
}

/* ----- small primitives kept local to this file ----- */

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-1)',
      }}
    >
      <span
        className="lp-label-caps"
        style={{ color: 'var(--lp-text-secondary)' }}
      >
        {label}
        {required ? (
          <span
            aria-hidden
            style={{
              marginLeft: 'var(--lp-space-1)',
              color: 'var(--color-lp-orange)',
            }}
          >
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: 'var(--lp-space-2) var(--lp-space-3)',
    fontSize: 'var(--lp-text-base)',
    color: 'var(--lp-text)',
    background: 'var(--lp-bg)',
    border: '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    outline: 'none',
  };
}
