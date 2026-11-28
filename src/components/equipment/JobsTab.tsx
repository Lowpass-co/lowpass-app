/* ============================================
   LOWPASS — Rental jobs list (Nov 2026 visual pass)

   Grouped by month (this month on, soonest first, then earlier), or by status
   (Adam: "months and then optional sort by status"). Each group is a flat
   <DataTable>; status chips and one search sit above. Totals come from
   priceQuote — the job page's own pricing.
   ============================================ */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, Search, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { jobDaysPerWeek } from '@/lib/rental-pricing';
import { priceQuote } from '@/lib/rental/quote';
import {
  fmtRange, groupJobsByMonth, groupJobsByStatus,
  JOB_STATUS_LABEL, JOB_STATUS_ORDER, type JobStatus,
} from '@/lib/rental/jobList';
import { rentalApi } from './rentalApi';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { FilterChips } from '@/components/ui/FilterChips';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { JobModal } from './JobModal';
import { JobDetail, type LinesUpdate, type RentalSettingsView } from './JobDetail';
import { JOB_STATUS_TONE, StatusPill } from './StatusPill';
import {
  calcDays, fmtMoney, jobCurrency, resolveQuoteDisplay,
  type EquipmentArtistOption, type EquipmentTourOption,
  type RentalJob, type RentalInventoryItem, type RentalJobItem,
} from './types';

interface Props {
  userId: string;
  workspaceId: string | null;
  jobs: RentalJob[];
  setJobs: (jobs: RentalJob[]) => void;
  linesByJob: Record<string, RentalJobItem[]>;
  onLinesChange: (jobId: string, next: LinesUpdate) => void;
  inventory: RentalInventoryItem[];
  artists: EquipmentArtistOption[];
  tours: EquipmentTourOption[];
  setArtists: (a: EquipmentArtistOption[]) => void;
  setTours: (t: EquipmentTourOption[]) => void;
  settings: RentalSettingsView;
  onOpenSettings: () => void;
}

type Row = {
  job: RentalJob;
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  artistTour: string;
  billed: number;
  /** In the figures' own currency (dispCur). */
  total: number;
  currency: string;
};

type Grouping = 'month' | 'status';
const GROUP_KEY = 'lowpass:rental:jobs:group';

export function JobsTab({
  userId, workspaceId, jobs, setJobs, linesByJob, onLinesChange, inventory,
  artists, tours, setArtists, setTours, settings, onOpenSettings,
}: Props) {
  const { showToast } = useToast();
  const [modalOpen, setModal] = useState(false);
  const [editingJob, setEditingJob] = useState<RentalJob | null>(null);
  const [activeJobId, setActiveJob] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all');
  const [grouping, setGroupingState] = useState<Grouping>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(GROUP_KEY) === 'status' ? 'status' : 'month';
    } catch {
      return 'month';
    }
  });
  function setGrouping(g: Grouping) {
    setGroupingState(g);
    try { window.localStorage.setItem(GROUP_KEY, g); } catch { /* private mode */ }
  }

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  const rows: Row[] = useMemo(
    () =>
      jobs.map((job) => {
        const billed = calcDays(job.start_date, job.end_date, jobDaysPerWeek(job, settings.daysPerWeek));
        const q = priceQuote({
          lines: linesByJob[job.id] ?? [],
          stock: inventory,
          days: billed,
          discountPercent: job.discount_percent,
          discountFixed: job.discount_fixed,
        });
        /* The list has no live rate: a frozen job shows its frozen
           conversion, a draft in another currency shows dollars, labelled. */
        const rate = job.fx_rate != null ? Number(job.fx_rate) : null;
        const { dispCur } = resolveQuoteDisplay(jobCurrency(job), rate);
        const artist = job.artist?.name ?? artists.find((a) => a.id === job.artist_id)?.name;
        const tour = job.tour?.name ?? tours.find((t) => t.id === job.tour_id)?.name;
        return {
          job,
          id: job.id,
          name: job.name,
          status: job.status,
          start_date: job.start_date,
          artistTour: [artist, tour].filter(Boolean).join(' / '),
          billed,
          total: dispCur === 'USD' || rate == null ? q.total : q.total * rate,
          currency: dispCur,
        };
      }),
    [jobs, linesByJob, inventory, settings.daysPerWeek, artists, tours],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobs) c[j.status] = (c[j.status] ?? 0) + 1;
    return c;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.job.client_name, r.artistTour, r.job.notes].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  const groups = useMemo(
    () => (grouping === 'status' ? groupJobsByStatus(filtered) : groupJobsByMonth(filtered, new Date())),
    [filtered, grouping],
  );

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'name', header: 'Job', accessor: 'name', flex: true, minWidth: 220,
        cell: (_, r) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-lp-text">{r.name}</span>
            {r.job.client_name ? <span className="block truncate text-xs text-lp-text-tertiary">{r.job.client_name}</span> : null}
          </span>
        ),
      },
      { id: 'artist', header: 'Artist / tour', accessor: 'artistTour', width: 220, cell: (v) => <span className="text-lp-text-secondary">{String(v || '—')}</span> },
      {
        id: 'dates', header: 'Dates', accessor: (r) => r.start_date ?? '', width: 200,
        cell: (_, r) => (
          <span className="block">
            <span className="block text-lp-text-secondary">{fmtRange(r.job.start_date, r.job.end_date)}</span>
            <span className="block text-xs text-lp-text-tertiary">{r.billed} day{r.billed === 1 ? '' : 's'} billed</span>
          </span>
        ),
      },
      { id: 'total', header: 'Total', accessor: 'total', align: 'right', width: 130, cell: (_, r) => <span className="tabular-nums text-lp-text">{fmtMoney(r.total, r.currency)}</span> },
      {
        id: 'status', header: 'Status', accessor: 'status', width: 130,
        cell: (_, r) => <StatusPill tone={JOB_STATUS_TONE[r.status] ?? 'neutral'}>{JOB_STATUS_LABEL[r.status as JobStatus] ?? r.status}</StatusPill>,
      },
    ],
    [],
  );

  function openNewJob() {
    setEditingJob(null);
    setModal(true);
  }

  function onJobSaved(saved: RentalJob) {
    const exists = jobs.find((j) => j.id === saved.id);
    if (exists) setJobs(jobs.map((j) => (j.id === saved.id ? { ...j, ...saved } : j)));
    else setJobs([saved, ...jobs]);
    setModal(false);
    setActiveJob(saved.id);
  }

  async function deleteJob(id: string) {
    await rentalApi.deleteJob(id);
    setJobs(jobs.filter((j) => j.id !== id));
    setActiveJob(null);
    showToast('Job deleted', 'success');
  }

  const onJobUpdated = useCallback(
    (updated: RentalJob) => setJobs(jobs.map((j) => (j.id === updated.id ? updated : j))),
    [jobs, setJobs],
  );

  const refreshWorkspaceLists = useCallback(async () => {
    if (!workspaceId) return;
    const sb = createClient();
    const [{ data: a }, { data: t }] = await Promise.all([
      sb.from('artists').select('id, name').eq('workspace_id', workspaceId).order('name'),
      sb.from('tours').select('id, name, artist_id').eq('workspace_id', workspaceId).order('start_date', { ascending: false }),
    ]);
    if (a) setArtists(a as EquipmentArtistOption[]);
    if (t) setTours(t as EquipmentTourOption[]);
  }, [workspaceId, setArtists, setTours]);

  /* R2-5 — the modal renders in BOTH branches (the job page's Edit lives in
     the other one). One shared block so nobody can fix one copy. */
  const jobModal = modalOpen ? (
    <JobModal
      userId={userId}
      workspaceId={workspaceId}
      editing={editingJob}
      artists={artists}
      tours={tours}
      onListsUpdated={refreshWorkspaceLists}
      onSave={onJobSaved}
      onClose={() => setModal(false)}
    />
  ) : null;

  if (activeJob) {
    return (
      <div className="w-full min-w-0">
        {jobModal}
        <JobDetail
          job={activeJob}
          inventory={inventory}
          artists={artists}
          tours={tours}
          lines={linesByJob[activeJob.id] ?? []}
          onLinesChange={onLinesChange}
          onBack={() => setActiveJob(null)}
          onEdit={() => { setEditingJob(activeJob); setModal(true); }}
          onDelete={() => deleteJob(activeJob.id)}
          onJobUpdated={onJobUpdated}
          settings={settings}
        />
      </div>
    );
  }

  const chipOptions = [
    { value: 'all' as const, label: 'All', count: jobs.length },
    ...JOB_STATUS_ORDER.map((s) => ({ value: s, label: JOB_STATUS_LABEL[s], count: counts[s] ?? 0 })),
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="lp-page-title" style={{ margin: 0, color: 'var(--lp-text)' }}>Rental jobs</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={<Settings size={14} aria-hidden />} onClick={onOpenSettings}>Settings</Button>
          <Button variant="primary" size="sm" leadingIcon={<Plus size={14} aria-hidden />} onClick={openNewJob}>New job</Button>
        </div>
      </header>

      {jobs.length === 0 ? (
        <div className="rounded-xl border px-6 py-16 text-center" style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}>
          <p className="text-base font-medium text-lp-text">Start your first job</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-lp-text-tertiary">A job is one hire: who it’s for, the dates, and the gear going out. Quotes and invoices come from it.</p>
          <div className="mt-4 flex justify-center">
            <Button variant="primary" size="sm" leadingIcon={<Plus size={14} aria-hidden />} onClick={openNewJob}>New job</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lp-text-tertiary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs, clients, artists"
                aria-label="Search jobs"
                className="h-9 w-full rounded-lg border bg-lp-surface pl-8 pr-3 text-sm text-lp-text outline-none placeholder:text-lp-text-tertiary focus-visible:border-[var(--color-lp-orange)]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </div>
            <FilterChips options={chipOptions} value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" />
            <div className="ml-auto flex items-center gap-2 text-xs text-lp-text-tertiary">
              Group by
              <FilterChips
                options={[{ value: 'month' as const, label: 'Month' }, { value: 'status' as const, label: 'Status' }]}
                value={grouping}
                onChange={setGrouping}
                ariaLabel="Group jobs by"
              />
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-lp-text-tertiary">Nothing matches that.</p>
          ) : (
            groups.map((g) => {
              const curs = new Set(g.jobs.map((r) => r.currency));
              const sum = curs.size === 1 ? g.jobs.reduce((s, r) => s + r.total, 0) : null;
              return (
                <section key={g.key} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <h2 className={`text-sm font-medium ${g.past ? 'text-lp-text-secondary' : 'text-lp-text'}`}>{g.label}</h2>
                    <span className="text-xs tabular-nums text-lp-text-tertiary">
                      {g.jobs.length} job{g.jobs.length === 1 ? '' : 's'}
                      {sum != null ? ` · ${fmtMoney(sum, [...curs][0])}` : ''}
                    </span>
                  </div>
                  <DataTable<Row>
                    rows={g.jobs}
                    columns={columns}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => setActiveJob(r.id)}
                    searchable={false}
                    toolbar={false}
                    pagination="none"
                    stickyHeader={false}
                    density="comfortable"
                    ariaLabel={`Rental jobs — ${g.label}`}
                  />
                </section>
              );
            })
          )}
        </>
      )}

      {jobModal}
    </div>
  );
}
