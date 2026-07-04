'use client';

/* ============================================
   LOWPASS — Budget Summary card dashboard (#29, approved design)

   Replaces the old BudgetSummaryTab body with a customizable brick dashboard.
   PRESENTATION-ONLY over computeBudgetPnl + the summaryData derivations — no number
   is recomputed or mutated here. Phase 1: show/hide + drag-reorder held IN-MEMORY
   (DEFAULT = the five approved bricks; persistence is Phase 2).
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, Plus, Check } from 'lucide-react';
import { computeBudgetPnl, type IncomeInput, type CommissionInput, type PnlSettingsInput } from '@/lib/budget/computeBudgetPnl';
import type { BudgetLineItem, BudgetSection } from '@/types';
import {
  DEFAULT_SUMMARY_CONFIG, SUMMARY_CARD_LABELS, FULL_WIDTH_CARDS,
  type SummaryCardId, type SummaryDashboardConfig,
} from './summaryCards';
import { expensesBySection, burnFrom, perShowIncome } from './summaryData';
import {
  SummaryCard, NetPnlCard, ExpensesBySectionCard, PerShowPnlCard, CommittedBurnCard,
  OverheadsCommissionsCard, FigureCard, VarianceCard,
} from './cards';

export interface BudgetSummaryDashboardProps {
  lines: BudgetLineItem[];
  sections?: BudgetSection[];
  income?: IncomeInput[];
  commissions?: CommissionInput[];
  settings?: PnlSettingsInput | null;
  tourCurrency: string;
  fxRates?: Record<string, number>;
  /** #24 — per-show labels aligned to `income` by index (routing venue name);
   *  the per-show income brick uses these instead of "Show N". */
  showLabels?: readonly (string | null | undefined)[];
}

export function BudgetSummaryDashboard({
  lines, sections = [], income = [], commissions = [], settings = null, tourCurrency, fxRates = {}, showLabels,
}: BudgetSummaryDashboardProps) {
  const searchParams = useSearchParams();
  const displayCurrency = (searchParams.get('display') ?? tourCurrency).toUpperCase();

  // The single source of truth — recomputed live over the (optimistic) line overlay.
  const pnl = useMemo(
    () => computeBudgetPnl({ lines, income, commissions, settings, tourCurrency, fxRates }),
    [lines, income, commissions, settings, tourCurrency, fxRates],
  );
  const sectionRows = useMemo(() => expensesBySection(lines, sections, tourCurrency, fxRates), [lines, sections, tourCurrency, fxRates]);
  const burn = useMemo(() => burnFrom(lines, tourCurrency, fxRates), [lines, tourCurrency, fxRates]);
  const shows = useMemo(() => perShowIncome(income, tourCurrency, fxRates, showLabels), [income, tourCurrency, fxRates, showLabels]);
  void displayCurrency; // cards render in tour currency (pnl currency); ?display= is a later enhancement.

  const [config, setConfig] = useState<SummaryDashboardConfig>(DEFAULT_SUMMARY_CONFIG);
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<SummaryCardId | null>(null);

  const hide = useCallback((id: SummaryCardId) => setConfig((c) => ({ ...c, cards: c.cards.map((k) => (k.id === id ? { ...k, show: false } : k)) })), []);
  const showCard = useCallback((id: SummaryCardId) => setConfig((c) => ({ ...c, cards: c.cards.map((k) => (k.id === id ? { ...k, show: true } : k)) })), []);
  const reorder = useCallback((fromId: SummaryCardId, toId: SummaryCardId) => {
    setConfig((c) => {
      if (fromId === toId) return c;
      const arr = [...c.cards];
      const from = arr.findIndex((k) => k.id === fromId);
      const to = arr.findIndex((k) => k.id === toId);
      if (from < 0 || to < 0) return c;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...c, cards: arr };
    });
  }, []);

  const renderBody = (id: SummaryCardId) => {
    switch (id) {
      case 'net-pnl': return <NetPnlCard pnl={pnl} />;
      case 'expenses-by-section': return <ExpensesBySectionCard rows={sectionRows} currency={pnl.currency} />;
      case 'per-show-pnl': return <PerShowPnlCard rows={shows} currency={pnl.currency} />;
      case 'committed-burn': return <CommittedBurnCard burn={burn} currency={pnl.currency} />;
      case 'overheads-commissions': return <OverheadsCommissionsCard pnl={pnl} />;
      case 'gross-income': return <FigureCard actual={pnl.grossIncome.actual} projected={pnl.grossIncome.projected} currency={pnl.currency} />;
      case 'total-expenses': return <FigureCard actual={pnl.totalExpenses.actual} projected={pnl.totalExpenses.projected} currency={pnl.currency} />;
      case 'variance': return <VarianceCard pnl={pnl} />;
      default: return null;
    }
  };

  const shown = config.cards.filter((c) => c.show);
  const hidden = config.cards.filter((c) => !c.show);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, position: 'relative' }}>
        <button type="button" onClick={() => setEditMode((e) => !e)} className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
          style={{ borderColor: editMode ? 'var(--lp-orange)' : 'var(--lp-border)', color: editMode ? 'var(--lp-orange)' : 'var(--lp-text-secondary)', background: 'transparent', fontSize: 13, fontWeight: 'var(--lp-weight-medium)', cursor: 'pointer' }}>
          <LayoutGrid className="h-4 w-4" aria-hidden /> {editMode ? 'Done' : 'Customize'}
        </button>
        {editMode ? (
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setAddOpen((o) => !o)} className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', background: 'transparent', fontSize: 13, cursor: 'pointer' }} aria-haspopup="menu" aria-expanded={addOpen}>
              <Plus className="h-4 w-4" aria-hidden /> Add card
            </button>
            {addOpen ? (
              <>
                <div onClick={() => setAddOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, minWidth: 220, background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', boxShadow: 'var(--lp-shadow-lg, 0 8px 24px rgba(0,0,0,0.3))', padding: 4 }}>
                  {hidden.length === 0 ? (
                    <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--lp-text-tertiary)' }}>All cards are shown.</div>
                  ) : hidden.map((k) => (
                    <button key={k.id} type="button" role="menuitem" onClick={() => { showCard(k.id); setAddOpen(false); }} className="btn-transition"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 0, background: 'transparent', borderRadius: 'var(--lp-radius-sm)', padding: '6px 8px', fontSize: 12, color: 'var(--lp-text)', cursor: 'pointer' }}>
                      <Plus className="h-3.5 w-3.5" aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} /> {SUMMARY_CARD_LABELS[k.id]}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Card grid — net-pnl + expenses-by-section span full width. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
        {shown.map((k) => (
          <div
            key={k.id}
            draggable={editMode}
            onDragStart={() => editMode && setDragId(k.id)}
            onDragOver={(e) => { if (editMode && dragId && dragId !== k.id) { e.preventDefault(); reorder(dragId, k.id); } }}
            onDragEnd={() => setDragId(null)}
            style={{ gridColumn: FULL_WIDTH_CARDS.has(k.id) ? '1 / -1' : undefined, opacity: dragId === k.id ? 0.6 : 1 }}
          >
            <SummaryCard label={SUMMARY_CARD_LABELS[k.id]} editMode={editMode} onHide={() => hide(k.id)}>
              {renderBody(k.id)}
            </SummaryCard>
          </div>
        ))}
      </div>

      {editMode ? (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
          <Check className="inline h-3 w-3" aria-hidden /> Drag a card to reorder · the eye hides it · “Add card” brings hidden ones back. Layout resets on reload (saved layouts arrive in Phase 2).
        </p>
      ) : null}
    </div>
  );
}
