'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow } from '@/components/spreadsheet-grid/types';

/* --- Data factories --- */

type BudgetLine = {
  id: string;
  code: string;
  date: string;
  category: string;
  description: string;
  subtotal: number;
  tax: number;
  total: number;
  show: string;
  status: string;
  notes: string;
};

const BUD_CATS = ['Hotel', 'Travel', 'Catering', 'Production', 'Misc'] as const;
const BUD_STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'hold', label: 'On hold' },
] as const;

function makeBudgetLines(n: number): BudgetLine[] {
  return Array.from({ length: n }, (_, i) => {
    const sub = Math.round(100 + (i * 17) % 5000) + 0.5;
    const tax = Math.round(sub * 0.1 * 100) / 100;
    return {
      id: `bud-${i}`,
      code: String(i + 1).padStart(3, '0'),
      date: new Date(2026, 0, 1 + (i % 120)).toISOString().slice(0, 10),
      category: BUD_CATS[i % BUD_CATS.length]!,
      description: `Line ${i} — ${String(BUD_CATS[i % BUD_CATS.length]).toLowerCase()}`,
      subtotal: sub,
      tax,
      total: sub + tax,
      show: i % 4 === 0 ? 'Headline' : 'Support',
      status: BUD_STATUS[i % BUD_STATUS.length]!.value,
      notes: i % 10 === 0 ? 'Review' : '',
    };
  });
}

/** 12 columns for payroll demo */
type PayrollLine = {
  id: string;
  name: string;
  role: string;
  dept: string;
  w2: string;
  hours: number;
  rate: number;
  otHours: number;
  otRate: number;
  gross: number;
  ded: number;
  net: number;
  ytd: number;
};

const ROLES = ['FOH', 'Mon', 'TM', 'PM', 'Driver', 'Lx', 'Rigger'];
const DEPTS = ['Audio', 'Lighting', 'Backline', 'Tour mgmt', 'Crew'];
const W2 = ['W2', '1099', 'LOAN'];

function makePayroll(n: number): PayrollLine[] {
  return Array.from({ length: n }, (_, i) => {
    const hours = 40 + (i % 20);
    const rate = 25 + (i % 5) * 5;
    const otH = (i * 3) % 8;
    const otR = rate * 1.5;
    const gross = hours * rate + otH * otR;
    const ded = Math.round(gross * 0.18 * 100) / 100;
    const net = gross - ded;
    return {
      id: `pay-${i}`,
      name: `Person ${i + 1}`,
      role: ROLES[i % ROLES.length]!,
      dept: DEPTS[i % DEPTS.length]!,
      w2: W2[i % W2.length]!,
      hours,
      rate,
      otHours: otH,
      otRate: otR,
      gross,
      ded,
      net,
      ytd: Math.round(net * (1 + (i % 6)) * 100) / 100,
    };
  });
}

type ChannelLine = {
  id: string;
  ch: string;
  label: string;
  source: string;
  dest: string;
  micId: string;
  gearId: string;
  gainDb: number;
  mute: boolean;
};

function makeChannel(n: number): ChannelLine[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ch-${i}`,
    ch: String((i % 32) + 1),
    label: `Ch ${(i % 32) + 1}`,
    source: i % 2 ? 'RF1' : 'Mon',
    dest: i % 3 ? 'FOH' : 'Mon A',
    micId: `entity-mic-${(i * 2) % 20}`,
    gearId: `entity-gear-${(i * 3) % 15}`,
    gainDb: -20 + (i % 8),
    mute: (i * 2) % 5 === 0,
  }));
}

/* --- Column defs --- */

const budgetColumns: GridColumn<BudgetLine>[] = [
  { id: 'code', header: 'Code', accessor: 'code', type: { kind: 'text' }, width: 72, frozen: true, align: 'left' },
  { id: 'date', header: 'Date', accessor: 'date', type: { kind: 'date', format: 'short' }, width: 110 },
  { id: 'category', header: 'Category', accessor: 'category', type: { kind: 'select', options: BUD_CATS.map(c => ({ value: c, label: c })) }, width: 120 },
  { id: 'description', header: 'Description', accessor: 'description', type: { kind: 'text' }, width: 200 },
  { id: 'subtotal', header: 'Subtotal', accessor: 'subtotal', type: { kind: 'currency', currency: 'USD' }, width: 120, align: 'right' },
  { id: 'tax', header: 'Tax', accessor: 'tax', type: { kind: 'currency', currency: 'USD' }, width: 100, align: 'right' },
  { id: 'total', header: 'Total', accessor: 'total', type: { kind: 'currency', currency: 'USD' }, width: 120, align: 'right' },
  { id: 'show', header: 'Show', accessor: 'show', type: { kind: 'text' }, width: 100 },
  { id: 'status', header: 'Status', accessor: 'status', type: { kind: 'select', options: [...BUD_STATUS] }, width: 110 },
  { id: 'notes', header: 'Notes', accessor: 'notes', type: { kind: 'text' }, width: 160 },
];

const payrollColumns: GridColumn<PayrollLine>[] = [
  { id: 'name', header: 'Name', accessor: 'name', type: { kind: 'text' }, width: 120, frozen: true },
  { id: 'role', header: 'Role', accessor: 'role', type: { kind: 'text' }, width: 88 },
  { id: 'dept', header: 'Dept', accessor: 'dept', type: { kind: 'select', options: DEPTS.map(d => ({ value: d, label: d })) }, width: 120 },
  { id: 'w2', header: 'Type', accessor: 'w2', type: { kind: 'select', options: W2.map(w => ({ value: w, label: w })) }, width: 72 },
  { id: 'hours', header: 'Hrs', accessor: 'hours', type: { kind: 'number', decimals: 1 }, width: 72, align: 'right' },
  { id: 'rate', header: 'Rate', accessor: 'rate', type: { kind: 'currency', currency: 'USD' }, width: 90, align: 'right' },
  { id: 'otHours', header: 'OT h', accessor: 'otHours', type: { kind: 'number', decimals: 1 }, width: 72, align: 'right' },
  { id: 'otRate', header: 'OT $', accessor: 'otRate', type: { kind: 'currency', currency: 'USD' }, width: 90, align: 'right' },
  { id: 'gross', header: 'Gross', accessor: 'gross', type: { kind: 'currency', currency: 'USD' }, width: 100, align: 'right' },
  { id: 'ded', header: 'Deduct', accessor: 'ded', type: { kind: 'currency', currency: 'USD' }, width: 90, align: 'right' },
  { id: 'net', header: 'Net', accessor: 'net', type: { kind: 'currency', currency: 'USD' }, width: 100, align: 'right' },
  { id: 'ytd', header: 'YTD', accessor: 'ytd', type: { kind: 'currency', currency: 'USD' }, width: 100, align: 'right' },
];

const channelColumns: GridColumn<ChannelLine>[] = [
  { id: 'ch', header: 'Ch', accessor: 'ch', type: { kind: 'text' }, width: 48, frozen: true, align: 'center' },
  { id: 'label', header: 'Label', accessor: 'label', type: { kind: 'text' }, width: 100 },
  { id: 'source', header: 'Source', accessor: 'source', type: { kind: 'text' }, width: 88 },
  { id: 'dest', header: 'Dest', accessor: 'dest', type: { kind: 'text' }, width: 88 },
  { id: 'mic', header: 'Mic (entity)', accessor: 'micId', type: { kind: 'entityRef', entity: 'person' }, width: 160 },
  { id: 'gear', header: 'Gear (entity)', accessor: 'gearId', type: { kind: 'entityRef', entity: 'gear' }, width: 160 },
  { id: 'gainDb', header: 'Gain dB', accessor: 'gainDb', type: { kind: 'number', decimals: 1, min: -60, max: 20 }, width: 88, align: 'right' },
  { id: 'mute', header: 'Mute', accessor: 'mute', type: { kind: 'checkbox' }, width: 64, align: 'center' },
];

function patchLine<T extends Record<string, unknown>>(row: T, key: string, value: unknown): T {
  return { ...row, [key]: value } as T;
}

type Demo = 'budget' | 'payroll' | 'channel';

export default function SpreadsheetPlaygroundClient() {
  const [demo, setDemo] = useState<Demo>('budget');
  const [stress, setStress] = useState(false);
  const [budget, setBudget] = useState(() => makeBudgetLines(200));
  const [payroll, setPayroll] = useState(() => makePayroll(30));
  const [channel, setChannel] = useState(() => makeChannel(50));

  const budgetSum = useMemo(() => {
    return budget.reduce(
      (a, r) => ({
        subtotal: a.subtotal + r.subtotal,
        tax: a.tax + r.tax,
        total: a.total + r.total,
      }),
      { subtotal: 0, tax: 0, total: 0 }
    );
  }, [budget]);

  const budgetGridRows: GridRow<BudgetLine>[] = useMemo(() => {
    const data = budget.map(
      (d): GridRow<BudgetLine> => ({
        id: d.id,
        data: d,
      })
    );
    const totals: BudgetLine = {
      id: 'bud-totals',
      code: 'Σ',
      date: '',
      category: '—',
      description: 'Tour total',
      subtotal: budgetSum.subtotal,
      tax: budgetSum.tax,
      total: budgetSum.total,
      show: '—',
      status: 'approved',
      notes: '',
    };
    return [
      ...data,
      {
        id: totals.id,
        data: totals,
        isPinnedBottom: true,
        computed: true,
      },
    ];
  }, [budget, budgetSum]);

  const sectionHeaders = useMemo(() => {
    if (stress || budget.length < 200) {
      return [{ afterRowId: null as string | null, label: 'All lines', collapsible: true }];
    }
    return [
      { afterRowId: null, label: 'Hotels & lodging', collapsible: true },
      { afterRowId: 'bud-49', label: 'Transport', collapsible: true },
      { afterRowId: 'bud-99', label: 'Production & misc', collapsible: true },
    ];
  }, [stress, budget.length]);

  const payrollGridRows: GridRow<PayrollLine>[] = useMemo(
    () => payroll.map(d => ({ id: d.id, data: d })),
    [payroll]
  );
  const channelGridRows: GridRow<ChannelLine>[] = useMemo(
    () => channel.map(d => ({ id: d.id, data: d })),
    [channel]
  );

  const onBudgetCommit = useCallback(
    async (rowId: string, columnId: string, value: unknown) => {
      if (rowId === 'bud-totals') return;
      setBudget(prev => {
        const i = prev.findIndex(r => r.id === rowId);
        if (i < 0) return prev;
        const row = { ...prev[i]! } as BudgetLine;
        const next = patchLine(row, columnId, value);
        if (columnId === 'subtotal' || columnId === 'tax') {
          next.total = next.subtotal + next.tax;
        }
        const copy = [...prev];
        copy[i] = next;
        return copy;
      });
    },
    []
  );

  const onBudgetBulk = useCallback(
    async (rowIds: string[], columnId: string, value: unknown) => {
      setBudget(prev => {
        const byId = new Map(prev.map((r, i) => [r.id, i] as const));
        const next = [...prev];
        for (const id of rowIds) {
          if (id === 'bud-totals') continue;
          const i = byId.get(id);
          if (i === undefined) continue;
          const row = { ...next[i]! } as BudgetLine;
          const u = patchLine(row, columnId, value);
          if (columnId === 'subtotal' || columnId === 'tax') {
            u.total = u.subtotal + u.tax;
          }
          next[i] = u;
        }
        return next;
      });
    },
    []
  );

  const onPayrollCommit = useCallback(
    async (rowId: string, columnId: string, value: unknown) => {
      setPayroll(prev => {
        const i = prev.findIndex(r => r.id === rowId);
        if (i < 0) return prev;
        const row = { ...prev[i]! } as PayrollLine;
        const next = patchLine(row, columnId, value) as PayrollLine;
        if (['hours', 'rate', 'otHours', 'otRate'].includes(columnId)) {
          const gross = next.hours * next.rate + next.otHours * next.otRate;
          next.gross = Math.round(gross * 100) / 100;
          next.net = Math.round((next.gross - next.ded) * 100) / 100;
        }
        if (columnId === 'gross' || columnId === 'ded') {
          next.net = Math.round((next.gross - next.ded) * 100) / 100;
        }
        const copy = [...prev];
        copy[i] = next;
        return copy;
      });
    },
    []
  );

  const onPayrollBulk = useCallback(
    async (rowIds: string[], columnId: string, value: unknown) => {
      setPayroll(prev => {
        const byId = new Map(prev.map((r, i) => [r.id, i] as const));
        const next = [...prev];
        for (const id of rowIds) {
          const i = byId.get(id);
          if (i === undefined) continue;
          const row = { ...next[i]! } as PayrollLine;
          const u = patchLine(row, columnId, value) as PayrollLine;
          if (['hours', 'rate', 'otHours', 'otRate'].includes(columnId)) {
            const gross = u.hours * u.rate + u.otHours * u.otRate;
            u.gross = Math.round(gross * 100) / 100;
            u.net = Math.round((u.gross - u.ded) * 100) / 100;
          }
          if (columnId === 'gross' || columnId === 'ded') {
            u.net = Math.round((u.gross - u.ded) * 100) / 100;
          }
          next[i] = u;
        }
        return next;
      });
    },
    []
  );

  const onChannelCommit = useCallback(
    async (rowId: string, columnId: string, value: unknown) => {
      setChannel(prev => {
        const i = prev.findIndex(r => r.id === rowId);
        if (i < 0) return prev;
        const row = { ...prev[i]! } as ChannelLine;
        const next = patchLine(row, columnId, value) as ChannelLine;
        const copy = [...prev];
        copy[i] = next;
        return copy;
      });
    },
    []
  );

  const onChannelBulk = useCallback(
    async (rowIds: string[], columnId: string, value: unknown) => {
      setChannel(prev => {
        const byId = new Map(prev.map((r, i) => [r.id, i] as const));
        const next = [...prev];
        for (const id of rowIds) {
          const i = byId.get(id);
          if (i === undefined) continue;
          const row = { ...next[i]! } as ChannelLine;
          next[i] = patchLine(row, columnId, value) as ChannelLine;
        }
        return next;
      });
    },
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 pb-8">
      <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
        UX06 <code>SpreadsheetGrid</code> — admin only. Compare styling with{' '}
        <Link
          className="font-semibold underline"
          style={{ color: 'var(--lp-orange)' }}
          href="/bugs"
        >
          /bugs
        </Link>{' '}
        and the live tour budget when exercising Demo 1.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {(['budget', 'payroll', 'channel'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setDemo(k)}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={
              demo === k
                ? { background: 'var(--lp-orange)', color: '#fff' }
                : { background: 'var(--lp-surface)', color: 'var(--lp-text)', border: '1px solid var(--lp-border)' }
            }
          >
            {k === 'budget' && '1. Budget (tight)'}
            {k === 'payroll' && '2. Payroll (comfortable)'}
            {k === 'channel' && '3. Channel list'}
          </button>
        ))}
        {demo === 'budget' && (
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            <input
              type="checkbox"
              checked={stress}
              onChange={e => {
                const on = e.target.checked;
                setStress(on);
                setBudget(makeBudgetLines(on ? 5000 : 200));
              }}
              className="rounded border"
            />
            5,000 rows (virtualisation stress)
          </label>
        )}
      </div>

      {demo === 'budget' && (
        <section className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-1 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
            Budget mock
          </h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            200×10 (or 5k with stress), section headers, currency + pinned total row.
          </p>
          <div className="h-[min(75vh,640px)] min-h-0 w-full max-w-full">
            <SpreadsheetGrid<BudgetLine>
              columns={budgetColumns}
              rows={budgetGridRows}
              density="tight"
              sectionHeaders={sectionHeaders}
              containerHeight="100%"
              ariaLabel="Budget spreadsheet demo"
              onCommitCell={onBudgetCommit}
              onBulkEdit={onBudgetBulk}
              onRowOpen={r => {
                console.info('[playground] open row', r);
              }}
            />
          </div>
        </section>
      )}

      {demo === 'payroll' && (
        <section className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-1 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
            Payroll mock
          </h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            30×12 mixed types; editing hours, rates, or gross/ded recalculates in the playground.
          </p>
          <div className="h-[min(70vh,560px)] min-h-0 w-full max-w-full">
            <SpreadsheetGrid<PayrollLine>
              columns={payrollColumns}
              rows={payrollGridRows}
              density="comfortable"
              containerHeight="100%"
              ariaLabel="Payroll spreadsheet demo"
              onCommitCell={onPayrollCommit}
              onBulkEdit={onPayrollBulk}
            />
          </div>
        </section>
      )}

      {demo === 'channel' && (
        <section className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-1 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
            Channel list mock
          </h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            50×8 with entity reference columns (stub) and checkboxes.
          </p>
          <div className="h-[min(65vh,520px)] min-h-0 w-full max-w-full">
            <SpreadsheetGrid<ChannelLine>
              columns={channelColumns}
              rows={channelGridRows}
              density="compact"
              containerHeight="100%"
              ariaLabel="Channel list spreadsheet demo"
              onCommitCell={onChannelCommit}
              onBulkEdit={onChannelBulk}
            />
          </div>
        </section>
      )}
    </div>
  );
}
