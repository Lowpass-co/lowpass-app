/* ============================================
   LOWPASS — Equipment / Jobs Tab
   Mirrors inventory toolbar + table shell.
   ============================================ */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import { JobModal } from './JobModal';
import { JobDetail } from './JobDetail';
import { cn } from '@/lib/utils';
import {
  EQUIPMENT_TABLE_MIN_CLASS,
  EQUIPMENT_TOOLBAR_GRID_CLASS,
  STATUS_OPTIONS,
  STATUS_STYLES,
  calcDays,
  fmtDate,
  type EquipmentArtistOption,
  type EquipmentTourOption,
  type RentalJob,
  type RentalInventoryItem,
} from './types';

interface Props {
  userId: string;
  workspaceId: string | null;
  jobs: RentalJob[];
  setJobs: (jobs: RentalJob[]) => void;
  inventory: RentalInventoryItem[];
  artists: EquipmentArtistOption[];
  tours: EquipmentTourOption[];
  setArtists: (a: EquipmentArtistOption[]) => void;
  setTours: (t: EquipmentTourOption[]) => void;
}

export function JobsTab({
  userId,
  workspaceId,
  jobs,
  setJobs,
  inventory,
  artists,
  tours,
  setArtists,
  setTours,
}: Props) {
  const [modalOpen, setModal] = useState(false);
  const [editingJob, setEditingJob] = useState<RentalJob | null>(null);
  const [activeJobId, setActiveJob] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const supabase = createClient();

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  const statusOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      { value: '', label: 'All statuses' },
      ...STATUS_OPTIONS.map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      const matchS = !statusFilter || j.status === statusFilter;
      if (!q) return matchS;
      const blob = [
        j.name,
        j.client_name,
        j.artist?.name,
        j.tour?.name,
        j.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchS && blob.includes(q);
    });
  }, [jobs, search, statusFilter]);

  function openNewJob() {
    setEditingJob(null);
    setModal(true);
  }
  function openEditJob(job: RentalJob) {
    setEditingJob(job);
    setModal(true);
  }

  function onJobSaved(saved: RentalJob) {
    const exists = jobs.find((j) => j.id === saved.id);
    if (exists) setJobs(jobs.map((j) => (j.id === saved.id ? saved : j)));
    else setJobs([saved, ...jobs]);
    setModal(false);
    setActiveJob(saved.id);
  }

  async function onJobDeleted(id: string) {
    const { error } = await supabase.from('rental_jobs').delete().eq('id', id);
    if (error) {
      alert('Delete failed: ' + error.message);
      return;
    }
    setJobs(jobs.filter((j) => j.id !== id));
    setActiveJob(null);
  }

  function onJobUpdated(updated: RentalJob) {
    setJobs(jobs.map((j) => (j.id === updated.id ? updated : j)));
  }

  const refreshWorkspaceLists = useCallback(async () => {
    if (!workspaceId) return;
    const sb = createClient();
    const [{ data: a }, { data: t }] = await Promise.all([
      sb.from('artists').select('id, name').eq('workspace_id', workspaceId).order('name'),
      sb
        .from('tours')
        .select('id, name, artist_id')
        .eq('workspace_id', workspaceId)
        .order('start_date', { ascending: false }),
    ]);
    if (a) setArtists(a as EquipmentArtistOption[]);
    if (t) setTours(t as EquipmentTourOption[]);
  }, [workspaceId, setArtists, setTours]);

  if (activeJob) {
    return (
      <div className="w-full min-w-0">
        <JobDetail
          job={activeJob}
          inventory={inventory}
          artists={artists}
          tours={tours}
          onBack={() => setActiveJob(null)}
          onEdit={() => openEditJob(activeJob)}
          onDelete={() => onJobDeleted(activeJob.id)}
          onJobUpdated={onJobUpdated}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className={EQUIPMENT_TOOLBAR_GRID_CLASS}>
        <div className="relative min-w-0">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="w-full min-w-0 rounded-lg border py-2 pl-8 pr-3 text-sm"
            style={{
              backgroundColor: 'var(--lp-surface)',
              borderColor: 'var(--lp-border)',
              color: 'var(--lp-text)',
            }}
          />
        </div>
        <div className="w-[160px] shrink-0 justify-self-stretch">
          <StyledSelect
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            placeholder="All statuses"
          />
        </div>
        <span className="text-right text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--lp-text-tertiary)' }}>
          {jobs.length} job{jobs.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={openNewJob}
          className="flex w-full min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors"
          style={{ backgroundColor: '#FF4500' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#E63E00')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#FF4500')}
        >
          <Plus size={14} strokeWidth={2.5} /> New Job
        </button>
      </div>

      <div
        className={cn('flex flex-col overflow-hidden rounded-xl border', EQUIPMENT_TABLE_MIN_CLASS)}
        style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
            <div className="text-3xl">📋</div>
            <p className="text-sm font-medium" style={{ color: 'var(--lp-text-secondary)' }}>
              {jobs.length === 0 ? 'No jobs yet.' : 'No jobs match that search'}
            </p>
            {jobs.length === 0 && (
              <button
                type="button"
                onClick={openNewJob}
                className="text-xs font-semibold"
                style={{ color: '#FF4500' }}
              >
                Create your first job →
              </button>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-bg-secondary)',
                  }}
                >
                  {['Name', 'Artist', 'Tour', 'Client', 'Dates', 'Status', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className={cn(
                        'px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider',
                        i === 6 && 'w-24 text-right'
                      )}
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((job, idx) => {
                  const days = calcDays(job.start_date, job.end_date);
                  const style = STATUS_STYLES[job.status] ?? STATUS_STYLES.draft;
                  const artistLabel = job.artist?.name ?? (job.artist_id ? '—' : '—');
                  const tourLabel = job.tour?.name ?? (job.tour_id ? '—' : '—');
                  return (
                    <tr
                      key={job.id}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom:
                          idx < filtered.length - 1 ? '1px solid var(--lp-border-light)' : 'none',
                      }}
                      onClick={() => setActiveJob(job.id)}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--lp-surface-hover)')
                      }
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold" style={{ color: 'var(--lp-text)' }}>
                          {job.name}
                        </div>
                        {job.notes && (
                          <div
                            className="mt-0.5 max-w-[240px] truncate text-xs"
                            style={{ color: 'var(--lp-text-tertiary)' }}
                          >
                            {job.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--lp-text-secondary)' }}>
                        {artistLabel}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--lp-text-secondary)' }}>
                        {tourLabel}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--lp-text-secondary)' }}>
                        {job.client_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                        <div>{fmtDate(job.start_date)} → {fmtDate(job.end_date)}</div>
                        <div className="mt-0.5" style={{ color: 'var(--lp-text-tertiary)' }}>
                          {days} day{days !== 1 ? 's' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: style.bg, color: style.text }}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditJob(job)}
                            className="rounded-md p-1.5 transition-colors"
                            style={{ color: 'var(--lp-text-tertiary)' }}
                            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--lp-text)')}
                            onMouseOut={(e) =>
                              (e.currentTarget.style.color = 'var(--lp-text-tertiary)')
                            }
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete job "${job.name}"?`)) void onJobDeleted(job.id);
                            }}
                            className="rounded-md p-1.5 transition-colors"
                            style={{ color: 'var(--lp-text-tertiary)' }}
                            onMouseOver={(e) => (e.currentTarget.style.color = '#EF4444')}
                            onMouseOut={(e) =>
                              (e.currentTarget.style.color = 'var(--lp-text-tertiary)')
                            }
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
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
      )}
    </div>
  );
}
