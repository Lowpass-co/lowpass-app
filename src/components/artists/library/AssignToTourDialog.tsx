'use client';

/* ============================================
   LOWPASS — <AssignToTourDialog> (Sprint 12 §7)

   Modal that lists the artist's tours and POSTs to
   /api/rider-packs/[id]/assign-to-tour to instantiate the
   template into the picked tour. The dialog stays open until
   one assign succeeds (or the operator dismisses) so picking
   multiple tours one-at-a-time is a tap-tap-tap flow.

   No multi-select — Adam's spec calls for "Assign to tour…"
   as a per-tour action, and the propagate-on-template-save
   modal (§7.1) handles the multi-target case for refresh
   propagation.

   Server-side copy is atomic: the API route writes the new
   folder, the new pack, and the cloned rider_sections in one
   transaction, or returns an error and rolls back.
   ============================================ */

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ArtistTemplateRow, ArtistTourOption } from './ArtistTemplateList';

interface AssignToTourDialogProps {
  template: ArtistTemplateRow;
  tours: ArtistTourOption[];
  kindLabel: string;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignToTourDialog({
  template,
  tours,
  kindLabel,
  onClose,
  onAssigned,
}: AssignToTourDialogProps) {
  const [assigningTourId, setAssigningTourId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign(tourId: string) {
    setAssigningTourId(tourId);
    setError(null);
    try {
      const res = await fetch(`/api/rider-packs/${template.id}/assign-to-tour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error ?? `Assign failed (${res.status})`);
        return;
      }
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setAssigningTourId(null);
    }
  }

  const title = template.title?.trim() || `Untitled ${kindLabel}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, black 55%, transparent)' }}
      onClick={() => assigningTourId === null && onClose()}
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
        <div
          className="flex items-start justify-between"
          style={{ marginBottom: 'var(--lp-space-3)', gap: 'var(--lp-space-2)' }}
        >
          <div className="min-w-0">
            <h3
              className="lp-h3"
              style={{
                margin: 0,
                fontSize: 'var(--lp-text-lg)',
                color: 'var(--lp-text)',
              }}
            >
              Assign template to tour
            </h3>
            <p
              className="truncate"
              style={{
                marginTop: 'var(--lp-space-1)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={assigningTourId !== null}
            aria-label="Close"
            style={{
              padding: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--lp-text-tertiary)',
              cursor: assigningTourId !== null ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: 'var(--lp-space-3)',
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

        {tours.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: 'var(--lp-space-4) 0',
              textAlign: 'center',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            This artist has no tours yet. Create one before assigning a template.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              maxHeight: 320,
              overflowY: 'auto',
              border: '1px solid var(--lp-border)',
              borderRadius: 'var(--lp-radius-md)',
            }}
          >
            {tours.map((t, idx) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={assigningTourId !== null}
                  onClick={() => void handleAssign(t.id)}
                  className="btn-transition"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--lp-space-2)',
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    background: 'transparent',
                    border: 'none',
                    borderTop:
                      idx > 0 ? '1px solid var(--lp-border-subtle)' : 'none',
                    cursor: assigningTourId !== null ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity:
                      assigningTourId === null || assigningTourId === t.id
                        ? 1
                        : 0.5,
                  }}
                >
                  <span className="truncate min-w-0">{t.name}</span>
                  {assigningTourId === t.id ? (
                    <Loader2
                      size={14}
                      className="animate-spin shrink-0"
                      style={{ color: 'var(--color-lp-orange)' }}
                    />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
