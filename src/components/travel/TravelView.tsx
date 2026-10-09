'use client';

/* ============================================
   LOWPASS — <TravelView> (UX simplification, Oct 2026)

   The tour's flights: a list, and one obvious place to add one.

   Layout, top to bottom:
     1. PageHeader — "Travel", what the page is for, and the Add button.
     2. The add form (opens in place, every field labelled).
     3. The list (<DataTable>). Click a row → <FlightSlideOver> to edit/delete.

   TIMES ARE WALL-CLOCK. Every flight writer in the app stores the time typed
   as if it were UTC and every reader slices it back out, so 10:00 in Joburg is
   10:00 on the page wherever the viewer is. Formatting here therefore reads
   the string, never `new Date(...)` in the browser's zone.

   Totals are per currency — amounts in different currencies are never summed
   (CLAUDE.md, Money).
   ============================================ */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plane, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import FlightSlideOver from '@/components/entity/flight/FlightSlideOver';
import { listFlights } from '@/lib/api/flights';
import type { Flight } from '@/lib/types/flight';
import { formatCurrency } from '@/lib/utils';

export interface TravelViewProps {
  tourId: string;
  tourCurrency: string;
  crewNames: string[];
}

/** "2026-10-14T10:00:00+00:00" → "Tue 14 Oct" — from the string, no zone shift. */
export function flightDateLabel(iso: string | null | undefined): string {
  const d = (iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** "…T10:05:00…" → "10:05". Midnight reads as "—": the create route defaults
 *  a blank time to 00:00, and showing that as a departure time would lie. */
export function flightTimeLabel(iso: string | null | undefined): string {
  const t = (iso ?? '').slice(11, 16);
  return /^\d{2}:\d{2}$/.test(t) && t !== '00:00' ? t : '—';
}

/** Sum per currency. Never adds GBP to USD. */
export function totalsByCurrency(flights: Flight[]): Array<{ currency: string; amount: number }> {
  const by = new Map<string, number>();
  for (const f of flights) {
    const amt = Number(f.costAmount) || 0;
    if (!amt) continue;
    const c = (f.costCurrency || 'GBP').toUpperCase();
    by.set(c, (by.get(c) ?? 0) + amt);
  }
  return [...by.entries()].map(([currency, amount]) => ({ currency, amount }));
}

const EMPTY_FORM = {
  who: '', from: '', to: '', date: '', time: '', airline: '', flightNumber: '', confirmation: '', cost: '',
};

export function TravelView({ tourId, tourCurrency, crewNames }: TravelViewProps) {
  const [flights, setFlights] = useState<Flight[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const listId = useId();

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setFlights(await listFlights(tourId));
    } catch (e) {
      setLoadError((e as Error).message || 'Could not load flights');
      setFlights([]);
    }
  }, [tourId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof typeof EMPTY_FORM) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.who.trim()) return setFormError('Who is flying?');
    if (!form.date) return setFormError('Pick the date of the flight.');
    const cost = form.cost.trim() === '' ? 0 : Number(form.cost);
    if (!Number.isFinite(cost) || cost < 0) return setFormError('Cost must be a number.');
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/budget/flights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          person_name: form.who.trim(),
          origin_code: form.from.trim().toUpperCase() || 'TBD',
          destination_code: form.to.trim().toUpperCase() || 'TBD',
          departure_date: form.date,
          departure_time: form.time || '00:00',
          airline: form.airline.trim() || null,
          flight_number: form.flightNumber.trim() || null,
          confirmation: form.confirmation.trim() || null,
          actual_cost: cost,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Could not save the flight');
      }
      // Keep who + date: the next flight is usually the same person's return
      // leg or the next person on the same day.
      setForm((f) => ({ ...EMPTY_FORM, who: f.who, date: f.date }));
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<Flight>[]>(
    () => [
      {
        id: 'date', header: 'Date', accessor: (f) => f.departAt ?? '', sortable: true, width: 120,
        cell: (_, f) => flightDateLabel(f.departAt),
      },
      {
        id: 'time', header: 'Departs', accessor: (f) => (f.departAt ?? '').slice(11, 16), width: 90,
        cell: (_, f) => <span className="tabular-nums">{flightTimeLabel(f.departAt)}</span>,
      },
      {
        id: 'who', header: 'Who', accessor: (f) => f.personName ?? '', sortable: true, flex: true,
        cell: (_, f) => f.personName?.trim() || <span className="text-lp-text-tertiary">Not set</span>,
      },
      {
        id: 'route', header: 'Route', accessor: (f) => `${f.originAirport} ${f.destinationAirport}`, width: 140,
        cell: (_, f) => <span className="tabular-nums">{f.originAirport} → {f.destinationAirport}</span>,
      },
      {
        id: 'flight', header: 'Flight', accessor: (f) => `${f.airline ?? ''} ${f.flightNumber ?? ''}`.trim(), width: 150,
        cell: (v) => (v as string) || <span className="text-lp-text-tertiary">—</span>,
      },
      {
        id: 'confirmation', header: 'Booking ref', accessor: (f) => f.confirmation ?? '', width: 120,
        cell: (v) => (v as string) || <span className="text-lp-text-tertiary">—</span>,
      },
      {
        id: 'cost', header: 'Cost', accessor: (f) => Number(f.costAmount) || 0, align: 'right', sortable: true, width: 120,
        cell: (_, f) =>
          f.costAmount ? (
            <span className="tabular-nums">{formatCurrency(Number(f.costAmount), (f.costCurrency || tourCurrency).toUpperCase())}</span>
          ) : (
            <span className="text-lp-text-tertiary">—</span>
          ),
      },
    ],
    [tourCurrency],
  );

  const totals = flights ? totalsByCurrency(flights) : [];
  const symbol = formatCurrency(0, tourCurrency).replace(/[0-9.,\s]/g, '');

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-6 pb-10 pt-6">
      <PageHeader
        title="Travel"
        subtitle="Every flight on this tour. A flight's cost goes into the budget automatically."
        actions={
          !adding ? (
            <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add flight
            </Button>
          ) : null
        }
      />

      {adding ? (
        <form
          onSubmit={submit}
          className="rounded-xl border border-lp-border bg-lp-surface p-4"
          aria-label="Add a flight"
          data-testid="travel-add-form"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-lp-text">
            <Plane className="h-4 w-4 text-lp-text-secondary" /> New flight
          </div>
          <datalist id={listId}>
            {crewNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Who" placeholder="Name" value={form.who} onChange={set('who')} list={listId} autoFocus required />
            <TextInput label="From" placeholder="LHR" value={form.from} onChange={set('from')} maxLength={4} helper="Airport code" />
            <TextInput label="To" placeholder="JFK" value={form.to} onChange={set('to')} maxLength={4} helper="Airport code" />
            <TextInput label="Date" type="date" value={form.date} onChange={set('date')} required />
            <TextInput label="Departs" type="time" value={form.time} onChange={set('time')} helper="Local time — optional" />
            <TextInput label="Airline" placeholder="British Airways" value={form.airline} onChange={set('airline')} />
            <TextInput label="Flight number" placeholder="BA117" value={form.flightNumber} onChange={set('flightNumber')} />
            <TextInput label="Booking ref" placeholder="ABC123" value={form.confirmation} onChange={set('confirmation')} />
            <TextInput
              label={`Cost (${tourCurrency})`} type="number" step="0.01" min="0" inputMode="decimal"
              currencySymbol={symbol} value={form.cost} onChange={set('cost')} placeholder="0.00"
            />
          </div>
          {formError ? (
            <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-lp-error)' }}>{formError}</p>
          ) : null}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setAdding(false); setFormError(null); setForm(EMPTY_FORM); }}>
              Done
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={saving}>
              Save flight
            </Button>
          </div>
        </form>
      ) : null}

      {loadError ? (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-lp-error)' }}>{loadError}</p>
      ) : null}

      {flights && flights.length > 0 ? (
        <p className="text-sm text-lp-text-secondary" data-testid="travel-summary">
          {flights.length} {flights.length === 1 ? 'flight' : 'flights'}
          {totals.map((t) => ` · ${formatCurrency(t.amount, t.currency)}`).join('')}
        </p>
      ) : null}

      <DataTable<Flight>
        rows={flights}
        columns={columns}
        rowKey={(f) => f.id}
        onRowClick={(f) => setOpenId(f.id)}
        searchPlaceholder="Search flights"
        pagination="none"
        ariaLabel="Flights"
        emptyState={
          <div className="py-10 text-center text-sm text-lp-text-secondary">
            No flights yet. Use <strong>Add flight</strong> — each one&apos;s cost lands in the budget on its own.
          </div>
        }
      />

      {openId ? (
        <FlightSlideOver
          key={openId}
          id={openId}
          onClose={() => { setOpenId(null); void load(); }}
        />
      ) : null}
    </div>
  );
}
