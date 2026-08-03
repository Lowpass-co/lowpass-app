'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { getFlightById, updateFlight } from '@/lib/api/flights';
import type { Flight } from '@/lib/types/flight';
import { cn } from '@/lib/utils';
import { SlideOver } from '@/components/ui/SlideOver';

const IC =
  'w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-lp-border/70 pb-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

export default function FlightSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);

  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [pnr, setPnr] = useState('');
  const [originAirport, setOriginAirport] = useState('');
  const [destinationAirport, setDestinationAirport] = useState('');
  const [departAt, setDepartAt] = useState('');
  const [arriveAt, setArriveAt] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState('GBP');
  const [notes, setNotes] = useState('');
  const [showId, setShowId] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    getFlightById(id)
      .then((f) => {
        if (!f) throw new Error('Flight not found');
        setFlight(f);
        setAirline(f.airline ?? '');
        setFlightNumber(f.flightNumber ?? '');
        setPnr(f.pnr ?? '');
        setOriginAirport(f.originAirport);
        setDestinationAirport(f.destinationAirport);
        setDepartAt(f.departAt.slice(0, 16));
        setArriveAt(f.arriveAt.slice(0, 16));
        setCostAmount(f.costAmount != null ? String(f.costAmount) : '');
        setCostCurrency(f.costCurrency || 'GBP');
        setNotes(f.notes ?? '');
        setShowId(f.showId ?? '');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const title = useMemo(() => {
    if (!flight) return 'Flight';
    return `${flight.airline ?? 'Flight'} ${flight.flightNumber ?? ''}`.trim();
  }, [flight]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFlight(id, {
        airline: airline || null,
        flight_number: flightNumber || null,
        pnr: pnr || null,
        origin_airport: originAirport || 'TBD',
        destination_airport: destinationAirport || 'TBD',
        depart_at: departAt ? new Date(departAt).toISOString() : null,
        arrive_at: arriveAt ? new Date(arriveAt).toISOString() : null,
        cost_amount: costAmount === '' ? null : Number(costAmount),
        cost_currency: costCurrency || 'GBP',
        notes: notes || null,
        show_id: showId || null,
      });
      setFlight(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
          Canonical flight record
        </span>
      }
      width="wide"
      backdrop
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="rounded-md border border-lp-border px-3 py-2 text-sm text-lp-text" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-md bg-lp-orange px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save flight'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading flight...
          </div>
        )}
        {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!loading && (
          <>
            <Section title="Details">
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={IC} placeholder="Airline" value={airline} onChange={(e) => setAirline(e.target.value)} />
                <input className={IC} placeholder="Flight number" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} />
                <input className={IC} placeholder="PNR" value={pnr} onChange={(e) => setPnr(e.target.value)} />
              </div>
            </Section>

            <Section title="Route">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={IC} placeholder="Origin airport" value={originAirport} onChange={(e) => setOriginAirport(e.target.value.toUpperCase())} />
                <input className={IC} placeholder="Destination airport" value={destinationAirport} onChange={(e) => setDestinationAirport(e.target.value.toUpperCase())} />
                <input className={IC} type="datetime-local" value={departAt} onChange={(e) => setDepartAt(e.target.value)} />
                <input className={IC} type="datetime-local" value={arriveAt} onChange={(e) => setArriveAt(e.target.value)} />
              </div>
            </Section>

            <Section title="Cost">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={IC} type="number" step="0.01" placeholder="Amount" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
                <input className={IC} placeholder="Currency" value={costCurrency} onChange={(e) => setCostCurrency(e.target.value.toUpperCase())} />
              </div>
            </Section>

            <Section title="Passengers">
              <p className="text-xs text-lp-text-tertiary">
                Passenger chips/picker are reserved for UX10 canonical person wiring.
              </p>
            </Section>

            <Section title="Show">
              <input className={IC} placeholder="Show ID (optional)" value={showId} onChange={(e) => setShowId(e.target.value)} />
            </Section>

            <Section title="Notes">
              <textarea className={cn(IC, 'min-h-24')} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Section>

            <Section title="Activity">
              <p className="text-xs text-lp-text-tertiary">Audit log placeholder for later prompt.</p>
            </Section>
          </>
        )}
      </div>
    </SlideOver>
  );
}
