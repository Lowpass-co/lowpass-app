/* ============================================
   LOWPASS — Routing Ledger (R2)

   The routing redesign's ledger view. Replaces the input-grid (<RoutingGrid>,
   which stays for the tour-create slide-over's `compact` variant) with a
   text-until-touched CSS-grid ledger — reference: docs/design/
   ROUTING_REDESIGN_MOCK_2026-07-20.html.

   WHAT R2 CHANGES vs the grid:
   - Columns collapse to Date · Day · Venue · City · Transit · Status · ⋯
     (Country / Address / Notes move into the row expansion — R3 fleshes out its
     graded button row; the editable fields live there now so nothing's orphaned).
   - Text-until-touched: cells read as text; the day-type / venue / city editors
     are the SAME always-mounted controls (DayTypeDropdown / VenueAutocomplete /
     input) styled borderless until focus, so the KEY-04..07 keyboard contract —
     native Tab-order + arrows-in-place + type-to-search + Tab-commits — is
     preserved byte-for-byte. The visual "editing" state is a CSS focus treatment,
     not a mount/unmount (which would break Tab-order).
   - Transit is a COLUMN (mono "2h15 · 155mi", drive-time in the travel hue) via
     <TravelBox variant="inline">, reusing the exact drive-time computation. The
     interleaved transit rows are gone. The transit-mode selector stays in the
     editor toolbar (moves to Export/settings in a later pass).
   - Status dots (advance · hotel · crew) per row, derived ONCE in the page loader
     (getRoutingDayStatus) and keyed by date — no per-cell queries.
   ============================================ */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { parseRoutingDate } from '@/lib/utils';
import { colourForDayType } from '@/lib/routing/dayType';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import {
  Eraser,
  ExternalLink,
  Trash2,
  Link2,
  ChevronDown,
  FileText,
  ClipboardCheck,
  CalendarClock,
  Calculator,
  BedDouble,
} from 'lucide-react';
import type { PrimaryTransit } from './RoutingMap';
import { DayTypeDropdown } from './DayTypeDropdown';
import { VenueAutocomplete } from './VenueAutocomplete';
import { TravelBox, type RoutingRow } from './RoutingGrid';
import type { RoutingDayStatus, RoutingStatusByDate, DotState } from '@/server/operations/getRoutingDayStatus';

/** Mock grid grammar — table-layout:fixed (G2-2b): columns never size to content. */
const LEDGER_COLS = '118px 108px minmax(0,1fr) 170px 130px 88px 34px';

const TRAVEL_DAY_TYPES = new Set(['travel', 'off']);

/** "Thu 1" (bold) + " Oct" (regular) — the mock's mono date treatment, no year. */
function dateParts(dateStr: string): { lead: string; tail: string } {
  const d = parseRoutingDate(dateStr);
  if (Number.isNaN(d.getTime())) return { lead: dateStr, tail: '' };
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return { lead: `${weekday} ${day}`, tail: ` ${month}` };
}

function StatusDots({ status }: { status: RoutingDayStatus | undefined }) {
  const dots: { key: 'advance' | 'hotel' | 'crew'; label: string }[] = [
    { key: 'advance', label: 'Advance' },
    { key: 'hotel', label: 'Hotel' },
    { key: 'crew', label: 'Crew' },
  ];
  return (
    <span className="flex items-center justify-end" style={{ gap: 7 }}>
      {dots.map(({ key, label }) => {
        const state: DotState = status?.[key] ?? 'off';
        const bg =
          state === 'done'
            ? 'var(--color-lp-status-complete)'
            : state === 'warn'
              ? 'var(--lp-orange)'
              : 'var(--lp-border-strong)';
        const title =
          state === 'done'
            ? `${label}: done`
            : state === 'warn'
              ? `${label}: needs attention`
              : `${label}: not started`;
        return (
          <span
            key={key}
            title={title}
            aria-label={title}
            className="inline-block rounded-full"
            style={{ width: 7, height: 7, background: bg }}
          />
        );
      })}
    </span>
  );
}

function LedgerRow({
  row,
  prevRow,
  rowIndex,
  rowsLength,
  status,
  primaryTransit,
  customDayTypes,
  advanceInfo,
  tourId,
  updateRow,
  onDeleteRow,
  onOpenAdvance,
  readOnly,
}: {
  row: RoutingRow;
  prevRow?: RoutingRow;
  rowIndex: number;
  rowsLength: number;
  status: RoutingDayStatus | undefined;
  primaryTransit: PrimaryTransit;
  customDayTypes?: string[];
  advanceInfo?: { routing_id: string; status: string };
  tourId?: string;
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  onDeleteRow?: (index: number) => void;
  onOpenAdvance?: (routingId: string) => void;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cityFocused, setCityFocused] = useState(false);
  const { lead, tail } = dateParts(row.date);
  const tickColour = colourForDayType(row.day_type ?? '');
  const firstType = (row.day_type ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  const isTravel = TRAVEL_DAY_TYPES.has(firstType);

  const menuItems = [
    {
      label: 'Clear day',
      icon: Eraser,
      onClick: () =>
        updateRow(rowIndex, {
          day_type: '',
          city: '',
          address: '',
          venue_name: '',
          venue_website: '',
          venue_phone: '',
          venue_capacity: undefined,
          notes: '',
          latitude: undefined,
          longitude: undefined,
          transport_to_next: 'default',
        }),
    },
    ...(tourId && advanceInfo?.routing_id
      ? [
          {
            label: 'Open advance',
            icon: ExternalLink,
            onClick: () => {
              if (onOpenAdvance) onOpenAdvance(advanceInfo.routing_id);
              else window.location.assign(`/advance/${tourId}/${advanceInfo.routing_id}`);
            },
          },
        ]
      : []),
    ...(onDeleteRow && rowsLength > 1
      ? [{ label: 'Delete day', icon: Trash2, variant: 'danger' as const, onClick: () => setDeleteOpen(true) }]
      : []),
  ] as { label: string; icon: typeof Eraser; onClick: () => void; variant?: 'danger' }[];

  return (
    <div
      data-routing-date={row.date}
      className="relative animate-fade-in"
      style={{
        borderBottom: '1px solid var(--lp-border-subtle)',
        animationDelay: `${Math.min(rowIndex, 20) * 24}ms`,
      }}
    >
      {/* Main row — the ledger grid. Hover raises a faint surface tint. */}
      <div
        className="lp-ledger-row grid items-center transition-colors"
        style={{ gridTemplateColumns: LEDGER_COLS, height: 46, paddingLeft: 14, paddingRight: 14, position: 'relative' }}
      >
        {/* Day-type tick — 3px left edge, inset 8px top/bottom (mock .tick). */}
        {tickColour ? (
          <span
            aria-hidden
            style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: tickColour }}
          />
        ) : null}

        {/* Date — mono, weekday+day bold, month muted. */}
        <span className="lp-mono" style={{ fontSize: '12.5px', color: 'var(--lp-text-secondary)', whiteSpace: 'nowrap' }}>
          <b style={{ color: 'var(--lp-text)', fontWeight: 500 }}>{lead}</b>
          {tail}
        </span>

        {/* Day type — ledger-styled dropdown (text until focus). */}
        <div style={{ minWidth: 0, paddingRight: 6 }}>
          {readOnly ? (
            <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
              {row.day_type ? row.day_type : '—'}
            </span>
          ) : (
            <DayTypeDropdown
              value={row.day_type ?? ''}
              onChange={(v) => updateRow(rowIndex, { day_type: v })}
              customTypes={customDayTypes}
              variant="ledger"
            />
          )}
        </div>

        {/* Venue — library-first autocomplete; ghosted on travel days. */}
        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingRight: 8 }}>
          {row.canonical_venue_id ? (
            <span
              title="Linked to the canonical venue — library edits propagate until show day, then freeze."
              className="inline-flex shrink-0"
            >
              <Link2 className="h-3.5 w-3.5" style={{ color: 'var(--lp-orange)' }} aria-label="Linked to the venue library" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {readOnly ? (
              <span
                className="truncate block text-sm"
                style={{ color: isTravel ? 'var(--lp-text-tertiary)' : 'var(--lp-text)', fontWeight: isTravel ? 400 : 500 }}
              >
                {row.venue_name || '—'}
              </span>
            ) : (
              <VenueAutocomplete
                value={row.venue_name ?? ''}
                variant="ledger"
                ghost={isTravel}
                onChange={(venue_name) => updateRow(rowIndex, { venue_name })}
                onLibrarySelect={(m) => {
                  const updates: Partial<RoutingRow> = {
                    venue_name: m.name,
                    canonical_venue_id: m.id,
                    place_id: undefined,
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
                placeholder="Venue"
              />
            )}
          </div>
        </div>

        {/* City */}
        <div style={{ minWidth: 0, paddingRight: 8 }}>
          {readOnly ? (
            <span className="truncate block" style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}>
              {row.city || '—'}
            </span>
          ) : (
            <input
              type="text"
              value={row.city ?? ''}
              onChange={(e) => updateRow(rowIndex, { city: e.target.value })}
              // R4b defect 1 (consistency) — select on cell entry so typing replaces,
              // matching the venue cell. R4b defect 4 — the placeholder word only
              // shows while editing; an unfocused empty cell reads as an en-dash
              // instead of the literal word "City", which scanned as real data.
              onFocus={(e) => {
                e.currentTarget.select();
                setCityFocused(true);
              }}
              onBlur={() => setCityFocused(false)}
              placeholder={cityFocused ? 'City' : '—'}
              className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 placeholder:text-lp-text-tertiary focus:outline-none focus:border-lp-orange focus:ring-2 focus:ring-lp-orange/40 focus:bg-lp-surface"
              style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}
            />
          )}
        </div>

        {/* Transit — ARRIVAL-based (mock): the drive that brought us to this day,
            from the previous day. First row is blank; drive-time in the travel hue;
            blank when either endpoint lacks coords. transport mode = the departing
            (previous) day's transport_to_next. */}
        <span style={{ minWidth: 0 }}>
          {prevRow ? (
            <TravelBox
              row={prevRow}
              nextRow={row}
              primaryTransit={primaryTransit}
              transportToNext={prevRow.transport_to_next ?? 'default'}
              variant="inline"
            />
          ) : null}
        </span>

        {/* Status dots (advance · hotel · crew). */}
        <StatusDots status={status} />

        {/* Expand / context toggle. ⋯ opens the menu; chevron toggles the row. */}
        <span className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse day' : 'Expand day'}
            aria-expanded={expanded}
            className="rounded p-0.5 transition-colors hover:bg-lp-surface-hover"
            style={{ color: expanded ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)' }}
          >
            <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .18s ease' }} />
          </button>
        </span>
      </div>

      {/* Row expansion — R2 keeps Address / Country / Notes editable here (they left
          the grid). R3 adds the graded cross-link button row + capacity + transport
          summary. ~180ms ease. */}
      {expanded ? (
        <div
          className="animate-fade-in"
          style={{
            background: 'var(--lp-panel)',
            borderTop: '1px solid var(--lp-border-subtle)',
            padding: '14px 24px 16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 22,
          }}
        >
          <ExpansionField label="Venue address">
            <input
              type="text"
              value={row.address ?? ''}
              disabled={readOnly}
              onChange={(e) => updateRow(rowIndex, { address: e.target.value })}
              placeholder="Address"
              className="w-full rounded-md border border-lp-border bg-lp-surface px-2.5 py-1.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:border-lp-orange focus:ring-2 focus:ring-lp-orange/30 disabled:opacity-70"
            />
          </ExpansionField>
          <ExpansionField label="Country">
            <input
              type="text"
              value={row.country ?? ''}
              disabled={readOnly}
              onChange={(e) => updateRow(rowIndex, { country: e.target.value })}
              placeholder="Country"
              className="w-full rounded-md border border-lp-border bg-lp-surface px-2.5 py-1.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:border-lp-orange focus:ring-2 focus:ring-lp-orange/30 disabled:opacity-70"
            />
          </ExpansionField>
          <ExpansionField label="Capacity">
            <div className="text-sm" style={{ color: 'var(--lp-text-secondary)', paddingTop: 6 }}>
              {row.venue_capacity != null ? row.venue_capacity.toLocaleString('en-GB') : '—'}
            </div>
          </ExpansionField>
          <ExpansionField label="Transport">
            <div className="text-sm" style={{ color: 'var(--lp-text-secondary)', paddingTop: 6 }}>
              {transportSummary(row, status?.hotel === 'done')}
            </div>
          </ExpansionField>
          <div style={{ gridColumn: '1 / 3' }}>
            <ExpansionField label="Notes">
              <input
                type="text"
                value={row.notes ?? ''}
                disabled={readOnly}
                onChange={(e) => updateRow(rowIndex, { notes: e.target.value })}
                placeholder="Notes for this day"
                className="w-full rounded-md border border-lp-border bg-lp-surface px-2.5 py-1.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:border-lp-orange focus:ring-2 focus:ring-lp-orange/30 disabled:opacity-70"
              />
            </ExpansionField>
          </div>

          {/* Graded cross-link button row — the day's spokes. Open day sheet is
              primary; Advance flushes autosave then soft-navs; Schedule shows the
              call count and preselects the date; Day budget is a product jump;
              Rooming only appears when a hotel is attached. Clear / Delete stay in
              the trailing context menu. */}
          <div className="flex flex-wrap items-center gap-[10px]" style={{ gridColumn: '1 / -1', marginTop: 2 }}>
            {tourId ? (
              <CrossLink
                primary
                icon={FileText}
                label="Open day sheet"
                // Single-day sheet when we hold the routing id; else the day-timeline
                // deep-linked by date (a brand-new unsaved row has no id yet).
                href={
                  status?.routingId
                    ? `/operations/${tourId}/day/${status.routingId}`
                    : `/operations/${tourId}/day?date=${encodeURIComponent(row.date.slice(0, 10))}`
                }
              />
            ) : null}
            {tourId && status?.routingId ? (
              <CrossLink
                icon={ClipboardCheck}
                label="Advance this show"
                onClick={() => {
                  if (onOpenAdvance) onOpenAdvance(status.routingId);
                  else window.location.assign(`/advance/${tourId}/${status.routingId}`);
                }}
              />
            ) : null}
            {tourId ? (
              <CrossLink
                icon={CalendarClock}
                label="Schedule"
                count={status?.crewCount ?? 0}
                href={`/operations/${tourId}/labor?date=${encodeURIComponent(row.date.slice(0, 10))}`}
              />
            ) : null}
            {tourId ? (
              <CrossLink icon={Calculator} label="Day budget" href={`/budget?tour_id=${tourId}`} />
            ) : null}
            {tourId && status?.hotel === 'done' ? (
              <CrossLink icon={BedDouble} label="Rooming" href={`/operations/${tourId}/rooming`} />
            ) : null}
            <span className="ml-auto">
              <ContextMenu items={menuItems} align="right" />
            </span>
          </div>
        </div>
      ) : null}

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
          document.body,
        )}
    </div>
  );
}

/** One-line transport summary for the expansion (mock: "Bus · hotel after show"). */
function transportSummary(row: RoutingRow, hotelAttached: boolean): string {
  const mode =
    row.transport_to_next === 'fly' ? 'Fly' : row.transport_to_next === 'drive' ? 'Drive' : 'Default';
  return hotelAttached ? `${mode} · hotel attached` : mode;
}

/** Graded cross-link button (mock `.ex .links a`). `primary` → orange fill. */
function CrossLink({
  href,
  onClick,
  icon: Icon,
  label,
  count,
  primary = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: typeof FileText;
  label: string;
  count?: number;
  primary?: boolean;
}) {
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.85 }} />
      <span>{label}</span>
      {count != null ? (
        <span
          className="lp-mono"
          style={{
            fontSize: '10.5px',
            color: primary ? '#fff' : 'var(--lp-text-tertiary)',
            background: primary ? 'rgba(255,255,255,.15)' : 'var(--lp-bg-secondary)',
            borderRadius: 4,
            padding: '1px 6px',
            marginLeft: 2,
          }}
        >
          {count}
        </span>
      ) : null}
    </>
  );
  const className = `lp-cross-link inline-flex items-center gap-[7px] rounded-lg text-[12.5px] font-medium transition-colors ${
    primary ? 'lp-cross-link--primary' : ''
  }`;
  const style: React.CSSProperties = {
    padding: '8px 14px',
    textDecoration: 'none',
    color: primary ? '#fff' : 'var(--lp-text)',
    background: primary ? 'var(--lp-orange)' : 'var(--lp-surface)',
    border: `1px solid ${primary ? 'var(--lp-orange)' : 'var(--lp-border)'}`,
  };
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  );
}

function ExpansionField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block"
        style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)', marginBottom: 4 }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function dateLabel(date: string): string {
  return parseRoutingDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function RoutingLedger({
  rows,
  updateRow,
  primaryTransit,
  customDayTypes,
  tourId,
  advanceByDate = {},
  statusByDate = {},
  onDeleteRow,
  onOpenAdvance,
  readOnly = false,
}: {
  rows: RoutingRow[];
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  primaryTransit: PrimaryTransit;
  customDayTypes?: string[];
  tourId?: string;
  advanceByDate?: Record<string, { routing_id: string; status: string }>;
  /** R2 — per-date status dots, derived once in the page loader. */
  statusByDate?: RoutingStatusByDate;
  onDeleteRow?: (index: number) => void;
  onOpenAdvance?: (routingId: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-lg)',
        overflow: 'hidden',
        background: 'var(--lp-surface)',
        // R5-3 — the spine's "before" snapshot. Its pair is the destination
        // rail's <nav> (Advance sidebar / Day rail), which carries the SAME name,
        // so the ledger morphs into the rail instead of hard-cutting. ONE name on
        // the container, deliberately not 21 per-row names: 21 simultaneous morphs
        // on 46px rows is the likeliest source of jank, and "the ledger collapses
        // left" is the effect R5 actually describes.
        viewTransitionName: 'lp-routing-spine',
      }}
    >
      {/* Header band. */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: LEDGER_COLS,
          padding: '8px 14px',
          fontSize: '10.5px',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          borderBottom: '1px solid var(--lp-border)',
          background: 'var(--lp-panel)',
        }}
      >
        <span>Date</span>
        <span>Day</span>
        <span>Venue</span>
        <span>City</span>
        <span>Transit</span>
        <span style={{ textAlign: 'right' }}>Status</span>
        <span />
      </div>

      {rows.map((row, i) => (
        <LedgerRow
          key={row.date || `row-${i}`}
          row={row}
          prevRow={rows[i - 1]}
          rowIndex={i}
          rowsLength={rows.length}
          status={statusByDate[row.date?.slice(0, 10)]}
          primaryTransit={primaryTransit}
          customDayTypes={customDayTypes}
          advanceInfo={advanceByDate[row.date]}
          tourId={tourId}
          updateRow={updateRow}
          onDeleteRow={onDeleteRow}
          onOpenAdvance={onOpenAdvance}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
