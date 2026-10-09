'use client';

/* ============================================
   LOWPASS — <FlightSlideOver>

   Edit one flight. Opened from Travel, from a flight chip, or from Advance.

   Oct 2026 pass:
   - "Who" is editable (it wasn't — the field only existed on create).
   - Developer placeholders removed ("Canonical flight record", the UX10
     passenger note, the audit-log placeholder, a raw "Show ID" box).
   - Delete, with a second click to confirm.
   - TIMES ARE WALL-CLOCK. Every other flight writer stores the time typed as
     if it were UTC (`${date}T${time}:00Z`) and every reader slices it back
     out. This panel used to run the box through `new Date(local)`, i.e. the
     browser's zone, so each save in BST moved the flight an hour earlier.
     It now writes the same wall-clock form everyone else reads.

   Every save/delete goes through /api/flights/[id], which refreshes the
   flight's budget line via the one derived-line writer.
   ============================================ */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { deleteFlight, getFlightById, updateFlight } from '@/lib/api/flights';
import type { Flight } from '@/lib/types/flight';
import { SlideOver } from '@/components/ui/SlideOver';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-lp-border/70 pb-5">
      <h3 className="text-sm font-semibold text-lp-text">{title}</h3>
      {children}
    </section>
  );
}

/** Stored "2026-10-14T10:05:00+00:00" → the datetime-local box's "2026-10-14T10:05". */
export function toWallClockInput(iso: string | null | undefined): string {
  const s = (iso ?? '').slice(0, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s : '';
}

/** The box's "2026-10-14T10:05" → the stored wall-clock form, or null. */
export function fromWallClockInput(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00.000Z` : null;
}

export default function FlightSlideOver({
  id,
  onClose,
  onDeleted,
}: {
  id: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);

  const [who, setWho] = useState('');
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [originAirport, setOriginAirport] = useState('');
  const [destinationAirport, setDestinationAirport] = useState('');
  const [departAt, setDepartAt] = useState('');
  const [arriveAt, setArriveAt] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState('GBP');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    getFlightById(id)
      .then((f) => {
        if (!f) throw new Error('Flight not found');
        setFlight(f);
        setWho(f.personName ?? '');
        setAirline(f.airline ?? '');
        setFlightNumber(f.flightNumber ?? '');
        setBookingRef(f.confirmation ?? f.pnr ?? '');
        setOriginAirport(f.originAirport);
        setDestinationAirport(f.destinationAirport);
        setDepartAt(toWallClockInput(f.departAt));
        setArriveAt(toWallClockInput(f.arriveAt));
        setCostAmount(f.costAmount != null ? String(f.costAmount) : '');
        setCostCurrency(f.costCurrency || 'GBP');
        setNotes(f.notes ?? '');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const title = useMemo(() => {
    if (!flight) return 'Flight';
    const route = `${flight.originAirport} → ${flight.destinationAirport}`;
    return flight.personName?.trim() ? `${flight.personName.trim()} · ${route}` : route;
  }, [flight]);

  const save = async () => {
    const cost = costAmount.trim() === '' ? null : Number(costAmount);
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      setError('Cost must be a number.');
      return;
    }
    const depart = fromWallClockInput(departAt);
    if (!depart) {
      setError('Departure needs a date and time.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFlight(id, {
        person_name: who.trim(),
        airline: airline.trim() || null,
        flight_number: flightNumber.trim() || null,
        // Both columns carry the booking ref; older rows filled only pnr.
        confirmation: bookingRef.trim() || null,
        pnr: bookingRef.trim() || null,
        origin_airport: originAirport.trim().toUpperCase() || 'TBD',
        destination_airport: destinationAirport.trim().toUpperCase() || 'TBD',
        depart_at: depart,
        // arrive_at is NOT NULL: a blank arrival keeps the departure time.
        arrive_at: fromWallClockInput(arriveAt) ?? depart,
        cost_amount: cost,
        cost_currency: costCurrency.trim().toUpperCase() || 'GBP',
        notes: notes.trim() || null,
      });
      setFlight(updated);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await deleteFlight(id);
      onDeleted?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      title={title}
      subtitle={
        <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
          Changes to the cost update the budget.
        </span>
      }
      width="wide"
      backdrop
      footer={
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-sm text-lp-text-secondary">Delete this flight?</span>
              <Button variant="danger" size="sm" onClick={() => void remove()} disabled={saving}>Yes, delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} disabled={loading || saving}>
              Delete
            </Button>
          )}
          <span className="ml-auto text-xs text-lp-text-tertiary" aria-live="polite">
            {savedAt && !saving ? 'Saved' : ''}
          </span>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || loading} loading={saving}>
            Save flight
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading flight…
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-lp-error)' }}>{error}</p>
        )}
        {!loading && flight && (
          <>
            <Section title="Who">
              <TextInput label="Passenger" hideLabel placeholder="Name" value={who} onChange={(e) => setWho(e.target.value)} />
            </Section>

            <Section title="Route">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="From" value={originAirport} maxLength={4} onChange={(e) => setOriginAirport(e.target.value.toUpperCase())} />
                <TextInput label="To" value={destinationAirport} maxLength={4} onChange={(e) => setDestinationAirport(e.target.value.toUpperCase())} />
                <TextInput label="Departs (local)" type="datetime-local" value={departAt} onChange={(e) => setDepartAt(e.target.value)} />
                <TextInput label="Arrives (local)" type="datetime-local" value={arriveAt} onChange={(e) => setArriveAt(e.target.value)} />
              </div>
            </Section>

            <Section title="Booking">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextInput label="Airline" value={airline} onChange={(e) => setAirline(e.target.value)} />
                <TextInput label="Flight number" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} />
                <TextInput label="Booking ref" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
              </div>
            </Section>

            <Section title="Cost">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
                <TextInput label="Currency" value={costCurrency} maxLength={3} onChange={(e) => setCostCurrency(e.target.value.toUpperCase())} />
              </div>
            </Section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-lp-text">Notes</h3>
              <textarea
                aria-label="Notes"
                className="min-h-24 w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>
          </>
        )}
      </div>
    </SlideOver>
  );
}
