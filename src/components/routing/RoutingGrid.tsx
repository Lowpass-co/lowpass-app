/* ============================================
   LOWPASS — Routing Grid View

   Table of dates with day type, city, venue, notes.
   ============================================ */

'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { parseRoutingDate, distanceMiles, formatRoutingDateShort, parseDayTypes } from '@/lib/utils';
import { colourForDayType } from '@/lib/routing/dayType';
import { DayTypeDropdown } from './DayTypeDropdown';
import { VenueAutocomplete } from './VenueAutocomplete';
import { Bus, Car, Plane, Trash2, ExternalLink, Eraser, Link2 } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import type { PrimaryTransit } from './RoutingMap';
import { cn } from '@/lib/utils';

export type TransportToNext = 'default' | 'fly' | 'drive';

export interface RoutingRow {
  date: string;
  day_type: string;
  city: string;
  /** Country (routing.country, migration 103) — now surfaced as a grid column +
   *  auto-filled from a library venue pick. */
  country?: string;
  address?: string;
  venue_name?: string;
  venue_website?: string;
  venue_phone?: string;
  venue_capacity?: number;
  notes?: string;
  latitude?: number;
  longitude?: number;
  transport_to_next?: TransportToNext;
  /** Transient — set when a venue is picked via Places this session;
   *  the server resolves it to canonical_venue_id on save (migration 214). */
  place_id?: string;
  /** Round-tripped canonical link, preserved across the bulk delete+reinsert
   *  save so an existing link survives an edit to another field. */
  canonical_venue_id?: string | null;
}

const PRIMARY_SPEED_MPH: Record<PrimaryTransit, number> = {
  bus_van: 60,
  van: 58,
  bus_trailer: 55,
  car: 55,
  flight: 500, // estimated flight speed for great-circle distance
};

/** Multiply Google drive time: bus 0.8x, van 0.9x (shorter than car). Car uses drive time as-is. In future: use legal driver framework per territory (e.g. EU 24/45hr breaks). */
const DRIVE_TIME_MULTIPLIER: Record<PrimaryTransit, number | null> = {
  bus_van: 0.8,
  van: 0.9,
  bus_trailer: 0.85,
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

/** Semantic travel colour as an lp token (over-limit / warning / ok). Applied
 *  inline so it reads from the canonical status palette, not raw Tailwind. */
function travelColorVar(hours: number, miles: number): string {
  if (hours > 10 || miles > 450) return 'var(--color-lp-error)';
  if (hours >= 5) return 'var(--color-lp-status-needs-review)';
  return 'var(--color-lp-status-complete)';
}

/** Transport mode pill buttons for the Travel column. */
function TransportPills({
  transportToNext,
  onSelectMode,
}: {
  transportToNext: TransportToNext;
  onSelectMode: (mode: TransportToNext) => void;
}) {
  const modes: { mode: TransportToNext; icon: typeof Bus; label: string }[] = [
    { mode: 'default', icon: Bus, label: 'Default' },
    { mode: 'drive', icon: Car, label: 'Drive' },
    { mode: 'fly', icon: Plane, label: 'Fly' },
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {modes.map(({ mode, icon: Icon, label }) => {
        const selected = transportToNext === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelectMode(mode)}
            aria-label={label}
            className={cn(
              'rounded-full p-1.5 transition-all duration-200 border cursor-pointer',
              selected
                ? 'bg-lp-accent text-white border-transparent ring-2 ring-lp-accent/50'
                : 'bg-lp-surface-hover text-lp-text-secondary border-lp-border hover:border-lp-border-light'
            )}
            style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/** Compact travel distance/time box for the dedicated row between date rows. */
function TravelBox({
  row,
  nextRow,
  primaryTransit,
  transportToNext,
}: {
  row: RoutingRow;
  nextRow: RoutingRow;
  primaryTransit: PrimaryTransit;
  transportToNext: TransportToNext;
}) {
  const [driveHours, setDriveHours] = useState<number | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);

  const hasCoords = row.latitude != null && row.longitude != null && nextRow.latitude != null && nextRow.longitude != null;
  const useGoogleDrive =
    hasCoords &&
    (transportToNext === 'default' || transportToNext === 'drive') &&
    (primaryTransit === 'car' || primaryTransit === 'bus_van' || primaryTransit === 'bus_trailer');

  useEffect(() => {
    // Legit fetch-then-setState effect: seed loading state, then resolve the
    // async drive-time. The direct seeds are intentional, not a render loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!useGoogleDrive) {
      setDriveHours(null);
      return;
    }
    setDriveLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
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
      <span className="inline-flex items-center gap-1 text-lp-text-tertiary text-sm">—</span>
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
  const travelColor = travelColorVar(hours, miles);
  const Icon = transportToNext === 'fly' || primaryTransit === 'flight' ? Plane : primaryTransit === 'car' ? Car : Bus;
  const showLoading = useGoogleDrive && driveLoading;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-2 py-1 text-sm hover:bg-lp-surface-hover hover:border-lp-border-light transition-colors cursor-pointer"
      style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      {/* §C4 — single NEUTRAL method icon; the drive time keeps the semantic
          colour so the over-limit signal isn't lost. */}
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
      {showLoading ? (
        <span className="text-lp-text-tertiary">…</span>
      ) : (
        <>
          <span className="font-medium" style={{ color: travelColor }}>{formatHours(hours)}</span>
          <span className="text-lp-text-tertiary">·</span>
          <span className="text-lp-text-secondary">{Math.round(miles)} mi</span>
        </>
      )}
    </button>
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
  onDeleteRow,
  onOpenAdvance,
  compact = false,
}: {
  rows: RoutingRow[];
  onChange: (rows: RoutingRow[]) => void;
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  primaryTransit: PrimaryTransit;
  customDayTypes?: string[];
  onAddCustomDayType?: (newType: string) => void;
  tourId?: string;
  advanceByDate?: Record<string, { routing_id: string; status: string }>;
  onDeleteRow?: (index: number) => void;
  /** Part 2 — flush a pending autosave, then navigate to Advance (soft nav), so a
   *  hard window.location.assign can't discard an unsaved routing edit. */
  onOpenAdvance?: (routingId: string) => void;
  /** Sprint 8.1 §4 — compact variant for embedding inside the
   *  multi-step <TourCreateSlideOver>. Renames the Venue column
   *  header to "Location" (matches Adam's spec for the merged
   *  Place/Address autocomplete) and tightens cell padding so
   *  the grid fits inside the 800px xwide slide-over without
   *  feeling cramped. All RoutingGrid behaviours (autocomplete,
   *  drive-time bands, day-type colors, transport pills, row
   *  context menu) are preserved. */
  compact?: boolean;
}) {
  const cellPadX = compact ? 'px-2' : 'px-4';
  const cellPadY = compact ? 'py-2' : 'py-3';
  // revamp #16 — grid sits ON the page (matches the Phase-1 #12 de-box of the
  // .lp-grid family): no outer boxed border/radius; the header band + row
  // dividers carry the structure. overflow-x-auto retained for column scroll.
  return (
    <div className="relative z-0 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-y border-lp-border bg-lp-bg-secondary">
            {/* §C4 — DATE · DAY · VENUE · CITY · COUNTRY · ADDRESS · NOTES ·
                TRANSIT. Day moves up beside the date (it sets the row's meaning);
                Country is kept beside City. */}
            {(['Date', 'Day', 'Venue', 'City', 'Country', 'Address', 'Notes', 'Transport'] as const).map((h) => (
              <th key={h} className={cn(cellPadX, cellPadY, 'text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text')}>
                {h}
              </th>
            ))}
            <th className="w-10 px-2 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const nextRow = rows[i + 1];
            return (
              <Fragment key={row.date || `row-${i}`}>
                <RoutingRowWithMenu
                  row={row}
                  nextRow={nextRow}
                  rowIndex={i}
                  tourId={tourId}
                  advanceByDate={advanceByDate}
                  updateRow={updateRow}
                  onDeleteRow={onDeleteRow}
                  onOpenAdvance={onOpenAdvance}
                  primaryTransit={primaryTransit}
                  customDayTypes={customDayTypes}
                  onAddCustomDayType={onAddCustomDayType}
                  rowsLength={rows.length}
                  compact={compact}
                />
                {nextRow && (
                  <tr className="border-b border-lp-border bg-lp-bg-secondary/50">
                    <td colSpan={9} className="px-4 py-1.5 align-middle">
                      <TravelBox
                        row={row}
                        nextRow={nextRow}
                        primaryTransit={primaryTransit}
                        transportToNext={row.transport_to_next ?? 'default'}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RoutingRowWithMenu({
  row,
  nextRow,
  rowIndex,
  tourId,
  advanceByDate,
  updateRow,
  onDeleteRow,
  onOpenAdvance,
  primaryTransit,
  customDayTypes,
  onAddCustomDayType,
  rowsLength,
  compact = false,
}: {
  row: RoutingRow;
  nextRow?: RoutingRow;
  rowIndex: number;
  tourId?: string;
  advanceByDate: Record<string, { routing_id: string; status: string }>;
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  onDeleteRow?: (index: number) => void;
  onOpenAdvance?: (routingId: string) => void;
  primaryTransit: PrimaryTransit;
  customDayTypes?: string[];
  onAddCustomDayType?: (newType: string) => void;
  rowsLength: number;
  compact?: boolean;
}) {
  const cellPadX = compact ? 'px-2' : 'px-4';
  const cellPadY = compact ? 'py-1.5' : 'py-2.5';
  const [deleteOpen, setDeleteOpen] = useState(false);
  const advanceInfo = advanceByDate[row.date];
  const menuItems = [
    { label: 'Clear day', icon: Eraser, onClick: () => updateRow(rowIndex, { day_type: '', city: '', address: '', venue_name: '', venue_website: '', venue_phone: '', venue_capacity: undefined, notes: '', latitude: undefined, longitude: undefined, transport_to_next: 'default' }) },
    ...(tourId && advanceInfo?.routing_id ? [{ label: 'Open advance', icon: ExternalLink, onClick: () => {
      // Part 2 — flush any pending autosave, then navigate (soft nav). Falls back
      // to the old hard nav only if no handler was wired.
      if (onOpenAdvance) onOpenAdvance(advanceInfo.routing_id);
      else window.location.assign(`/advance/${tourId}/${advanceInfo.routing_id}`);
    } }] : []),
    ...(onDeleteRow && rowsLength > 1 ? [{ label: 'Delete day', icon: Trash2, variant: 'danger' as const, onClick: () => setDeleteOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof Eraser; onClick: () => void; variant?: 'danger' }[];

  return (
    <>
      <tr
        data-routing-date={row.date}
        className="border-b border-lp-border last:border-0 hover:bg-lp-surface-hover animate-fade-in transition-colors duration-150"
        style={{ animationDelay: `${rowIndex * 30}ms` }}
      >
        {/* Date — VIS-TR-06: day-type colour tick(s). One tick per type, up to
            two, so a two-type day (e.g. show,festival) stacks a second 3px tick. */}
        <td className={cn(cellPadX, cellPadY, 'whitespace-nowrap text-sm font-medium text-lp-text')}>
          <div className="flex items-center gap-2">
            {(() => {
              const types = parseDayTypes(row.day_type ?? '').slice(0, 2);
              return types.length > 0 ? (
                <span className="flex shrink-0 items-center gap-[2px]" aria-hidden>
                  {types.map((t, i) => (
                    <span
                      key={`${t}-${i}`}
                      style={{ width: 3, height: 16, borderRadius: 1, background: colourForDayType(t) }}
                    />
                  ))}
                </span>
              ) : null;
            })()}
            {formatRoutingDateShort(row.date)}
          </div>
        </td>
        {/* Day (type) — §C4: sits right after the date. */}
        <td className={cn(cellPadX, cellPadY)}>
          <DayTypeDropdown
            value={row.day_type ?? ''}
            onChange={(v) => updateRow(rowIndex, { day_type: v })}
            customTypes={customDayTypes}
          />
        </td>
        {/* Venue — library-first autocomplete + linked marker */}
        <td className={cn(cellPadX, cellPadY)}>
          <div className="flex items-center gap-1.5">
            {row.canonical_venue_id ? (
              <span title="Linked to the canonical venue — library edits propagate to this show until show day, then freeze." className="inline-flex shrink-0">
                <Link2 className="h-3.5 w-3.5" style={{ color: 'var(--lp-orange)' }} aria-label="Linked to the venue library" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <VenueAutocomplete
                value={row.venue_name ?? ''}
                onChange={(venue_name) => updateRow(rowIndex, { venue_name })}
                onLibrarySelect={(m) => {
                  // Pick an existing library venue → LINK + auto-fill facts (no
                  // Places billing). Address stays editable; a later manual edit
                  // only sets `address` so canonical_venue_id survives.
                  const updates: Partial<RoutingRow> = {
                    venue_name: m.name,
                    canonical_venue_id: m.id,
                    place_id: undefined, // already canonical — no Places resolve on save
                  };
                  if (m.city) updates.city = m.city;
                  if (m.country) updates.country = m.country;
                  if (m.address) updates.address = m.address;
                  if (m.lat != null) updates.latitude = m.lat;
                  if (m.lng != null) updates.longitude = m.lng;
                  if (m.capacity != null) updates.venue_capacity = m.capacity;
                  updateRow(rowIndex, updates);
                }}
                onPlaceSelect={(result) => {
                  // "Create new" (Google) path — only overwrite address when the
                  // pick returned one; capture place_id so save resolves canonical.
                  const updates: Partial<RoutingRow> = {
                    venue_name: result.venue_name,
                    city: result.city ?? row.city,
                    country: result.country ?? row.country,
                    latitude: result.latitude,
                    longitude: result.longitude,
                    venue_website: result.website,
                    venue_phone: result.phone,
                    venue_capacity: result.capacity ?? undefined,
                    place_id: result.place_id,
                  };
                  if (result.address && result.address.trim()) updates.address = result.address;
                  updateRow(rowIndex, updates);
                }}
                placeholder={compact ? 'Location' : 'Venue'}
              />
            </div>
          </div>
        </td>
        {/* City */}
        <td className={cn(cellPadX, cellPadY)}>
          <input
            type="text"
            value={row.city ?? ''}
            onChange={(e) => updateRow(rowIndex, { city: e.target.value })}
            placeholder="City"
            className="w-full min-w-[90px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
          />
        </td>
        {/* Country */}
        <td className={cn(cellPadX, cellPadY)}>
          <input
            type="text"
            value={row.country ?? ''}
            onChange={(e) => updateRow(rowIndex, { country: e.target.value })}
            placeholder="Country"
            className="w-full min-w-[80px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
          />
        </td>
        {/* Address — editable; a manual edit does NOT unlink the canonical venue */}
        <td className={cn(cellPadX, cellPadY)}>
          <input
            type="text"
            value={row.address ?? ''}
            onChange={(e) => updateRow(rowIndex, { address: e.target.value })}
            placeholder="Address"
            className="w-full min-w-[100px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
          />
        </td>
        {/* Notes */}
        <td className={cn(cellPadX, cellPadY)}>
          <input
            type="text"
            value={row.notes ?? ''}
            onChange={(e) => updateRow(rowIndex, { notes: e.target.value })}
            placeholder="Notes"
            className="w-full min-w-[120px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
          />
        </td>
        {/* Transport */}
        <td className={cn(cellPadX, cellPadY)}>
          {nextRow ? (
            <TransportPills
              transportToNext={row.transport_to_next ?? 'default'}
              onSelectMode={(mode) => updateRow(rowIndex, { transport_to_next: mode })}
            />
          ) : (
            <span className="text-lp-text-tertiary">—</span>
          )}
        </td>
        <td className={cn('w-10', cellPadY, 'px-2')}>
          <ContextMenu items={menuItems} align="right" />
        </td>
      </tr>
      {onDeleteRow &&
        typeof document !== 'undefined' &&
        createPortal(
          <DeleteConfirmationModal
            open={deleteOpen}
            itemName={dateLabel(row.date)}
            onClose={() => setDeleteOpen(false)}
            onConfirm={async () => {
              onDeleteRow(rowIndex);
              setDeleteOpen(false);
            }}
          />,
          document.body
        )}
    </>
  );
}

function dateLabel(date: string): string {
  return parseRoutingDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}
