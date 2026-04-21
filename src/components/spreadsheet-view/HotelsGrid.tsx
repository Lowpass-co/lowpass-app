'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { budgetCurrencySymbol } from '@/lib/budget-currency';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import { RoutingDateField } from './RoutingDateField';
import { TextColumnHeader, NumberColumnHeader } from './SpreadsheetColumnHeader';
import { InlineEditCell } from './InlineEditCell';
import { PlacesAutocompleteInput } from './PlacesAutocompleteInput';
import {
  nightsBetweenHotelStay,
  hotelRateDenominatorNights,
  impliedRatePerNight,
} from '@/lib/hotel-rate';

const HOTEL_BOOKING_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
] as const;

function hotelBookingStatusSelectClasses(status: string): string {
  switch (status) {
    case 'draft':
      return 'border-zinc-500/50 bg-zinc-900/75 text-zinc-100';
    case 'quoted':
      return 'border-sky-500/55 bg-sky-950/65 text-sky-50';
    case 'approved':
      return 'border-emerald-500/55 bg-emerald-950/55 text-emerald-50';
    case 'paid':
      return 'border-violet-500/55 bg-violet-950/55 text-violet-50';
    case 'disputed':
      return 'border-rose-500/55 bg-rose-950/55 text-rose-50';
    default:
      return 'border-lp-border bg-lp-surface text-lp-text';
  }
}

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
  line_item_id?: string | null;
  proposed_cost?: number;
  actual_cost?: number;
  /** Budget line item status (same as detail panel). */
  status?: string | null;
  hotel_name: string;
  city: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_assignments: RoomAssignment[];
}

type SortState =
  | { col: 'hotel_name' | 'city' | 'conf'; mode: 'az' | 'za' }
  | { col: 'check_in'; mode: 'earliest' | 'latest' }
  | { col: 'nights' | 'rooms' | 'rate' | 'projected' | 'actual'; mode: 'hi' | 'lo' }
  | null;

function monthOptionsFromRows(rows: HotelRow[]) {
  const seen = new Set<string>();
  for (const h of rows) {
    const d = h.check_in_date;
    if (d && d.length >= 7) seen.add(d.slice(0, 7));
  }
  return [...seen]
    .sort()
    .map((yyyymm) => ({
      value: yyyymm,
      label: new Date(yyyymm + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }));
}

export function HotelsGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const { openLineItem } = useDetailPanel();
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<HotelRow>>({});
  const [saving, setSaving] = useState(false);
  const [searchHotel, setSearchHotel] = useState('');
  const [searchCity, setSearchCity] = useState('');
  const [searchConf, setSearchConf] = useState('');
  const [monthYyyymm, setMonthYyyymm] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const textSorts = {
    hotel: sort?.col === 'hotel_name' && sort.mode ? sort.mode : null,
    city: sort?.col === 'city' && sort.mode ? sort.mode : null,
    conf: sort?.col === 'conf' && sort.mode ? sort.mode : null,
  };
  const numSorts = {
    nights: sort?.col === 'nights' && sort.mode ? sort.mode : null,
    rooms: sort?.col === 'rooms' && sort.mode ? sort.mode : null,
    rate: sort?.col === 'rate' && sort.mode ? sort.mode : null,
    projected: sort?.col === 'projected' && sort.mode ? sort.mode : null,
    actual: sort?.col === 'actual' && sort.mode ? sort.mode : null,
  };

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

  useEffect(() => {
    const onLineItemUpdated = () => void fetchData();
    window.addEventListener('lp-budget-line-item-updated', onLineItemUpdated);
    window.addEventListener('lp-hotel-booking-updated', onLineItemUpdated);
    return () => {
      window.removeEventListener('lp-budget-line-item-updated', onLineItemUpdated);
      window.removeEventListener('lp-hotel-booking-updated', onLineItemUpdated);
    };
  }, [fetchData]);

  const monthOpts = useMemo(() => monthOptionsFromRows(hotels), [hotels]);

  const rowsDerived = useMemo(() => {
    return hotels.map((h) => {
      const nights = nightsBetweenHotelStay(h.check_in_date, h.check_out_date);
      const roomCount = h.room_assignments?.length ?? 0;
      const totalAssignmentNights = h.room_assignments?.reduce((s, a) => s + (a.nights || 0), 0) ?? 0;
      const denomNights = hotelRateDenominatorNights(nights, totalAssignmentNights);
      const totalProjected = Number(h.proposed_cost ?? 0);
      const actualTotal = Number(h.actual_cost ?? 0);
      const avgRate = impliedRatePerNight(totalProjected, actualTotal, denomNights);
      const conf0 = h.room_assignments?.[0]?.confirmation ?? '';
      return { h, nights, roomCount, denomNights, totalProjected, actualTotal, avgRate, conf0 };
    });
  }, [hotels]);

  const filteredSorted = useMemo(() => {
    let list = rowsDerived.filter(({ h, conf0 }) => {
      if (searchHotel && !h.hotel_name.toLowerCase().includes(searchHotel.toLowerCase())) return false;
      if (searchCity && !(h.city ?? '').toLowerCase().includes(searchCity.toLowerCase())) return false;
      if (searchConf && !String(conf0).toLowerCase().includes(searchConf.toLowerCase())) return false;
      if (monthYyyymm) {
        const ci = h.check_in_date;
        if (!ci || !ci.startsWith(monthYyyymm)) return false;
      }
      return true;
    });

    const cmp = (a: (typeof list)[0], b: (typeof list)[0]) => {
      if (sort?.col === 'hotel_name' && sort.mode) {
        const t = a.h.hotel_name.localeCompare(b.h.hotel_name);
        return sort.mode === 'az' ? t : -t;
      }
      if (sort?.col === 'city' && sort.mode) {
        const t = (a.h.city ?? '').localeCompare(b.h.city ?? '');
        return sort.mode === 'az' ? t : -t;
      }
      if (sort?.col === 'check_in' && sort.mode) {
        const da = a.h.check_in_date ?? '';
        const db = b.h.check_in_date ?? '';
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        const t = da.localeCompare(db);
        return sort.mode === 'earliest' ? t : -t;
      }
      if (sort?.col === 'nights' && sort.mode) {
        const na = a.nights ?? -1;
        const nb = b.nights ?? -1;
        return sort.mode === 'hi' ? nb - na : na - nb;
      }
      if (sort?.col === 'rooms' && sort.mode) {
        const t = a.roomCount - b.roomCount;
        return sort.mode === 'hi' ? -t : t;
      }
      if (sort?.col === 'rate' && sort.mode) {
        const na = a.avgRate ?? -1;
        const nb = b.avgRate ?? -1;
        return sort.mode === 'hi' ? nb - na : na - nb;
      }
      if (sort?.col === 'projected' && sort.mode) {
        const t = a.totalProjected - b.totalProjected;
        return sort.mode === 'hi' ? -t : t;
      }
      if (sort?.col === 'actual' && sort.mode) {
        const ta = a.actualTotal;
        const tb = b.actualTotal;
        return sort.mode === 'hi' ? tb - ta : ta - tb;
      }
      if (sort?.col === 'conf' && sort.mode) {
        const t = String(a.conf0).localeCompare(String(b.conf0));
        return sort.mode === 'az' ? t : -t;
      }
      return 0;
    };

    if (sort) list = [...list].sort(cmp);
    return list;
  }, [rowsDerived, sort, searchHotel, searchCity, searchConf, monthYyyymm]);

  const totalProjectedAll = useMemo(
    () => filteredSorted.reduce((s, r) => s + r.totalProjected, 0),
    [filteredSorted]
  );

  const totalActualAll = useMemo(
    () => filteredSorted.reduce((s, r) => s + r.actualTotal, 0),
    [filteredSorted]
  );

  const varianceTotal = useMemo(() => totalActualAll - totalProjectedAll, [totalActualAll, totalProjectedAll]);

  const currencySymbol = useMemo(() => budgetCurrencySymbol(currency), [currency]);

  const patchHotelLineItem = useCallback(
    async (
      hotelId: string,
      lineItemId: string,
      body: { proposed_cost?: number; actual_cost?: number; status?: string }
    ) => {
      const res = await fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineItemId, ...body }),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = (await res.json()) as {
        proposed_cost?: number | null;
        actual_cost?: number | null;
        status?: string | null;
      };
      setHotels((prev) =>
        prev.map((x) =>
          x.id === hotelId
            ? {
                ...x,
                proposed_cost: Number(data.proposed_cost ?? body.proposed_cost ?? x.proposed_cost ?? 0),
                actual_cost: Number(data.actual_cost ?? body.actual_cost ?? x.actual_cost ?? 0),
                status: String(data.status ?? body.status ?? x.status ?? 'draft'),
              }
            : x
        )
      );
      window.dispatchEvent(new CustomEvent('lp-budget-line-item-updated'));
    },
    []
  );

  const saveHotel = useCallback(async (id: string, field: string, value: string | number | null) => {
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
    setHotels((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...updated, room_assignments: x.room_assignments } : x))
    );
    window.dispatchEvent(new CustomEvent('lp-hotel-booking-updated'));
  }, []);

  const saveEditRow = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await saveHotel(editingId, 'hotel_name', String(editDraft.hotel_name ?? ''));
      await saveHotel(editingId, 'city', editDraft.city ?? null);
      await saveHotel(
        editingId,
        'check_in_date',
        editDraft.check_in_date ? String(editDraft.check_in_date).slice(0, 10) : null
      );
      await saveHotel(
        editingId,
        'check_out_date',
        editDraft.check_out_date ? String(editDraft.check_out_date).slice(0, 10) : null
      );
      setEditingId(null);
      setEditDraft({});
    } finally {
      setSaving(false);
    }
  };

  const addHotel = useCallback(async () => {
    const res = await fetch('/api/budget/hotels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, hotel_name: '' }),
    });
    if (!res.ok) throw new Error('Create failed');
    const created = (await res.json()) as { id: string };
    await fetchData();
    setEditingId(created.id);
    setEditDraft({});
  }, [tourId, fetchData]);

  const deleteHotel = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this hotel and its room assignments?')) return;
      setSaving(true);
      try {
        const res = await fetch('/api/budget/hotels', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error('Delete failed');
        setHotels((prev) => prev.filter((h) => h.id !== id));
        if (editingId === id) {
          setEditingId(null);
          setEditDraft({});
        }
      } finally {
        setSaving(false);
      }
    },
    [editingId]
  );

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  const checkInSortValue =
    sort?.col === 'check_in' && (sort.mode === 'earliest' || sort.mode === 'latest') ? sort.mode : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-sm">
        <label className="flex flex-wrap items-center gap-2 text-lp-text-secondary">
          <span className="whitespace-nowrap font-medium text-lp-text">Sort by check-in</span>
          <select
            value={checkInSortValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'earliest' || v === 'latest') setSort({ col: 'check_in', mode: v });
              else setSort((prev) => (prev?.col === 'check_in' ? null : prev));
            }}
            className="min-w-[11rem] rounded-md border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
          >
            <option value="">Default order</option>
            <option value="earliest">Earliest first</option>
            <option value="latest">Latest first</option>
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-lp-text-secondary">
          <span className="whitespace-nowrap font-medium text-lp-text">Month</span>
          <select
            value={monthYyyymm}
            onChange={(e) => setMonthYyyymm(e.target.value)}
            className="min-w-[10rem] rounded-md border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
          >
            <option value="">All months</option>
            {monthOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
        <table className="w-full min-w-[1220px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border">
              <th className="px-3 py-2 text-left align-top">
                <TextColumnHeader
                  label="Hotel Name"
                  search={searchHotel}
                  onSearchChange={setSearchHotel}
                  textSort={textSorts.hotel}
                  onTextSort={(m) => setSort(m ? { col: 'hotel_name', mode: m } : null)}
                />
              </th>
              <th className="px-3 py-2 text-left align-top">
                <TextColumnHeader
                  label="City"
                  search={searchCity}
                  onSearchChange={setSearchCity}
                  textSort={textSorts.city}
                  onTextSort={(m) => setSort(m ? { col: 'city', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-2 text-left align-top">
                <div className="flex min-h-11 w-full min-w-0 flex-col gap-1 py-1 pr-0.5">
                  <span className="min-w-0 w-full truncate text-left text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text">
                    Check In
                  </span>
                  <div className="min-h-5 shrink-0" aria-hidden />
                </div>
              </th>
              <th className="px-1 py-2 text-left align-top">
                <div className="flex min-h-11 w-full min-w-0 flex-col gap-1 py-1 pr-0.5">
                  <span className="min-w-0 w-full truncate text-left text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text">
                    Check Out
                  </span>
                  <div className="min-h-5 shrink-0" aria-hidden />
                </div>
              </th>
              <th className="px-2 py-2 text-right align-top">
                <NumberColumnHeader
                  label="# Nights"
                  numSort={numSorts.nights}
                  onNumSort={(m) => setSort(m ? { col: 'nights', mode: m } : null)}
                />
              </th>
              <th className="px-2 py-2 text-right align-top">
                <NumberColumnHeader
                  label="# Rooms"
                  numSort={numSorts.rooms}
                  onNumSort={(m) => setSort(m ? { col: 'rooms', mode: m } : null)}
                />
              </th>
              <th className="px-2 py-2 text-right align-top">
                <NumberColumnHeader
                  label="Rate/Night"
                  numSort={numSorts.rate}
                  onNumSort={(m) => setSort(m ? { col: 'rate', mode: m } : null)}
                />
              </th>
              <th className="px-2 py-2 text-right align-top">
                <NumberColumnHeader
                  label="Projected"
                  numSort={numSorts.projected}
                  onNumSort={(m) => setSort(m ? { col: 'projected', mode: m } : null)}
                />
              </th>
              <th className="px-2 py-2 text-center align-top">
                <NumberColumnHeader
                  label="Actual"
                  labelAlign="center"
                  numSort={numSorts.actual}
                  onNumSort={(m) => setSort(m ? { col: 'actual', mode: m } : null)}
                />
              </th>
              <th className="px-2 py-2 text-center align-top">
                <div className="flex min-h-11 w-full min-w-0 flex-col items-center gap-1 py-1">
                  <span className="min-w-0 w-full truncate text-center text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text">
                    Status
                  </span>
                  <div className="min-h-5 w-full shrink-0" aria-hidden />
                </div>
              </th>
              <th className="px-3 py-2 text-center align-top">
                <TextColumnHeader
                  label="Conf #"
                  labelAlign="center"
                  search={searchConf}
                  onSearchChange={setSearchConf}
                  textSort={textSorts.conf}
                  onTextSort={(m) => setSort(m ? { col: 'conf', mode: m } : null)}
                />
              </th>
              <th className="w-20 px-2 py-2 align-top" />
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map(({ h, nights, roomCount, denomNights, totalProjected, actualTotal, avgRate, conf0 }) => {
              const isEditing = editingId === h.id;
              const form = isEditing
                ? {
                    ...h,
                    ...editDraft,
                  }
                : h;
              return (
                <tr
                  key={h.id}
                  className={cn(
                    'group border-b border-lp-border/30 hover:bg-lp-surface-hover',
                    isEditing && 'bg-lp-orange/[0.04]'
                  )}
                  onClick={() => {
                    if (isEditing) return;
                    if (h.line_item_id) openLineItem(h.line_item_id);
                  }}
                >
                  <td className="p-0 align-middle" onClick={(e) => isEditing && e.stopPropagation()}>
                    <div className="flex min-h-11 w-full items-center px-3 py-2">
                      {isEditing ? (
                        <PlacesAutocompleteInput
                          value={form.hotel_name ?? ''}
                          onTyping={(v) => setEditDraft((d) => ({ ...d, hotel_name: v, city: '' }))}
                          onChange={(v) => setEditDraft((d) => ({ ...d, hotel_name: v }))}
                          onPlaceResolved={(d) => {
                            const city =
                              [d.inferredCity, d.locality].find((x) => x && String(x).trim())?.trim() ?? '';
                            setEditDraft((prev) => ({
                              ...prev,
                              hotel_name: d.displayName,
                              city,
                            }));
                          }}
                          includedPrimaryTypes={['lodging']}
                          placeholder="Hotel name (search or type)…"
                        />
                      ) : (
                        <span className="font-medium text-lp-text">
                          {h.hotel_name?.trim() ? h.hotel_name : '—'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle text-lp-text-secondary" onClick={(e) => isEditing && e.stopPropagation()}>
                    <div className="flex min-h-11 w-full items-center px-3 py-2">
                      {isEditing ? (
                        <PlacesAutocompleteInput
                          value={form.city ?? ''}
                          onChange={(v) => setEditDraft((d) => ({ ...d, city: v }))}
                          onPlaceResolved={(d) =>
                            setEditDraft((prev) => ({
                              ...prev,
                              city: d.locality ?? d.displayName ?? prev.city ?? '',
                            }))
                          }
                          includedPrimaryTypes={['locality']}
                          placeholder="City (search or type)…"
                        />
                      ) : (
                        h.city ?? '—'
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-h-11 w-full min-w-0 items-center justify-start px-1 py-2">
                      {isEditing ? (
                        <RoutingDateField
                          tourId={tourId}
                          variant="tableCell"
                          value={form.check_in_date}
                          onChange={(iso) => setEditDraft((d) => ({ ...d, check_in_date: iso }))}
                        />
                      ) : (
                        <RoutingDateField
                          tourId={tourId}
                          variant="tableCell"
                          value={h.check_in_date}
                          onChange={async (iso) => {
                            if (iso) await saveHotel(h.id, 'check_in_date', iso);
                          }}
                          className="pointer-events-auto"
                        />
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-h-11 w-full min-w-0 items-center justify-start px-1 py-2">
                      {isEditing ? (
                        <RoutingDateField
                          tourId={tourId}
                          variant="tableCell"
                          value={form.check_out_date}
                          onChange={(iso) => setEditDraft((d) => ({ ...d, check_out_date: iso }))}
                        />
                      ) : (
                        <RoutingDateField
                          tourId={tourId}
                          variant="tableCell"
                          value={h.check_out_date}
                          onChange={async (iso) => {
                            if (iso) await saveHotel(h.id, 'check_out_date', iso);
                          }}
                        />
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle tabular-nums text-lp-text-secondary">
                    <div className="flex min-h-11 w-full items-center justify-end px-2 py-2 text-right">
                      {nights != null ? nights : '—'}
                    </div>
                  </td>
                  <td className="p-0 align-middle tabular-nums text-lp-text-secondary">
                    <div className="flex min-h-11 w-full items-center justify-end px-2 py-2 text-right">{roomCount}</div>
                  </td>
                  <td className="p-0 align-middle text-lp-text-secondary">
                    <div className="flex min-h-11 w-full items-center justify-end px-2 py-2 text-right tabular-nums">
                      {avgRate != null ? (
                        <InlineEditCell
                          type="currency"
                          currency={currency}
                          align="right"
                          value={avgRate}
                          readOnly
                          className="text-lp-text-secondary"
                          onSave={async () => {}}
                        />
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle text-lp-text-secondary" onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-h-11 w-full items-center justify-end px-2 py-2 text-right">
                      {h.line_item_id ? (
                        <InlineEditCell
                          type="currency"
                          currency={currency}
                          align="right"
                          value={totalProjected}
                          className="text-lp-text-secondary"
                          onSave={async (v) => {
                            await patchHotelLineItem(h.id, h.line_item_id!, { proposed_cost: Number(v) });
                          }}
                        />
                      ) : (
                        <span className="tabular-nums">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle text-lp-text-secondary" onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-h-11 w-full items-center justify-end px-2 py-2 text-right">
                      {h.line_item_id ? (
                        <InlineEditCell
                          type="currency"
                          currency={currency}
                          align="right"
                          value={actualTotal}
                          className="text-lp-text-secondary"
                          onSave={async (v) => {
                            await patchHotelLineItem(h.id, h.line_item_id!, { actual_cost: Number(v) });
                          }}
                        />
                      ) : (
                        <span className="tabular-nums">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-h-11 w-full items-center px-2 py-2">
                      {h.line_item_id ? (
                        <select
                          value={h.status ?? 'draft'}
                          disabled={saving}
                          onChange={(e) => {
                            void patchHotelLineItem(h.id, h.line_item_id!, { status: e.target.value });
                          }}
                          className={cn(
                            'w-full min-w-[7.25rem] max-w-[10.5rem] cursor-pointer rounded-md border px-2 py-1.5 text-xs font-semibold shadow-sm transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange/35',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            hotelBookingStatusSelectClasses(h.status ?? 'draft')
                          )}
                        >
                          {HOTEL_BOOKING_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-lp-text-tertiary">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-0 align-middle text-lp-text-secondary max-w-[120px]">
                    <div className="flex min-h-11 w-full min-w-0 items-center justify-end px-3 py-2 text-right">
                      <span className="min-w-0 max-w-full truncate text-right" title={conf0 || undefined}>
                        {conf0 || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="p-0 align-middle">
                    <div className="flex min-h-11 items-center justify-end px-1 py-1">
                      <div
                        className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveEditRow()}
                            disabled={saving}
                            className="rounded p-1 text-emerald-600 hover:bg-lp-surface"
                            title="Save"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft({});
                            }}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-surface"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(h.id);
                              setEditDraft({
                                hotel_name: h.hotel_name,
                                city: h.city,
                                check_in_date: h.check_in_date,
                                check_out_date: h.check_out_date,
                              });
                            }}
                            className="rounded p-1 text-lp-text-tertiary hover:text-lp-text"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteHotel(h.id)}
                            className="rounded p-1 text-red-500/80 hover:bg-red-500/10"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-lp-border bg-lp-surface p-5">
          <div className="ml-auto max-w-[500px] space-y-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-lp-text-tertiary">Projected Hotel Cost</span>
              <span className="font-mono tabular-nums tracking-wide text-lp-text">
                <span className="mr-1 text-lp-text-secondary">{currencySymbol}</span>
                {totalProjectedAll.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-lp-text-tertiary">Actual Hotel Cost</span>
              <span className="font-mono tabular-nums tracking-wide text-lp-text">
                <span className="mr-1 text-lp-text-secondary">{currencySymbol}</span>
                {totalActualAll.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="my-3 h-px w-full bg-lp-border opacity-60" />
            <div className="flex items-center justify-between text-[15px]">
              <span className="font-bold text-lp-text">Variance</span>
              <span className="font-mono font-bold tabular-nums tracking-wide text-lp-orange">
                <span className="mr-1 text-lp-orange/60">{currencySymbol}</span>
                {varianceTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t border-lp-border px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
            onClick={() => void addHotel()}
          >
            <Plus className="h-4 w-4" />
            Add Hotel
          </button>
        </div>
      </div>
    </div>
  );
}
