/* ============================================
   LOWPASS — Sprint 5 §3 / Sprint 8 §5 — <TourCreateSlideOver>

   In-context create flow for a new tour, opened from the
   "+ Create new tour" CTA in <ArtistTourSwitcher>. Posts to the
   existing /api/tours route.

   Sprint 8 §5 expansion: full field set mirroring TourWizard.
   Adam's intent — slide-overs become the canonical creation
   UX, the legacy /tours/create page becomes a fallback for
   any deep-linked bookmarks. Fields:

     - artist (auto from selectedArtistId, falls back to picker)
     - name (required)
     - start_date / end_date (required, end >= start)
     - continent (single-select, defaults UK; matches schema)
     - currency (default GBP)
     - personnel: principal / band / crew counts (default 0)

   On success: optimistic prepend via onCreated, navigate via
   wrapper, toast.
   ============================================ */

'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlideOver } from '@/components/shell/SlideOver';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useToast } from '@/components/ui/Toast';
import {
  TOUR_CURRENCIES,
  DEFAULT_TOUR_CURRENCY,
} from '@/lib/currencies';

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
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [currency, setCurrency] = useState<string>(DEFAULT_TOUR_CURRENCY);
  const [continent, setContinent] = useState<string>('UK');
  const [principalCount, setPrincipalCount] = useState('0');
  const [bandCount, setBandCount] = useState('0');
  const [crewCount, setCrewCount] = useState('0');
  // When no context artist, user must pick from the workspace
  // artists list. Initial value is the first artist in the list
  // so the form has a valid default; falls back to '' when the
  // workspace has zero artists.
  const [pickedArtistId, setPickedArtistId] = useState<string>(
    () => contextArtistId ?? artists[0]?.id ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effective artist for submit + display. Context wins if set,
  // otherwise the picker value.
  const effectiveArtistId = contextArtistId ?? pickedArtistId ?? null;
  const effectiveArtistName = useMemo(() => {
    if (!effectiveArtistId) return null;
    return (
      artists.find((a) => a.id === effectiveArtistId)?.name ?? null
    );
  }, [artists, effectiveArtistId]);

  const trimmedName = name.trim();
  const datesValid = !!startDate && !!endDate && startDate <= endDate;
  const principalNum = Math.max(0, parseInt(principalCount, 10) || 0);
  const bandNum = Math.max(0, parseInt(bandCount, 10) || 0);
  const crewNum = Math.max(0, parseInt(crewCount, 10) || 0);
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
          // Sprint 8 §5 — full field set, mirroring TourWizard.
          continent,
          principal_count: principalNum,
          band_count: bandNum,
          crew_count: crewNum,
        }),
      });
      // The existing /api/tours POST returns the inserted row
      // directly (NextResponse.json(data)) rather than { tour: data }
      // — Sprint 5 noted the inconsistency. Read the relevant
      // fields off the row.
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            id?: string;
            name?: string;
            start_date?: string | null;
            end_date?: string | null;
          }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Create failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const newTourId = body?.id;
      if (newTourId) {
        // Sprint 6 §2 sub-bug C — optimistic prepend so the new
        // tour appears in the switcher immediately.
        // Sprint 6.2 §4 — onCreated also navigates to the new
        // tour's product surface (wrapper handles it). The
        // path-aware hydration sets context selectedTourId from
        // the new URL. The previous explicit
        // `setSelectedTourId(newTourId)` here was redundant and
        // fired a syncUrlParams → router.replace that raced
        // the navigation, leaving the user on a stale page
        // until they manually clicked the tour to re-navigate
        // (Adam's "could only select the tour in the picker
        // after refresh" smoke).
        onCreated?.({
          id: newTourId,
          name: body?.name ?? trimmedName,
          start_date: body?.start_date ?? startDate,
          end_date: body?.end_date ?? endDate,
        });
      }
      showToast('Tour created');
      onClose();
      // Sprint 6.2 §4 — dropped router.refresh(). The wrapper's
      // handleTourCreated now pushes to the new tour's product
      // surface, which triggers a Server Component re-render
      // anyway. router.refresh() here would re-fetch the OLD
      // route's data in a redundant cycle.
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
                {artists.length === 0
                  ? 'No artists yet. Create an artist first.'
                  : 'Pick an artist below.'}
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

        {/* Personnel triplet — Sprint 8 §5 expansion. All default
            0; HTML <input min={0}> nudges users away from negatives,
            but submission also clamps via Math.max. */}
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
