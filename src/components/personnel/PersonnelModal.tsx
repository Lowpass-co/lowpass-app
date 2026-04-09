'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Personnel, PersonnelRates } from '@/types';
import { cn } from '@/lib/utils';

const CURRENCIES = ['GBP', 'EUR', 'USD'] as const;

function emptyRates(): PersonnelRates {
  return {
    show_day_rate: 0,
    off_day_rate: 0,
    travel_day_rate: 0,
    per_diem_rate: 0,
    currency: 'GBP',
  };
}

function parseRates(raw: unknown): PersonnelRates {
  if (!raw || typeof raw !== 'object') return emptyRates();
  const o = raw as Record<string, unknown>;
  return {
    show_day_rate: Number(o.show_day_rate) || 0,
    off_day_rate: Number(o.off_day_rate) || 0,
    travel_day_rate: Number(o.travel_day_rate) || 0,
    per_diem_rate: Number(o.per_diem_rate) || 0,
    currency: typeof o.currency === 'string' ? o.currency : 'GBP',
  };
}

export function PersonnelModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Personnel | null;
  onClose: () => void;
  onSaved: (row: Personnel) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [dietary, setDietary] = useState('');
  const [merchSize, setMerchSize] = useState('');
  const [preferences, setPreferences] = useState('');
  const [rates, setRates] = useState<PersonnelRates>(emptyRates());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setName(initial.name);
      setRole(initial.role ?? '');
      setEmail(initial.email ?? '');
      setPhone(initial.phone ?? '');
      setHomeAirport(initial.home_airport ?? '');
      setDietary(initial.dietary_needs ?? '');
      setMerchSize(initial.merch_size ?? '');
      setPreferences(initial.preferences ?? '');
      setRates(parseRates(initial.standard_rates));
    } else {
      setName('');
      setRole('');
      setEmail('');
      setPhone('');
      setHomeAirport('');
      setDietary('');
      setMerchSize('');
      setPreferences('');
      setRates(emptyRates());
    }
  }, [open, initial]);

  if (!open) return null;

  const title = initial ? `Edit ${initial.lp_id}` : 'Add personnel';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const standard_rates = { ...rates };
      const payload = {
        name: n,
        role,
        email: email.trim() || null,
        phone: phone.trim() || null,
        home_airport: homeAirport.trim() || null,
        dietary_needs: dietary.trim() || null,
        merch_size: merchSize.trim() || null,
        preferences: preferences.trim() || null,
        standard_rates,
      };
      const url = initial ? `/api/personnel/${initial.id}` : '/api/personnel';
      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data as Personnel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        className={cn(
          'relative z-[81] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl'
        )}
        role="dialog"
        aria-labelledby="personnel-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="personnel-modal-title" className="text-lg font-semibold text-lp-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange focus:ring-1 focus:ring-lp-orange"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Role
            </label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
              placeholder="e.g. FOH, TM, Driver"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
                Phone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Home airport
            </label>
            <input
              value={homeAirport}
              onChange={(e) => setHomeAirport(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Dietary
            </label>
            <input
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
                Merch size
              </label>
              <input
                value={merchSize}
                onChange={(e) => setMerchSize(e.target.value)}
                className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
                Currency (default rates)
              </label>
              <select
                value={rates.currency}
                onChange={(e) => setRates((r) => ({ ...r, currency: e.target.value }))}
                className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-lp-border bg-lp-bg/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
              Standard day rates (used when adding to a tour)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['show_day_rate', 'Show day'],
                  ['off_day_rate', 'Off day'],
                  ['travel_day_rate', 'Travel / rehearsal'],
                  ['per_diem_rate', 'Per diem'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-0.5 block text-xs text-lp-text-secondary">{label}</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={rates[key]}
                    onChange={(e) =>
                      setRates((r) => ({ ...r, [key]: Number(e.target.value) || 0 }))
                    }
                    className="w-full rounded-md border border-lp-border bg-lp-surface px-2 py-1.5 text-sm tabular-nums text-lp-text outline-none focus:border-lp-orange"
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Preferences / notes
            </label>
            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
