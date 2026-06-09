'use client';

/* ============================================
   LOWPASS — <BudgetGridToggle> (Phase 3 mount, safety net)

   Lets Adam smoke the canonical <Grid> on the REAL budget data on the running
   page WITHOUT replacing the production Expenses view yet. Default = the
   classic BudgetSpreadsheetView; "Grid (beta)" renders <BudgetGridView>. Once
   the grid is live-verified, this flips to grid-default (and the remaining
   CRUD — add/delete/section/reorder — gets wired). Token-clean.
   ============================================ */

import { useState } from 'react';

export function BudgetGridToggle({ classic, grid }: { classic: React.ReactNode; grid: React.ReactNode }) {
  const [mode, setMode] = useState<'classic' | 'grid'>('classic');
  const TABS: { id: 'classic' | 'grid'; label: string }[] = [
    { id: 'classic', label: 'Classic' },
    { id: 'grid', label: 'Grid (beta)' },
  ];
  return (
    <div>
      <div
        role="tablist"
        aria-label="Expenses view"
        style={{
          display: 'inline-flex',
          gap: 2,
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-full)',
          padding: 3,
          background: 'var(--lp-panel)',
          marginBottom: 'var(--lp-space-3)',
        }}
      >
        {TABS.map((t) => {
          const on = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setMode(t.id)}
              style={{
                border: 0,
                cursor: 'pointer',
                borderRadius: 'var(--lp-radius-full)',
                padding: '5px 14px',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 600,
                background: on ? 'var(--lp-orange)' : 'transparent',
                color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                transition: 'background 0.16s ease, color 0.16s ease',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {mode === 'classic' ? classic : grid}
    </div>
  );
}
