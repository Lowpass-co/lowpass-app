'use client';

/**
 * ArtistBudgetSummary
 * ---------------------
 * Annual P&L overview for one artist — matches the "2026 Global Summary" Google Sheets view.
 *
 * Layout:
 *   ┌─ Year selector + totals header
 *   ├─ Table: Tour | Dates | Shows | Income Plan | Income Act | Exp Plan | Exp Act | Net Plan | Net Act
 *   └─ Monthly rolling P&L row
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface TourSummaryRow {
  tour_id: string;
  tour_name: string;
  start_date: string;
  end_date: string;
  status: string;
  continent: string;
  currency: string;
  income_proposed: number;
  income_actual: number;
  expenses_proposed: number;
  expenses_actual: number;
  net_proposed: number;
  net_actual: number;
  show_count: number;
}

interface Totals {
  income_proposed: number;
  income_actual: number;
  expenses_proposed: number;
  expenses_actual: number;
  net_proposed: number;
  net_actual: number;
}

interface MonthlyEntry {
  month: string; // "2026-03"
  proposed: number;
  actual: number;
}

interface ArtistSummaryData {
  tours: TourSummaryRow[];
  totals: Totals;
  monthly_rolling: MonthlyEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(x: number, symbol = '£') {
  const abs = Math.abs(x);
  const s = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000
      ? `${(abs / 1_000).toFixed(0)}K`
      : abs.toFixed(0);
  return `${x < 0 ? '-' : ''}${symbol}${s}`;
}

function fmtFull(x: number, symbol = '£') {
  return `${x < 0 ? '-' : ''}${symbol}${Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function netClass(n: number): string {
  if (n > 0) return 'text-emerald-500';
  if (n < 0) return 'text-red-500';
  return 'text-lp-text-tertiary';
}

function varClass(proposed: number, actual: number, isIncome = false): string {
  if (proposed === 0) return 'text-lp-text-tertiary';
  const pct = ((actual - proposed) / proposed) * 100;
  if (isIncome) return pct >= 0 ? 'text-emerald-500' : 'text-red-500';
  return pct <= 0 ? 'text-emerald-500' : pct <= 5 ? 'text-amber-500' : 'text-red-500';
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active' ? 'bg-emerald-500' :
    status === 'planning' ? 'bg-amber-500' :
    status === 'completed' ? 'bg-lp-text-tertiary' :
    'bg-lp-border';
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', color)} />;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const mo = (d: Date) => d.toLocaleString('en-GB', { month: 'short' });
  const yr = (d: Date) => d.getFullYear();
  if (yr(s) === yr(e)) {
    return `${mo(s)} – ${mo(e)} ${yr(e)}`;
  }
  return `${mo(s)} ${yr(s)} – ${mo(e)} ${yr(e)}`;
}

function formatMonth(m: string) {
  const d = new Date(`${m}-01`);
  return d.toLocaleString('en-GB', { month: 'short', year: '2-digit' });
}

// ─── Year Picker ──────────────────────────────────────────────────────────────

function YearPicker({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);
  return (
    <div className="flex items-center gap-1">
      {years.map(y => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={cn(
            'px-2.5 py-1 rounded text-[12px] font-medium transition-colors',
            y === year
              ? 'bg-lp-orange text-white'
              : 'text-lp-text-tertiary hover:text-lp-text hover:bg-lp-surface-hover'
          )}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  proposed,
  actual,
  isIncome = false,
  symbol = '£',
}: {
  label: string;
  proposed: number;
  actual: number;
  isIncome?: boolean;
  symbol?: string;
}) {
  const variance = actual - proposed;
  const isPositive = isIncome ? variance >= 0 : variance <= 0;

  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-r border-lp-border/40 last:border-r-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">{label}</span>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-[17px] font-bold tabular-nums text-lp-text">{fmt(actual, symbol)}</span>
        <span className="text-[11px] tabular-nums text-lp-text-tertiary">/ {fmt(proposed, symbol)}</span>
      </div>
      <div className={cn('flex items-center gap-1 text-[11px] tabular-nums font-medium', isPositive ? 'text-emerald-500' : 'text-red-500')}>
        {isPositive ? <TrendingUp className="h-3 w-3 shrink-0" /> : <TrendingDown className="h-3 w-3 shrink-0" />}
        <span>{variance >= 0 ? '+' : ''}{fmt(variance, symbol)} vs proposed</span>
      </div>
    </div>
  );
}

// ─── Tour Row ─────────────────────────────────────────────────────────────────

function TourRow({ tour, symbol }: { tour: TourSummaryRow; symbol: string }) {
  const hasData = tour.income_proposed > 0 || tour.expenses_proposed > 0;
  const netProposedClass = netClass(tour.net_proposed);
  const netActualClass = netClass(tour.net_actual);

  return (
    <Link
      href={`/budget?tour_id=${tour.tour_id}&view=overview`}
      className="grid grid-cols-[minmax(0,1.4fr)_100px_36px_90px_90px_90px_90px_90px_90px] gap-x-2 px-4 py-2.5 items-center border-b border-lp-border/40 hover:bg-lp-surface-hover cursor-pointer transition-colors text-[12px] group"
    >
      {/* Tour name + status */}
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={tour.status} />
        <span className="truncate text-lp-text font-medium group-hover:text-lp-orange transition-colors">{tour.tour_name}</span>
      </div>

      {/* Dates */}
      <span className="text-lp-text-tertiary text-[11px] whitespace-nowrap">
        {tour.start_date ? formatDateRange(tour.start_date, tour.end_date) : '—'}
      </span>

      {/* Shows */}
      <span className="text-center tabular-nums text-lp-text-secondary">{tour.show_count || '—'}</span>

      {/* Income Plan / Act */}
      <span className={cn('text-right tabular-nums', hasData ? 'text-lp-text-secondary' : 'text-lp-text-tertiary')}>
        {hasData ? fmt(tour.income_proposed, symbol) : '—'}
      </span>
      <span className={cn('text-right tabular-nums', hasData ? 'text-lp-text' : 'text-lp-text-tertiary')}>
        {hasData ? fmt(tour.income_actual, symbol) : '—'}
      </span>

      {/* Expenses Plan / Act */}
      <span className={cn('text-right tabular-nums', hasData ? 'text-lp-text-secondary' : 'text-lp-text-tertiary')}>
        {hasData ? fmt(tour.expenses_proposed, symbol) : '—'}
      </span>
      <span className={cn('text-right tabular-nums', hasData ? 'text-lp-text' : 'text-lp-text-tertiary')}>
        {hasData ? fmt(tour.expenses_actual, symbol) : '—'}
      </span>

      {/* Net P&L Plan / Act */}
      <span className={cn('text-right tabular-nums font-medium', hasData ? netProposedClass : 'text-lp-text-tertiary')}>
        {hasData ? fmt(tour.net_proposed, symbol) : '—'}
      </span>
      <span className={cn('text-right tabular-nums font-semibold', hasData ? netActualClass : 'text-lp-text-tertiary')}>
        {hasData ? fmt(tour.net_actual, symbol) : '—'}
      </span>
    </Link>
  );
}

// ─── Monthly Rolling ──────────────────────────────────────────────────────────

function MonthlyRolling({ data, symbol }: { data: MonthlyEntry[]; symbol: string }) {
  if (data.length === 0) return null;

  return (
    <div className="border-t border-lp-border/60 mt-4 pt-4">
      <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
        Monthly Net P&L
      </p>
      <div className="overflow-x-auto px-4">
        <div className="flex gap-2 pb-2">
          {data.map(m => {
            const isProfit = m.actual >= 0;
            return (
              <div key={m.month} className="flex flex-col items-center min-w-[52px]">
                <span className="text-[10px] text-lp-text-tertiary mb-1">{formatMonth(m.month)}</span>
                <div
                  className={cn(
                    'w-full rounded-sm text-center text-[10px] font-medium py-0.5 tabular-nums',
                    isProfit ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                  )}
                >
                  {fmt(m.actual, symbol)}
                </div>
                <span className="text-[9px] text-lp-text-tertiary mt-0.5">{fmt(m.proposed, symbol)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ArtistBudgetSummary({ artistId, artistName }: { artistId: string; artistName?: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<ArtistSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/budget/artist-summary?artist_id=${artistId}&year=${year}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(d => setData(d))
      .catch(e => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [artistId, year]);

  useEffect(() => { load(); }, [load]);

  const symbol = '£';

  return (
    <div className="flex flex-col min-h-0 overflow-hidden rounded-xl border border-lp-border bg-lp-surface">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-lp-border/60 bg-lp-surface/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-lp-text">
            {artistName ? `${artistName} — ` : ''}Annual Budget
          </span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-lp-text-tertiary" />}
        </div>
        <YearPicker year={year} onChange={setYear} />
      </div>

      {error && (
        <div className="px-4 py-3 text-sm text-red-500">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="flex items-stretch border-b border-lp-border/60 overflow-x-auto shrink-0">
            <SummaryCard label="Total Income" proposed={data.totals.income_proposed} actual={data.totals.income_actual} isIncome symbol={symbol} />
            <SummaryCard label="Total Expenses" proposed={data.totals.expenses_proposed} actual={data.totals.expenses_actual} symbol={symbol} />
            <SummaryCard label="Net P&L" proposed={data.totals.net_proposed} actual={data.totals.net_actual} isIncome symbol={symbol} />
            <div className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">Tours</span>
              <span className="text-[17px] font-bold text-lp-text mt-0.5">{data.tours.length}</span>
              <span className="text-[11px] text-lp-text-tertiary">{year}</span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto min-h-0">
            {/* Column headers */}
            <div className="grid grid-cols-[minmax(0,1.4fr)_100px_36px_90px_90px_90px_90px_90px_90px] gap-x-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary border-b border-lp-border/50 sticky top-0 bg-lp-surface z-10">
              <span>Tour</span>
              <span>Dates</span>
              <span className="text-center">Shows</span>
              <span className="text-right">Inc Plan</span>
              <span className="text-right">Inc Act</span>
              <span className="text-right">Exp Plan</span>
              <span className="text-right">Exp Act</span>
              <span className="text-right">P&L Plan</span>
              <span className="text-right">P&L Act</span>
            </div>

            {data.tours.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-lp-text-tertiary">
                No tours found for {year}
              </div>
            ) : (
              data.tours.map(t => <TourRow key={t.tour_id} tour={t} symbol={symbol} />)
            )}

            {/* Totals row */}
            {data.tours.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1.4fr)_100px_36px_90px_90px_90px_90px_90px_90px] gap-x-2 px-4 py-2.5 items-center border-t-2 border-lp-border text-[12px] font-semibold bg-lp-surface/70 sticky bottom-0">
                <span className="text-lp-text uppercase tracking-wide text-[10px]">Total {year}</span>
                <span />
                <span />
                <span className="text-right tabular-nums text-lp-text-secondary">{fmt(data.totals.income_proposed, symbol)}</span>
                <span className={cn('text-right tabular-nums', netClass(data.totals.income_actual))}>{fmt(data.totals.income_actual, symbol)}</span>
                <span className="text-right tabular-nums text-lp-text-secondary">{fmt(data.totals.expenses_proposed, symbol)}</span>
                <span className="text-right tabular-nums text-lp-text">{fmt(data.totals.expenses_actual, symbol)}</span>
                <span className={cn('text-right tabular-nums', netClass(data.totals.net_proposed))}>{fmt(data.totals.net_proposed, symbol)}</span>
                <span className={cn('text-right tabular-nums font-bold', netClass(data.totals.net_actual))}>{fmt(data.totals.net_actual, symbol)}</span>
              </div>
            )}

            {/* Monthly rolling */}
            <MonthlyRolling data={data.monthly_rolling} symbol={symbol} />
          </div>
        </>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 p-8 text-[12px] text-lp-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading annual summary…
        </div>
      )}
    </div>
  );
}
