/* ============================================
   LOWPASS — Tour Edit Form

   Edit tour name, dates, continent, currency,
   band/crew count, status.
   ============================================ */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Tour } from '@/types';
import type { Continent } from '@/types';

type LayoutTemplate = { id: string; name: string; sections: unknown[] };

const CONTINENTS: { value: Continent; label: string }[] = [
  { value: 'US', label: 'US' },
  { value: 'UK', label: 'UK' },
  { value: 'EU', label: 'EU' },
  { value: 'AUS', label: 'AUS' },
  { value: 'ASIA', label: 'ASIA' },
  { value: 'OTHER', label: 'Other' },
];

const CURRENCIES = [
  { value: 'GBP', label: '£ GBP' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
  { value: 'AUD', label: 'A$ AUD' },
];

const STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export function TourEditForm({ tour }: { tour: Tour }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(tour.name);
  const [startDate, setStartDate] = useState(tour.start_date);
  const [endDate, setEndDate] = useState(tour.end_date);
  const [continent, setContinent] = useState<Continent>(tour.continent);
  const [currency, setCurrency] = useState(tour.currency);
  const [principalCount, setPrincipalCount] = useState((tour as { principal_count?: number }).principal_count ?? 0);
  const [bandCount, setBandCount] = useState(tour.band_count);
  const [crewCount, setCrewCount] = useState(tour.crew_count);
  const [status, setStatus] = useState(tour.status);
  const [notes, setNotes] = useState(tour.notes ?? '');
  const [defaultAdvanceTemplateId, setDefaultAdvanceTemplateId] = useState<string>(
    (tour as { default_advance_template_id?: string }).default_advance_template_id ?? ''
  );
  const [layoutTemplates, setLayoutTemplates] = useState<LayoutTemplate[]>([]);

  useEffect(() => {
    fetch('/api/advance/layout-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setLayoutTemplates(j.templates ?? []))
      .catch(() => setLayoutTemplates([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tours/${tour.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          continent,
          currency,
          principal_count: principalCount,
          band_count: bandCount,
          crew_count: crewCount,
          status,
          notes: notes.trim() || null,
          default_advance_template_id: defaultAdvanceTemplateId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      router.push(`/tours/${tour.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Tour name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Continent</label>
          <select
            value={continent}
            onChange={(e) => setContinent(e.target.value as Continent)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          >
            {CONTINENTS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Principal artists</label>
          <input
            type="number"
            min={0}
            value={principalCount}
            onChange={(e) => setPrincipalCount(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Band members</label>
          <input
            type="number"
            min={0}
            value={bandCount}
            onChange={(e) => setBandCount(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Crew</label>
          <input
            type="number"
            min={0}
            value={crewCount}
            onChange={(e) => setCrewCount(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Tour['status'])}
          className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Default advance template</label>
        <select
          value={defaultAdvanceTemplateId}
          onChange={(e) => setDefaultAdvanceTemplateId(e.target.value)}
          className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
        >
          <option value="">None</option>
          {layoutTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <p className="mt-0.5 text-xs text-lp-text-tertiary">
          New advances for this tour will use this section layout by default.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <Link
          href={`/tours/${tour.id}`}
          className="rounded-lg border border-lp-border bg-lp-surface px-4 py-2.5 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
