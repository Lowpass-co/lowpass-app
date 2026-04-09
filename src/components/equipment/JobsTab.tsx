/* ============================================
   LOWPASS — Equipment / Jobs Tab
   ============================================ */

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { JobModal } from './JobModal';
import { JobDetail } from './JobDetail';
import { STATUS_STYLES, calcDays, fmtUSD, fmtDate, type RentalJob, type RentalInventoryItem } from './types';

interface Props {
  userId: string;
  jobs: RentalJob[];
  setJobs: (jobs: RentalJob[]) => void;
  inventory: RentalInventoryItem[];
}

export function JobsTab({ userId, jobs, setJobs, inventory }: Props) {
  const [modalOpen, setModal]       = useState(false);
  const [editingJob, setEditingJob] = useState<RentalJob | null>(null);
  const [activeJobId, setActiveJob] = useState<string | null>(null);
  const supabase = createClient();

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;

  function openNewJob()             { setEditingJob(null); setModal(true); }
  function openEditJob(job: RentalJob) { setEditingJob(job); setModal(true); }

  function onJobSaved(saved: RentalJob) {
    const exists = jobs.find(j => j.id === saved.id);
    if (exists) setJobs(jobs.map(j => j.id === saved.id ? saved : j));
    else        setJobs([saved, ...jobs]);
    setModal(false);
    setActiveJob(saved.id);
  }

  async function onJobDeleted(id: string) {
    const { error } = await supabase.from('rental_jobs').delete().eq('id', id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setJobs(jobs.filter(j => j.id !== id));
    setActiveJob(null);
  }

  function onJobUpdated(updated: RentalJob) {
    setJobs(jobs.map(j => j.id === updated.id ? updated : j));
  }

  if (activeJob) {
    return (
      <JobDetail
        job={activeJob}
        inventory={inventory}
        onBack={() => setActiveJob(null)}
        onEdit={() => openEditJob(activeJob)}
        onDelete={() => onJobDeleted(activeJob.id)}
        onJobUpdated={onJobUpdated}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
          {jobs.length} job{jobs.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={openNewJob}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors"
          style={{ backgroundColor: '#FF4500' }}
          onMouseOver={e => (e.currentTarget.style.backgroundColor = '#E63E00')}
          onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
        >
          <Plus size={14} strokeWidth={2.5} /> New Job
        </button>
      </div>

      {jobs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl border py-20 gap-3"
          style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
        >
          <div className="text-3xl">📋</div>
          <p className="text-sm font-medium" style={{ color: 'var(--lp-text-secondary)' }}>No jobs yet</p>
          <button onClick={openNewJob} className="text-xs font-semibold" style={{ color: '#FF4500' }}>
            Create your first job →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map(job => {
            const days   = calcDays(job.start_date, job.end_date);
            const style  = STATUS_STYLES[job.status] ?? STATUS_STYLES.draft;
            return (
              <button
                key={job.id}
                onClick={() => setActiveJob(job.id)}
                className="rounded-xl border p-4 text-left transition-all hover:shadow-md"
                style={{
                  borderColor: 'var(--lp-border)',
                  backgroundColor: 'var(--lp-surface)',
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = '#FF4500')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--lp-border)')}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-semibold leading-tight" style={{ color: 'var(--lp-text)' }}>{job.name}</div>
                    {job.client_name && (
                      <div className="mt-0.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{job.client_name}</div>
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {job.status}
                  </span>
                </div>
                <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                  <span>📅 {fmtDate(job.start_date)}</span>
                  <span>⏱ {days} day{days !== 1 ? 's' : ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <JobModal
          userId={userId}
          editing={editingJob}
          onSave={onJobSaved}
          onClose={() => setModal(false)}
        />
      )}
    </>
  );
}
