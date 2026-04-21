'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import { SpreadsheetCurrencyAmount } from './SpreadsheetCurrencyAmount';
import { RoutingDateField } from './RoutingDateField';
import { TextColumnHeader, NumberColumnHeader, DateColumnHeader } from './SpreadsheetColumnHeader';
import { InlineEditCell } from './InlineEditCell';
import { BrandedSelect } from '@/components/ui/BrandedSelect';

type PersonnelOption = { person_name: string; role: string | null };

interface FlightRow {
  id: string;
  line_item_id?: string | null;
  person_name: string;
  role: string | null;
  origin_code: string | null;
  destination_code: string | null;
  proposed_cost: number;
  actual_cost: number;
  departure_date: string | null;
  airline: string | null;
  flight_number: string | null;
  leg_order: number;
}

type FlSort =
  | { col: 'name' | 'airline' | 'flightNum'; mode: 'az' | 'za' }
  | { col: 'proposed' | 'actual' | 'leg'; mode: 'hi' | 'lo' }
  | { col: 'dep'; mode: 'earliest' | 'latest' }
  | { col: 'orig' | 'dest'; mode: 'az' | 'za' }
  | null;

function monthOptionsFromFlights(flights: FlightRow[]) {
  const seen = new Set<string>();
  for (const f of flights) {
    const d = f.departure_date;
    if (d && d.length >= 7) seen.add(d.slice(0, 7));
  }
  return [...seen]
    .sort()
    .map((yyyymm) => ({
      value: yyyymm,
      label: new Date(yyyymm + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }));
}

function useDebounced<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function formatAirportButtonText(code: string | null, nameByIata: Readonly<Record<string, string>>) {
  if (!code) return '—';
  const up = code.toUpperCase();
  const n = nameByIata[up];
  return n ? `${up} — ${n}` : up;
}

function AirportSearchCell({
  code,
  onResolved,
  nameByIata,
  onCodeChange,
}: {
  code: string | null;
  onResolved: (iata: string, placeName: string) => void;
  nameByIata: Readonly<Record<string, string>>;
  onCodeChange: (iata: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [sug, setSug] = useState<{ placeId: string; text: string }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const qDeb = useDebounced(q, 200);

  useEffect(() => {
    if (!open) return;
    if (qDeb.length < 2) {
      setSug([]);
      return;
    }
    setLoading(true);
    fetch('/api/places/airports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: qDeb }),
    })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((j) => setSug(j.suggestions ?? []))
      .catch(() => setSug([]))
      .finally(() => setLoading(false));
  }, [qDeb, open]);

  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [open]);

  const display = formatAirportButtonText(code, nameByIata);

  return (
    <div ref={wrapRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[2.75rem] w-full min-w-0 max-w-[220px] items-center border border-transparent px-2 py-1.5 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
      >
        <span className="truncate" title={typeof display === 'string' ? display : undefined}>
          {display}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-0.5 w-[min(100vw-2rem,28rem)] rounded-md border border-lp-border bg-lp-bg p-2 shadow-lg">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search airport…"
            className="mb-2 w-full rounded border border-lp-border bg-lp-surface px-2 py-1.5 text-xs"
            autoFocus
          />
          {loading && <p className="px-1 py-0.5 text-xs text-lp-text-secondary">Searching…</p>}
          <ul className="max-h-40 overflow-y-auto text-xs">
            {sug.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  className="w-full truncate rounded px-1 py-1.5 text-left hover:bg-lp-surface-hover"
                  onClick={() => {
                    setLoading(true);
                    fetch(
                      `/api/places/details?placeId=${encodeURIComponent(s.placeId)}`
                    )
                      .then((r) => (r.ok ? r.json() : null))
                      .then((d: { iataCode?: string; displayName?: string } | null) => {
                        const fromApi = d?.iataCode?.trim().toUpperCase();
                        const fromText = s.text.split(/[\s–—,-]/)[0]?.trim().toUpperCase() ?? '';
                        const iata =
                          fromApi && fromApi.length >= 3
                            ? fromApi.slice(0, 3)
                            : fromText.length >= 3
                              ? fromText.slice(0, 3)
                              : s.text
                                  .split(/[\s–—,-]/)
                                  .find((p) => /^[A-Z]{3}$/i.test(p))?.toUpperCase() ?? '';
                        if (iata.length < 2) {
                          return;
                        }
                        const name = d?.displayName || s.text;
                        onCodeChange(iata);
                        onResolved(iata, name);
                        setOpen(false);
                        setQ('');
                        setSug([]);
                      })
                      .finally(() => setLoading(false));
                  }}
                >
                  {s.text}
                </button>
              </li>
            ))}
            {!loading && qDeb.length >= 2 && sug.length === 0 && (
              <li className="px-1 py-1.5 text-lp-text-tertiary">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FlightsGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const { openLineItem } = useDetailPanel();
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<FlightRow>>({});
  const [saving, setSaving] = useState(false);
  const [iataLabelByCode, setIataLabelByCode] = useState<Record<string, string>>({});
  const [searchName, setSearchName] = useState('');
  const [searchAir, setSearchAir] = useState('');
  const [searchFn, setSearchFn] = useState('');
  const [searchOrig, setSearchOrig] = useState('');
  const [searchDest, setSearchDest] = useState('');
  const [monthYyyymm, setMonthYyyymm] = useState('');
  const [sort, setSort] = useState<FlSort>(null);

  const nameSort = sort?.col === 'name' && sort.mode ? sort.mode : null;
  const origSort = sort?.col === 'orig' && sort.mode ? sort.mode : null;
  const destSort = sort?.col === 'dest' && sort.mode ? sort.mode : null;
  const propSort = sort?.col === 'proposed' && sort.mode ? sort.mode : null;
  const actSort = sort?.col === 'actual' && sort.mode ? sort.mode : null;
  const depSort = sort?.col === 'dep' && sort.mode ? sort.mode : null;
  const airSort = sort?.col === 'airline' && sort.mode ? sort.mode : null;
  const fnSort = sort?.col === 'flightNum' && sort.mode ? sort.mode : null;
  const legSort = sort?.col === 'leg' && sort.mode ? sort.mode : null;

  const monthOpts = useMemo(() => monthOptionsFromFlights(flights), [flights]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, pRes] = await Promise.all([
        fetch(`/api/budget/flights?tour_id=${tourId}`),
        fetch(`/api/budget/personnel-rates?tour_id=${tourId}`),
      ]);
      if (!fRes.ok) throw new Error('Failed to load flights');
      const fJson = await fRes.json();
      setFlights(fJson.flights ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        const pr = pJson.personnel_rates ?? [];
        setPersonnel(
          pr.map((p: { person_name: string; role: string | null }) => ({
            person_name: p.person_name,
            role: p.role ?? null,
          }))
        );
      } else {
        setPersonnel([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateLabels = (iata: string, name: string) => {
    setIataLabelByCode((m) => ({ ...m, [iata.toUpperCase()]: name }));
  };

  const saveFlight = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      const res = await fetch('/api/budget/flights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value === '' ? null : value }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setFlights((prev) => prev.map((f) => (f.id === id ? updated : f)));
    },
    []
  );

  const filteredSorted = useMemo(() => {
    let list = flights.filter((f) => {
      if (searchName && !f.person_name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (searchAir && !(f.airline ?? '').toLowerCase().includes(searchAir.toLowerCase())) return false;
      if (searchFn && !(f.flight_number ?? '').toLowerCase().includes(searchFn.toLowerCase())) return false;
      if (searchOrig && !(f.origin_code ?? '').toLowerCase().includes(searchOrig.toLowerCase())) return false;
      if (searchDest && !(f.destination_code ?? '').toLowerCase().includes(searchDest.toLowerCase())) return false;
      if (monthYyyymm) {
        const d = f.departure_date;
        if (!d || !d.startsWith(monthYyyymm)) return false;
      }
      return true;
    });

    if (!sort) return list;
    const cmp = (a: FlightRow, b: FlightRow) => {
      switch (sort.col) {
        case 'name': {
          const t = a.person_name.localeCompare(b.person_name);
          return sort.mode === 'az' ? t : -t;
        }
        case 'orig': {
          const t = (a.origin_code ?? '').localeCompare(b.origin_code ?? '');
          return sort.mode === 'az' ? t : -t;
        }
        case 'dest': {
          const t = (a.destination_code ?? '').localeCompare(b.destination_code ?? '');
          return sort.mode === 'az' ? t : -t;
        }
        case 'proposed': {
          const t = a.proposed_cost - b.proposed_cost;
          return sort.mode === 'hi' ? -t : t;
        }
        case 'actual': {
          const t = a.actual_cost - b.actual_cost;
          return sort.mode === 'hi' ? -t : t;
        }
        case 'dep': {
          const da = a.departure_date ?? '';
          const db = b.departure_date ?? '';
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          const t = da.localeCompare(db);
          return sort.mode === 'earliest' ? t : -t;
        }
        case 'airline': {
          const t = (a.airline ?? '').localeCompare(b.airline ?? '');
          return sort.mode === 'az' ? t : -t;
        }
        case 'flightNum': {
          const t = (a.flight_number ?? '').localeCompare(b.flight_number ?? '');
          return sort.mode === 'az' ? t : -t;
        }
        case 'leg': {
          const t = a.leg_order - b.leg_order;
          return sort.mode === 'hi' ? -t : t;
        }
        default:
          return 0;
      }
    };
    return [...list].sort(cmp);
  }, [flights, sort, searchName, searchAir, searchFn, searchOrig, searchDest, monthYyyymm]);

  const totalProposed = useMemo(
    () => flights.reduce((s, f) => s + (f.proposed_cost || 0), 0),
    [flights]
  );

  const addFlight = useCallback(async () => {
    const first = personnel[0]?.person_name;
    if (!first) return;
    const res = await fetch('/api/budget/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        person_name: first,
        role: personnel[0]?.role ?? null,
        leg_order: flights.length,
        proposed_cost: 0,
        actual_cost: 0,
      }),
    });
    if (!res.ok) throw new Error('Create failed');
    await fetchData();
  }, [tourId, personnel, flights.length, fetchData]);

  const saveEditRow = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const id = editingId;
      const base = flights.find((x) => x.id === id);
      if (!base) return;
      const d = { ...base, ...editDraft } as FlightRow;
      const res = await fetch('/api/budget/flights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          person_name: d.person_name,
          role: d.role,
          origin_code: d.origin_code,
          destination_code: d.destination_code,
          proposed_cost: d.proposed_cost,
          actual_cost: d.actual_cost,
          departure_date: d.departure_date,
          airline: d.airline,
          flight_number: d.flight_number,
          leg_order: d.leg_order,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setFlights((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setEditingId(null);
      setEditDraft({});
    } finally {
      setSaving(false);
    }
  };

  const deleteFlight = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this flight?')) return;
      setSaving(true);
      try {
        const res = await fetch('/api/budget/flights', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error('Delete failed');
        setFlights((prev) => prev.filter((f) => f.id !== id));
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

  const byName = (name: string) => personnel.find((p) => p.person_name === name);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border">
              <th className="px-2 py-3 text-left align-bottom min-w-[140px]">
                <TextColumnHeader
                  label="Name"
                  search={searchName}
                  onSearchChange={setSearchName}
                  textSort={nameSort}
                  onTextSort={(m) => setSort(m ? { col: 'name', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-3 text-left align-bottom">
                <TextColumnHeader
                  label="Origin"
                  search={searchOrig}
                  onSearchChange={setSearchOrig}
                  textSort={origSort}
                  onTextSort={(m) => setSort(m ? { col: 'orig', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-3 text-left align-bottom">
                <TextColumnHeader
                  label="Destination"
                  search={searchDest}
                  onSearchChange={setSearchDest}
                  textSort={destSort}
                  onTextSort={(m) => setSort(m ? { col: 'dest', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-3 text-right align-bottom">
                <NumberColumnHeader
                  label="Proposed"
                  numSort={propSort}
                  onNumSort={(m) => setSort(m ? { col: 'proposed', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-3 text-right align-bottom">
                <NumberColumnHeader
                  label="Actual"
                  numSort={actSort}
                  onNumSort={(m) => setSort(m ? { col: 'actual', mode: m } : null)}
                />
              </th>
              <th className="px-0 py-3 text-right align-bottom">
                <DateColumnHeader
                  label="Departure"
                  dateSort={depSort}
                  onDateSort={(d) => {
                    if (d == null) setSort(null);
                    else setSort({ col: 'dep', mode: d });
                  }}
                  monthYyyymm={monthYyyymm}
                  onMonthYyyymm={setMonthYyyymm}
                  monthOptions={monthOpts}
                />
              </th>
              <th className="px-1 py-3 text-left align-bottom min-w-[100px]">
                <TextColumnHeader
                  label="Airline"
                  search={searchAir}
                  onSearchChange={setSearchAir}
                  textSort={airSort}
                  onTextSort={(m) => setSort(m ? { col: 'airline', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-3 text-left align-bottom">
                <TextColumnHeader
                  label="Flight #"
                  search={searchFn}
                  onSearchChange={setSearchFn}
                  textSort={fnSort}
                  onTextSort={(m) => setSort(m ? { col: 'flightNum', mode: m } : null)}
                />
              </th>
              <th className="px-1 py-3 text-right align-bottom w-16">
                <NumberColumnHeader
                  label="Leg"
                  numSort={legSort}
                  onNumSort={(m) => setSort(m ? { col: 'leg', mode: m } : null)}
                />
              </th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((f) => {
              const isEditing = editingId === f.id;
              const form: FlightRow = { ...f, ...editDraft };

              return (
                <tr
                  key={f.id}
                  className={cn(
                    'group border-b border-lp-border/30 hover:bg-lp-surface-hover',
                    isEditing && 'bg-lp-orange/[0.04]'
                  )}
                  onClick={() => {
                    if (isEditing) return;
                    if (f.line_item_id) openLineItem(f.line_item_id);
                  }}
                >
                  <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                    {personnel.length === 0 ? (
                      <span className="px-1 text-lp-text-secondary" title="Add people on the tour Personnel page">
                        {f.person_name || '—'}
                      </span>
                    ) : (
                      <BrandedSelect
                        value={isEditing ? form.person_name : f.person_name}
                        onChange={async (name) => {
                          const opt = byName(name);
                          if (isEditing) {
                            setEditDraft((d) => ({ ...d, person_name: name, role: opt?.role ?? null }));
                          } else {
                            setSaving(true);
                            try {
                              await saveFlight(f.id, 'person_name', name);
                              if (opt) await saveFlight(f.id, 'role', opt.role);
                            } finally {
                              setSaving(false);
                            }
                          }
                        }}
                        options={personnel.map((p) => ({ value: p.person_name, label: p.person_name }))}
                        ariaLabel="Person"
                        className="w-full max-w-[200px]"
                        size="sm"
                        minWidth={140}
                      />
                    )}
                  </td>
                  <td className="p-0 align-top" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <input
                        className="m-1 w-16 rounded border border-lp-border px-1.5 py-1 text-sm uppercase"
                        value={form.origin_code ?? ''}
                        maxLength={3}
                        onChange={(e) => setEditDraft((d) => ({ ...d, origin_code: e.target.value }))}
                      />
                    ) : (
                      <AirportSearchCell
                        code={f.origin_code}
                        nameByIata={iataLabelByCode}
                        onCodeChange={async (i) => {
                          setSaving(true);
                          try {
                            await saveFlight(f.id, 'origin_code', i);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onResolved={updateLabels}
                      />
                    )}
                  </td>
                  <td className="p-0 align-top" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <input
                        className="m-1 w-16 rounded border border-lp-border px-1.5 py-1 text-sm uppercase"
                        value={form.destination_code ?? ''}
                        maxLength={3}
                        onChange={(e) => setEditDraft((d) => ({ ...d, destination_code: e.target.value }))}
                      />
                    ) : (
                      <AirportSearchCell
                        code={f.destination_code}
                        nameByIata={iataLabelByCode}
                        onCodeChange={async (i) => {
                          setSaving(true);
                          try {
                            await saveFlight(f.id, 'destination_code', i);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onResolved={updateLabels}
                      />
                    )}
                  </td>
                  <td className="p-0" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      value={form.proposed_cost}
                      type="currency"
                      currency={currency}
                      onSave={async (v) => {
                        if (isEditing) {
                          setEditDraft((d) => ({ ...d, proposed_cost: v as number }));
                        } else {
                          await saveFlight(f.id, 'proposed_cost', v as number);
                        }
                      }}
                      align="right"
                    />
                  </td>
                  <td className="p-0" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      value={form.actual_cost}
                      type="currency"
                      currency={currency}
                      onSave={async (v) => {
                        if (isEditing) {
                          setEditDraft((d) => ({ ...d, actual_cost: v as number }));
                        } else {
                          await saveFlight(f.id, 'actual_cost', v as number);
                        }
                      }}
                      align="right"
                    />
                  </td>
                  <td className="px-0 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-0.5 pr-0.5">
                      <div className="flex min-w-0 items-center justify-self-end">
                        <RoutingDateField
                          tourId={tourId}
                          variant="tableCell"
                          value={isEditing ? form.departure_date : f.departure_date}
                          onChange={async (iso) => {
                            if (isEditing) {
                              setEditDraft((d) => ({ ...d, departure_date: iso }));
                            } else if (iso) {
                              await saveFlight(f.id, 'departure_date', iso);
                            }
                          }}
                        />
                      </div>
                      <div className="pointer-events-none select-none" aria-hidden />
                    </div>
                  </td>
                  <td className="p-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="m-0 w-full min-w-0 border-0 bg-transparent px-2 py-2 text-sm"
                      value={isEditing ? form.airline ?? '' : f.airline ?? ''}
                      onChange={async (e) => {
                        if (isEditing) setEditDraft((d) => ({ ...d, airline: e.target.value }));
                        else {
                          setSaving(true);
                          try {
                            await saveFlight(f.id, 'airline', e.target.value || null);
                          } finally {
                            setSaving(false);
                          }
                        }
                      }}
                    />
                  </td>
                  <td className="p-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="m-0 w-full min-w-0 border-0 bg-transparent px-2 py-2 text-sm tabular-nums"
                      value={isEditing ? form.flight_number ?? '' : f.flight_number ?? ''}
                      onChange={async (e) => {
                        if (isEditing) setEditDraft((d) => ({ ...d, flight_number: e.target.value }));
                        else {
                          setSaving(true);
                          try {
                            await saveFlight(f.id, 'flight_number', e.target.value || null);
                          } finally {
                            setSaving(false);
                          }
                        }
                      }}
                    />
                  </td>
                  <td className="p-0 text-right" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      className="m-0 w-14 min-w-0 border-0 bg-transparent px-2 py-2 text-sm tabular-nums text-right"
                      value={isEditing ? String(form.leg_order) : f.leg_order}
                      onChange={async (e) => {
                        const n = parseInt(e.target.value, 10);
                        if (isEditing) setEditDraft((d) => ({ ...d, leg_order: Number.isNaN(n) ? 0 : n }));
                        else if (!Number.isNaN(n)) {
                          setSaving(true);
                          try {
                            await saveFlight(f.id, 'leg_order', n);
                          } finally {
                            setSaving(false);
                          }
                        }
                      }}
                    />
                  </td>
                  <td className="px-1 py-1">
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
                              setEditingId(f.id);
                              setEditDraft({ ...f });
                            }}
                            className="rounded p-1 text-lp-text-tertiary hover:text-lp-text"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteFlight(f.id)}
                            className="rounded p-1 text-red-500/80 hover:bg-red-500/10"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-lp-border bg-lp-surface/80">
              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-lp-text">
                Total flight cost (proposed)
              </td>
              <td className="px-1 py-3 text-right font-semibold text-lp-text">
                <SpreadsheetCurrencyAmount amount={totalProposed} currency={currency} />
              </td>
              <td colSpan={6} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex justify-end">
        {personnel.length > 0 ? (
          <button
            type="button"
            onClick={() => void addFlight()}
            className="rounded-lg border border-lp-border bg-lp-surface px-4 py-2.5 text-sm font-semibold text-lp-text hover:bg-lp-surface-hover"
          >
            + Add new flight
          </button>
        ) : (
          <p className="text-sm text-lp-text-tertiary">Add people in Tour Personnel to add flights</p>
        )}
      </div>
    </div>
  );
}
