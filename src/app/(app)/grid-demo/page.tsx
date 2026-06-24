'use client';

/* ============================================
   LOWPASS — /grid-demo (Canonical Grid smoke harness)

   A throwaway dev harness for smoking the <Grid> core + <GridSlideOver>
   against static data — NOT a product surface, so it deliberately skips
   <ProductShell>. Two views (B1):

     Expenses — the budget column set (no Day-type column).
     Income   — guarantees read like routing (Day · Venue · Date · Capacity ·
                Deal · Guarantee · Settled · Docs); a row set to Day = Show
                opens the SETTLEMENT slide variant.

   Between them the seed exercises every cell type and all four slide
   variants. See docs/smoke-tests/grid.md (GRID-NN / SLIDE-NN).
   ============================================ */

import { useState } from 'react';
import { Grid } from '@/components/grid/Grid';
import type { Column, Row, Section } from '@/components/grid/types';

const DAY_COLORS = {
  Show: 'var(--lp-grid-accent-4)',
  Off: 'var(--lp-text-tertiary)',
  Travel: 'var(--lp-grid-accent-2)',
  Rehearsal: 'var(--lp-grid-accent-3)',
};

/* ---- Expenses (budget) ---- */
const EXPENSE_COLS: Column[] = [
  { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false },
  { id: 'item', label: 'Item', type: 'text', w: 280, min: 150, resize: true },
  { id: 'vendor', label: 'Vendor', type: 'text', w: 150, min: 100, resize: true },
  {
    id: 'category',
    label: 'Category',
    type: 'dropdown',
    w: 130,
    min: 100,
    resize: true,
    options: ['Travel', 'Crew', 'Production', 'Hospitality'],
    optColors: {
      Travel: 'var(--lp-grid-accent-2)',
      Crew: 'var(--lp-grid-accent-3)',
      Production: 'var(--lp-grid-accent-1)',
      Hospitality: 'var(--lp-grid-accent-5)',
    },
  },
  { id: 'qty', label: 'Qty', type: 'number', w: 70, min: 56, resize: true },
  { id: 'est', label: 'Estimate', type: 'money', w: 120, min: 90, resize: true },
  { id: 'act', label: 'Actual', type: 'money', w: 120, min: 90, resize: true },
  {
    id: 'total',
    label: 'Qty × Act',
    type: 'calc',
    w: 110,
    min: 84,
    resize: true,
    calc: (r: Row) => (Number(r.qty) || 0) * (Number(r.act) || 0),
  },
  { id: 'var', label: 'Variance', type: 'variance', w: 110, min: 90, resize: true },
  { id: 'delta', label: 'Act − Est', type: 'formula', w: 110, min: 84, resize: true, formula: { a: 'act', op: '-', b: 'est' } },
  { id: 'status', label: 'Status', type: 'status', w: 120, min: 100, resize: true, options: ['budgeted', 'paid', 'reconciled', 'refunded'] },
  { id: 'paid', label: 'Paid?', type: 'check', w: 76, min: 60, resize: true },
  { id: 'rcpts', label: 'Receipts', type: 'receipts', w: 90, min: 70, resize: false },
  { id: 'memo', label: 'Memo', type: 'doc', w: 100, min: 80, resize: true },
  { id: 'notes', label: 'Notes', type: 'text', w: 200, min: 120, resize: true, hidden: true },
];

const EXPENSE_DATA: Section[] = [
  {
    name: 'Travel & Flights',
    kind: 'normal',
    rows: [
      {
        item: 'BNA → JFK | Band + Ad',
        icon: '✈',
        vendor: 'Southwest Airlines',
        category: 'Travel',
        qty: 5,
        est: 711,
        act: 900,
        status: 'paid',
        paid: true,
        notes: 'Held on company card.',
        transactions: [
          { date: '2026-05-02', desc: 'Deposit', amount: 300, receipt: null },
          { date: '2026-05-20', desc: 'Balance', amount: 600, receipt: null },
        ],
      },
      { item: 'BNA → NYC → LAX | Char', icon: '✈', vendor: '', category: 'Travel', qty: 1, est: 706, act: 705, status: 'reconciled' },
      {
        item: 'Car Hire',
        icon: '🚗',
        vendor: 'Avis',
        category: 'Production',
        qty: 2,
        est: 400,
        act: 490,
        status: 'paid',
      },
    ],
  },
  {
    name: 'Accommodation',
    kind: 'derived',
    source: 'Rooming',
    rows: [{ item: 'Hotel NH København', icon: '🏨', vendor: 'NH Hotels', category: 'Hospitality', est: 520, act: 0, status: 'budgeted', cur: 'EUR' }],
  },
  {
    name: 'Salaries',
    kind: 'derived',
    source: 'Payroll',
    rows: [
      { item: 'Tour Manager', vendor: '', category: 'Crew', est: 0, act: 0, status: 'budgeted' },
      { item: 'Guitar Tech', vendor: '', category: 'Crew', est: 1200, act: 0, status: 'budgeted', cur: 'GBP' },
    ],
  },
  {
    name: 'Commissions & Fixed',
    kind: 'formula',
    rows: [
      { item: 'Agency commission', pct: 10, basis: 'gross', custom: false, est: 0, act: 0, status: 'budgeted' },
      { item: 'Management commission', pct: 15, basis: 'gross', custom: false, est: 0, act: 0, status: 'budgeted' },
      { item: 'Insurance', pct: 3, basis: 'gross', custom: false, est: 0, act: 0, status: 'budgeted' },
      { item: 'Contingency', pct: 5, basis: 'gross', custom: false, est: 0, act: 0, status: 'budgeted' },
    ],
  },
];

/* ---- Income (guarantees read like routing) ---- */
const INCOME_COLS: Column[] = [
  { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false },
  { id: 'daytype', label: 'Day', type: 'dropdown', w: 110, min: 80, resize: true, options: ['Show', 'Off', 'Travel', 'Rehearsal'], optColors: DAY_COLORS },
  { id: 'item', label: 'Venue', type: 'text', w: 220, min: 140, resize: true },
  { id: 'idate', label: 'Date', type: 'text', w: 96, min: 78, resize: true },
  { id: 'cap', label: 'Capacity', type: 'number', w: 90, min: 70, resize: true },
  { id: 'deal', label: 'Deal', type: 'dropdown', w: 120, min: 90, resize: true, options: ['Flat', 'Plus', 'Versus', 'Door'], optColors: { Flat: 'var(--lp-text-tertiary)', Plus: 'var(--lp-grid-accent-3)', Versus: 'var(--lp-grid-accent-1)', Door: 'var(--lp-grid-accent-2)' } },
  { id: 'est', label: 'Guarantee', type: 'money', w: 120, min: 90, resize: true },
  { id: 'act', label: 'Settled', type: 'money', w: 120, min: 90, resize: true },
  { id: 'var', label: 'vs Gtee', type: 'variance', w: 96, min: 76, resize: true },
  { id: 'status', label: 'Status', type: 'status', w: 120, min: 100, resize: true, options: ['budgeted', 'paid', 'reconciled', 'refunded'] },
  { id: 'memo', label: 'Docs', type: 'doc', w: 100, min: 80, resize: true },
];

const INCOME_DATA: Section[] = [
  {
    name: 'Routing & Income',
    // Routing-derived: the slide shows the "🔗 Routing → open" pill but the
    // estimate (guarantee) stays EDITABLE (only Payroll/Rooming lock it).
    kind: 'derived',
    source: 'Routing',
    rows: [
      { daytype: 'Off', item: 'Travel → Oslo', idate: '16 Jun', est: 0, act: 0, status: 'budgeted' },
      { daytype: 'Show', item: 'Øvre Oslo Festival', idate: '17 Jun', cap: 1500, deal: 'Versus', split: 80, est: 6915, wh: 20, act: 5532, status: 'reconciled' },
      { daytype: 'Show', item: 'IOW Festival', idate: '19 Jun', cap: 5000, deal: 'Flat', split: 0, est: 20000, wh: 0, act: 20000, status: 'paid' },
      { daytype: 'Off', item: 'Travel → Brussels', idate: '20 Jun', est: 0, act: 0, status: 'budgeted' },
    ],
  },
];

type View = 'expenses' | 'income';

export default function GridDemoPage() {
  const [view, setView] = useState<View>('expenses');
  const TABS: { id: View; label: string }[] = [
    { id: 'expenses', label: 'Expenses' },
    { id: 'income', label: 'Income' },
  ];
  return (
    <div style={{ maxWidth: 1520, margin: '0 auto', padding: 'var(--lp-space-6) var(--lp-space-6) var(--lp-space-16)' }}>
      <div style={{ marginBottom: 'var(--lp-space-4)' }}>
        <div style={{ fontSize: 'var(--lp-text-2xs)', letterSpacing: '0.13em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--lp-text-tertiary)' }}>
          Canonical Grid · smoke harness
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: 'var(--lp-text-3xl)', fontWeight: 750, letterSpacing: '-0.015em', color: 'var(--lp-text)' }}>
          Grid playbox → app
        </h1>
        <p style={{ margin: '6px 0 12px', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)', lineHeight: 1.5 }}>
          The one <code>&lt;Grid&gt;</code> + <code>&lt;GridSlideOver&gt;</code> every tabular surface will use. Static
          data; no backend. Open a row (the orange <strong>Open</strong> chip on the first cell) for the slide; set an
          Income row&rsquo;s <strong>Day → Show</strong> and open it for the settlement variant.
        </p>
        {/* Expenses / Income — segmented control (token-clean) */}
        <div
          role="tablist"
          aria-label="Demo view"
          style={{
            display: 'inline-flex',
            gap: 2,
            border: '1px solid var(--lp-border)',
            borderRadius: 'var(--lp-radius-full)',
            padding: 3,
            background: 'var(--lp-panel)',
          }}
        >
          {TABS.map((t) => {
            const on = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(t.id)}
                style={{
                  border: 0,
                  cursor: 'pointer',
                  borderRadius: 'var(--lp-radius-full)',
                  padding: '6px 18px',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 600,
                  background: on ? 'var(--lp-orange)' : 'transparent',
                  color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                  boxShadow: on ? 'var(--lp-shadow-sm)' : 'none',
                  transition: 'background 0.16s ease, color 0.16s ease',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* key by view → the Grid remounts with the right column + data set */}
      {view === 'expenses' ? (
        <Grid key="expenses" initialColumns={EXPENSE_COLS} initialData={EXPENSE_DATA} fillHandle clickTwiceToOpen />
      ) : (
        <Grid key="income" initialColumns={INCOME_COLS} initialData={INCOME_DATA} fillHandle clickTwiceToOpen />
      )}
    </div>
  );
}
