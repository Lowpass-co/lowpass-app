/* ============================================
   LOWPASS — Sprint 8.4 §3 — <ArtistDeleteConfirmationModal>

   Mirrors the structure of <TourDeleteConfirmationModal>
   (Sprint 8.1 §5) but with the bigger blast-radius copy that
   artist deletion warrants — the cascade wipes EVERY tour
   under the artist plus all 22 tour-scoped tables per tour,
   plus rider packs / assets / folders + the artist's own
   logo/banner storage.

   Counts come from GET /api/artists/[id]/delete-preview.
   "Type DELETE to confirm" guard. Red destructive button
   (uses --color-lp-error per Sprint 8.1 §5 sign-off).

   On successful DELETE: caller's onDeleted handler runs, which
   typically navigates to /artists (workspace landing).
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const CONFIRM_WORD = 'DELETE';

interface DeletePreviewCounts {
  tours: number;
  shows: number;
  budgetRows: number;
  riderPacks: number;
  dealMemos: number;
  flights: number;
  hotels: number;
  gear: number;
}

interface DeletePreview {
  artist: { id: string; name: string };
  counts: DeletePreviewCounts;
}

export interface ArtistDeleteConfirmationModalProps {
  open: boolean;
  artistId: string;
  /** Optional pre-known artist name so the title doesn't pop in
   *  while the preview fetch lands. */
  artistName?: string;
  onClose: () => void;
  /** Called after the DELETE roundtrip succeeds. Caller
   *  navigates (typically to /artists). */
  onDeleted: () => void;
}

export function ArtistDeleteConfirmationModal({
  open,
  artistId,
  artistName,
  onClose,
  onDeleted,
}: ArtistDeleteConfirmationModalProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canConfirm = confirmInput === CONFIRM_WORD;

  // Fetch counts + reset transient state on each open. queueMicrotask
  // wraps the resets so the effect doesn't trip
  // react-hooks/set-state-in-effect (mirrors the Sprint 8.1 §5
  // tour modal pattern).
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
          `/api/artists/${artistId}/delete-preview`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setError(
              res.status === 404
                ? 'Artist not found.'
                : `Could not fetch artist details (${res.status}).`,
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
        setError('Network error fetching artist details.');
        setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, artistId]);

  // Autofocus once preview lands.
  useEffect(() => {
    if (open && !previewLoading && !error) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, previewLoading, error]);

  // Esc closes when not submitting.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const headline = preview ? buildCountsLine(preview.counts) : null;

  async function handleConfirm() {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/artists/${artistId}`, {
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
      aria-labelledby="lp-artist-delete-title"
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
              id="lp-artist-delete-title"
              className="lp-h3"
              style={{ margin: 0, color: 'var(--lp-text)' }}
            >
              Delete artist?
            </h3>
            <p
              className="mt-1 truncate"
              style={{
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {preview?.artist.name ?? artistName ?? '…'}
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
                Loading artist details…
              </p>
            ) : null}
          </div>
        </div>

        {/* Big-warning red banner — artist deletion is wider than tour. */}
        <div
          className="mt-4"
          style={{
            padding: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--color-lp-error)',
            background:
              'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
            border:
              '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)',
            borderRadius: 'var(--lp-radius-md)',
            lineHeight: 1.5,
          }}
        >
          This permanently deletes the artist AND every tour under
          them. Cannot be undone.
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
            <li>Every tour under this artist</li>
            <li>All routing, advances, deal memos for those tours</li>
            <li>All budget, payroll, expenses</li>
            <li>All personnel assignments, rates, gear, hotels, flights</li>
            <li>All rider packs, rider assets, and uploaded files</li>
            <li>The artist&apos;s logo and banner files</li>
          </ul>
          <p
            className="mt-3"
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Workspace-shared data is NOT affected: persons, venues,
            vendors, templates remain intact.
          </p>
        </div>

        {/* Confirm input */}
        <div className="mt-4">
          <label
            htmlFor="lp-artist-delete-confirm"
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
            id="lp-artist-delete-confirm"
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
            {submitting ? 'Deleting…' : 'Delete artist'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Build the dot-separated counts header. Skips zero categories
 *  so a brand-new artist with nothing shows just "EMPTY ARTIST". */
function buildCountsLine(counts: DeletePreviewCounts): string {
  const parts: string[] = [];
  if (counts.tours > 0) {
    parts.push(`${counts.tours} ${counts.tours === 1 ? 'TOUR' : 'TOURS'}`);
  }
  if (counts.shows > 0) {
    parts.push(`${counts.shows} ${counts.shows === 1 ? 'SHOW' : 'SHOWS'}`);
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
  return parts.length === 0 ? 'EMPTY ARTIST' : parts.join(' · ');
}
