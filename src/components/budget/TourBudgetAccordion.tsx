'use client';

/**
 * TourBudgetAccordion
 * ---------------------
 * Single-page accordion budget view — replaces the 10-tab layout.
 *
 * Structure:
 *   ┌─ P&L Header (Income | Expenses | Net — proposed vs actual)
 *   └─ Accordion sections:
 *        Income | Salaries | Per Diem | Hotels | Flights |
 *        Transport | Production | Commissions | Insurance | Contingency
 *
 * Collapsed row → shows totals from /api/budget/summary.
 * Expanded row  → lazy-loads detail from specific API endpoints.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, Plus, Trash2, Loader2, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SummaryLine {
  label: string;
  proposed: number;
  actual: number;
  variancePct: number | null;
  varianceDisplay: string;
}
interface SummarySection {
  title: string;
  lines: SummaryLine[];
  subtotal?: SummaryLine;
}
interface SummaryData {
  sections: SummarySection[];
  dayCount: { showDays: number; offDays: number; rehearsalDays: number; totalDays: number };
}
interface LineItem {
  id: string;
  category: string;
  label: string;
  quantity: number;
  proposed_cost: number;
  actual_cost: number;
  notes: string | null;
  order_index: number;
}
interface Personnel {
  id: string;
  person_name: string;
  role: string | null;
  person_type: string;
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  per_diem: number;
  advance_fee: number;
}
interface Commission {
  id: string;
  label: string;
  percentage: number;
  basis: string;
  notes: string | null;
}
interface IncomeRow {
  id: string;
  routing_id: string;
  pre_tax_guarantee: number;
  post_tax_guarantee: number;
  withholding_pct: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
  routing?: { date: string; venue_name: string; city: string; day_type: string };
}
interface FlightBooking {
  id: string;
  routing_id: string | null;
  passenger_name: string;
  origin: string;
  destination: string;
  proposed_cost: number;
  actual_cost: number;
  notes: string | null;
  routing?: { date: string; city: string };
}
interface BudgetSettings {
  insurance_pct: number;
  contingency_pct: number;
  accountancy_pct: number;
  currency_home: string;
}
interface PayrollEntry {
  id: string;
  personnel_id: string;
  week_start: string;
  total_fee: number;
  total_per_diem: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const n = (x: number | null | undefined) => (x == null ? 0 : Number(x) || 0);

function fmt(x: number, symbol = '£') {
  return `${symbol}${x.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtFull(x: number, symbol = '£') {
  return `${symbol}${x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function variancePct(proposed: number, actual: number) {
  if (proposed === 0) return null;
  return ((actual - proposed) / proposed) * 100;
}
function varianceDisplay(proposed: number, actual: number, isIncome = false) {
  const pct = variancePct(proposed, actual);
  if (pct === null) return '—';
  const formatted = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return formatted;
}
function varianceClass(proposed: number, actual: number, isIncome = false): string {
  const pct = variancePct(proposed, actual);
  if (pct === null) return 'text-lp-text-tertiary';
  if (isIncome) {
    return pct >= 0 ? 'text-emerald-500' : 'text-red-500';
  }
  // For expenses: over budget = red, under = green
  return pct <= 0 ? 'text-emerald-500' : pct <= 5 ? 'text-amber-500' : 'text-red-500';
}

/** Fixed-width number columns so the grid does not reflow when sections open/close. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_4rem] gap-x-3 items-center';
const GRID_SM = 'grid grid-cols-[minmax(0,1fr)_5.25rem_5.25rem_3.25rem] gap-x-2 items-center';

// ─── Column Header ────────────────────────────────────────────────────────────

function ColHeader({ extra = '' }: { extra?: string }) {
  return (
    <div className={cn(GRID, 'px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary border-b border-lp-border/60', extra)}>
      <span>Item</span>
      <span className="text-right">Proposed</span>
      <span className="text-right">Actual</span>
      <span className="text-right">Variance</span>
    </div>
  );
}

// ─── Generic editable line-item row ──────────────────────────────────────────

function LineRow({
  item,
  symbol,
  isIncome = false,
  onSave,
  onDelete,
  saving,
}: {
  item: LineItem;
  symbol: string;
  isIncome?: boolean;
  onSave: (id: string, proposed: number, actual: number, label?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [proposed, setProposed] = useState(String(item.proposed_cost));
  const [actual, setActual] = useState(String(item.actual_cost));
  const [label, setLabel] = useState(item.label);
  const [pendingSave, setPendingSave] = useState(false);

  const save = async () => {
    setPendingSave(true);
    await onSave(item.id, parseFloat(proposed) || 0, parseFloat(actual) || 0, label);
    setPendingSave(false);
    setEditing(false);
  };

  const cancel = () => {
    setProposed(String(item.proposed_cost));
    setActual(String(item.actual_cost));
    setLabel(item.label);
    setEditing(false);
  };

  const proposed_n = parseFloat(proposed) || 0;
  const actual_n = parseFloat(actual) || 0;

  if (editing) {
    return (
      <div className={cn(GRID, 'px-4 py-1.5 text-[12px] border-b border-lp-border/30 bg-lp-surface-hover')}>
        <input
          autoFocus
          className="w-full min-w-0 bg-lp-surface border border-lp-border rounded px-1.5 py-0.5 text-lp-text text-[12px] focus:outline-none focus:border-lp-orange"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        />
        <input
          className="w-full text-right bg-lp-surface border border-lp-border rounded px-1.5 py-0.5 text-lp-text text-[12px] tabular-nums focus:outline-none focus:border-lp-orange"
          value={proposed}
          onChange={e => setProposed(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          type="number"
          min="0"
        />
        <input
          className="w-full text-right bg-lp-surface border border-lp-border rounded px-1.5 py-0.5 text-lp-text text-[12px] tabular-nums focus:outline-none focus:border-lp-orange"
          value={actual}
          onChange={e => setActual(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          type="number"
          min="0"
        />
        <div className="flex justify-end gap-1">
          <button onClick={save} disabled={pendingSave} className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50">
            {pendingSave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={cancel} className="text-lp-text-tertiary hover:text-lp-text">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(GRID, 'group px-4 py-1.5 text-[12px] border-b border-lp-border/30 hover:bg-lp-surface-hover cursor-pointer')}
      onClick={() => setEditing(true)}
    >
      <span className="truncate text-lp-text">{item.label}</span>
      <span className="text-right tabular-nums text-lp-text-secondary">{fmtFull(n(item.proposed_cost), symbol)}</span>
      <span className="text-right tabular-nums text-lp-text">{fmtFull(n(item.actual_cost), symbol)}</span>
      <div className="flex items-center justify-end gap-1">
        <span className={cn('text-right tabular-nums text-[11px]', varianceClass(n(item.proposed_cost), n(item.actual_cost), isIncome))}>
          {varianceDisplay(n(item.proposed_cost), n(item.actual_cost), isIncome)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(item.id); }}
          disabled={saving}
          className="ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-500"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Add-row form ─────────────────────────────────────────────────────────────

function AddRow({
  categories,
  defaultCategory,
  symbol,
  onAdd,
  onCancel,
}: {
  categories: { value: string; label: string }[];
  defaultCategory: string;
  symbol: string;
  onAdd: (category: string, label: string, proposed: number, actual: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(defaultCategory);
  const [label, setLabel] = useState('');
  const [proposed, setProposed] = useState('');
  const [actual, setActual] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!label.trim()) return;
    setSaving(true);
    await onAdd(category, label.trim(), parseFloat(proposed) || 0, parseFloat(actual) || 0);
    setSaving(false);
  };

  return (
    <div className="border-b border-lp-border/30 bg-lp-surface/50">
      {categories.length > 1 && (
        <div className="px-4 pt-2">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-lp-surface border border-lp-border rounded px-2 py-1 text-[11px] text-lp-text focus:outline-none focus:border-lp-orange"
          >
            {categories.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className={cn(GRID, 'px-4 py-1.5')}>
        <input
          autoFocus
          placeholder="Description…"
          className="w-full min-w-0 bg-lp-surface border border-lp-border rounded px-1.5 py-0.5 text-[12px] text-lp-text placeholder-lp-text-tertiary focus:outline-none focus:border-lp-orange"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        />
        <input
          placeholder="0"
          type="number"
          min="0"
          className="w-full text-right bg-lp-surface border border-lp-border rounded px-1.5 py-0.5 text-[12px] text-lp-text tabular-nums placeholder-lp-text-tertiary focus:outline-none focus:border-lp-orange"
          value={proposed}
          onChange={e => setProposed(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        />
        <input
          placeholder="0"
          type="number"
          min="0"
          className="w-full text-right bg-lp-surface border border-lp-border rounded px-1.5 py-0.5 text-[12px] text-lp-text tabular-nums placeholder-lp-text-tertiary focus:outline-none focus:border-lp-orange"
          value={actual}
          onChange={e => setActual(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        />
        <div className="flex justify-end gap-1">
          <button onClick={submit} disabled={saving || !label.trim()} className="text-emerald-500 hover:text-emerald-400 disabled:opacity-40">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onCancel} className="text-lp-text-tertiary hover:text-lp-text"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Accordion Shell ──────────────────────────────────────────────────────────

function AccordionSection({
  title,
  proposed,
  actual,
  isIncome = false,
  icon,
  open,
  onToggle,
  loading,
  children,
}: {
  title: string;
  proposed: number;
  actual: number;
  isIncome?: boolean;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  const [feedbackKey, setFeedbackKey] = useState(0);
  const variance = variancePct(proposed, actual);
  const varStr = varianceDisplay(proposed, actual, isIncome);
  const varCls = varianceClass(proposed, actual, isIncome);
  const plClass = isIncome
    ? (actual > 0 ? 'text-emerald-500' : 'text-lp-text')
    : (actual > proposed ? 'text-red-500' : actual > 0 ? 'text-lp-text' : 'text-lp-text-tertiary');

  const handleToggle = () => {
    setFeedbackKey((k) => k + 1);
    onToggle();
  };

  return (
    <div className="relative mb-2 overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-sm">
      {feedbackKey > 0 ? (
        <div
          key={feedbackKey}
          className="lp-accordion-feedback pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          aria-hidden
          onAnimationEnd={() => setFeedbackKey(0)}
        />
      ) : null}
      <button
        type="button"
        className={cn(
          GRID,
          'relative z-[2] w-full px-4 py-3 text-left',
          open ? 'bg-lp-bg-tertiary/40' : 'bg-lp-surface hover:bg-lp-bg-tertiary/25'
        )}
        onClick={handleToggle}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-lp-text-tertiary transition-none', open && 'rotate-180')}
            aria-hidden
          />
          {icon && <span className="shrink-0 text-lp-text-tertiary opacity-80">{icon}</span>}
          <span className="truncate text-[13px] font-semibold tracking-tight text-lp-text">{title}</span>
        </div>
        <span className="text-right text-[12px] tabular-nums text-lp-text-secondary">{fmt(proposed)}</span>
        <span className={cn('text-right text-[12px] tabular-nums font-semibold', plClass)}>{fmt(actual)}</span>
        <div className="flex items-center justify-end gap-1.5">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-lp-text-tertiary" />}
          <span className={cn('text-[11px] tabular-nums font-medium', varCls)}>{varStr}</span>
        </div>
      </button>

      {open ? (
        <div className="relative z-[2] border-t border-lp-border bg-lp-bg/30">{children}</div>
      ) : null}
    </div>
  );
}

// ─── Line Items Section (Hotels / Transport / Production) ─────────────────────

const TRANSPORT_CATS = [
  { value: 'transport_bus', label: 'Bus' },
  { value: 'transport_taxis', label: 'Taxis' },
  { value: 'transport_fuel', label: 'Fuel' },
  { value: 'transport_parking', label: 'Parking' },
  { value: 'transport_misc', label: 'Misc' },
  { value: 'transport_agent', label: 'Agent' },
];
const PRODUCTION_CATS = [
  { value: 'prod_audio', label: 'Audio & Backline' },
  { value: 'prod_lighting', label: 'Lighting' },
  { value: 'prod_freight', label: 'Freight' },
  { value: 'prod_equipment', label: 'Equipment' },
  { value: 'prod_programming', label: 'Programming' },
  { value: 'prod_set_wardrobe', label: 'Set & Wardrobe' },
  { value: 'prod_misc', label: 'Misc' },
];
const HOTELS_CAT = [{ value: 'hotels', label: 'Hotels' }];

function LineItemsAccordionBody({
  tourId,
  categoryPrefix,
  categories,
  symbol,
}: {
  tourId: string;
  categoryPrefix: string;
  categories: { value: string; label: string }[];
  symbol: string;
}) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/budget/line-items?tour_id=${tourId}`)
      .then(r => r.ok ? r.json() : { line_items: [] })
      .then(d => {
        const all: LineItem[] = d.line_items ?? [];
        setItems(all.filter(i => i.category.startsWith(categoryPrefix)));
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId, categoryPrefix]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (id: string, proposed: number, actual: number, label?: string) => {
    setSaving(true);
    await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, proposed_cost: proposed, actual_cost: actual, ...(label !== undefined && { label }) }),
    });
    setSaving(false);
    load();
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    await fetch('/api/budget/line-items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSaving(false);
    load();
  };

  const handleAdd = async (category: string, label: string, proposed: number, actual: number) => {
    await fetch('/api/budget/line-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, category, label, quantity: 1, proposed_cost: proposed, actual_cost: actual }),
    });
    setAdding(false);
    load();
  };

  if (loading) return (
    <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-lp-text-tertiary">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  );
  if (error) return <div className="px-4 py-3 text-[12px] text-red-500">{error}</div>;

  // Group by sub-category
  const grouped = categories.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0 || categories.length === 1);

  const defaultCat = categories[0]?.value ?? '';

  return (
    <div>
      <ColHeader />
      {categories.length > 1 ? (
        grouped.map(group => (
          <div key={group.value}>
            <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary bg-lp-surface/60 border-b border-lp-border/30">
              {group.label}
            </div>
            {group.items.map(item => (
              <LineRow key={item.id} item={item} symbol={symbol} onSave={handleSave} onDelete={handleDelete} saving={saving} />
            ))}
          </div>
        ))
      ) : (
        items.map(item => (
          <LineRow key={item.id} item={item} symbol={symbol} onSave={handleSave} onDelete={handleDelete} saving={saving} />
        ))
      )}
      {items.length === 0 && !adding && (
        <div className="px-4 py-2 text-[11px] text-lp-text-tertiary italic">No items yet</div>
      )}
      {adding ? (
        <AddRow categories={categories} defaultCategory={defaultCat} symbol={symbol} onAdd={handleAdd} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-[11px] text-lp-text-tertiary hover:text-lp-orange"
        >
          <Plus className="h-3.5 w-3.5" /> Add line item
        </button>
      )}
    </div>
  );
}

// ─── Flights Section ──────────────────────────────────────────────────────────

function FlightsAccordionBody({ tourId, symbol }: { tourId: string; symbol: string }) {
  const [flights, setFlights] = useState<FlightBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/budget/flights?tour_id=${tourId}`)
      .then(r => r.ok ? r.json() : { flights: [] })
      .then((d: { flights?: FlightBooking[] }) => setFlights(d.flights ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tourId]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async (id: string, proposed: number, actual: number) => {
    setSaving(true);
    await fetch('/api/budget/flights', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, proposed_cost: proposed, actual_cost: actual }),
    });
    setSaving(false);
    load();
  };

  if (loading) return <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-lp-text-tertiary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;

  return (
    <div>
      <div className={cn(GRID, 'px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary border-b border-lp-border/60')}>
        <span>Route / Passenger</span>
        <span className="text-right">Proposed</span>
        <span className="text-right">Actual</span>
        <span className="text-right">Variance</span>
      </div>
      {flights.map(f => {
        const label = f.origin && f.destination
          ? `${f.passenger_name} — ${f.origin} → ${f.destination}`
          : f.passenger_name;
        const fakeItem: LineItem = { id: f.id, category: 'flights', label, quantity: 1, proposed_cost: f.proposed_cost, actual_cost: f.actual_cost, notes: f.notes, order_index: 0 };
        return (
          <LineRow
            key={f.id}
            item={fakeItem}
            symbol={symbol}
            onSave={async (id, proposed, actual) => handleSave(id, proposed, actual)}
            onDelete={async () => {}}
            saving={saving}
          />
        );
      })}
      {flights.length === 0 && (
        <div className="px-4 py-2 text-[11px] text-lp-text-tertiary italic">No flights booked. Use the Flights tab for detailed booking management.</div>
      )}
    </div>
  );
}

// ─── Income Section ───────────────────────────────────────────────────────────

function IncomeAccordionBody({ tourId, symbol }: { tourId: string; symbol: string }) {
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/budget/income?tour_id=${tourId}`)
      .then(r => r.ok ? r.json() : { income: [] })
      .then((d: { income?: IncomeRow[] }) => setRows(d.income ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tourId]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async (id: string, field: string, value: number) => {
    setSaving(id);
    await fetch('/api/budget/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    });
    setSaving(null);
    load();
  };

  if (loading) return <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-lp-text-tertiary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;

  if (rows.length === 0) {
    return <div className="px-4 py-3 text-[11px] text-lp-text-tertiary italic">No income data. Set up routing first, then add guarantees in the Routing & Income tab.</div>;
  }

  // Aggregate into summary lines: Guarantees, Merch, VIP
  const totalProposedGuarantee = rows.reduce((s, r) => s + n(r.post_tax_guarantee), 0);
  const totalActualGuarantee = rows.reduce((s, r) => s + n(r.actual_guarantee) + n(r.actual_overage), 0);
  const totalProposedMerch = rows.reduce((s, r) => s + n(r.merch_income), 0);
  const totalActualMerch = rows.reduce((s, r) => s + n(r.actual_merch), 0);
  const totalProposedVip = rows.reduce((s, r) => s + n(r.vip_income), 0);
  const totalActualVip = rows.reduce((s, r) => s + n(r.actual_vip), 0);

  const summaryLines = [
    { label: 'Guarantees (Post-Tax)', proposed: totalProposedGuarantee, actual: totalActualGuarantee },
    { label: 'Merchandise', proposed: totalProposedMerch, actual: totalActualMerch },
    { label: 'VIP / Premium', proposed: totalProposedVip, actual: totalActualVip },
  ];

  return (
    <div>
      <ColHeader />
      {summaryLines.map((line, i) => (
        <div key={i} className={cn(GRID, 'px-4 py-2 text-[12px] border-b border-lp-border/30')}>
          <span className="text-lp-text">{line.label}</span>
          <span className="text-right tabular-nums text-lp-text-secondary">{fmtFull(line.proposed, symbol)}</span>
          <span className="text-right tabular-nums text-lp-text">{fmtFull(line.actual, symbol)}</span>
          <span className={cn('text-right tabular-nums text-[11px]', varianceClass(line.proposed, line.actual, true))}>
            {varianceDisplay(line.proposed, line.actual, true)}
          </span>
        </div>
      ))}
      <div className="border-t border-lp-border/40 px-4 py-2 text-[10px] italic text-lp-text-tertiary">
        {rows.length} show{rows.length !== 1 ? 's' : ''} — edit per-show income in the Routing & Income tab
      </div>
    </div>
  );
}

// ─── Salaries Section ─────────────────────────────────────────────────────────

function SalariesAccordionBody({
  tourId,
  symbol,
  dayCount,
}: {
  tourId: string;
  symbol: string;
  dayCount: SummaryData['dayCount'];
}) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/budget/personnel-rates?tour_id=${tourId}`).then(r => r.ok ? r.json() : { personnel: [] }),
      fetch(`/api/budget/payroll?tour_id=${tourId}`).then(r => r.ok ? r.json() : { entries: [] }),
    ]).then(([pData, prData]: [{ personnel?: Personnel[] }, { entries?: PayrollEntry[] }]) => {
      setPersonnel(pData.personnel ?? []);
      setPayroll(prData.entries ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [tourId]);

  if (loading) return <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-lp-text-tertiary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;

  const { showDays, offDays, rehearsalDays, totalDays } = dayCount;

  // Calculate proposed salary per person
  const personRows = personnel.map(p => {
    let proposedSalary: number;
    if (p.rate_type === 'split_rate') {
      proposedSalary = showDays * n(p.show_rate) + offDays * n(p.off_rate) + rehearsalDays * n(p.rehearsal_rate) + n(p.advance_fee);
    } else {
      proposedSalary = totalDays * n(p.off_rate) + n(p.advance_fee);
    }
    const proposedPerDiem = totalDays * n(p.per_diem);
    // Actual from payroll
    const personPayroll = payroll.filter(e => e.personnel_id === p.id);
    const actualSalary = personPayroll.reduce((s, e) => s + n(e.total_fee), 0);
    const actualPerDiem = personPayroll.reduce((s, e) => s + n(e.total_per_diem), 0);
    return { ...p, proposedSalary, proposedPerDiem, actualSalary, actualPerDiem };
  });

  if (personRows.length === 0) {
    return <div className="px-4 py-3 text-[11px] text-lp-text-tertiary italic">No personnel set up. Add crew and band members in the Personnel section.</div>;
  }

  return (
    <div>
      <div className={cn('grid grid-cols-[minmax(0,1fr)_80px_80px_80px_80px_60px] gap-x-2 border-b border-lp-border/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary')}>
        <span>Name / Role</span>
        <span className="text-right">Prop. Salary</span>
        <span className="text-right">Act. Salary</span>
        <span className="text-right">Prop. P/D</span>
        <span className="text-right">Act. P/D</span>
        <span className="text-right">Var.</span>
      </div>
      {personRows.map(p => {
        const totalProposed = p.proposedSalary + p.proposedPerDiem;
        const totalActual = p.actualSalary + p.actualPerDiem;
        return (
          <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px_80px_60px] gap-x-2 border-b border-lp-border/30 px-4 py-2 text-[12px] hover:bg-lp-surface-hover items-center">
            <div className="min-w-0">
              <div className="truncate text-lp-text">{p.person_name}</div>
              <div className="text-[10px] text-lp-text-tertiary">{p.role ?? p.person_type}</div>
            </div>
            <span className="text-right tabular-nums text-lp-text-secondary">{fmt(p.proposedSalary, symbol)}</span>
            <span className="text-right tabular-nums text-lp-text">{fmt(p.actualSalary, symbol)}</span>
            <span className="text-right tabular-nums text-lp-text-secondary">{fmt(p.proposedPerDiem, symbol)}</span>
            <span className="text-right tabular-nums text-lp-text">{fmt(p.actualPerDiem, symbol)}</span>
            <span className={cn('text-right tabular-nums text-[11px]', varianceClass(totalProposed, totalActual))}>
              {varianceDisplay(totalProposed, totalActual)}
            </span>
          </div>
        );
      })}
      <div className="border-t border-lp-border/40 px-4 py-2 text-[10px] italic text-lp-text-tertiary">
        Edit rates & per diems in the Salary & Per Diems tab · {totalDays} tour day{totalDays !== 1 ? 's' : ''} ({showDays} show, {offDays} off, {rehearsalDays} rehearsal)
      </div>
    </div>
  );
}

// ─── Commissions Section ──────────────────────────────────────────────────────

function CommissionsAccordionBody({ tourId, symbol, totalIncome }: { tourId: string; symbol: string; totalIncome: number }) {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/budget/commissions?tour_id=${tourId}`)
      .then(r => r.ok ? r.json() : { commissions: [] })
      .then((d: { commissions?: Commission[] }) => setCommissions(d.commissions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tourId]);

  if (loading) return <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-lp-text-tertiary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;

  if (commissions.length === 0) {
    return <div className="px-4 py-3 text-[11px] text-lp-text-tertiary italic">No commissions configured. Add them in the Commissions tab.</div>;
  }

  return (
    <div>
      <div className={cn('grid grid-cols-[minmax(0,1fr)_60px_100px_100px_80px] gap-x-2 border-b border-lp-border/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary')}>
        <span>Recipient</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Basis</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Var.</span>
      </div>
      {commissions.map(c => {
        const amount = n(c.percentage) * totalIncome;
        return (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_60px_100px_100px_80px] gap-x-2 border-b border-lp-border/30 px-4 py-2 text-[12px] items-center">
            <span className="truncate text-lp-text">{c.label}</span>
            <span className="text-right tabular-nums text-lp-text-secondary">{(n(c.percentage) * 100).toFixed(1)}%</span>
            <span className="text-right tabular-nums text-[11px] text-lp-text-tertiary capitalize">{c.basis.replace('_', ' ')}</span>
            <span className="text-right tabular-nums text-lp-text">{fmt(amount, symbol)}</span>
            <span className="text-right text-[11px] text-lp-text-tertiary">—</span>
          </div>
        );
      })}
      <div className="border-t border-lp-border/40 px-4 py-2 text-[10px] italic text-lp-text-tertiary">
        Edit commissions in the Commissions tab
      </div>
    </div>
  );
}

// ─── Percentage Section (Insurance / Contingency) ─────────────────────────────

function PctAccordionBody({
  label,
  pct,
  basis,
  proposed,
  actual,
  symbol,
}: {
  label: string;
  pct: number;
  basis: string;
  proposed: number;
  actual: number;
  symbol: string;
}) {
  return (
    <div>
      <ColHeader />
      <div className={cn(GRID, 'border-b border-lp-border/30 px-4 py-2 text-[12px]')}>
        <div>
          <span className="text-lp-text">{label}</span>
          <span className="ml-2 text-[10px] text-lp-text-tertiary">{(pct * 100).toFixed(1)}% of {basis}</span>
        </div>
        <span className="text-right tabular-nums text-lp-text-secondary">{fmtFull(proposed, symbol)}</span>
        <span className="text-right tabular-nums text-lp-text">{fmtFull(actual, symbol)}</span>
        <span className={cn('text-right tabular-nums text-[11px]', varianceClass(proposed, actual))}>
          {varianceDisplay(proposed, actual)}
        </span>
      </div>
      <div className="px-4 py-2 text-[10px] italic text-lp-text-tertiary">
        Edit percentage in Budget Settings
      </div>
    </div>
  );
}

// ─── P&L Header ──────────────────────────────────────────────────────────────

function PLHeader({ summary, symbol }: { summary: SummaryData; symbol: string }) {
  const income = summary.sections.find(s => s.title === 'INCOME');
  const expenses = summary.sections.find(s => s.title === 'DIRECT EXPENSES');
  const overheads = summary.sections.find(s => s.title === 'OVERHEADS');
  const totals = summary.sections.find(s => s.title === 'TOTALS');

  const incomeP = income?.subtotal?.proposed ?? 0;
  const incomeA = income?.subtotal?.actual ?? 0;
  const expP = (expenses?.subtotal?.proposed ?? 0) + (overheads?.lines.reduce((s, l) => s + l.proposed, 0) ?? 0);
  const expA = (expenses?.subtotal?.actual ?? 0) + (overheads?.lines.reduce((s, l) => s + l.actual, 0) ?? 0);
  const netP = incomeP - expP;
  const netA = incomeA - expA;

  const card = (label: string, proposed: number, actual: number, isIncome = false) => {
    const netVariance = actual - proposed;
    const isPositive = isIncome ? netVariance >= 0 : netVariance <= 0;
    return (
      <div className="flex flex-col gap-1 px-4 py-3 border-r border-lp-border/40 last:border-r-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-bold tabular-nums text-lp-text">{fmt(actual, symbol)}</span>
          <span className="text-[11px] tabular-nums text-lp-text-tertiary">/ {fmt(proposed, symbol)}</span>
        </div>
        <span className={cn('text-[11px] tabular-nums font-medium', isPositive ? 'text-emerald-500' : 'text-red-500')}>
          {netVariance >= 0 ? '+' : ''}{fmt(netVariance, symbol)} vs proposed
        </span>
      </div>
    );
  };

  const netClass = netA >= 0 ? 'text-emerald-500' : 'text-red-500';

  return (
    <div className="mx-4 mt-4 shrink-0 overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-sm">
      <div className="flex min-w-0 items-stretch overflow-x-auto">
        {card('Income', incomeP, incomeA, true)}
        {card('Expenses', expP, expA, false)}
        <div className="flex min-w-[8rem] flex-col gap-1 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">Net P&amp;L</span>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-[18px] font-bold tabular-nums', netClass)}>{fmt(netA, symbol)}</span>
            <span className="text-[11px] tabular-nums text-lp-text-tertiary">/ {fmt(netP, symbol)}</span>
          </div>
          <span className={cn('text-[11px] tabular-nums font-medium', netA >= netP ? 'text-emerald-500' : 'text-red-500')}>
            {netA - netP >= 0 ? '+' : ''}{fmt(netA - netP, symbol)} vs proposed
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TourBudgetAccordion({ tourId }: { tourId: string }) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const loadSummary = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/budget/summary?tour_id=${tourId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(d => setSummary(d))
      .catch(e => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const toggle = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading budget…
      </div>
    );
  }
  if (error || !summary) {
    return (
      <div className="p-8 text-red-500 text-sm">
        Failed to load budget: {error ?? 'Unknown error'}
      </div>
    );
  }

  const symbol = '£'; // TODO: pull from budget settings
  const sections = summary.sections;
  const income = sections.find(s => s.title === 'INCOME');
  const directExp = sections.find(s => s.title === 'DIRECT EXPENSES');
  const overheads = sections.find(s => s.title === 'OVERHEADS');

  // Helper to find a line in a section by partial label match
  const line = (section: SummarySection | undefined, kw: string): SummaryLine =>
    section?.lines.find(l => l.label.toUpperCase().includes(kw.toUpperCase())) ??
    { label: kw, proposed: 0, actual: 0, variancePct: null, varianceDisplay: '—' };

  const incomeTotal = income?.subtotal ?? line(income, 'Total Income');
  const salariesLine = line(directExp, 'Salaries');
  const perDiemLine = line(directExp, 'Per Diem');
  const hotelsLine = line(directExp, 'Hotels');
  const flightsLine = line(directExp, 'Flights');
  const transportLine = line(directExp, 'Transportation');
  const productionLine = line(directExp, 'Production');
  const accountancyLine = line(overheads, 'Accountancy');
  const insuranceLine = line(overheads, 'Insurance');
  const contingencyLine = line(overheads, 'Contingency');
  const commissionsLine = line(overheads, 'Commissions');

  // Settings for pct sections: we infer from values + income
  const insurancePct = incomeTotal.proposed > 0 ? insuranceLine.proposed / incomeTotal.proposed : 0.03;
  const contingencyPct = 0.02; // displayed only

  const totalIncome = incomeTotal.proposed; // used for commission display

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PLHeader summary={summary} symbol={symbol} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <div
          className={cn(
            GRID,
            'sticky top-0 z-10 mb-2 rounded-lg border border-lp-border bg-lp-surface px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary shadow-sm'
          )}
        >
          <span>Section</span>
          <span className="text-right tabular-nums">Proposed</span>
          <span className="text-right tabular-nums">Actual</span>
          <span className="text-right tabular-nums">Variance</span>
        </div>

        {/* ── Income ── */}
        <AccordionSection
          title="Income"
          proposed={incomeTotal.proposed}
          actual={incomeTotal.actual}
          isIncome
          open={openSections.has('income')}
          onToggle={() => toggle('income')}
        >
          <IncomeAccordionBody tourId={tourId} symbol={symbol} />
        </AccordionSection>

        {/* ── Salaries ── */}
        <AccordionSection
          title="Salaries & Per Diem"
          proposed={salariesLine.proposed + perDiemLine.proposed}
          actual={salariesLine.actual + perDiemLine.actual}
          open={openSections.has('salaries')}
          onToggle={() => toggle('salaries')}
        >
          <SalariesAccordionBody tourId={tourId} symbol={symbol} dayCount={summary.dayCount} />
        </AccordionSection>

        {/* ── Hotels ── */}
        <AccordionSection
          title="Hotels"
          proposed={hotelsLine.proposed}
          actual={hotelsLine.actual}
          open={openSections.has('hotels')}
          onToggle={() => toggle('hotels')}
        >
          <LineItemsAccordionBody tourId={tourId} categoryPrefix="hotels" categories={HOTELS_CAT} symbol={symbol} />
        </AccordionSection>

        {/* ── Flights ── */}
        <AccordionSection
          title="Flights"
          proposed={flightsLine.proposed}
          actual={flightsLine.actual}
          open={openSections.has('flights')}
          onToggle={() => toggle('flights')}
        >
          <FlightsAccordionBody tourId={tourId} symbol={symbol} />
        </AccordionSection>

        {/* ── Transport ── */}
        <AccordionSection
          title="Transportation"
          proposed={transportLine.proposed}
          actual={transportLine.actual}
          open={openSections.has('transport')}
          onToggle={() => toggle('transport')}
        >
          <LineItemsAccordionBody tourId={tourId} categoryPrefix="transport_" categories={TRANSPORT_CATS} symbol={symbol} />
        </AccordionSection>

        {/* ── Production ── */}
        <AccordionSection
          title="Production & Misc"
          proposed={productionLine.proposed}
          actual={productionLine.actual}
          open={openSections.has('production')}
          onToggle={() => toggle('production')}
        >
          <LineItemsAccordionBody tourId={tourId} categoryPrefix="prod_" categories={PRODUCTION_CATS} symbol={symbol} />
        </AccordionSection>

        {/* ── Commissions ── */}
        <AccordionSection
          title="Commissions"
          proposed={commissionsLine.proposed}
          actual={commissionsLine.actual}
          open={openSections.has('commissions')}
          onToggle={() => toggle('commissions')}
        >
          <CommissionsAccordionBody tourId={tourId} symbol={symbol} totalIncome={totalIncome} />
        </AccordionSection>

        {/* ── Insurance ── */}
        <AccordionSection
          title="Insurance"
          proposed={insuranceLine.proposed}
          actual={insuranceLine.actual}
          open={openSections.has('insurance')}
          onToggle={() => toggle('insurance')}
        >
          <PctAccordionBody
            label="Insurance"
            pct={insurancePct}
            basis="gross income"
            proposed={insuranceLine.proposed}
            actual={insuranceLine.actual}
            symbol={symbol}
          />
        </AccordionSection>

        {/* ── Contingency ── */}
        <AccordionSection
          title="Contingency"
          proposed={contingencyLine.proposed}
          actual={contingencyLine.actual}
          open={openSections.has('contingency')}
          onToggle={() => toggle('contingency')}
        >
          <PctAccordionBody
            label="Contingency"
            pct={contingencyPct}
            basis="direct expenses"
            proposed={contingencyLine.proposed}
            actual={contingencyLine.actual}
            symbol={symbol}
          />
        </AccordionSection>

        {/* ── Accountancy ── */}
        {accountancyLine.proposed > 0 && (
          <AccordionSection
            title="Accountancy"
            proposed={accountancyLine.proposed}
            actual={accountancyLine.actual}
            open={openSections.has('accountancy')}
            onToggle={() => toggle('accountancy')}
          >
            <PctAccordionBody
              label="Accountancy"
              pct={0}
              basis="gross income"
              proposed={accountancyLine.proposed}
              actual={accountancyLine.actual}
              symbol={symbol}
            />
          </AccordionSection>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}
