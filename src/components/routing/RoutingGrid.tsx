/* ============================================
   LOWPASS — Routing Grid View

   Table of dates with day type, city, venue, notes.
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import { parseRoutingDate, distanceMiles, getAdvanceStatusInfo } from '@/lib/utils';
import { DayTypeCombobox } from './DayTypeCombobox';
import { VenueAutocomplete } from './VenueAutocomplete';
import Link from 'next/link';
import { Bus, Car, ChevronDown, Plane, Trash2 } from 'lucide-react';
import type { PrimaryTransit } from './RoutingMap';
import { cn } from '@/lib/utils';

export type TransportToNext = 'default' | 'fly' | 'drive';

export interface RoutingRow {
  date: string;
  day_type: string;
  city: string;
  address?: string;
  venue_name?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  transport_to_next?: TransportToNext;
}

const PRIMARY_SPEED_MPH: Record<PrimaryTransit, number> = {
  bus_van: 60,
  bus_trailer: 55,
  car: 55,
  flight: 500, // estimated flight speed for great-circle distance
};

/** Multiply Google drive time by this: bus 1.7x, bus+trailer 1.6x (longer than car). Car uses drive time as-is. */
const DRIVE_TIME_MULTIPLIER: Record<PrimaryTransit, number | null> = {
  bus_van: 1.7,
  bus_trailer: 1.6,
  car: 1,
  flight: null, // uses flight estimate, not drive time
};

const FLY_SPEED_MPH = 500;

function getSpeedMph(primary: PrimaryTransit, transportToNext: TransportToNext): number {
  if (transportToNext === 'fly' || primary === 'flight') return FLY_SPEED_MPH;
  return PRIMARY_SPEED_MPH[primary];
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function travelColor(hours: number, miles: number): string {
  if (miles > 450) return 'text-red-600 dark:text-red-400';
  if (hours >= 8) return 'text-red-600 dark:text-red-400';
  if (hours >= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function TravelCell({
  row,
  nextRow,
  primaryTransit,
  transportToNext,
  onSelectMode,
}: {
  row: RoutingRow;
  nextRow: RoutingRow;
  primaryTransit: PrimaryTransit;
  transportToNext: TransportToNext;
  onSelectMode: (mode: TransportToNext) => void;
}) {
  const [open, setOpen] = useState(false);
  const [driveHours, setDriveHours] = useState<number | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasCoords = row.latitude != null && row.longitude != null && nextRow.latitude != null && nextRow.longitude != null;
  const useGoogleDrive =
    hasCoords &&
    (transportToNext === 'default' || transportToNext === 'drive') &&
    (primaryTransit === 'car' || primaryTransit === 'bus_van' || primaryTransit === 'bus_trailer');

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!useGoogleDrive) {
      setDriveHours(null);
      return;
    }
    setDriveLoading(true);
    const origin = `${row.latitude},${row.longitude}`;
    const dest = `${nextRow.latitude},${nextRow.longitude}`;
    fetch(`/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { durationSeconds?: number } | null) => {
        if (data?.durationSeconds != null) setDriveHours(data.durationSeconds / 3600);
        else setDriveHours(null);
      })
      .catch(() => setDriveHours(null))
      .finally(() => setDriveLoading(false));
  }, [useGoogleDrive, row.latitude, row.longitude, nextRow.latitude, nextRow.longitude]);

  if (!hasCoords) {
    return (
      <span className="flex items-center gap-1 text-lp-text-tertiary">
        <Car className="h-3.5 w-3.5" />
        —
      </span>
    );
  }

  const miles = distanceMiles(row.latitude!, row.longitude!, nextRow.latitude!, nextRow.longitude!);
  let hours: number;
  const mult = DRIVE_TIME_MULTIPLIER[primaryTransit];
  if (useGoogleDrive && driveHours != null) {
    hours = mult != null ? driveHours * mult : driveHours;
  } else if (useGoogleDrive && driveLoading) {
    const fallbackDrive = miles / PRIMARY_SPEED_MPH.car;
    hours = mult != null ? fallbackDrive * mult : fallbackDrive;
  } else if (useGoogleDrive) {
    const fallbackDrive = miles / PRIMARY_SPEED_MPH.car;
    hours = mult != null ? fallbackDrive * mult : fallbackDrive;
  } else {
    const speed = getSpeedMph(primaryTransit, transportToNext);
    hours = miles / speed;
  }
  const colorClass = travelColor(hours, miles);
  const Icon = transportToNext === 'fly' || primaryTransit === 'flight' ? Plane : primaryTransit === 'car' ? Car : Bus;
  const showLoading = useGoogleDrive && driveLoading;

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', colorClass)} />
      {showLoading ? (
        <span className="text-lp-text-tertiary">…</span>
      ) : (
        <span className={cn('font-medium', colorClass)}>{formatHours(hours)}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('rounded p-0.5 transition-colors', colorClass, 'hover:opacity-80')}
        aria-label="Change transport mode"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-20 mt-1 min-w-[100px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
          {(['default', 'drive', 'fly'] as const).map((mode) => (
            <li key={mode}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectMode(mode);
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-lp-surface-hover"
              >
                {mode === 'default' ? 'Default' : mode === 'drive' ? 'Drive' : 'Fly'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SHOW_DAY_TYPES = ['show', 'festival'];

const ADVANCE_DOT: Record<string, string> = {
  not_started: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  complete: 'bg-emerald-500',
  needs_review: 'bg-amber-500',
};

function AdvanceDot({
  tourId,
  row,
  advanceByDate,
}: {
  tourId: string | undefined;
  row: RoutingRow;
  advanceByDate: Record<string, { routing_id: string; status: string }>;
}) {
  if (!SHOW_DAY_TYPES.includes(row.day_type)) return null;
  const info = advanceByDate[row.date];
  const status = info?.status ?? 'not_started';
  const dotClass = ADVANCE_DOT[status] ?? 'bg-gray-400';
  const title = getAdvanceStatusInfo(status).label;
  if (info?.routing_id && tourId) {
    return (
      <Link
        href={`/tours/${tourId}/advance/${info.routing_id}`}
        className="ml-1.5 inline-flex shrink-0 items-center rounded p-0.5 hover:bg-lp-bg-tertiary"
        title={`Advance: ${title}`}
        aria-label={`Advance ${title}`}
      >
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
      </Link>
    );
  }
  return (
    <span
      className={cn('ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full', dotClass)}
      title={title}
      aria-label={title}
    />
  );
}

export function RoutingGrid({
  rows,
  onChange,
  updateRow,
  primaryTransit,
  customDayTypes,
  onAddCustomDayType,
  tourId,
  advanceByDate = {},
}: {
  rows: RoutingRow[];
  onChange: (rows: RoutingRow[]) => void;
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  primaryTransit: PrimaryTransit;
  customDayTypes?: string[];
  onAddCustomDayType?: (newType: string) => void;
  tourId?: string;
  advanceByDate?: Record<string, { routing_id: string; status: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-lp-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-lp-border bg-lp-bg-secondary">
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Date</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Day type</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Venue</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Address</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Notes</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Travel</th>
            <th className="w-10 px-2 py-3" aria-label="Clear day" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
              <tr
                key={row.date}
                data-routing-date={row.date}
                className="border-b border-lp-border last:border-0 hover:bg-lp-surface-hover"
              >
                <td className="px-4 py-2.5 font-medium text-lp-text">
                  {parseRoutingDate(row.date).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  })}
                </td>
                <td className="px-4 py-2.5 pl-5">
                  <div className="flex items-center gap-0">
                    <DayTypeCombobox
                      value={row.day_type}
                      onChange={(v) => updateRow(i, { day_type: v })}
                      customTypes={customDayTypes}
                      onAddCustomType={onAddCustomDayType}
                      placeholder="Day type"
                      className="min-w-[140px]"
                    />
                    <AdvanceDot tourId={tourId} row={row} advanceByDate={advanceByDate} />
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <VenueAutocomplete
                    value={row.venue_name ?? ''}
                    onChange={(venue_name) => updateRow(i, { venue_name })}
                    onPlaceSelect={(result) =>
                      updateRow(i, {
                        venue_name: result.venue_name,
                        address: result.address,
                        city: result.city ?? row.city,
                        latitude: result.latitude,
                        longitude: result.longitude,
                      })
                    }
                    placeholder="Venue"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={row.address ?? row.city}
                    onChange={(e) => updateRow(i, { address: e.target.value })}
                    placeholder="Address"
                    className="w-full min-w-[100px] rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={row.notes ?? ''}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-full min-w-[120px] rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                  />
                </td>
                <td className="px-4 py-2.5">
                  {i < rows.length - 1 ? (
                    <TravelCell
                      row={row}
                      nextRow={rows[i + 1]}
                      primaryTransit={primaryTransit}
                      transportToNext={row.transport_to_next ?? 'default'}
                      onSelectMode={(mode) => updateRow(i, { transport_to_next: mode })}
                    />
                  ) : (
                    <span className="text-lp-text-tertiary">—</span>
                  )}
                </td>
                <td className="w-10 px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateRow(i, {
                        day_type: '',
                        city: '',
                        address: '',
                        venue_name: '',
                        notes: '',
                        latitude: undefined,
                        longitude: undefined,
                        transport_to_next: 'default',
                      })
                    }
                    className="rounded p-1.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                    title="Clear day"
                    aria-label="Clear day"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
