/* ============================================
   LOWPASS — Routing Calendar View

   Scrollable month calendar. Days empty until
   assigned. Click a day to open edit panel.
   ============================================ */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDayTypeColor, getDayTypeLabel, parseRoutingDate, firstDayType, dayTypesInclude } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DayTypeCombobox } from './DayTypeCombobox';
import { VenueAutocomplete } from './VenueAutocomplete';
import type { RoutingRow } from './RoutingGrid';

const todayStr = () => new Date().toISOString().slice(0, 10);

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T12:00:00');
  const endDate = new Date(end + 'T12:00:00');
  while (d <= endDate) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function RoutingCalendar({
  rows,
  updateRow,
  startDate,
  endDate,
  customDayTypes,
  onAddCustomDayType,
}: {
  rows: RoutingRow[];
  updateRow: (index: number, updates: Partial<RoutingRow>) => void;
  startDate: string;
  endDate: string;
  customDayTypes?: string[];
  onAddCustomDayType?: (newType: string) => void;
}) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [editPanelWidth, setEditPanelWidth] = useState<number>(280);
  const containerRef = useRef<HTMLDivElement>(null);

  const measureCalendarWidth = useCallback(() => {
    try {
      const el = containerRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (Number.isFinite(w) && w > 0) setEditPanelWidth(Math.round(w * 0.7));
    } catch {
      // ignore if ref or layout not ready
    }
  }, []);

  useEffect(() => {
    if (editingDate == null) return;
    measureCalendarWidth();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureCalendarWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, [editingDate, measureCalendarWidth]);

  const startStr = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
  const endStr = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null;
  const allDates = startStr && endStr && startStr <= endStr ? dateRange(startStr, endStr) : [];
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingDate != null) return;
      const current = focusedDate ?? allDates[0] ?? null;
      if (!current) return;
      const idx = allDates.indexOf(current);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < allDates.length - 1) setFocusedDate(allDates[idx + 1]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) setFocusedDate(allDates[idx - 1]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setEditingDate(current);
      }
    },
    [editingDate, focusedDate, allDates]
  );

  const start = startStr ? parseRoutingDate(startStr) : new Date(NaN);
  const end = endStr ? parseRoutingDate(endStr) : new Date(NaN);
  const startMonth = Number.isFinite(start.getTime()) ? start.getFullYear() * 12 + start.getMonth() : 0;
  const endMonth = Number.isFinite(end.getTime()) ? end.getFullYear() * 12 + end.getMonth() : 0;
  const months: { year: number; month: number }[] = [];
  for (let m = startMonth; m <= endMonth; m++) {
    if (Number.isFinite(m)) months.push({ year: Math.floor(m / 12), month: m % 12 });
  }

  const rowIndex = editingDate != null ? rows.findIndex((r) => r.date === editingDate) : -1;
  const editingRow = rowIndex >= 0 ? rows[rowIndex] : null;

  const isAssigned = (row: RoutingRow) => !!(row.day_type || row.venue_name || row.city);

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="Tour calendar"
        onKeyDown={handleKeyDown}
        className="overflow-y-auto rounded-xl border border-lp-border bg-lp-surface outline-none"
        style={{ maxHeight: 'min(70vh, 720px)' }}
      >
        <div className="p-4 space-y-6">
          {months.map(({ year, month }) => {
            const first = new Date(year, month, 1);
            const last = new Date(year, month + 1, 0);
            const startDay = first.getDay();
            const daysInMonth = last.getDate();
            const weeks: (string | null)[][] = [];
            let week: (string | null)[] = [];
            for (let i = 0; i < startDay; i++) week.push(null);
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              week.push(dateStr);
              if (week.length === 7) {
                weeks.push(week);
                week = [];
              }
            }
            if (week.length) {
              while (week.length < 7) week.push(null);
              weeks.push(week);
            }

            const monthDates = weeks.flat().filter((d): d is string => d != null && allDates.includes(d));
            const monthRows = monthDates.map((d) => byDate.get(d)).filter(Boolean) as RoutingRow[];
            const showCount = monthRows.filter((r) => dayTypesInclude(r.day_type ?? '', 'show') || dayTypesInclude(r.day_type ?? '', 'festival')).length;
            const offCount = monthRows.filter((r) => dayTypesInclude(r.day_type ?? '', 'off')).length;
            const travelCount = monthRows.filter((r) => dayTypesInclude(r.day_type ?? '', 'travel')).length;
            const countParts = [
              showCount > 0 && `${showCount} show${showCount !== 1 ? 's' : ''}`,
              offCount > 0 && `${offCount} off`,
              travelCount > 0 && `${travelCount} travel`,
            ].filter(Boolean);

            return (
              <section key={`${year}-${month}`} className="rounded-xl border border-lp-border bg-lp-bg overflow-hidden">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-lp-border bg-lp-bg-secondary px-4 py-3">
                  <h3 className="text-base font-semibold text-lp-text">
                    {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  </h3>
                  {countParts.length > 0 && (
                    <>
                      <span className="text-lp-text-tertiary/60 text-sm" aria-hidden="true">
                        |
                      </span>
                      <span className="text-xs text-lp-text-tertiary px-4 py-1.5">
                        {countParts.join(' | ')}
                      </span>
                    </>
                  )}
                </header>
                <div className="grid grid-cols-7 border-b border-lp-border bg-lp-bg-secondary/80 text-xs font-medium text-lp-text-tertiary">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="border-r border-lp-border last:border-r-0 py-2 text-center">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {weeks.flatMap((week, wi) =>
                    week.map((dateStr, di) => {
                      if (!dateStr) {
                        return (
                          <div
                            key={`${wi}-${di}`}
                            className="min-h-[64px] border-b border-r border-lp-border bg-lp-bg-secondary/50 p-2 [&:nth-child(7n)]:border-r-0"
                          />
                        );
                      }
                      const row = byDate.get(dateStr);
                      const inRange = allDates.includes(dateStr);
                      const assigned = row && isAssigned(row);
                      const primaryType = row ? firstDayType(row.day_type ?? '') : '';
                      const colors = row && assigned && primaryType ? getDayTypeColor(primaryType) : null;
                      const isToday = dateStr === todayStr();
                      const isFocused = focusedDate === dateStr;
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => {
                            if (inRange) {
                              setFocusedDate(dateStr);
                              setEditingDate(dateStr);
                            }
                          }}
                          onFocus={() => inRange && setFocusedDate(dateStr)}
                          onBlur={() => setFocusedDate(null)}
                          className={cn(
                            'min-h-[64px] border-b border-r border-lp-border p-2 text-left transition-colors [&:nth-child(7n)]:border-r-0',
                            inRange && 'cursor-pointer bg-lp-surface hover:bg-lp-surface-hover',
                            !inRange && 'cursor-default bg-lp-bg-secondary/30 opacity-50',
                            isToday && 'ring-2 ring-lp-orange ring-inset',
                            isFocused && 'bg-lp-surface-hover'
                          )}
                        >
                          <span className="text-xs font-medium text-lp-text-tertiary">
                            {parseRoutingDate(dateStr).getDate()}
                          </span>
                          {row && assigned && (
                            <div className="mt-1 space-y-0.5">
                              <span
                                className={cn(
                                  'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                  colors?.bg,
                                  colors?.text
                                )}
                              >
                                {getDayTypeLabel(primaryType).replace(/\s*Day$/, '').replace(/^Day\s+/, '').replace(/\s*performance$/i, '')}
                              </span>
                              {(row.venue_name || row.city) && (
                                <div className="truncate text-[10px] text-lp-text-secondary">
                                  {row.venue_name || row.city}
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {editingDate != null && editingRow && rowIndex >= 0 && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3"
          onClick={() => setEditingDate(null)}
        >
          <div
            className="rounded-xl border border-lp-border bg-lp-surface p-3 shadow-xl"
            style={{ width: editPanelWidth }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-sm font-semibold text-lp-text">
              {parseRoutingDate(editingDate).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </h3>
            <div className="mt-3 space-y-2.5">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-lp-text-secondary">Day type</label>
                <DayTypeCombobox
                  value={editingRow.day_type}
                  onChange={(v) => updateRow(rowIndex, { day_type: v })}
                  customTypes={customDayTypes}
                  onAddCustomType={onAddCustomDayType}
                  placeholder="Day type"
                  className="min-w-0"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-lp-text-secondary">Venue</label>
                <VenueAutocomplete
                  value={editingRow.venue_name ?? ''}
                  onChange={(venue_name) => updateRow(rowIndex, { venue_name })}
                  onPlaceSelect={(result) =>
                    updateRow(rowIndex, {
                      venue_name: result.venue_name,
                      address: result.address,
                      city: result.city ?? editingRow.city,
                      latitude: result.latitude,
                      longitude: result.longitude,
                      venue_website: result.website,
                      venue_phone: result.phone,
                      venue_capacity: result.capacity ?? undefined,
                    })
                  }
                  placeholder="Venue"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-lp-text-secondary">Address</label>
                <input
                  type="text"
                  value={editingRow.address ?? editingRow.city}
                  onChange={(e) => updateRow(rowIndex, { address: e.target.value })}
                  placeholder="Address"
                  className="w-full rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 text-xs text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-lp-text-secondary">Notes</label>
                <input
                  type="text"
                  value={editingRow.notes ?? ''}
                  onChange={(e) => updateRow(rowIndex, { notes: e.target.value })}
                  placeholder="Notes"
                  className="w-full rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 text-xs text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingDate(null)}
                className="rounded-lg bg-lp-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-lp-orange-hover"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
