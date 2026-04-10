'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import { SpreadsheetCurrencyAmount } from './SpreadsheetCurrencyAmount';

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
              <tr>
                <td className="w-10 p-0 text-center align-middle">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : h.id)}
                    className="inline-flex p-1 text-lp-text-secondary hover:text-lp-text"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </td>
                <td className="p-0">
                  <InlineEditCell
                    value={h.hotel_name}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'hotel_name', String(v))}
                  />
                </td>
                <td className="p-0">
                  <InlineEditCell
                    value={h.city}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'city', String(v))}
                  />
                </td>
                <td className="p-0">
                  <InlineEditCell
                    value={h.check_in_date ? h.check_in_date.slice(0, 10) : null}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'check_in_date', String(v) || '')}
                  />
                </td>
                <td className="p-0">
                  <InlineEditCell
                    value={h.check_out_date ? h.check_out_date.slice(0, 10) : null}
                    type="text"
                    onSave={async (v) => saveHotel(h.id, 'check_out_date', String(v) || '')}
                  />
                </td>
                <td className="text-right text-lp-text-secondary font-[tabular-nums]">
                  {nights != null ? nights : '—'}
                </td>
                <td className="text-right text-lp-text-secondary">{roomCount}</td>
                <td className="text-lp-text-secondary">
                  {avgRate != null ? <SpreadsheetCurrencyAmount amount={avgRate} currency={currency} /> : '—'}
                </td>
                <td className="text-lp-text-secondary">
                  {totalProjected > 0 ? <SpreadsheetCurrencyAmount amount={totalProjected} currency={currency} /> : '—'}
                </td>
                <td className="text-right text-lp-text-secondary">—</td>
                <td className="text-lp-text-secondary">{h.room_assignments?.[0]?.confirmation ?? '—'}</td>
              </tr>
              {isExpanded && h.room_assignments?.length > 0 && (
                <tr className="bg-lp-surface/20">
                  <td colSpan={11} className="px-4 py-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-lp-text-secondary">
                      Room assignments
                    </div>
                    <table className="w-full border-collapse overflow-hidden rounded-md border border-lp-border text-sm">
                      <thead>
                        <tr className="border-b border-lp-border bg-lp-bg-tertiary/80 dark:bg-lp-bg-secondary/80">
                          <th className="border-r border-lp-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide lp-table-header-text last:border-r-0">
                            Person
                          </th>
                          <th className="border-r border-lp-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide lp-table-header-text last:border-r-0">
                            Check In
                          </th>
                          <th className="border-r border-lp-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide lp-table-header-text last:border-r-0">
                            Check Out
                          </th>
                          <th className="border-r border-lp-border px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide lp-table-header-text last:border-r-0">
                            Nights
                          </th>
                          <th className="border-r border-lp-border px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide lp-table-header-text last:border-r-0">
                            Rate/Night
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide lp-table-header-text">
                            Conf #
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.room_assignments.map((a) => (
                          <tr key={a.id} className="border-b border-lp-border last:border-b-0">
                            <td className="border-r border-lp-border px-3 py-2 text-lp-text-secondary last:border-r-0">
                              {a.person_name ?? '—'}
                            </td>
                            <td className="border-r border-lp-border px-3 py-2 text-lp-text-secondary last:border-r-0">
                              {formatDate(a.check_in)}
                            </td>
                            <td className="border-r border-lp-border px-3 py-2 text-lp-text-secondary last:border-r-0">
                              {formatDate(a.check_out)}
                            </td>
                            <td className="border-r border-lp-border px-3 py-2 text-right font-[tabular-nums] text-lp-text-secondary last:border-r-0">
                              {a.nights}
                            </td>
                            <td className="border-r border-lp-border px-3 py-2 text-lp-text-secondary last:border-r-0">
                              <SpreadsheetCurrencyAmount amount={a.rate_per_night} currency={currency} />
                            </td>
                            <td className="px-3 py-2 text-lp-text-secondary">{a.confirmation ?? '—'}</td>
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
