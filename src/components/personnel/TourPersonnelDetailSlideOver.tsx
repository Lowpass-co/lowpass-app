'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { PersonnelRate } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

const IC =
  'w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange';
const PT = [
  { value: 'principal', label: 'Principal' },
  { value: 'band', label: 'Band' },
  { value: 'crew', label: 'Crew' },
] as const;

export function TourPersonnelDetailSlideOver({
  open,
  rate,
  tourId,
  onClose,
  onSaved,
}: {
  open: boolean;
  rate: PersonnelRate | null;
  tourId: string;
  onClose: () => void;
  onSaved: (r: PersonnelRate) => void;
}) {
  const { showToast } = useToast();
  const [person_name, setPersonName] = useState('');
  const [role, setRole] = useState('');
  const [person_type, setPersonType] = useState<string>('crew');
  const [show_rate, setShow] = useState(0);
  const [off_rate, setOff] = useState(0);
  const [rehearsal_rate, setReh] = useState(0);
  const [per_diem, setPd] = useState(0);
  const [advance_fee, setAdv] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!rate) return;
    setPersonName(rate.person_name ?? '');
    setRole(rate.role ?? '');
    setPersonType(rate.person_type ?? 'crew');
    setShow(Number(rate.show_rate) || 0);
    setOff(Number(rate.off_rate) || 0);
    setReh(Number(rate.rehearsal_rate) || 0);
    setPd(Number(rate.per_diem) || 0);
    setAdv(Number(rate.advance_fee) || 0);
  }, [rate]);

  if (!open || !rate) return null;

  const rosterId = rate.roster_personnel_id;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/personnel-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rate.id,
          person_name: person_name.trim(),
          role: role.trim() || null,
          person_type,
          show_rate,
          off_rate,
          rehearsal_rate,
          per_diem,
          advance_fee,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data as PersonnelRate);
      showToast('Tour personnel updated');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[85] bg-black/20 md:block" aria-hidden onClick={onClose} />
      <div
        className={cn(
          'fixed top-0 right-0 z-[90] flex h-full w-full flex-col border-l border-lp-border bg-lp-bg shadow-2xl md:w-[min(100vw,480px)]'
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-lp-border p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-lp-text">Tour line</h2>
            <p className="mt-1 text-xs text-lp-text-secondary">
              Budget / payroll / rooming use this row. Commission and advanced edits live in Budget.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-lp-text-secondary hover:bg-lp-surface" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {rosterId && (
            <div className="rounded-lg border border-lp-border bg-lp-surface/50 p-3 text-sm">
              <p className="text-lp-text-secondary">Linked to workspace roster.</p>
              <Link
                href={`/personnel?focus=${rosterId}`}
                className="mt-2 inline-block text-lp-orange hover:underline"
                onClick={onClose}
              >
                Open full profile →
              </Link>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Name (rooming / payroll)</label>
            <input value={person_name} onChange={(e) => setPersonName(e.target.value)} className={IC} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Role on tour</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} className={IC} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Person type</label>
            <select value={person_type} onChange={(e) => setPersonType(e.target.value)} className={IC}>
              {PT.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Show rate</label>
              <input type="number" min={0} value={show_rate} onChange={(e) => setShow(Number(e.target.value) || 0)} className={IC} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Off rate</label>
              <input type="number" min={0} value={off_rate} onChange={(e) => setOff(Number(e.target.value) || 0)} className={IC} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Travel / rehearsal</label>
              <input type="number" min={0} value={rehearsal_rate} onChange={(e) => setReh(Number(e.target.value) || 0)} className={IC} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Per diem</label>
              <input type="number" min={0} value={per_diem} onChange={(e) => setPd(Number(e.target.value) || 0)} className={IC} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Advance fee</label>
              <input type="number" min={0} value={advance_fee} onChange={(e) => setAdv(Number(e.target.value) || 0)} className={IC} />
            </div>
          </div>

          <Link
            href={`/budget?tour_id=${tourId}`}
            className="inline-block text-sm text-lp-orange hover:underline"
            onClick={onClose}
          >
            Open full budget personnel tab →
          </Link>
        </div>

        <footer className="shrink-0 border-t border-lp-border p-4">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}
