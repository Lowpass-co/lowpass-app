'use client';

/* ============================================
   LOWPASS — /grid-demo (Canonical Grid · Phase 1 smoke harness)

   A throwaway dev harness for smoking the <Grid> core against static data
   — NOT a product surface, so it deliberately skips <ProductShell> (the
   ProductName union has no neutral "Grid" member and the demo needs no rail
   chrome / tour context). Phase 2 mounts <Grid> inside the real product
   surfaces (Expenses / Income / Payroll / Rooming / Channel list).

   The seed exercises every Phase-1 cell type: idx · text · dropdown (with
   option colours) · number · money (incl. a non-USD row that renders red) ·
   calc · variance · formula · status · check · receipts · doc — across all
   three section kinds (normal / derived-locked / formula).
   ============================================ */

import { Grid } from '@/components/grid/Grid';
import type { Column, Row, Section } from '@/components/grid/types';

const COLS: Column[] = [
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
  {
    id: 'daytype',
    label: 'Day',
    type: 'dropdown',
    w: 104,
    min: 78,
    resize: true,
    options: ['Show', 'Off', 'Travel', 'Rehearsal'],
    optColors: {
      Show: 'var(--lp-grid-accent-4)',
      Off: 'var(--lp-text-tertiary)',
      Travel: 'var(--lp-grid-accent-2)',
      Rehearsal: 'var(--lp-grid-accent-3)',
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

const DATA: Section[] = [
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
          { date: '2026-05-02', desc: 'Deposit', amount: 300, receipt: 'flights-deposit.pdf' },
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
        transactions: [{ date: '2026-06-01', desc: 'Avis booking', amount: 490, receipt: 'avis-confirmation.pdf' }],
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

export default function GridDemoPage() {
  return (
    <div style={{ maxWidth: 1520, margin: '0 auto', padding: 'var(--lp-space-6) var(--lp-space-6) var(--lp-space-16)' }}>
      <div style={{ marginBottom: 'var(--lp-space-4)' }}>
        <div
          style={{
            fontSize: 'var(--lp-text-2xs)',
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Canonical Grid · Phase 1 smoke harness
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: 'var(--lp-text-3xl)', fontWeight: 750, letterSpacing: '-0.015em', color: 'var(--lp-text)' }}>
          Grid playbox → app
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)', lineHeight: 1.5 }}>
          The one <code>&lt;Grid&gt;</code> every tabular surface will use. Static data; no backend. See{' '}
          <code>docs/smoke-tests/grid.md</code> for the GRID-NN checklist.
        </p>
      </div>
      <Grid initialColumns={COLS} initialData={DATA} />
    </div>
  );
}
