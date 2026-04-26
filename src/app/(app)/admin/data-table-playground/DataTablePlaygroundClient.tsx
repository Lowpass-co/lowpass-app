'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { SEVERITY_META, STATUS_META } from '@/components/bug-report/types';

/* --- Demos: mock data --- */

type Personnel = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
};

const names = [
  'Alex Kim',
  'Sam Rivera',
  'Jordan Lee',
  'Casey Park',
  'Morgan Fox',
  'Riley Stone',
  'Drew Chen',
  'Quinn Hall',
  'Jesse West',
  'Avery North',
];
const roles = ['FOH', 'Mon', 'PM', 'TM', 'Driver', 'Lx'];

function makePersonnel(n: number): Personnel[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    name: names[i % names.length] + (i >= 10 ? ` ${Math.floor(i / 10)}` : ''),
    role: roles[i % roles.length],
    email: `user${i}@example.com`,
    phone: `+1 555 ${String(1000 + (i * 7) % 9000).padStart(4, '0')}`,
    status: i % 7 === 0 ? 'inactive' : 'active',
  }));
}

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  show: string;
};

const expCats = ['Travel', 'Meals', 'Gear', 'Per diem', 'Other'];
function makeExpenses(n: number): Expense[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e-${i}`,
    date: new Date(2025, 0, 1 + (i % 200)).toISOString().slice(0, 10),
    category: expCats[i % expCats.length],
    description: `Line item ${i} — details`,
    amount: Math.round(50 + (i * 13) % 2000) + (i % 100) / 100,
    show: i % 3 === 0 ? 'Headline' : 'Support',
  }));
}

type TourRow = {
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  shows: number;
};

const tourNames = [
  'Neon North America',
  'EU Acoustic',
  'Asia Festival',
  'UK Residency',
  'Coast to Coast',
  'Winter Shed',
  'Spring Arenas',
  'Summer Stadia',
  'Festival run',
  'Theatre',
  'Club circuit',
  'Reunion',
];
function makeTours(n: number): TourRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t-${i}`,
    name: tourNames[i % tourNames.length],
    status: i % 4 === 0 ? 'complete' : i % 3 === 0 ? 'draft' : 'active',
    start: new Date(2025, 2 + (i % 4), 1 + (i % 20)).toISOString().slice(0, 10),
    end: new Date(2025, 6 + (i % 4), 1 + (i % 15)).toISOString().slice(0, 10),
    shows: 4 + (i * 3) % 40,
  }));
}

const bugTitles = [
  'Dropdown clips under modal',
  'Time zone wrong on day sheet',
  'Channel list save flicker',
  'Budget CSV missing column',
  'Slideovers trap focus on mobile',
  'Search debounce not clearing',
  'Roster import duplicate rows',
  'Dark mode: low contrast in table',
  'Avatar fails on slow 3G',
  'Long tour name overflow',
  'iOS Safari date picker',
  'Export zip empty sometimes',
  'PWA cache stale on deploy',
  'Keyboard: skip hidden rows',
  'Bulk action toast duplicate',
  'Filter chip label truncation',
  'Server error 500 on save',
  'Read-only user can edit? ',
  'Chart axis labels overlap',
  'Session expiry mid-form',
  'PDF export missing logo',
  'List scroll jumps on filter',
  'Command palette: duplicate hits',
  'On-call redirect loop',
  'Empty state on slow network',
  'Undo toast dismisses too fast',
  'Guest link expired message',
  'Map pin stack',
  'Calendar week start',
  'Locale number format',
];
type BugRow = {
  id: string;
  title: string;
  severity: keyof typeof SEVERITY_META;
  status: keyof typeof STATUS_META;
  reporter: string;
  created: string;
};

function makeBugs(n: number): BugRow[] {
  const sevs = Object.keys(SEVERITY_META) as (keyof typeof SEVERITY_META)[];
  const st = Object.keys(STATUS_META) as (keyof typeof STATUS_META)[];
  return Array.from({ length: n }, (_, i) => ({
    id: `b-${i}`,
    title: bugTitles[i % bugTitles.length],
    severity: sevs[i % sevs.length],
    status: st[i % st.length],
    reporter: i % 2 === 0 ? `user${i}@band.com` : `tour@example.org`,
    created: new Date(2025, 0, 1 + (i % 90)).toISOString(),
  }));
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: `${color}1a`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const personnelCols: ColumnDef<Personnel>[] = [
  { id: 'name', header: 'Name', accessor: 'name', sortable: true, minWidth: 140 },
  { id: 'role', header: 'Role', accessor: 'role', sortable: true, width: 100 },
  { id: 'email', header: 'Email', accessor: 'email', sortable: true, minWidth: 180 },
  { id: 'phone', header: 'Phone', accessor: 'phone', minWidth: 120 },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    sortable: true,
    width: 100,
    cell: v => <span className="capitalize">{String(v)}</span>,
  },
];

const expensesCols: ColumnDef<Expense>[] = [
  { id: 'date', header: 'Date', accessor: 'date', sortable: true, width: 120 },
  {
    id: 'category',
    header: 'Category',
    accessor: 'category',
    sortable: true,
    width: 120,
    filter: { kind: 'select', options: expCats.map(c => ({ value: c, label: c })) },
  },
  { id: 'description', header: 'Description', accessor: 'description', minWidth: 200 },
  {
    id: 'amount',
    header: 'Amount',
    accessor: 'amount',
    sortable: true,
    align: 'right',
    width: 100,
    cell: v => (
      <span className="font-[family-name:var(--lp-font-numeric)]">
        {typeof v === 'number' ? v.toFixed(2) : String(v)}
      </span>
    ),
  },
  { id: 'show', header: 'Show', accessor: 'show', sortable: true, width: 100 },
];

const tourCols: ColumnDef<TourRow>[] = [
  { id: 'name', header: 'Name', accessor: 'name', sortable: true, frozen: true, minWidth: 180 },
  { id: 'status', header: 'Status', accessor: 'status', sortable: true, width: 100 },
  { id: 'start', header: 'Start', accessor: 'start', sortable: true, width: 120 },
  { id: 'end', header: 'End', accessor: 'end', sortable: true, width: 120 },
  {
    id: 'shows',
    header: 'Shows',
    accessor: 'shows',
    sortable: true,
    align: 'right',
    width: 80,
  },
];

const bugCols: ColumnDef<BugRow>[] = [
  {
    id: 'title',
    header: 'Title',
    accessor: 'title',
    sortable: true,
    minWidth: 220,
    cell: (_v, row) => (
      <p className="min-w-0 font-semibold" style={{ color: 'var(--lp-text)' }}>
        {row.title}
      </p>
    ),
  },
  {
    id: 'severity',
    header: 'Severity',
    accessor: 'severity',
    sortable: true,
    width: 120,
    cell: (_v, row) => <Pill label={SEVERITY_META[row.severity].label} color={SEVERITY_META[row.severity].color} />,
  },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    sortable: true,
    width: 120,
    cell: (_v, row) => <Pill label={STATUS_META[row.status].label} color={STATUS_META[row.status].color} />,
  },
  {
    id: 'reporter',
    header: 'Reporter',
    accessor: 'reporter',
    minWidth: 160,
  },
  {
    id: 'created',
    header: 'Created',
    accessor: 'created',
    sortable: true,
    width: 160,
    cell: v => <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{fmtDate(String(v))}</span>,
  },
];

export default function DataTablePlaygroundClient() {
  const personnel = useMemo(() => makePersonnel(50), []);
  const expenses = useMemo(() => makeExpenses(200), []);
  const tours = useMemo(() => makeTours(12), []);
  const bugs = useMemo(() => makeBugs(30), []);

  const [selP, setSelP] = useState<string[]>([]);
  const [skeleton, setSkeleton] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-10 pb-8">
      <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
        UX05 <code>DataTable</code> — sort, search, filter, selection, keyboard (/, arrows, Enter / Space, Esc in
        search). Open{' '}
        <Link
          className="font-semibold underline"
          style={{ color: 'var(--lp-orange)' }}
          href="/bugs"
        >
          /bugs
        </Link>{' '}
        in another tab to compare the Bug Reports mock below.
      </p>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
            1. Personnel
          </h2>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            <input
              type="checkbox"
              checked={skeleton}
              onChange={e => setSkeleton(e.target.checked)}
              className="rounded border"
            />
            Force loading skeleton
          </label>
        </div>
        <p className="mb-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          50 rows, comfortable, selectable + bulk area.
        </p>
        <div className="h-[min(70vh,520px)] min-h-0">
          <DataTable<Personnel>
            rows={skeleton ? undefined : personnel}
            rowKey={r => r.id}
            columns={personnelCols}
            density="comfortable"
            selectable
            selectedIds={selP}
            onSelectionChange={setSelP}
            selectionActions={
              <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                (Playground: wire actions in UX13.)
              </span>
            }
            onRowClick={() => undefined}
            containerHeight="100%"
            pageSize={50}
            pagination="paged"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
          2. Expenses
        </h2>
        <p className="mb-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          200 rows, compact, sortable, category filter chip.
        </p>
        <div className="h-[min(60vh,420px)] min-h-0">
          <DataTable<Expense>
            rows={expenses}
            rowKey={r => r.id}
            columns={expensesCols}
            density="compact"
            onRowClick={() => undefined}
            containerHeight="100%"
            pageSize={50}
            pagination="paged"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
          3. Tours
        </h2>
        <p className="mb-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          12 rows, frozen Name, 10 per page.
        </p>
        <div className="h-[min(50vh,400px)] min-h-0">
          <DataTable<TourRow>
            rows={tours}
            rowKey={r => r.id}
            columns={tourCols}
            density="comfortable"
            onRowClick={() => undefined}
            containerHeight="100%"
            pageSize={10}
            pagination="paged"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
          4. Bug reports (mock)
        </h2>
        <p className="mb-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          30 mock rows — pills and typography aligned with the live Bug Reports grid.
        </p>
        <div className="h-[min(60vh,480px)] min-h-0">
          <DataTable<BugRow>
            rows={bugs}
            rowKey={r => r.id}
            columns={bugCols}
            density="comfortable"
            onRowClick={() => undefined}
            containerHeight="100%"
            pageSize={50}
            pagination="paged"
          />
        </div>
      </section>
    </div>
  );
}
