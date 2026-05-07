/* ============================================
   LOWPASS — Sprint 5 §3 / Sprint 8 §5 / Sprint 8.1 §4
                                       — <TourCreateSlideOver>

   In-context create flow for a new tour, opened from the
   "+ Create new tour" CTA in <ArtistTourSwitcher>. Posts to the
   existing /api/tours route.

   Sprint 8.1 §4 — multi-step:
     Page 1 = tour info (existing form).
     Page 2 = routing builder. Embeds the production
              <RoutingGrid> in a compact variant (preserves
              VenueAutocomplete, drive-time bands, day-type
              colors, transport pills). Slide-over expands
              to xwide (800px) on page 2.

   Footer changes per step:
     Page 1 → [Cancel]   [Skip routing & Create]   [Next: routing →]
     Page 2 → [← Back]   [Cancel]   [Skip routing & Create]   [Create with N rows →]

   On submit:
     1. POST /api/tours with form data.
     2. If page 2 was visited and there are valid rows, POST
        /api/tours/[newId]/routing with the rows.
     3. Optimistic prepend to switcher + navigate to product surface.

   Page 2 row seeding: when the user advances from page 1, rows
   are pre-seeded with one row per date in [start_date, end_date].
   Rows with no day_type AND no venue_name are dropped silently
   on save (matches Adam's spec: "rows missing a date are dropped
   silently"; we extend the rule to "rows without ANY content").

   Sprint 8 §5: full field set mirroring TourWizard. Adam's
   intent — slide-overs are the canonical creation UX, the legacy
   /tours/create page is a fallback for deep-linked bookmarks.
   ============================================ */

'use client';

import { useEffect, useId, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useToast } from '@/components/ui/Toast';
import {
  TOUR_CURRENCIES,
  DEFAULT_TOUR_CURRENCY,
} from '@/lib/currencies';
import { RoutingGrid, type RoutingRow } from '@/components/routing/RoutingGrid';

/** Continents matching the schema's TEXT enum — see
 *  src/types/index.ts Continent type. Single-select per Sprint 8
 *  §5 sign-off (schema is single-continent; the wizard's multi-
 *  select stored only the first one anyway). */
const CONTINENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UK', label: 'UK' },
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
  { value: 'AUS', label: 'AUS' },
  { value: 'ASIA', label: 'ASIA' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'OTHER', label: 'Other' },
] as const;

interface ArtistOption {
  id: string;
  name: string;
}

interface TourCreateSlideOverProps {
  open: boolean;
  onClose: () => void;
  /** Artist this tour belongs to. Default comes from
   *  ArtistTourContext (currently selected artist). When null,
   *  the form renders an artist <select> populated from
   *  workspace artists. */
  artistId?: string | null;
  /** Sprint 8 §5 — workspace artists for the picker fallback
   *  when no context artist is set. The wrapper passes the
   *  same list it already maintains for the switcher's artists
   *  pane. Empty array = no artists yet → form surfaces the
   *  "create an artist first" state. */
  artists?: ArtistOption[];
  /** Sprint 6 §2 sub-bug C — fired with the freshly-created
   *  tour's lean projection so the wrapper can optimistically
   *  prepend it to the switcher's tour list. Without this the
   *  new tour wouldn't appear until the next server roundtrip
   *  refreshed initialTours, which router.refresh() doesn't
   *  reliably trigger across product navigation in Next 16. */
  onCreated?: (tour: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  }) => void;
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

/** Generate ISO YYYY-MM-DD strings between start and end (inclusive). */
function dateRangeIso(start: string, end: string): string[] {
  const out: string[] = [];
  if (!start || !end) return out;
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return out;
  while (s <= e) {
    out.push(s.toISOString().slice(0, 10));
    s.setUTCDate(s.getUTCDate() + 1);
    if (out.length > 365) break; // safety cap
  }
  return out;
}

/** Add one day to a YYYY-MM-DD string. */
function addOneDayIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isRowFilled(row: RoutingRow): boolean {
  return !!(
    (row.day_type && row.day_type.trim()) ||
    (row.venue_name && row.venue_name.trim()) ||
    (row.city && row.city.trim()) ||
    (row.address && row.address.trim())
  );
}

export function TourCreateSlideOver({
  open,
  onClose,
  artistId,
  artists,
  onCreated,
}: TourCreateSlideOverProps) {
  const { showToast } = useToast();
  const { selectedArtistId } = useArtistTourContext();
  const contextArtistId = artistId ?? selectedArtistId ?? null;

  const formId = useId();
  const today = useMemo(() => todayIsoDate(), []);

  return (
    <TourCreateSlideOverInner
      key={open ? 'open' : 'closed'}
      open={open}
      onClose={onClose}
      contextArtistId={contextArtistId}
      artists={artists ?? []}
      formId={formId}
      today={today}
      showToast={showToast}
      onCreated={onCreated}
    />
  );
}

interface InnerProps {
  open: boolean;
  onClose: () => void;
  /** Artist id pre-selected from context, if any. When null the
   *  form lets the user pick from `artists`. */
  contextArtistId: string | null;
  artists: ArtistOption[];
  formId: string;
  today: string;
  showToast: ReturnType<typeof useToast>['showToast'];
  onCreated?: TourCreateSlideOverProps['onCreated'];
}

function TourCreateSlideOverInner({
  open,
  onClose,
  contextArtistId,
  artists,
  formId,
  today,
  showToast,
  onCreated,
}: InnerProps) {
  /* -------- step -------- */
  const [step, setStep] = useState<1 | 2>(1);

  /* -------- page 1 form -------- */
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [currency, setCurrency] = useState<string>(DEFAULT_TOUR_CURRENCY);
  const [continent, setContinent] = useState<string>('UK');
  const [principalCount, setPrincipalCount] = useState('0');
  const [bandCount, setBandCount] = useState('0');
  const [crewCount, setCrewCount] = useState('0');
  const [pickedArtistId, setPickedArtistId] = useState<string>(
    () => contextArtistId ?? artists[0]?.id ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------- page 2 routing rows -------- */
  const [rows, setRows] = useState<RoutingRow[]>([]);
  // Track whether rows have been initialised from the date range so
  // re-entering page 2 after edits doesn't clobber user input.
  const [rowsInitialisedForRange, setRowsInitialisedForRange] = useState<
    string | null
  >(null);

  /* -------- effective values -------- */
  const effectiveArtistId = contextArtistId ?? pickedArtistId ?? null;
  const effectiveArtistName = useMemo(() => {
    if (!effectiveArtistId) return null;
    return artists.find((a) => a.id === effectiveArtistId)?.name ?? null;
  }, [artists, effectiveArtistId]);

  const trimmedName = name.trim();
  const datesValid = !!startDate && !!endDate && startDate <= endDate;
  const principalNum = Math.max(0, parseInt(principalCount, 10) || 0);
  const bandNum = Math.max(0, parseInt(bandCount, 10) || 0);
  const crewNum = Math.max(0, parseInt(crewCount, 10) || 0);
  const canAdvanceFromPage1 =
    !!effectiveArtistId && !!trimmedName && datesValid && !submitting;

  // Filled rows count drives the page-2 primary button label.
  const filledRowCount = useMemo(
    () => rows.filter(isRowFilled).length,
    [rows],
  );

  /* -------- routing row helpers -------- */
  const updateRow = useCallback(
    (index: number, updates: Partial<RoutingRow>) => {
      setRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, ...updates } : r)),
      );
    },
    [],
  );

  const onDeleteRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onAddRow = useCallback(() => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const nextDate = last?.date ? addOneDayIso(last.date) : today;
      return [
        ...prev,
        {
          date: nextDate,
          day_type: '',
          city: '',
          address: '',
          venue_name: '',
          notes: '',
          transport_to_next: 'default',
        },
      ];
    });
  }, [today]);

  /* -------- page transitions -------- */
  const goToPage2 = useCallback(() => {
    if (!canAdvanceFromPage1) return;
    // Seed rows from the tour's date range when entering page 2
    // for the first time for THIS range. Re-entering with edits
    // intact preserves user state.
    const rangeKey = `${startDate}__${endDate}`;
    if (rowsInitialisedForRange !== rangeKey) {
      const dates = dateRangeIso(startDate, endDate);
      setRows(
        dates.map((d) => ({
          date: d,
          day_type: '',
          city: '',
          address: '',
          venue_name: '',
          notes: '',
          transport_to_next: 'default',
        })),
      );
      setRowsInitialisedForRange(rangeKey);
    }
    setStep(2);
    setError(null);
  }, [
    canAdvanceFromPage1,
    startDate,
    endDate,
    rowsInitialisedForRange,
  ]);

  const goBackToPage1 = useCallback(() => {
    setStep(1);
    setError(null);
  }, []);

  /* -------- submit -------- */
  // submitRouting: include rows only when explicitly invoked from page 2.
  // Page 1's "Skip routing & Create" passes false.
  const performCreate = useCallback(
    async (includeRouting: boolean) => {
      if (!effectiveArtistId || !trimmedName || !datesValid) return;
      setSubmitting(true);
      setError(null);
      try {
        const tourRes = await fetch('/api/tours', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist_id: effectiveArtistId,
            name: trimmedName,
            start_date: startDate,
            end_date: endDate,
            currency,
            continent,
            principal_count: principalNum,
            band_count: bandNum,
            crew_count: crewNum,
          }),
        });
        const tourBody = (await tourRes.json().catch(() => null)) as
          | {
              error?: string;
              id?: string;
              name?: string;
              start_date?: string | null;
              end_date?: string | null;
            }
          | null;
        if (!tourRes.ok) {
          setError(tourBody?.error ?? `Create failed (${tourRes.status})`);
          setSubmitting(false);
          return;
        }
        const newTourId = tourBody?.id;

        // Bulk-insert routing rows. Quietly drops failures —
        // the tour exists, the user can re-edit routing from the
        // Operations · Routing surface.
        if (includeRouting && newTourId) {
          const filledRows = rows.filter(isRowFilled);
          if (filledRows.length > 0) {
            try {
              await fetch(`/api/tours/${newTourId}/routing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dates: filledRows }),
              });
            } catch {
              showToast(
                'Tour created, but routing failed to save — open Routing to retry.',
              );
            }
          }
        }

        if (newTourId) {
          onCreated?.({
            id: newTourId,
            name: tourBody?.name ?? trimmedName,
            start_date: tourBody?.start_date ?? startDate,
            end_date: tourBody?.end_date ?? endDate,
          });
        }
        showToast('Tour created');
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
        setSubmitting(false);
      }
    },
    [
      effectiveArtistId,
      trimmedName,
      datesValid,
      startDate,
      endDate,
      currency,
      continent,
      principalNum,
      bandNum,
      crewNum,
      rows,
      onCreated,
      onClose,
      showToast,
    ],
  );

  function onPage1Submit(e: React.FormEvent<HTMLFormElement>) {
    // Page 1's <form> wraps both inputs and a submit button. We
    // intercept submit and route to "Next" rather than create — the
    // primary button on page 1 advances steps; "Skip & Create" is
    // a separate explicit click.
    e.preventDefault();
    if (canAdvanceFromPage1) goToPage2();
  }

  /* -------- rendering -------- */
  // Slide-over width grows on page 2 to accommodate the routing grid.
  // Adam's call: xwide (800px) over horizontal scroll alone.
  const slideOverWidth: 'default' | 'xwide' =
    step === 2 ? 'xwide' : 'default';

  // Reset width-on-close edge — when the user closes the slide-over
  // mid-page-2, the component is keyed by `open` so will remount
  // with default width on reopen. No explicit reset needed here.

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="New tour"
      subtitle={<StepIndicator step={step} />}
      width={slideOverWidth}
      footer={
        <Footer
          step={step}
          submitting={submitting}
          canAdvanceFromPage1={canAdvanceFromPage1}
          filledRowCount={filledRowCount}
          formId={formId}
          onCancel={onClose}
          onBack={goBackToPage1}
          onSkipAndCreate={() => {
            void performCreate(false);
          }}
          onCreateWithRouting={() => {
            void performCreate(true);
          }}
        />
      }
    >
      {error ? (
        <div
          role="alert"
          style={{
            padding: 'var(--lp-space-3)',
            marginBottom: 'var(--lp-space-3)',
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

      {step === 1 ? (
        <Page1Form
          formId={formId}
          onSubmit={onPage1Submit}
          contextArtistId={contextArtistId}
          effectiveArtistName={effectiveArtistName}
          effectiveArtistId={effectiveArtistId}
          artists={artists}
          pickedArtistId={pickedArtistId}
          setPickedArtistId={setPickedArtistId}
          name={name}
          setName={setName}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          datesValid={datesValid}
          continent={continent}
          setContinent={setContinent}
          currency={currency}
          setCurrency={setCurrency}
          principalCount={principalCount}
          setPrincipalCount={setPrincipalCount}
          bandCount={bandCount}
          setBandCount={setBandCount}
          crewCount={crewCount}
          setCrewCount={setCrewCount}
        />
      ) : (
        <Page2Routing
          rows={rows}
          tourName={trimmedName}
          onChange={setRows}
          updateRow={updateRow}
          onDeleteRow={onDeleteRow}
          onAddRow={onAddRow}
          filledRowCount={filledRowCount}
        />
      )}
    </SlideOver>
  );
}

/* ============================================
   Step indicator (subtitle slot)
   ============================================ */

function StepIndicator({ step }: { step: 1 | 2 }) {
  const stepStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 'var(--lp-text-2xs)',
    fontWeight: 'var(--lp-weight-bold)',
    letterSpacing: 'var(--lp-tracking-caps)',
    textTransform: 'uppercase',
    color: active ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
  });
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--lp-space-2)',
      }}
    >
      <span style={stepStyle(step === 1)}>1 · Tour info</span>
      <span aria-hidden style={{ color: 'var(--lp-text-tertiary)' }}>
        →
      </span>
      <span style={stepStyle(step === 2)}>2 · Routing</span>
    </span>
  );
}

/* ============================================
   Footer — adapts per step
   ============================================ */

function Footer({
  step,
  submitting,
  canAdvanceFromPage1,
  filledRowCount,
  formId,
  onCancel,
  onBack,
  onSkipAndCreate,
  onCreateWithRouting,
}: {
  step: 1 | 2;
  submitting: boolean;
  canAdvanceFromPage1: boolean;
  filledRowCount: number;
  formId: string;
  onCancel: () => void;
  onBack: () => void;
  onSkipAndCreate: () => void;
  onCreateWithRouting: () => void;
}) {
  if (step === 1) {
    return (
      <div
        className="flex items-center justify-end"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="btn-transition"
          style={secondaryButtonStyle()}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSkipAndCreate}
          disabled={!canAdvanceFromPage1}
          className="btn-transition"
          style={ghostButtonStyle(canAdvanceFromPage1 && !submitting)}
        >
          {submitting ? 'Creating…' : 'Skip routing & Create'}
        </button>
        <button
          type="submit"
          form={formId}
          disabled={!canAdvanceFromPage1}
          className="btn-transition"
          style={primaryButtonStyle(canAdvanceFromPage1)}
        >
          Next: routing →
        </button>
      </div>
    );
  }

  // step 2
  return (
    <div
      className="flex items-center justify-end"
      style={{ gap: 'var(--lp-space-3)' }}
    >
      <button
        type="button"
        onClick={onBack}
        className="btn-transition"
        style={secondaryButtonStyle()}
      >
        ← Back
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn-transition"
        style={secondaryButtonStyle()}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSkipAndCreate}
        disabled={submitting}
        className="btn-transition"
        style={ghostButtonStyle(!submitting)}
      >
        Skip routing
      </button>
      <button
        type="button"
        onClick={onCreateWithRouting}
        disabled={submitting}
        className="btn-transition"
        style={primaryButtonStyle(!submitting)}
      >
        {submitting
          ? 'Creating…'
          : filledRowCount > 0
            ? `Create with ${filledRowCount} ${
                filledRowCount === 1 ? 'row' : 'rows'
              } →`
            : 'Create →'}
      </button>
    </div>
  );
}

function primaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: 'var(--lp-space-2) var(--lp-space-4)',
    fontSize: 'var(--lp-text-sm)',
    fontWeight: 'var(--lp-weight-semibold)',
    color: enabled ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
    background: enabled
      ? 'var(--color-lp-orange)'
      : 'var(--lp-surface-hover)',
    border: '1px solid transparent',
    borderRadius: 'var(--lp-radius-md)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.7,
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: 'var(--lp-space-2) var(--lp-space-4)',
    fontSize: 'var(--lp-text-sm)',
    fontWeight: 'var(--lp-weight-medium)',
    color: 'var(--lp-text-secondary)',
    background: 'transparent',
    border: '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    cursor: 'pointer',
  };
}

function ghostButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: 'var(--lp-space-2) var(--lp-space-4)',
    fontSize: 'var(--lp-text-sm)',
    fontWeight: 'var(--lp-weight-medium)',
    color: enabled ? 'var(--lp-text-secondary)' : 'var(--lp-text-tertiary)',
    background: 'transparent',
    border: '1px dashed var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
  };
}

/* ============================================
   Page 1 — tour info form (mostly the original Sprint 8 §5 form)
   ============================================ */

function Page1Form({
  formId,
  onSubmit,
  contextArtistId,
  effectiveArtistName,
  effectiveArtistId,
  artists,
  pickedArtistId,
  setPickedArtistId,
  name,
  setName,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  datesValid,
  continent,
  setContinent,
  currency,
  setCurrency,
  principalCount,
  setPrincipalCount,
  bandCount,
  setBandCount,
  crewCount,
  setCrewCount,
}: {
  formId: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  contextArtistId: string | null;
  effectiveArtistName: string | null;
  effectiveArtistId: string | null;
  artists: ArtistOption[];
  pickedArtistId: string;
  setPickedArtistId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  datesValid: boolean;
  continent: string;
  setContinent: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  principalCount: string;
  setPrincipalCount: (v: string) => void;
  bandCount: string;
  setBandCount: (v: string) => void;
  crewCount: string;
  setCrewCount: (v: string) => void;
}) {
  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-4)',
      }}
    >
      {!effectiveArtistId ? (
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-error)',
          }}
        >
          {artists.length === 0
            ? 'No artists yet. Create an artist first.'
            : 'Pick an artist below.'}
        </div>
      ) : null}

      {/* Artist — context-locked or picker fallback. */}
      <Field label="Artist" htmlFor={`${formId}-artist`} required>
        {contextArtistId && effectiveArtistName ? (
          <div
            id={`${formId}-artist`}
            style={{
              ...inputStyle(),
              color: 'var(--lp-text-secondary)',
              background: 'var(--lp-panel)',
              cursor: 'not-allowed',
            }}
          >
            {effectiveArtistName}
          </div>
        ) : (
          <select
            id={`${formId}-artist`}
            value={pickedArtistId}
            onChange={(e) => setPickedArtistId(e.target.value)}
            required
            disabled={artists.length === 0}
            style={inputStyle()}
          >
            {artists.length === 0 ? (
              <option value="">No artists yet</option>
            ) : (
              artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        )}
      </Field>

      <Field label="Tour name" htmlFor={`${formId}-name`} required>
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--lp-space-3)',
        }}
      >
        <Field label="Continent" htmlFor={`${formId}-continent`} required>
          <select
            id={`${formId}-continent`}
            value={continent}
            onChange={(e) => setContinent(e.target.value)}
            required
            style={inputStyle()}
          >
            {CONTINENT_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
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
      </div>

      {/* Personnel triplet */}
      <div>
        <span
          className="lp-label-caps"
          style={{
            display: 'block',
            color: 'var(--lp-text-secondary)',
            marginBottom: 'var(--lp-space-1)',
          }}
        >
          Personnel
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 'var(--lp-space-3)',
          }}
        >
          <Field label="Principal" htmlFor={`${formId}-principal`}>
            <input
              id={`${formId}-principal`}
              type="number"
              min={0}
              value={principalCount}
              onChange={(e) => setPrincipalCount(e.target.value)}
              style={inputStyle()}
            />
          </Field>
          <Field label="Band" htmlFor={`${formId}-band`}>
            <input
              id={`${formId}-band`}
              type="number"
              min={0}
              value={bandCount}
              onChange={(e) => setBandCount(e.target.value)}
              style={inputStyle()}
            />
          </Field>
          <Field label="Crew" htmlFor={`${formId}-crew`}>
            <input
              id={`${formId}-crew`}
              type="number"
              min={0}
              value={crewCount}
              onChange={(e) => setCrewCount(e.target.value)}
              style={inputStyle()}
            />
          </Field>
        </div>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 'var(--lp-text-xs)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        Or use the{' '}
        <Link
          href="/tours/create"
          style={{ color: 'var(--color-lp-orange)' }}
        >
          full tour wizard
        </Link>
        {' '}for the legacy multi-step flow.
      </p>
    </form>
  );
}

/* ============================================
   Page 2 — routing builder (embedded RoutingGrid compact)
   ============================================ */

function Page2Routing({
  rows,
  tourName,
  onChange,
  updateRow,
  onDeleteRow,
  onAddRow,
  filledRowCount,
}: {
  rows: RoutingRow[];
  tourName: string;
  onChange: (rows: RoutingRow[]) => void;
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  onDeleteRow: (index: number) => void;
  onAddRow: () => void;
  filledRowCount: number;
}) {
  // Sprint 8.1 §4 — respect prefers-reduced-motion. The page-
  // transition fade is purely decorative; if reduced, skip it
  // and just render content. Lazy initial-state avoids the
  // react-hooks/set-state-in-effect lint by reading the
  // matchMedia value synchronously on mount.
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cb = () => setReduced(mq.matches);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-3)',
        animation: reduced ? 'none' : 'lp-page2-enter 200ms ease-out',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lp-space-1)',
        }}
      >
        <span
          className="lp-label-caps"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          Routing for {tourName || 'this tour'}
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          One row per date. Pick a location to autofill the address
          and venue details. Empty rows are dropped on save —{' '}
          <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
            {filledRowCount}
          </span>{' '}
          of <span className="lp-mono">{rows.length}</span> currently
          filled.
        </p>
      </header>

      <RoutingGrid
        rows={rows}
        onChange={onChange}
        updateRow={updateRow}
        onDeleteRow={onDeleteRow}
        primaryTransit="bus_van"
        compact
      />

      <button
        type="button"
        onClick={onAddRow}
        className="btn-transition inline-flex items-center self-start"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--lp-text-secondary)',
          background: 'var(--lp-panel)',
          border: '1px dashed var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          cursor: 'pointer',
        }}
      >
        <Plus aria-hidden size={14} strokeWidth={2.25} />
        Add row
      </button>

      <style>{`
        @keyframes lp-page2-enter {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
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
