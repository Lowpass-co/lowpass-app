'use client';

/* ============================================
   LOWPASS — <SwapPersonnelModal> (Personnel unification — Phase 4 + foundation fix)

   Replace a roster member with another workspace person, transferring
   their rate card + room assignments + derived budget lines (the swap API
   re-points the FKs in place — nothing rebuilds). Search the workspace
   `persons` (reusing the personnel search endpoint), pick a replacement,
   then CONFIRM IN-PANEL (a second view inside this same overlay) which
   lists exactly what moves.

   Why in-panel confirm and not <BudgetConfirmDialog>: this modal launches
   from inside a <SlideOver> (z 1210), so its own overlay sits at the
   dropdown layer (z 1300) to clear it. <BudgetConfirmDialog> is built on
   the shared <Modal> primitive (z-50) — it would render *behind* this
   overlay and be unreachable (the OPS-15/18 "swap list isn't clickable"
   dead-end: clicking a row opened a confirm nobody could see). Keeping the
   confirm in this overlay's panel removes the z-index trap entirely.
   Token-clean.
   ============================================ */

import { useEffect, useState } from 'react';
import { Search, X, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface Hit {
  id: string;
  display_name: string;
  email?: string | null;
}

export function SwapPersonnelModal({
  open,
  tourId,
  member,
  onClose,
  onSwapped,
}: {
  open: boolean;
  tourId: string;
  member: { id: string; display_name: string; person_id: string } | null;
  onClose: () => void;
  onSwapped: () => void;
}) {
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  // When set, the panel shows the confirm step for this replacement instead
  // of the search list (in-panel, so no second overlay to fight for z-order).
  const [pending, setPending] = useState<Hit | null>(null);
  const [summary, setSummary] = useState('their rate card, room assignments, and derived budget lines');

  // Debounced workspace person search (excludes the person being replaced).
  useEffect(() => {
    if (!open || !member || pending) return;
    const query = q.trim();
    let active = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q: query, exclude: member.person_id });
          const res = await fetch(
            `/api/tours/${tourId}/personnel/search?${params.toString()}`,
          );
          if (!res.ok) return;
          const body = (await res.json()) as { persons: Hit[] };
          if (active) setHits(body.persons ?? []);
        } catch {
          /* ignore — search is best-effort */
        }
      })();
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, open, tourId, member, pending]);

  if (!open || !member) return null;

  // Step 1 → 2: fetch exactly what will transfer, then show the confirm view.
  const pick = (hit: Hit) => {
    setPending(hit);
    setSummary('their rate card, room assignments, and derived budget lines');
    void (async () => {
      try {
        // Removal-preview GET lives on the member route itself.
        const res = await fetch(`/api/tours/${tourId}/personnel/${member.id}`);
        if (res.ok) {
          const p = (await res.json()) as {
            rateCards?: number;
            roomAssignments?: number;
            budgetLines?: number;
          };
          const bits: string[] = [];
          if ((p.rateCards ?? 0) > 0) bits.push('their rate card');
          if ((p.roomAssignments ?? 0) > 0)
            bits.push(`${p.roomAssignments} room assignment${p.roomAssignments === 1 ? '' : 's'}`);
          if ((p.budgetLines ?? 0) > 0)
            bits.push(`${p.budgetLines} derived budget line${p.budgetLines === 1 ? '' : 's'}`);
          if (bits.length > 0) setSummary(bits.join(', '));
        }
      } catch {
        /* keep the generic summary */
      }
    })();
  };

  const doSwap = async (hit: Hit) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tours/${tourId}/personnel/${member.id}/swap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_person_id: hit.id }),
        },
      );
      const b = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(b?.error ?? `Swap failed (${res.status})`);
      showToast(`Swapped in ${hit.display_name}.`);
      onSwapped();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Swap failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center p-4 pt-24"
      style={{ background: 'color-mix(in srgb, #000 40%, transparent)', zIndex: 'var(--lp-z-dropdown)' }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-3 rounded-xl border p-4 shadow-lg"
        style={{
          borderColor: 'var(--lp-border)',
          background: 'var(--lp-surface)',
          maxHeight: '70vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3
            style={{
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-base)',
              fontWeight: 'var(--lp-weight-semibold)',
            }}
          >
            {pending ? `Swap in ${pending.display_name}` : `Swap ${member.display_name}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-transition rounded-md p-1"
            style={{ color: 'var(--lp-text-tertiary)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {pending ? (
          /* Step 2 — in-panel confirm. */
          <div className="flex flex-col gap-4">
            <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', lineHeight: 1.5 }}>
              Replace <strong style={{ color: 'var(--lp-text)' }}>{member.display_name}</strong> with{' '}
              <strong style={{ color: 'var(--lp-text)' }}>{pending.display_name}</strong> on this tour. {summary}{' '}
              transfer to {pending.display_name}; {member.display_name} leaves the roster. Nothing is rebuilt.
            </p>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="btn-transition inline-flex items-center gap-1 rounded-md border px-3 py-2"
                style={{
                  borderColor: 'var(--lp-border)',
                  background: 'var(--lp-surface)',
                  color: 'var(--lp-text-secondary)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-medium)',
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doSwap(pending)}
                className="btn-transition rounded-md px-4 py-2"
                style={{
                  background: 'var(--color-lp-orange)',
                  color: 'var(--lp-text-inverse)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                }}
              >
                {busy ? 'Swapping…' : 'Swap'}
              </button>
            </div>
          </div>
        ) : (
          /* Step 1 — search + pick. */
          <>
            <div
              className="flex items-center gap-2 rounded-md border px-2 py-1"
              style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)' }}
            >
              <Search className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
              <input
                type="search"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search workspace people…"
                className="w-full bg-transparent outline-none"
                style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}
                aria-label="Search people to swap in"
              />
            </div>

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {hits.length === 0 ? (
                <li className="px-2 py-4 text-center" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
                  {q.trim() ? 'No matches.' : 'Type to search the workspace people.'}
                </li>
              ) : (
                hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pick(hit)}
                      className="btn-transition flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-lp-bg"
                      style={{ color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)' }}
                    >
                      <span className="truncate">{hit.display_name}</span>
                      {hit.email ? (
                        <span className="truncate" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
                          {hit.email}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
