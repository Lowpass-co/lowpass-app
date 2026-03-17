'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import { cn } from '@/lib/utils';

interface TemplateLineItem {
  category: string;
  label: string;
  proposed_cost: number;
  routing_id: null;
  reasoning?: string;
}

interface TemplateResult {
  summary?: string;
  line_items?: TemplateLineItem[];
  estimated_total_expenses?: number;
  confidence?: string;
  warnings?: string[];
  _meta?: { past_tour_count?: number };
}

interface LineItem {
  id: string;
  category: string;
  label: string;
  proposed_cost: number;
  actual_cost?: number;
  routing_id: string | null;
}

interface Settings {
  id?: string;
  insurance_pct: number;
  contingency_pct: number;
  accountancy_pct: number;
}

interface Commission {
  id: string;
  label: string;
  percentage: number;
  basis: string;
}

const n = (x: number | null | undefined): number => (x == null ? 0 : Number(x) || 0);

function basisLabel(basis: string): string {
  const map: Record<string, string> = {
    gross: 'Gross',
    net: 'Net',
    gross_merch: 'Merch Gross',
    net_merch: 'Net Merch',
    gross_minus_tax: 'Gross (Pre-Tax)',
  };
  return map[basis] ?? basis;
}

export function TourWideCosts({
  tourId,
  currency,
  artistId,
  workspaceId,
  showCount,
  crewCount,
  initialLineItems,
  initialSettings,
  initialCommissions,
}: {
  tourId: string;
  currency: string;
  artistId: string;
  workspaceId: string;
  showCount: number;
  crewCount: number;
  initialLineItems: LineItem[];
  initialSettings: Settings | null;
  initialCommissions: Commission[];
}) {
  const { openLineItem } = useDetailPanel();
  const [lineItems, setLineItems] = useState<LineItem[]>(initialLineItems);
  const [settings, setSettings] = useState<Settings | null>(initialSettings);
  const [commissions, setCommissions] = useState<Commission[]>(initialCommissions);
  const [summary, setSummary] = useState<{ totalIncome: number; totalExpenses: number } | null>(null);
  const [editingPct, setEditingPct] = useState(false);
  const [pctDraft, setPctDraft] = useState({ insurance: 3, contingency: 2, accountancy: 0 });
  const [templateModal, setTemplateModal] = useState<TemplateResult | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSelected, setTemplateSelected] = useState<Set<number>>(new Set());

  const productionItems = lineItems.filter((i) => i.category.startsWith('prod_'));
  const transportItems = lineItems.filter((i) => i.category.startsWith('transport_'));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/budget/summary?tour_id=${encodeURIComponent(tourId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const income = data.sections?.find((s: { title: string }) => s.title === 'INCOME');
        const totals = data.sections?.find((s: { title: string }) => s.title === 'TOTALS');
        const totalIncome = income?.subtotal?.proposed ?? 0;
        const totalExpenses = totals?.lines?.[0]?.proposed ?? 0;
        setSummary({ totalIncome, totalExpenses });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tourId]);

  const insurancePct = settings ? n(settings.insurance_pct) : 0.03;
  const contingencyPct = settings ? n(settings.contingency_pct) : 0.02;
  const accountancyPct = settings ? n(settings.accountancy_pct) : 0;

  const totalExpenses = summary?.totalExpenses ?? 0;
  const totalIncome = summary?.totalIncome ?? 0;
  const insuranceAmount = insurancePct * totalExpenses;
  const contingencyAmount = contingencyPct * totalExpenses;
  const accountancyAmount = accountancyPct * totalIncome;

  const commissionAmounts = commissions.map((c) => {
    const pct = n(c.percentage);
    const amount = pct * totalIncome;
    return { ...c, amount };
  });
  const totalCommission = commissionAmounts.reduce((a, c) => a + c.amount, 0);

  const lineItemsTotal = lineItems.reduce((a, i) => a + n(i.proposed_cost), 0);
  const totalTourWide = lineItemsTotal + insuranceAmount + contingencyAmount + accountancyAmount + totalCommission;

  const saveProposed = useCallback(async (id: string, value: number) => {
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, proposed_cost: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLineItems((prev) => prev.map((i) => (i.id === id ? { ...i, proposed_cost: updated.proposed_cost } : i)));
    }
  }, []);

  const addLineItem = useCallback(async (category: string) => {
    const res = await fetch('/api/budget/line-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        category,
        label: 'New item',
        proposed_cost: 0,
        routing_id: null,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setLineItems((prev) => [...prev, created]);
    }
  }, [tourId]);

  const saveSettings = useCallback(async () => {
    const res = await fetch('/api/budget/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        insurance_pct: pctDraft.insurance / 100,
        contingency_pct: pctDraft.contingency / 100,
        accountancy_pct: pctDraft.accountancy / 100,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSettings(updated);
      setEditingPct(false);
    }
  }, [tourId, pctDraft]);

  const saveCommissionPct = useCallback(async (id: string, value: number) => {
    const res = await fetch('/api/budget/commissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, percentage: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCommissions((prev) => prev.map((c) => (c.id === id ? { ...c, percentage: updated.percentage } : c)));
    }
  }, []);

  const addCommission = useCallback(async () => {
    const res = await fetch('/api/budget/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        label: 'New commission',
        percentage: 0,
        basis: 'gross',
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setCommissions((prev) => [...prev, created]);
    }
  }, [tourId]);

  const fetchTemplate = useCallback(async () => {
    setTemplateLoading(true);
    setTemplateModal(null);
    try {
      const res = await fetch('/api/budget/ai/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          artist_id: artistId || undefined,
          workspace_id: workspaceId,
          cities: [],
          show_count: showCount || 1,
          crew_count: crewCount || 1,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTemplateModal(data);
        setTemplateSelected(new Set((data.line_items ?? []).map((_: unknown, i: number) => i)));
      }
    } finally {
      setTemplateLoading(false);
    }
  }, [tourId, artistId, workspaceId, showCount, crewCount]);

  const acceptTemplateItems = useCallback(
    async (indices: number[]) => {
      const items = templateModal?.line_items ?? [];
      for (const i of indices) {
        const it = items[i];
        if (!it) continue;
        const res = await fetch('/api/budget/line-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tour_id: tourId,
            category: it.category,
            label: it.label,
            proposed_cost: it.proposed_cost,
            routing_id: null,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          setLineItems((prev) => [...prev, created]);
        }
      }
      setTemplateModal(null);
    },
    [templateModal, tourId]
  );

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);

  const openEditPct = () => {
    setPctDraft({
      insurance: (insurancePct * 100),
      contingency: (contingencyPct * 100),
      accountancy: (accountancyPct * 100),
    });
    setEditingPct(true);
  };

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-lp-text">Tour-Wide Costs</h1>
        <button
          type="button"
          onClick={fetchTemplate}
          disabled={templateLoading}
          className="text-sm font-medium text-lp-orange hover:underline disabled:opacity-50"
        >
          {templateLoading ? 'Generating…' : 'Auto-fill from past tours'}
        </button>
      </div>

      {templateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-lp-border bg-lp-bg shadow-xl">
            <div className="border-b border-lp-border p-4">
              <h2 className="text-lg font-bold text-lp-text">Suggested budget</h2>
              <p className="mt-1 text-sm text-lp-text-secondary">
                Based on {templateModal._meta?.past_tour_count ?? 0} past tour(s). Review and accept items to add.
              </p>
              {templateModal.summary && (
                <p className="mt-2 text-sm text-lp-text">{templateModal.summary}</p>
              )}
              {templateModal.warnings && templateModal.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs text-amber-600 dark:text-amber-400">
                  {templateModal.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto p-4">
              <ul className="space-y-2">
                {(templateModal.line_items ?? []).map((it, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={templateSelected.has(i)}
                      onChange={() => {
                        setTemplateSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                      className="rounded border-lp-border"
                    />
                    <span className="flex-1 text-lp-text">{it.label}</span>
                    <span className="text-lp-text-secondary">{fmt(it.proposed_cost)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-lp-border p-4">
              <button
                type="button"
                onClick={() => setTemplateModal(null)}
                className="rounded border border-lp-border px-3 py-1.5 text-sm font-medium text-lp-text hover:bg-lp-surface"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => acceptTemplateItems(Array.from(templateSelected))}
                className="rounded bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Accept selected ({templateSelected.size})
              </button>
              <button
                type="button"
                onClick={() => acceptTemplateItems((templateModal.line_items ?? []).map((_, i) => i))}
                className="rounded bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-lp-text-tertiary">Production</h2>
        <ul className="mt-2 space-y-1">
          {productionItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-tertiary">├</span>
              <span className="min-w-0 flex-1 truncate text-lp-text">{item.label}</span>
              <span className="shrink-0">
                <InlineEditCell
                  value={item.proposed_cost}
                  onSave={(v) => saveProposed(item.id, Number(v))}
                  type="currency"
                  currency={currency}
                  align="right"
                  className="min-w-[80px] text-right"
                />
              </span>
              <button
                type="button"
                onClick={() => openLineItem(item.id)}
                className="shrink-0 p-1 text-lp-text-tertiary hover:text-lp-orange"
                aria-label="Open detail"
              >
                <ChevronRight size={18} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => addLineItem('prod_misc')}
          className="mt-2 text-sm text-lp-orange hover:underline"
        >
          + Add production item
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-lp-text-tertiary">Transport</h2>
        <ul className="mt-2 space-y-1">
          {transportItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-tertiary">├</span>
              <span className="min-w-0 flex-1 truncate text-lp-text">{item.label}</span>
              <span className="shrink-0">
                <InlineEditCell
                  value={item.proposed_cost}
                  onSave={(v) => saveProposed(item.id, Number(v))}
                  type="currency"
                  currency={currency}
                  align="right"
                  className="min-w-[80px] text-right"
                />
              </span>
              <button
                type="button"
                onClick={() => openLineItem(item.id)}
                className="shrink-0 p-1 text-lp-text-tertiary hover:text-lp-orange"
                aria-label="Open detail"
              >
                <ChevronRight size={18} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => addLineItem('transport_misc')}
          className="mt-2 text-sm text-lp-orange hover:underline"
        >
          + Add transport item
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-lp-text-tertiary">
          Overheads (auto-calculated)
        </h2>
        <ul className="mt-2 space-y-1 text-sm text-lp-text">
          <li className="flex items-center gap-2">
            <span className="text-lp-text-tertiary">├</span>
            <span>Insurance ({(insurancePct * 100).toFixed(0)}%)</span>
            <span className="ml-auto">{fmt(insuranceAmount)}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-lp-text-tertiary">├</span>
            <span>Contingency ({(contingencyPct * 100).toFixed(0)}%)</span>
            <span className="ml-auto">{fmt(contingencyAmount)}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-lp-text-tertiary">└</span>
            <span>Accountancy ({(accountancyPct * 100).toFixed(0)}%)</span>
            <span className="ml-auto">{fmt(accountancyAmount)}</span>
          </li>
        </ul>
        {!editingPct ? (
          <button
            type="button"
            onClick={openEditPct}
            className="mt-2 text-sm text-lp-orange hover:underline"
          >
            [Edit percentages]
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-lp-border bg-lp-surface-secondary/50 p-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-tertiary">Insurance %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={pctDraft.insurance}
                onChange={(e) => setPctDraft((p) => ({ ...p, insurance: Number(e.target.value) || 0 }))}
                className="w-16 rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-tertiary">Contingency %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={pctDraft.contingency}
                onChange={(e) => setPctDraft((p) => ({ ...p, contingency: Number(e.target.value) || 0 }))}
                className="w-16 rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-tertiary">Accountancy %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={pctDraft.accountancy}
                onChange={(e) => setPctDraft((p) => ({ ...p, accountancy: Number(e.target.value) || 0 }))}
                className="w-16 rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={saveSettings}
              className="rounded bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingPct(false)}
              className="text-sm text-lp-text-tertiary hover:text-lp-text"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-lp-text-tertiary">Commissions</h2>
        <ul className="mt-2 space-y-1">
          {commissionAmounts.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-tertiary">├</span>
              <span className="min-w-0 flex-1 truncate text-lp-text">{c.label}</span>
              <span className="shrink-0">
                <InlineEditCell
                  value={c.percentage * 100}
                  onSave={(v) => saveCommissionPct(c.id, Number(v) / 100)}
                  type="percentage"
                  align="right"
                  className="min-w-[60px] text-right"
                />
              </span>
              <span className="w-24 text-right text-lp-text">{fmt(c.amount)}</span>
              <span className="w-24 shrink-0 text-lp-text-tertiary">{basisLabel(c.basis)}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addCommission}
          className="mt-2 text-sm text-lp-orange hover:underline"
        >
          + Add commission
        </button>
      </section>

      <div className="mt-8 border-t-2 border-lp-border pt-4">
        <p className="flex justify-end text-lg font-bold text-lp-text">
          TOTAL TOUR-WIDE: {fmt(totalTourWide)}
        </p>
      </div>
    </div>
  );
}
