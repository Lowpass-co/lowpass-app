/* ============================================
   LOWPASS — Job Modal (Create / Edit)
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { type RentalJob } from './types';

interface Props {
  userId: string;
  editing: RentalJob | null;
  onSave: (job: RentalJob) => void;
  onClose: () => void;
}

export function JobModal({ userId, editing, onSave, onClose }: Props) {
  const [name,   setName]   = useState(editing?.name        ?? '');
  const [client, setClient] = useState(editing?.client_name ?? '');
  const [start,  setStart]  = useState(editing?.start_date  ?? '');
  const [end,    setEnd]    = useState(editing?.end_date    ?? '');
  const [notes,  setNotes]  = useState(editing?.notes       ?? '');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSave() {
    if (!name.trim() || !start || !end) return;
    if (end < start) { alert('End date must be on or after start date'); return; }
    setSaving(true);

    const payload = {
      user_id:     userId,
      name:        name.trim(),
      client_name: client.trim() || null,
      start_date:  start,
      end_date:    end,
      notes:       notes.trim() || null,
    };

    let result;
    if (editing) {
      result = await supabase.from('rental_jobs').update(payload).eq('id', editing.id).select().single();
    } else {
      result = await supabase.from('rental_jobs').insert(payload).select().single();
    }

    setSaving(false);
    if (result.error) { alert('Save failed: ' + result.error.message); return; }
    onSave(result.data as RentalJob);
  }

  const valid = name.trim() && start && end;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl"
        style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--lp-border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--lp-text)' }}>
            {editing ? 'Edit Job' : 'New Job'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1" style={{ color: 'var(--lp-text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <Field label="Job Name" required>
            <input
              ref={nameRef}
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Glastonbury 2026 — Stage B"
              className="lp-input"
            />
          </Field>
          <Field label="Client / Artist">
            <input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Touring Ltd" className="lp-input" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className="lp-input" />
            </Field>
            <Field label="End Date" required>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="lp-input" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any relevant info…" rows={2} className="lp-input resize-none" />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-5 pt-2" style={{ borderTop: '1px solid var(--lp-border)' }}>
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !valid}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#FF4500' }}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Job'}
          </button>
        </div>
      </div>

      <style>{`
        .lp-input {
          width: 100%; border-radius: 8px;
          border: 1px solid var(--lp-border);
          background-color: var(--lp-bg);
          color: var(--lp-text); padding: 8px 12px;
          font-size: 0.875rem; outline: none; transition: border-color 0.15s;
        }
        .lp-input:focus { border-color: #FF4500; }
        .lp-input::placeholder { color: var(--lp-text-tertiary); }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
