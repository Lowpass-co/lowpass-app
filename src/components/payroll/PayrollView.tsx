'use client';

/* ============================================
   LOWPASS — <PayrollView> (Stage B host · b2 rate-lines)

   Two views:
     Rates & Summary — editable dynamic-column Rates grid (columns from the
                       workspace rate_types catalog; cells write
                       personnel_rate_lines.amount) + read-only Summary totals.
     Days matrix     — days DOWN the shared rail, people across, week-grouped.

   This component is the state hub: it owns the rate_types catalog + the rate
   line amounts, so an edit in the Rates grid (or an Add/Manage type) flows to
   the Summary and Days matrix without a reload. Fee math is fees.ts/computeTotals
   throughout (reconciles to legacy — reconcile.harness.ts).
   ============================================ */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock } from 'lucide-react';
import type { PersonnelRate } from '@/types';
import type { RateBucket, RateBasis, DayStatus } from '@/lib/payroll/fees';
import { canonicalOrderOf, CANONICAL_RATE_TYPE_IDS, type RateTypeMeta } from '@/lib/payroll/rateLines';
import { PayrollRatesSpreadsheet } from './PayrollRatesSpreadsheet';
import { PayrollDaysMatrix } from './PayrollDaysMatrix';
import { buildAmountMap, type RateLineRecord } from './rateLinesClient';
import { usePayrollGrid, type RoutingDay } from './usePayrollGrid';
import { AddPersonToTourButton } from '@/components/operations/personnel/AddPersonToTourButton';
import { PayrollExportButton } from '@/components/payroll/PayrollExportButton';
import { PageTitle } from '@/components/ui/PageHeader';

interface RateTypeRow { id: string; name: string; bucket: string; basis: string; day_statuses: string[] | null; order_index: number; }

interface PayrollViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; day_type?: string; venue_name?: string; city?: string }[];
  personnelRates: Record<string, unknown>[];
  payrollEntries: Record<string, unknown>[];
  /** b2 — the workspace rate_types catalog (global defaults + customs). */
  rateTypes?: RateTypeRow[];
  /** b2 — every person's rate line amounts for this tour. */
  rateLines?: RateLineRecord[];
  /** PAY-09 deep-link — personnel_rates.id to focus on landing (Personnel rate
   *  click → ?focus=). Expands Rates, flashes the row + matrix row, then fades. */
  focusRateId?: string | null;
  /** M1-C — the tour's payroll_finalized_at (null = editable). When set, the grids
   *  go read-only and the finalize bar shows; the server rejects writes regardless. */
  finalizedAt?: string | null;
}

/** Row → meta, CANONICAL-FILTERED (migration 261): only the flat-seven +
 *  Advance load; Weekly and custom types are retired (rows stay in the DB).
 *  Order is Adam's canonical column order, not raw order_index. */
function toCanonicalMetas(rows: RateTypeRow[]): RateTypeMeta[] {
  return rows
    .filter((r) => CANONICAL_RATE_TYPE_IDS.includes(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      bucket: r.bucket as RateBucket,
      basis: r.basis as RateBasis,
      dayStatuses: (r.day_statuses ?? []) as DayStatus[],
      orderIndex: canonicalOrderOf(r.id),
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export function PayrollView({
  tourId,
  tourName,
  currency,
  routingDates,
  personnelRates,
  payrollEntries,
  rateTypes = [],
  rateLines = [],
  focusRateId = null,
  finalizedAt = null,
}: PayrollViewProps) {
  const finalized = !!finalizedAt;
  const [rates, setRates] = useState<Record<string, unknown>[]>(personnelRates);

  // PAY-09 deep-link — land on Payroll with a person focused (Personnel rate
  // click). The Rates disclosure opens and both the rate row and the matrix row
  // flash the orange ring; seeded from the server prop at mount (the page
  // remounts per navigation), then the effect fades the ring after ~2s.
  const [ratesOpen, setRatesOpen] = useState<boolean>(!!focusRateId);
  const [flashKey, setFlashKey] = useState<string | null>(focusRateId);
  useEffect(() => {
    if (!focusRateId) return;
    const t = setTimeout(() => setFlashKey(null), 2200);
    return () => clearTimeout(t);
  }, [focusRateId]);

  // The canonical catalog + amounts are the hub's state, shared by all grids.
  const types = useMemo(() => toCanonicalMetas(rateTypes), [rateTypes]);
  const [lines, setLines] = useState<RateLineRecord[]>(rateLines);
  const amountMap = useMemo(() => buildAmountMap(lines), [lines]);

  const excludePersonIds = useMemo(
    () => rates.map((r) => r.person_id).filter((id): id is string => typeof id === 'string'),
    [rates],
  );

  const { statusOf, saveDayStatus, saveDayType, tourDayTypeOf, isExplicit, fillDays, effectiveCountsFor } = usePayrollGrid(tourId, routingDates as RoutingDay[], payrollEntries);

  // Persist one rate-line cell edit; optimistic, reverts on failure.
  const onRateLineCommit = useCallback(
    async (personnelRateId: string, rateTypeId: string, amount: number) => {
      const prev = lines;
      setLines((cur) => {
        const i = cur.findIndex((l) => l.personnel_rate_id === personnelRateId && l.rate_type_id === rateTypeId);
        if (i === -1) return [...cur, { personnel_rate_id: personnelRateId, rate_type_id: rateTypeId, amount }];
        const next = cur.slice();
        next[i] = { ...next[i], amount };
        return next;
      });
      const res = await fetch('/api/budget/rate-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel_rate_id: personnelRateId, rate_type_id: rateTypeId, amount }),
      });
      if (!res.ok) {
        setLines(prev); // revert
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : 'Save failed');
      }
    },
    [lines],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <PageTitle style={{ fontSize: 22 }}>{tourName} — Payroll</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PayrollExportButton tourId={tourId} />
          <AddPersonToTourButton
            tourId={tourId}
            excludePersonIds={excludePersonIds}
            onAdded={(result) => { if (result?.rateCard) setRates((prev) => [...prev, result.rateCard as Record<string, unknown>]); }}
          />
        </div>
      </div>

      <FinalizeBar tourId={tourId} finalizedAt={finalizedAt} />

      {/* G2-1b — the DAYS MATRIX is the work surface and dominates. Rates + Summary
          collapse to disclosures (Rates is reference while painting; Summary is
          read-only derived data), so opening Payroll shows the matrix ready to
          work with rates/summary one click away. */}
      <Disclosure
        label="Rates"
        hint={`${rates.length} ${rates.length === 1 ? 'person' : 'people'} · click to edit rates & types`}
        open={ratesOpen}
        onToggle={setRatesOpen}
      >
        <PayrollRatesSpreadsheet
          currency={currency}
          initialRates={rates as unknown as PersonnelRate[]}
          canSeeCommission={false}
          rateTypes={types}
          amountMap={amountMap}
          countsFor={effectiveCountsFor}
          onRateLineCommit={onRateLineCommit}
          highlightRowId={flashKey}
          finalized={finalized}
        />
      </Disclosure>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
        <PayrollDaysMatrix
          routingDates={routingDates}
          personnelRates={rates}
          currency={currency}
          statusOf={statusOf}
          saveDayStatus={saveDayStatus}
          saveDayType={saveDayType}
          tourDayTypeOf={tourDayTypeOf}
          isExplicit={isExplicit}
          fillDays={fillDays}
          rateTypes={types}
          amountMap={amountMap}
          effectiveCountsFor={effectiveCountsFor}
          focusRowId={flashKey}
          finalized={finalized}
        />
      </section>

    </div>
  );
}

/** M1-C — the finalize lock bar. When finalized: an amber banner + admin Unlock.
 *  When editable: a subtle "Finalize payroll" action. The server enforces the lock
 *  regardless (src/lib/payroll/finalize.ts); this is the affordance + the cue. */
function FinalizeBar({ tourId, finalizedAt }: { tourId: string; finalizedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const finalized = !!finalizedAt;

  async function act(method: 'POST' | 'DELETE') {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/payroll/finalize`, { method });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === 'string' ? j.error : 'Action failed');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (finalized) {
    const when = finalizedAt ? new Date(finalizedAt).toLocaleDateString() : '';
    return (
      <div
        className="flex flex-wrap items-center justify-between"
        style={{
          gap: 8, padding: '8px 12px', borderRadius: 'var(--lp-radius-md)',
          background: 'color-mix(in srgb, var(--color-lp-warning) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-lp-warning) 40%, transparent)',
        }}
      >
        <span className="flex items-center" style={{ gap: 6, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
          <Lock size={14} /> Finalized {when} — rates &amp; days are read-only.
        </span>
        <button type="button" disabled={busy} onClick={() => void act('DELETE')} className="btn-transition inline-flex items-center" style={{ gap: 4, padding: '4px 10px', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', background: 'transparent', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' }}>
          <Unlock size={13} /> Unlock to edit
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <button type="button" disabled={busy} onClick={() => void act('POST')} className="btn-transition inline-flex items-center" style={{ gap: 4, padding: '4px 10px', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', background: 'transparent', border: '1px solid var(--lp-border-subtle)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' }} title="Lock rates + days so they can't be edited">
        <Lock size={12} /> Finalize payroll
      </button>
    </div>
  );
}

/** Collapsed-by-default disclosure — the compact chrome for Rates / Summary so
 *  the Days matrix dominates the page (G2-1b). Native <details> for the toggle. */
function Disclosure({ label, hint, children, open, onToggle }: { label: string; hint?: string; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void }) {
  return (
    <details
      open={open}
      onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}
      style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)' }}
    >
      <summary
        style={{
          cursor: 'pointer', padding: '8px 12px', display: 'flex', alignItems: 'baseline', gap: 8,
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {label}
        {hint ? <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--lp-text-tertiary)' }}>· {hint}</span> : null}
      </summary>
      <div style={{ padding: '4px 12px 12px' }}>{children}</div>
    </details>
  );
}

