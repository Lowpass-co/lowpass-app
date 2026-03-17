'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import { cn } from '@/lib/utils';

interface RoomAssignment {
  id: string;
  person_name: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  rate_per_night: number;
  confirmation: string | null;
}

interface HotelRow {
  id: string;
  tour_id: string;
  hotel_name: string;
  city: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_assignments: RoomAssignment[];
}

function nightsBetween(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn + 'T12:00:00');
  const b = new Date(checkOut + 'T12:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

const COLS = [
  { key: '_expand', label: '', width: '32px' },
  { key: 'hotel_name', label: 'Hotel Name', width: '180px' },
  { key: 'city', label: 'City', width: '100px' },
  { key: 'check_in', label: 'Check In', width: '100px' },
  { key: 'check_out', label: 'Check Out', width: '100px' },
  { key: 'nights', label: '# Nights', width: '80px', align: 'right' as const },
  { key: 'rooms', label: '# Rooms', width: '80px', align: 'right' as const },
  { key: 'rate', label: 'Rate/Night', width: '100px', align: 'right' as const },
  { key: 'projected', label: 'Projected', width: '100px', align: 'right' as const },
  { key: 'actual', label: 'Actual', width: '100px', align: 'right' as const },
  { key: 'conf', label: 'Conf #', width: '100px' },
];

export function HotelsGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/hotels?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load hotels');
      const json = await res.json();
      setHotels(json.hotels ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveHotel = useCallback(async (id: string, field: string, value: string | number) => {
    const res = await fetch('/api/budget/hotels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        [field]: value === '' ? null : value,
      }),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    setHotels((prev) => prev.map((h) => (h.id === id ? { ...h, ...updated, room_assignments: h.room_assignments } : h)));
  }, []);

  const addHotel = useCallback(async () => {
    const res = await fetch('/api/budget/hotels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, hotel_name: 'New Hotel' }),
    });
    if (!res.ok) throw new Error('Create failed');
    const created = await res.json();
    setHotels((prev) => [...prev, { ...created, room_assignments: [] }]);
  }, [tourId]);

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <GridTable columns={COLS}>
        {hotels.map((h) => {
          const nights = nightsBetween(h.check_in_date, h.check_out_date);
          const roomCount = h.room_assignments?.length ?? 0;
          const totalNights = h.room_assignments?.reduce((s, a) => s + (a.nights || 0), 0) ?? 0;
          const totalProjected = h.room_assignments?.reduce((s, a) => s + a.rate_per_night * (a.nights || 0), 0) ?? 0;
          const avgRate = totalNights > 0 ? totalProjected / totalNights : null;
          const isExpanded = expandedId === h.id;
          return (
            <Fragment key={h.id}>
              <tr className={cn('even:bg-lp-surface/30')}>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : h.id)}
                    className="p-0.5 text-lp-text-secondary hover:text-lp-text"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={h.hotel_name}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'hotel_name', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={h.city}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'city', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={h.check_in_date ? h.check_in_date.slice(0, 10) : null}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'check_in_date', String(v) || '')}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={h.check_out_date ? h.check_out_date.slice(0, 10) : null}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'check_out_date', String(v) || '')}
                  />
                </td>
                <td className="px-2 py-1 text-sm text-lp-text-secondary text-right font-[tabular-nums]">
                  {nights != null ? nights : '—'}
                </td>
                <td className="px-2 py-1 text-sm text-lp-text-secondary text-right">{roomCount}</td>
                <td className="px-2 py-1 text-sm text-right font-[tabular-nums]">
                  {avgRate != null ? formatter.format(avgRate) : '—'}
                </td>
                <td className="px-2 py-1 text-sm text-right font-[tabular-nums]">
                  {totalProjected > 0 ? formatter.format(totalProjected) : '—'}
                </td>
                <td className="px-2 py-1 text-sm text-lp-text-secondary text-right">—</td>
                <td className="px-2 py-1 text-sm text-lp-text-secondary">
                  {h.room_assignments?.[0]?.confirmation ?? '—'}
                </td>
              </tr>
              {isExpanded && h.room_assignments?.length > 0 && (
                <tr className="bg-lp-surface/20">
                  <td colSpan={11} className="px-4 py-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2">
                      Room assignments
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-lp-text-secondary">
                          <th className="text-left py-1">Person</th>
                          <th className="text-left py-1">Check In</th>
                          <th className="text-left py-1">Check Out</th>
                          <th className="text-right py-1">Nights</th>
                          <th className="text-right py-1">Rate/Night</th>
                          <th className="text-left py-1">Conf #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.room_assignments.map((a) => (
                          <tr key={a.id}>
                            <td className="py-1">{a.person_name ?? '—'}</td>
                            <td className="py-1">{formatDate(a.check_in)}</td>
                            <td className="py-1">{formatDate(a.check_out)}</td>
                            <td className="py-1 text-right">{a.nights}</td>
                            <td className="py-1 text-right font-[tabular-nums]">{formatter.format(a.rate_per_night)}</td>
                            <td className="py-1">{a.confirmation ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </GridTable>
      <button
        type="button"
        onClick={addHotel}
        className="text-lp-orange text-sm font-semibold hover:underline"
      >
        + Add Hotel
      </button>
    </div>
  );
}
