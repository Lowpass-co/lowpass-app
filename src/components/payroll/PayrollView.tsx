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
import { ChevronDown, Lock, Unlock } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { PersonnelRate } from '@/types';
import type { RateBucket, RateBasis, DayStatus } from '@/lib/payroll/fees';
import { canonicalOrderOf, CANONICAL_RATE_TYPE_IDS, type RateTypeMeta } from '@/lib/payroll/rateLines';
import { PayrollRatesSpreadsheet } from './PayrollRatesSpreadsheet';
import { PayrollDaysMatrix } from './PayrollDaysMatrix';
import { buildAmountMap, oneOffTotals, personTotals, type RateLineRecord } from './rateLinesClient';
import { usePayrollGrid, type RoutingDay } from './usePayrollGrid';
import { AddPersonToTourButton } from '@/components/operations/personnel/AddPersonToTourButton';
import { PayrollExportButton } from '@/components/payroll/PayrollExportButton';
import { PageTitle } from '@/components/ui/PageHeader';
import './payroll.css';

interface RateTypeRow { id: string; name: string; bucket: string; basis: string; day_statuses: string[] | null; order_index: number; }

interface PayrollViewProps {
  tourId: string;
  /** No longer shown — the top bar names the tour. Kept so callers needn't change. */
  tourName?: string;
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
  // click). The Summary (open by default) and the week rows
  // flash the orange ring; seeded from the server prop at mount (the page
  // remounts per navigation), then the effect fades the ring after ~2s.
  const [ratesOpen, setRatesOpen] = useState<boolean>(true);
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

  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'GBP').trim().toUpperCase(), maximumFractionDigits: 0 }),
    [currency],
  );

  // Tour totals — the same fees.ts engine and EFFECTIVE day counts as the
  // Summary's Total fee / Total PD columns, so the three figures always add up
  // to the Summary. One-offs (advances, flat tour fees) are in the fee total
  // but not in any week, so say how much of it they are.
  const totals = useMemo(() => {
    let fee = 0, pd = 0, oneOff = 0;
    for (const r of rates) {
      const id = r.id as string;
      const counts = effectiveCountsFor(id);
      const t = personTotals(amountMap, id, types, counts);
      fee += t.totalFee;
      pd += t.totalPerDiem;
      oneOff += oneOffTotals(amountMap, id, types, counts).fee;
    }
    return { fee, pd, total: fee + pd, oneOff };
  }, [rates, effectiveCountsFor, amountMap, types]);
  const tourDays = useMemo(() => new Set(routingDates.map((d) => d.date?.slice(0, 10)).filter(Boolean)).size, [routingDates]);

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
    <div className="pay-page">
      <header className="pay-head">
        <div>
          <PageTitle>Payroll</PageTitle>
          <p className="pay-sub">
            <b>{rates.length}</b> {rates.length === 1 ? 'person' : 'people'} · <b>{tourDays}</b> tour {tourDays === 1 ? 'day' : 'days'}
          </p>
        </div>
        <div className="pay-actions">
          {finalized ? null : <FinalizeButton tourId={tourId} />}
          <PayrollExportButton tourId={tourId} />
          <AddPersonToTourButton
            tourId={tourId}
            excludePersonIds={excludePersonIds}
            onAdded={(result) => { if (result?.rateCard) setRates((prev) => [...prev, result.rateCard as Record<string, unknown>]); }}
          />
        </div>
      </header>

      {finalized ? <FinalizedBanner tourId={tourId} finalizedAt={finalizedAt} /> : null}

      <div className="pay-stats" role="group" aria-label="Tour payroll totals">
        <div className="pay-stat">
          <span className="pay-stat-label">Fees</span>
          <span className="pay-stat-value">{money.format(totals.fee)}</span>
          {totals.oneOff > 0 ? <span className="pay-stat-note">incl. {money.format(totals.oneOff)} advances &amp; flat fees</span> : null}
        </div>
        <div className="pay-stat">
          <span className="pay-stat-label">Per diems</span>
          <span className="pay-stat-value">{money.format(totals.pd)}</span>
        </div>
        <div className="pay-stat" data-total="true">
          <span className="pay-stat-label">Total payroll</span>
          <span className="pay-stat-value">{money.format(totals.total)}</span>
        </div>
      </div>

      {/* Oct 2026 — Adam's SUMMARY tab: everyone's rates, show / off-travel
          days and totals, OPEN at the top. Rates are typed straight in; the
          weeks below are where days are set. */}
      <Disclosure
        label="Summary"
        hint="Rates, days and totals for everyone — type rates straight in"
        open={ratesOpen}
        onToggle={setRatesOpen}
      >
        <div className="lp-sheet-summary pay-summary-body">
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
        </div>
      </Disclosure>

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
        oneOffFee={totals.oneOff}
        focusRowId={flashKey}
        finalized={finalized}
      />
    </div>
  );
}

/** M1-C — finalize / unlock. The server enforces the lock regardless
 *  (src/lib/payroll/finalize.ts); these are the affordance and the cue. */
function useFinalizeAction(tourId: string) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  async function act(method: 'POST' | 'DELETE') {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/payroll/finalize`, { method });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(typeof j.error === 'string' ? j.error : 'That didn’t work — try again.', 'error');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return { busy, act };
}

function FinalizeButton({ tourId }: { tourId: string }) {
  const { busy, act } = useFinalizeAction(tourId);
  return (
    <button type="button" className="pay-btn pay-btn-ghost" disabled={busy} onClick={() => void act('POST')} title="Lock rates and days so they can’t be edited">
      <Lock size={14} aria-hidden /> Finalize
    </button>
  );
}

function FinalizedBanner({ tourId, finalizedAt }: { tourId: string; finalizedAt: string | null }) {
  const { busy, act } = useFinalizeAction(tourId);
  const when = finalizedAt ? new Date(finalizedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  return (
    <div className="pay-banner" role="status">
      <span><Lock size={14} aria-hidden /> Finalized {when}. Rates and days are read-only.</span>
      <button type="button" className="pay-btn pay-btn-sm" disabled={busy} onClick={() => void act('DELETE')}>
        <Unlock size={13} aria-hidden /> Unlock to edit
      </button>
    </div>
  );
}

/** The Summary card — native <details> so it collapses without JS state. */
function Disclosure({ label, hint, children, open, onToggle }: { label: string; hint?: string; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void }) {
  return (
    <details
      className="pay-card"
      open={open}
      onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary className="pay-card-head" style={{ justifyContent: 'flex-start' }}>
        <ChevronDown size={16} className="pay-chev" aria-hidden />
        <span className="pay-card-title">{label}</span>
        {hint ? <span className="pay-card-hint">{hint}</span> : null}
      </summary>
      {children}
    </details>
  );
}
