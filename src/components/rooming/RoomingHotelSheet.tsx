'use client';

import { useCallback, useEffect, useState } from 'react';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { cn } from '@/lib/utils';

interface Assignment {
  id: string;
  person_name: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  room_type: string | null;
  room_number: string | null;
  confirmation: string | null;
  rate_per_night: number;
  notes: string | null;
}

function nightsBetween(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn + 'T12:00:00');
  const b = new Date(checkOut + 'T12:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

interface RoomingHotelSheetProps {
  hotelBooking: {
    id: string;
    hotel_name: string;
    address?: string | null;
    phone?: string | null;
    cancellation_policy?: string | null;
    distance_to_venue?: string | null;
    distance_to_airport?: string | null;
  };
  roomAssignments: Assignment[];
  currency: string;
}

export function RoomingHotelSheet({ hotelBooking, roomAssignments: initialAssignments, currency }: RoomingHotelSheetProps) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [hotel, setHotel] = useState(hotelBooking);

  useEffect(() => {
    setAssignments(initialAssignments);
    setHotel(hotelBooking);
  }, [hotelBooking.id]);

  const saveHotel = useCallback(async (field: string, value: string | number) => {
    const res = await fetch('/api/budget/hotels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: hotel.id, [field]: value === '' ? null : value }),
    });
    if (res.ok) setHotel((prev) => ({ ...prev, [field]: value }));
  }, [hotel.id]);

  const saveAssignment = useCallback(async (id: string, field: string, value: string | number) => {
    const res = await fetch('/api/budget/hotels/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value === '' ? null : value }),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }, []);

  const addAssignment = useCallback(async () => {
    const res = await fetch('/api/budget/hotels/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotel_booking_id: hotel.id,
        person_name: 'New',
        nights: 1,
        rate_per_night: 0,
      }),
    });
    if (!res.ok) throw new Error('Create failed');
    const created = await res.json();
    setAssignments((prev) => [...prev, created]);
  }, [hotel.id]);

  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 });
  const totalNights = assignments.reduce((s, a) => s + (a.nights || 0), 0);
  const totalAmount = assignments.reduce((s, a) => s + (a.nights || 0) * (a.rate_per_night || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-lp-border bg-lp-surface/30 p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">HOTEL</p>
          <InlineEditCell value={hotel.hotel_name} type="text" onSave={(v) => saveHotel('hotel_name', String(v))} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">Distance to Venue</p>
          <InlineEditCell value={hotel.distance_to_venue} type="text" onSave={(v) => saveHotel('distance_to_venue', String(v))} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">ADDRESS</p>
          <InlineEditCell value={hotel.address} type="text" onSave={(v) => saveHotel('address', String(v))} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">Distance to Airport</p>
          <InlineEditCell value={hotel.distance_to_airport} type="text" onSave={(v) => saveHotel('distance_to_airport', String(v))} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">T</p>
          <InlineEditCell value={hotel.phone} type="text" onSave={(v) => saveHotel('phone', String(v))} />
        </div>
        <div />
        <div className="md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">CANCELLATION</p>
          <InlineEditCell value={hotel.cancellation_policy} type="text" onSave={(v) => saveHotel('cancellation_policy', String(v))} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-lp-surface text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
              <th className="border-b border-lp-border/30 px-2 py-2 w-10">No.</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Name</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Check In</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Check Out</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-right w-16">Nights</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Room Type</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Room No.</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Notes</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-left">Conf Number</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-right">Rate/Night</th>
              <th className="border-b border-lp-border/30 px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => {
              const nights = nightsBetween(a.check_in, a.check_out) || a.nights || 0;
              const total = nights * (a.rate_per_night || 0);
              return (
                <tr key={a.id} className="even:bg-lp-surface/30">
                  <td className="border-b border-lp-border/30 px-2 py-1 text-lp-text-secondary">{i + 1}</td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.person_name} type="text" onSave={(v) => saveAssignment(a.id, 'person_name', String(v))} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.check_in ? a.check_in.slice(0, 10) : null} type="text" onSave={(v) => saveAssignment(a.id, 'check_in', String(v) || null)} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.check_out ? a.check_out.slice(0, 10) : null} type="text" onSave={(v) => saveAssignment(a.id, 'check_out', String(v) || null)} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-1 text-right font-[tabular-nums]">{nights}</td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.room_type} type="text" onSave={(v) => saveAssignment(a.id, 'room_type', String(v))} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.room_number} type="text" onSave={(v) => saveAssignment(a.id, 'room_number', String(v))} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.notes} type="text" onSave={(v) => saveAssignment(a.id, 'notes', String(v))} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.confirmation} type="text" onSave={(v) => saveAssignment(a.id, 'confirmation', String(v))} />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-0">
                    <InlineEditCell value={a.rate_per_night} type="currency" currency={currency} onSave={(v) => saveAssignment(a.id, 'rate_per_night', v)} align="right" />
                  </td>
                  <td className="border-b border-lp-border/30 px-2 py-1 text-right font-[tabular-nums]">{formatter.format(total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t-2 border-lp-border">
              <td colSpan={4} className="px-2 py-2">TOTALS</td>
              <td className="px-2 py-2 text-right font-[tabular-nums]">{totalNights}</td>
              <td colSpan={4} className="px-2 py-2" />
              <td className="px-2 py-2 text-right font-[tabular-nums]">{formatter.format(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button type="button" onClick={addAssignment} className="text-lp-orange text-sm font-semibold hover:underline">
        + Add person
      </button>
    </div>
  );
}
