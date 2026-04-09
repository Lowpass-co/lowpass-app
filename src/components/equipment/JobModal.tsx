/* ============================================
   LOWPASS — Job Modal (Create / Edit)
   ============================================ */

'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import {
  type EquipmentArtistOption,
  type EquipmentTourOption,
  type RentalJob,
} from './types';

interface Props {
  userId: string;
  workspaceId: string | null;
  editing: RentalJob | null;
  artists: EquipmentArtistOption[];
  tours: EquipmentTourOption[];
  onListsUpdated: () => void | Promise<void>;
  onSave: (job: RentalJob) => void;
  onClose: () => void;
}

export function JobModal({
  userId,
  workspaceId,
  editing,
  artists,
  tours,
  onListsUpdated,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [client, setClient] = useState(editing?.client_name ?? '');
  const [artistId, setArtistId] = useState(editing?.artist_id ?? '');
  const [tourId, setTourId] = useState(editing?.tour_id ?? '');
  const [start, setStart] = useState(editing?.start_date ?? '');
  const [end, setEnd] = useState(editing?.end_date ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void onListsUpdated();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [onListsUpdated]);

  const artistOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      { value: '', label: '— Select artist —' },
      ...artists.map((a) => ({ value: a.id, label: a.name })),
    ],
    [artists]
  );

  const toursForArtist = useMemo(
    () => tours.filter((t) => !artistId || t.artist_id === artistId),
    [tours, artistId]
  );

  const tourOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      { value: '', label: artistId ? '— Select tour —' : '— Select artist first —' },
      ...toursForArtist.map((t) => ({ value: t.id, label: t.name })),
    ],
    [toursForArtist, artistId]
  );

  useEffect(() => {
    if (!tourId) return;
    const t = tours.find((x) => x.id === tourId);
    if (t && artistId && t.artist_id !== artistId) setTourId('');
  }, [artistId, tourId, tours]);

  async function handleSave() {
    if (!name.trim() || !start || !end) return;
    if (end < start) {
      alert('End date must be on or after start date');
      return;
    }
    setSaving(true);

    const payload = {
      user_id: userId,
      name: name.trim(),
      client_name: client.trim() || null,
      artist_id: artistId || null,
      tour_id: tourId || null,
      start_date: start,
      end_date: end,
      notes: notes.trim() || null,
    };

    let result;
    if (editing) {
      result = await supabase.from('rental_jobs').update(payload).eq('id', editing.id).select(`
        *,
        artist:artists ( id, name ),
        tour:tours ( id, name )
      `).single();
    } else {
      result = await supabase.from('rental_jobs').insert(payload).select(`
        *,
        artist:artists ( id, name ),
        tour:tours ( id, name )
      `).single();
    }

    setSaving(false);
    if (result.error) {
      alert('Save failed: ' + result.error.message);
      return;
    }
    if (!result.data) {
      alert('Save failed: no row returned');
      return;
    }
    onSave(normalizeJobRow(result.data as Record<string, unknown>));
  }

  const valid = name.trim() && start && end;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl shadow-2xl"
        style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
      >
        <div
          className="flex items-center justify-between px-6 pb-4 pt-5"
          style={{ borderBottom: '1px solid var(--lp-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--lp-text)' }}>
            {editing ? 'Edit Job' : 'New Job'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1" style={{ color: 'var(--lp-text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Job Name" required>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Glastonbury 2026 — Stage B"
              className="lp-input"
            />
          </Field>

          <div className="space-y-2">
            <Field label="Artist">
              <StyledSelect value={artistId} onChange={setArtistId} options={artistOptions} placeholder="Select artist" />
            </Field>
            {workspaceId ? (
              <Link
                href="/artists"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ color: '#FF4500' }}
              >
                Add new artist <ExternalLink size={12} />
              </Link>
            ) : (
              <p className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                Workspace required to link artists.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Field label="Tour">
              <StyledSelect
                value={tourId}
                onChange={setTourId}
                options={tourOptions}
                placeholder="Select tour"
                disabled={!artistId}
              />
            </Field>
            {workspaceId ? (
              <Link
                href="/tours/create"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ color: '#FF4500' }}
              >
                Add new tour <ExternalLink size={12} />
              </Link>
            ) : null}
          </div>

          <Field label="Client / billing name">
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="e.g. Acme Touring Ltd"
              className="lp-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="lp-input" />
            </Field>
            <Field label="End Date" required>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="lp-input" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any relevant info…"
              rows={2}
              className="lp-input resize-none"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-5 pt-2" style={{ borderTop: '1px solid var(--lp-border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
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
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function normalizeJobRow(row: Record<string, unknown>): RentalJob {
  const r = row as unknown as RentalJob;
  const artist = r.artist as { id: string; name: string } | null | undefined | { id: string; name: string }[];
  const tour = r.tour as { id: string; name: string } | null | undefined | { id: string; name: string }[];
  return {
    ...r,
    artist_id: r.artist_id ?? null,
    tour_id: r.tour_id ?? null,
    artist: Array.isArray(artist) ? artist[0] ?? null : artist ?? null,
    tour: Array.isArray(tour) ? tour[0] ?? null : tour ?? null,
  };
}
