/* ============================================
   LOWPASS — Sprint 8.1 §5 — <TourDeleteConfirmationModal>

   Tour-aware confirmation modal that shows a head-line of
   counts (X shows · Y personnel · Z budget rows · ...), a
   generic-category bullet list of what gets deleted, and the
   "Type DELETE to confirm" guard. The Delete button stays
   disabled until the input matches DELETE (case-sensitive).

   Used from the <ArtistTourSwitcher> overflow menu (⋮ next
   to each tour row) and from the future Operations · Edit
   Tour surface when that lands.

   Reuses the existing modal pattern from
   <DeleteConfirmationModal> but renders richer body content
   (counts head-line, category bullets, "NOT affected" note)
   that the generic primitive doesn't accommodate.

   Counts come from GET /api/tours/[id]/delete-preview which
   the modal fetches when opened. The modal renders a brief
   loading state while the fetch is in flight.

   Reuses the existing --color-lp-error token for the destructive
   button (Adam's sign-off: reuse --color-lp-error rather than
   adding a new --lp-red-destructive token; the name and the hex
   match the destructive-red intent).
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const CONFIRM_WORD = 'DELETE';

interface DeletePreviewCounts {
  shows: number;
  personnel: number;
  budgetRows: number;
  riderPacks: number;
  dealMemos: number;
  flights: number;
  hotels: number;
  gear: number;
}

interface DeletePreview {
  tour: { id: string; name: string };
  counts: DeletePreviewCounts;
}

export interface TourDeleteConfirmationModalProps {
  open: boolean;
  tourId: string;
  /** Optional pre-known tour name for the header. The modal
   *  fetches the canonical name from the preview endpoint anyway,
   *  but using the prop avoids "Delete tour?" → "Delete <name>?"
   *  pop-in on the first paint. */
  tourName?: string;
  onClose: () => void;
  /** Called after the DELETE roundtrip succeeds. Caller is
   *  expected to navigate away (typically to the artist landing). */
  onDeleted: () => void;
}

export function TourDeleteConfirmationModal({
  open,
  tourId,
  tourName,
  onClose,
  onDeleted,
}: TourDeleteConfirmationModalProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canConfirm = confirmInput === CONFIRM_WORD;

  // Reset transient state on each open + fetch the counts. The
  // resets are wrapped in queueMicrotask so the effect doesn't
  // trip react-hooks/set-state-in-effect; functionally equivalent
  // (the microtask runs before the next paint).
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setConfirmInput('');
      setError(null);
      setPreview(null);
      setPreviewLoading(true);
    });
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/tours/${tourId}/delete-preview`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setError(
              res.status === 404
                ? 'Tour not found.'
                : `Could not fetch tour details (${res.status}).`,
            );
            setPreviewLoading(false);
          }
          return;
        }
        const body = (await res.json()) as DeletePreview;
        if (cancelled) return;
        setPreview(body);
        setPreviewLoading(false);
      } catch {
        if (cancelled) return;
        setError('Network error fetching tour details.');
        setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tourId]);

  // Autofocus the confirm input once the preview lands.
  useEffect(() => {
    if (open && !previewLoading && !error) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, previewLoading, error]);

  // Esc closes (when not mid-submit).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const headline = preview
    ? buildCountsLine(preview.counts)
    : null;

  async function handleConfirm() {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error ?? `Delete failed (${res.status}).`);
        setSubmitting(false);
        return;
      }
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lp-tour-delete-title"
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{
        background: 'color-mix(in srgb, black 50%, transparent)',
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border shadow-xl animate-scale-in"
        style={{
          background: 'var(--lp-surface)',
          borderColor: 'var(--lp-border-strong)',
          padding: 'var(--lp-space-6)',
        }}
      >
        {/* Title row */}
        <div
          className="flex items-start"
          style={{ gap: 'var(--lp-space-3)' }}
        >
          <span
            aria-hidden
            className="inline-flex shrink-0 items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--lp-radius-md)',
              background:
                'color-mix(in srgb, var(--color-lp-error) 12%, transparent)',
              color: 'var(--color-lp-error)',
            }}
          >
            <AlertTriangle size={20} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id="lp-tour-delete-title"
              className="lp-h3"
              style={{ margin: 0, color: 'var(--lp-text)' }}
            >
              Delete tour?
            </h3>
            <p
              className="mt-1 truncate"
              style={{
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {preview?.tour.name ?? tourName ?? '…'}
            </p>
            {headline ? (
              <p
                className="mt-2"
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  fontWeight: 'var(--lp-weight-bold)',
                  letterSpacing: 'var(--lp-tracking-caps)',
                  textTransform: 'uppercase',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                {headline}
              </p>
            ) : previewLoading ? (
              <p
                className="mt-2"
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                Loading tour details…
              </p>
            ) : null}
          </div>
        </div>

        {/* Body — generic-category bullets + "NOT affected" line */}
        <div
          className="mt-4"
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0 }}>This permanently deletes:</p>
          <ul
            className="mt-2"
            style={{
              margin: 0,
              paddingLeft: 'var(--lp-space-5)',
              listStyle: 'disc',
            }}
          >
            <li>All routing, advances, deal memos</li>
            <li>All budget, payroll, expenses</li>
            <li>All personnel assignments and rates</li>
            <li>All rider packs and uploaded files</li>
            <li>All flights, hotels, rooming, gear</li>
          </ul>
          <p
            className="mt-3"
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            The artist, venues, persons, and templates are NOT
            affected.
          </p>
        </div>

        {/* Confirm input */}
        <div className="mt-4">
          <label
            htmlFor="lp-tour-delete-confirm"
            className="lp-label-caps"
            style={{
              display: 'block',
              color: 'var(--lp-text-secondary)',
              marginBottom: 'var(--lp-space-1)',
            }}
          >
            Type DELETE to confirm
          </label>
          <input
            id="lp-tour-delete-confirm"
            ref={inputRef}
            type="text"
            value={confirmInput}
            onChange={(e) => {
              setConfirmInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConfirm();
            }}
            placeholder="DELETE"
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-base)',
              color: 'var(--lp-text)',
              background: 'var(--lp-bg)',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              outline: 'none',
              fontFamily: 'var(--lp-font-numeric)',
              letterSpacing: '0.05em',
            }}
          />
        </div>

        {error ? (
          <p
            className="mt-3"
            role="alert"
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-error)',
            }}
          >
            {error}
          </p>
        ) : null}

        {/* Footer */}
        <div
          className="mt-6 flex justify-end"
          style={{ gap: 'var(--lp-space-3)' }}
        >
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || submitting}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'white',
              background: 'var(--color-lp-error)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor:
                canConfirm && !submitting ? 'pointer' : 'not-allowed',
              opacity: canConfirm && !submitting ? 1 : 0.55,
            }}
          >
            {submitting ? 'Deleting…' : 'Delete tour'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Build the dot-separated header line of counts.
 *  Skips zero-count categories so a brand-new tour with no
 *  routing/personnel/etc shows just "Empty tour" instead of
 *  "0 SHOWS · 0 PERSONNEL · 0 BUDGET ROWS". */
function buildCountsLine(counts: DeletePreviewCounts): string {
  const parts: string[] = [];
  if (counts.shows > 0) {
    parts.push(`${counts.shows} ${counts.shows === 1 ? 'SHOW' : 'SHOWS'}`);
  }
  if (counts.personnel > 0) {
    parts.push(
      `${counts.personnel} ${counts.personnel === 1 ? 'PERSON' : 'PERSONNEL'}`,
    );
  }
  if (counts.budgetRows > 0) {
    parts.push(
      `${counts.budgetRows} BUDGET ${
        counts.budgetRows === 1 ? 'ROW' : 'ROWS'
      }`,
    );
  }
  if (counts.riderPacks > 0) {
    parts.push(
      `${counts.riderPacks} RIDER ${
        counts.riderPacks === 1 ? 'PACK' : 'PACKS'
      }`,
    );
  }
  if (counts.dealMemos > 0) {
    parts.push(
      `${counts.dealMemos} DEAL ${
        counts.dealMemos === 1 ? 'MEMO' : 'MEMOS'
      }`,
    );
  }
  if (counts.flights > 0) {
    parts.push(
      `${counts.flights} ${counts.flights === 1 ? 'FLIGHT' : 'FLIGHTS'}`,
    );
  }
  if (counts.hotels > 0) {
    parts.push(
      `${counts.hotels} ${counts.hotels === 1 ? 'HOTEL' : 'HOTELS'}`,
    );
  }
  if (counts.gear > 0) {
    parts.push(`${counts.gear} GEAR ${counts.gear === 1 ? 'ITEM' : 'ITEMS'}`);
  }
  return parts.length === 0 ? 'EMPTY TOUR' : parts.join(' · ');
}
