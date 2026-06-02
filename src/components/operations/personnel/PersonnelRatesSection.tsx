'use client';

/* ============================================
   LOWPASS — <PersonnelRatesSection> (Payroll Sprint §P2)

   Rates editor mounted inside PersonnelManageSlideOver. Reads
   + writes the personnel_rates row for the current (tour,
   person) via /api/tours/[id]/personnel/[memberId]/rates.

   Four fields:
     Show rate    → personnel_rates.show_rate
     Travel rate  → personnel_rates.off_rate
     Per diem     → personnel_rates.per_diem
     Internal     → personnel_rates.internal_rate (ADMIN ONLY)

   The internal-rate row only renders when the GET response
   reports is_admin=true. Non-admins never see it (the server
   also drops non-admin writes + omits the value on read —
   defence in depth).

   Currency prefix from the tour currency (budgetCurrencySymbol).
   Auto-save on blur (debounce-free; one PUT per committed
   field change). "Copy from previous tour" pulls another
   tour's rates into the inputs (editable before the next
   blur commits them).
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { budgetCurrencySymbol } from '@/lib/budget-currency';

interface RatesState {
  show_rate: string;
  off_rate: string;
  per_diem: string;
  internal_rate: string;
}

interface HistoryEntry {
  tour_id: string;
  tour_name: string;
  show_rate: number;
  off_rate: number;
  per_diem: number;
  internal_rate: number | null;
  updated_at: string;
}

interface Props {
  tourId: string;
  memberId: string;
  personId: string;
  currency: string;
}

function numToInput(n: number | null | undefined): string {
  if (n == null) return '';
  return String(n);
}

export function PersonnelRatesSection({ tourId, memberId, personId, currency }: Props) {
  const [state, setState] = useState<RatesState>({
    show_rate: '',
    off_rate: '',
    per_diem: '',
    internal_rate: '',
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const symbol = budgetCurrencySymbol(currency);

  /* Load current rates on mount / member change. */
  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount loading guard (matches LineItemDetailPanel fetchDetails precedent) */
    setLoading(true);
    setError(null);
    fetch(`/api/tours/${tourId}/personnel/${memberId}/rates`)
      .then((r) => r.json())
      .then((json: { rates?: Record<string, number | null>; is_admin?: boolean }) => {
        if (cancelled) return;
        const rt = json.rates ?? {};
        setIsAdmin(!!json.is_admin);
        setState({
          show_rate: numToInput(rt.show_rate),
          off_rate: numToInput(rt.off_rate),
          per_diem: numToInput(rt.per_diem),
          internal_rate: numToInput(rt.internal_rate),
        });
      })
      .catch(() => {
        if (!cancelled) setError('Could not load rates.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tourId, memberId]);

  /* Commit one field via PUT. Called on blur. */
  const commit = useCallback(
    async (field: keyof RatesState, raw: string) => {
      const trimmed = raw.trim();
      const value = trimmed === '' ? null : Number(trimmed);
      if (value != null && (!Number.isFinite(value) || value < 0)) {
        setError('Rates must be non-negative numbers.');
        return;
      }
      setError(null);
      try {
        const res = await fetch(`/api/tours/${tourId}/personnel/${memberId}/rates`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? 'Save failed.');
        }
      } catch {
        setError('Network error saving rate.');
      }
    },
    [tourId, memberId],
  );

  const openCopy = useCallback(async () => {
    setCopyOpen((v) => !v);
    if (history === null) {
      try {
        const res = await fetch(
          `/api/persons/${personId}/rates-history?exclude=${encodeURIComponent(tourId)}`,
        );
        const json = (await res.json()) as { history?: HistoryEntry[] };
        setHistory(json.history ?? []);
      } catch {
        setHistory([]);
      }
    }
  }, [history, personId, tourId]);

  const applyHistory = useCallback(
    (entry: HistoryEntry) => {
      setState({
        show_rate: numToInput(entry.show_rate),
        off_rate: numToInput(entry.off_rate),
        per_diem: numToInput(entry.per_diem),
        internal_rate: isAdmin ? numToInput(entry.internal_rate) : '',
      });
      setCopyOpen(false);
      /* Commit each copied field. internal_rate only when admin. */
      void commit('show_rate', numToInput(entry.show_rate));
      void commit('off_rate', numToInput(entry.off_rate));
      void commit('per_diem', numToInput(entry.per_diem));
      if (isAdmin) void commit('internal_rate', numToInput(entry.internal_rate));
    },
    [commit, isAdmin],
  );

  const rateField = (
    label: string,
    field: keyof RatesState,
    adminOnly = false,
  ) => (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-lp-text-secondary">{label}</span>
      <span className="relative inline-flex items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 text-xs text-lp-text-tertiary"
        >
          {symbol}
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={state[field]}
          onChange={(e) => setState((p) => ({ ...p, [field]: e.target.value }))}
          onBlur={() => void commit(field, state[field])}
          className="w-32 rounded-md border border-lp-border bg-lp-bg py-1.5 pl-6 pr-2 text-right text-sm tabular-nums text-lp-text outline-none focus:border-lp-orange/40"
          aria-label={`${label}${adminOnly ? ' (admin only)' : ''}`}
        />
      </span>
    </label>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
          Rates
        </h3>
        <div className="relative">
          <button
            type="button"
            onClick={openCopy}
            className="text-xs font-medium text-lp-orange hover:underline"
          >
            Copy from previous tour
          </button>
          {copyOpen ? (
            <div
              className="absolute right-0 z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border py-1 shadow-lg"
              style={{
                background: 'var(--lp-surface)',
                borderColor: 'var(--lp-border-strong)',
              }}
            >
              {history === null ? (
                <div className="px-3 py-2 text-xs text-lp-text-tertiary">Loading…</div>
              ) : history.length === 0 ? (
                <div className="px-3 py-2 text-xs text-lp-text-tertiary">
                  No previous tour rates for this person.
                </div>
              ) : (
                history.map((h) => (
                  <button
                    key={h.tour_id}
                    type="button"
                    onClick={() => applyHistory(h)}
                    className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-lp-surface-hover"
                  >
                    <span className="text-sm text-lp-text">{h.tour_name}</span>
                    <span className="text-[11px] text-lp-text-tertiary tabular-nums">
                      {symbol}
                      {h.show_rate} / {symbol}
                      {h.off_rate} / {symbol}
                      {h.per_diem} pd
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-lp-text-tertiary">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading rates…
        </div>
      ) : (
        <div className="space-y-2">
          {rateField('Show rate', 'show_rate')}
          {rateField('Travel rate', 'off_rate')}
          {rateField('Per diem', 'per_diem')}

          {isAdmin ? (
            <>
              <div
                className="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary"
              >
                <span className="h-px flex-1" style={{ background: 'var(--lp-border)' }} />
                Admin only
                <span className="h-px flex-1" style={{ background: 'var(--lp-border)' }} />
              </div>
              {rateField('Internal rate', 'internal_rate', true)}
              <p className="text-[11px] text-lp-text-tertiary">
                The Lowpass rate. Hidden from non-admin members.
              </p>
            </>
          ) : null}
        </div>
      )}

      {error ? <p className="text-xs text-lp-error">{error}</p> : null}
    </section>
  );
}
