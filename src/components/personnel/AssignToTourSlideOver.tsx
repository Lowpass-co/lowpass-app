'use client';

/* ============================================
   LOWPASS — AssignToTourSlideOver (Sprint 9 §9)

   Two-step flow used from the workspace Personnel page's
   [Assign to tour] action:

     1. Pick a tour from the workspace's active + archived list.
     2. The slide-over redirects the user to the tour's
        Operations Personnel page with ?assign=<personId> in the
        query string. The Operations PersonnelManagerClient
        reads that param and auto-opens its existing
        AddPersonnelSlideOver pre-filled with this person.

   Step 2 keeps the existing Add-personnel UX as the single
   source of truth for assignment fields (role / window / rate /
   status) — no duplication.

   This slide-over is small: a tour picker + a [Continue] button.
   ============================================ */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useToast } from '@/components/ui/Toast';

interface TourOption {
  id: string;
  name: string;
  status: 'planning' | 'active' | 'completed' | 'archived';
  start_date: string | null;
  end_date: string | null;
  artist_name: string | null;
}

interface AssignToTourSlideOverProps {
  open: boolean;
  personId: string;
  personName: string;
  onClose: () => void;
}

export function AssignToTourSlideOver({
  open,
  personId,
  personName,
  onClose,
}: AssignToTourSlideOverProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tours, setTours] = useState<TourOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedTourId, setPickedTourId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPickedTourId(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tours', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Failed to load tours (${res.status})`);
          return;
        }
        const body = (await res.json()) as { tours?: TourOption[] } | TourOption[];
        const list = Array.isArray(body) ? body : (body.tours ?? []);
        if (!cancelled) setTours(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const sortedTours = [...tours].sort((a, b) => {
    // Active first, then planning, then completed, then archived.
    const order: Record<TourOption['status'], number> = {
      active: 0,
      planning: 1,
      completed: 2,
      archived: 3,
    };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    // Tie-break by start_date desc (most recent first within group).
    if (a.start_date && b.start_date) {
      return b.start_date.localeCompare(a.start_date);
    }
    return a.name.localeCompare(b.name);
  });

  function handleContinue() {
    if (!pickedTourId) return;
    setSubmitting(true);
    // Hand off to the Operations Personnel page with a query
    // param the manager client picks up to auto-open its
    // existing AddPersonnelSlideOver pre-selected.
    router.push(
      `/operations/${pickedTourId}/personnel?assign=${encodeURIComponent(personId)}`,
    );
    showToast(`Continuing assignment for ${personName}…`);
    onClose();
    setSubmitting(false);
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`Assign ${personName} to a tour`}
      width="default"
    >
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
          Pick a tour. We&apos;ll take you to that tour&apos;s personnel
          page with the assignment form pre-filled — set the role,
          window, and rate there.
        </p>

        {loading ? (
          <div
            className="flex items-center"
            style={{
              gap: 'var(--lp-space-2)',
              padding: 'var(--lp-space-3)',
              color: 'var(--lp-text-tertiary)',
              fontSize: 'var(--lp-text-sm)',
            }}
          >
            <Loader2 size={14} className="animate-spin" />
            Loading tours…
          </div>
        ) : error ? (
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
        ) : sortedTours.length === 0 ? (
          <div
            style={{
              padding: 'var(--lp-space-4)',
              textAlign: 'center',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-tertiary)',
              background: 'var(--lp-panel)',
              border: '1px dashed var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
            }}
          >
            No tours in this workspace yet.
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--lp-space-1)',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {sortedTours.map((t) => {
              const picked = t.id === pickedTourId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setPickedTourId(t.id)}
                    className="btn-transition flex w-full items-start"
                    style={{
                      gap: 'var(--lp-space-2)',
                      padding: 'var(--lp-space-2) var(--lp-space-3)',
                      fontSize: 'var(--lp-text-sm)',
                      color: 'var(--lp-text)',
                      textAlign: 'left',
                      background: picked
                        ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
                        : 'var(--lp-surface)',
                      border: picked
                        ? '1px solid var(--color-lp-orange)'
                        : '1px solid var(--lp-border-subtle)',
                      borderRadius: 'var(--lp-radius-md)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        className="block truncate"
                        style={{ fontWeight: 'var(--lp-weight-semibold)' }}
                      >
                        {t.name}
                      </span>
                      <span
                        className="block"
                        style={{
                          fontSize: 'var(--lp-text-xs)',
                          color: 'var(--lp-text-tertiary)',
                        }}
                      >
                        {t.artist_name ? `${t.artist_name} · ` : ''}
                        {t.status}
                        {t.start_date && t.end_date
                          ? ` · ${t.start_date} – ${t.end_date}`
                          : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
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
            onClick={handleContinue}
            disabled={!pickedTourId || submitting}
            className="btn-transition btn-primary-press inline-flex items-center"
            style={{
              gap: 6,
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: pickedTourId ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
              background: pickedTourId ? 'var(--color-lp-orange)' : 'var(--lp-surface-hover)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: pickedTourId ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Continue
          </button>
        </div>
      </div>
    </SlideOver>
  );
}
