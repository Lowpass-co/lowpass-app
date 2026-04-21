'use client';

import { ReactNode, useEffect, useState } from 'react';
import { RoutingEditor } from '@/components/routing/RoutingEditor';
import { RoutingIncomePanel } from '@/components/day-view/RoutingIncomePanel';
import { useSelectedRoutingId } from '@/hooks/useSelectedRoutingId';
import { dayTypeAccent, dayTypeLabel, formatDateHeading } from '@/lib/dayType';
import { cn } from '@/lib/utils';

type DayListRow = { id: string; date: string; day_type: string; city: string; venue_name: string | null };

export function RoutingPageShell({
  tourId,
  startDate,
  endDate,
  initialCustomDayTypes,
  tourCurrency,
}: {
  tourId: string;
  startDate: string;
  endDate: string;
  initialCustomDayTypes: string[];
  tourCurrency: string;
}) {
  const [routing, setRouting] = useState<DayListRow[]>([]);
  const [routingLoading, setRoutingLoading] = useState(true);
  const [selected, setSelected] = useSelectedRoutingId(routing.map((r) => r.id));

  useEffect(() => {
    let active = true;
    fetch(`/api/tours/${encodeURIComponent(tourId)}/routing`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (active) setRouting(Array.isArray(list) ? list : []);
      })
      .finally(() => {
        if (active) setRoutingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tourId]);

  const selectedDay = routing.find((r) => r.id === selected);

  return (
    <div className="space-y-8">
      <section aria-label="Routing editor">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="lp-label-caps text-[11px] font-semibold tracking-widest text-lp-text-secondary">
            Routing
          </h2>
        </header>
        <RoutingEditor
          tourId={tourId}
          startDate={startDate}
          endDate={endDate}
          initialCustomDayTypes={initialCustomDayTypes}
        />
      </section>

      <section aria-label="Income and expenses" id="income">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="lp-label-caps text-[11px] font-semibold tracking-widest text-lp-text-secondary">
              Income &amp; Expenses
            </h2>
            {selectedDay && (
              <p className="mt-1 text-sm text-lp-text">
                <span className="font-semibold">{formatDateHeading(selectedDay.date)}</span>
                <span className="mx-2 text-lp-text-tertiary">·</span>
                <span className="text-lp-text-secondary">{dayTypeLabel(selectedDay.day_type)}</span>
                {selectedDay.venue_name && (
                  <>
                    <span className="mx-2 text-lp-text-tertiary">·</span>
                    <span className="text-lp-text-secondary">{selectedDay.venue_name}</span>
                  </>
                )}
                {selectedDay.city && (
                  <>
                    <span className="mx-2 text-lp-text-tertiary">·</span>
                    <span className="text-lp-text-secondary">{selectedDay.city}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </header>

        <DayStrip routing={routing} selected={selected} onSelect={setSelected} loading={routingLoading} />

        {selected && (
          <div className={cn('mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]')}>
            <RoutingIncomePanel
              tourId={tourId}
              selectedRoutingId={selected}
              onRoutingIdChange={setSelected}
              currency={tourCurrency}
              showDayStrip={false}
            />
            <RightRailMeta selectedDay={selectedDay ?? null} />
          </div>
        )}
      </section>
    </div>
  );
}

function DayStrip({ routing, selected, onSelect, loading }: {
  routing: DayListRow[]; selected: string | null; onSelect: (id: string) => void; loading: boolean;
}) {
  if (loading) {
    return <div className="h-16 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />;
  }

  if (routing.length === 0) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-6 text-center text-sm text-lp-text-tertiary">
        No routing dates. Add routing above to see income and expenses.
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {routing.map((r) => (
        <DayCard key={r.id} row={r} active={r.id === selected} onClick={() => onSelect(r.id)} />
      ))}
    </div>
  );
}

function DayCard({ row, active, onClick }: { row: DayListRow; active: boolean; onClick: () => void }) {
  const accent = dayTypeAccent(row.day_type);
  const label = dayTypeLabel(row.day_type);
  const d = new Date(`${row.date}T12:00:00`);
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const day = d.toLocaleDateString('en-GB', { day: '2-digit' });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group/menu-host relative flex min-w-[92px] shrink-0 overflow-hidden rounded-lg border text-left transition-colors',
        active
          ? 'border-lp-orange bg-lp-orange text-white'
          : 'border-lp-border bg-lp-surface text-lp-text-secondary hover:bg-lp-surface-hover'
      )}
    >
      <span className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: accent }} aria-hidden />
      <span className="px-3 py-2">
        <span className="block text-[10px] font-semibold uppercase tracking-widest opacity-90">{month}</span>
        <span className="block text-base font-bold tabular-nums leading-tight">{day}</span>
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-widest opacity-80">
          {label || '—'}
        </span>
      </span>
    </button>
  );
}

function RightRailMeta({ selectedDay }: { selectedDay: DayListRow | null }) {
  if (!selectedDay) return null;

  return (
    <aside className="hidden space-y-4 xl:block">
      <MetaSection title="Day Type & Locations">
        <div className="text-sm">
          <div
            className="lp-chip inline-flex items-center gap-1.5 rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-lp-text"
            style={{ color: dayTypeAccent(selectedDay.day_type) }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dayTypeAccent(selectedDay.day_type) }} />
            {dayTypeLabel(selectedDay.day_type) || 'Untitled day'}
          </div>
          {selectedDay.venue_name && <div className="mt-2 font-semibold text-lp-text">{selectedDay.venue_name}</div>}
          {selectedDay.city && <div className="text-sm text-lp-text-secondary">{selectedDay.city}</div>}
        </div>
      </MetaSection>

      <MetaSection title="Lodging">
        <p className="text-sm text-lp-text-tertiary">No lodging recorded</p>
      </MetaSection>

      <MetaSection title="Notes">
        <p className="text-sm text-lp-text-tertiary">No notes</p>
      </MetaSection>

      <MetaSection title="Contacts">
        <p className="text-sm text-lp-text-tertiary">No contacts for this tour day</p>
      </MetaSection>
    </aside>
  );
}

function MetaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="lp-label-caps text-[10px] font-semibold uppercase tracking-widest text-lp-text-secondary">{title}</h3>
        <button
          type="button"
          onClick={() => alert('TODO: Phase F will enable editing here')}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
          aria-label={`Add to ${title}`}
        >
          +
        </button>
      </div>
      {children}
    </div>
  );
}
