'use client';

/* ============================================
   LOWPASS — <PayrollDaysMatrix> (Stage B — rail flip)

   Replaces the horizontal week-tab sheet: days DOWN the left (the shared
   RailNightCell — same night cell as <RoutingRail>), people ACROSS the top,
   cells = day type (Show / Off-Travel / No-Tour). Grouped by WEEK (week-divider
   rows), ALL routing dates incl. no-tour (D5). Tokenised day-type colours.
   Optimistic writes via the shared hook → unchanged budget Salary feed.
   ============================================ */

import { useMemo } from 'react';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { RailNightCell, type RailEntry } from '@/components/routing/RoutingRail';
import { getWeekStart } from './payroll-utils';
import { formatWeekLabel } from '@/lib/routing/week';
import {
  DAY_OPTIONS,
  dayStatusTint,
  usePayrollGrid,
  type PayrollPerson,
  type RoutingDay,
} from './usePayrollGrid';

const RAIL_W = 210;
const PERSON_W = 104;

function splitName(name: string): { forename: string; surname: string } {
  const parts = (name ?? '').trim().split(/\s+/);
  return { forename: parts[0] ?? '', surname: parts.slice(1).join(' ') };
}
function toPerson(pr: Record<string, unknown>): PayrollPerson {
  return {
    id: pr.id as string,
    person_name: (pr.person_name as string) ?? '',
    role: (pr.role as string) ?? '',
    show_rate: Number(pr.show_rate) || 0,
    off_rate: Number(pr.off_rate) || 0,
    rehearsal_rate: Number((pr as { rehearsal_rate?: number }).rehearsal_rate) || 0,
    per_diem: Number(pr.per_diem) || 0,
    advance_fee: Number(pr.advance_fee) || 0,
  };
}

export function PayrollDaysMatrix({
  tourId,
  routingDates,
  personnelRates,
  payrollEntries,
}: {
  tourId: string;
  routingDates: RoutingDay[];
  personnelRates: Record<string, unknown>[];
  payrollEntries: Record<string, unknown>[];
}) {
  const { statusOf, saveDayStatus } = usePayrollGrid(tourId, routingDates, payrollEntries);
  const people = useMemo(() => personnelRates.map(toPerson), [personnelRates]);

  // dates sorted + grouped by Monday week.
  const weeks = useMemo(() => {
    const sorted = [...routingDates].filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
    const groups: { week: string; days: RoutingDay[] }[] = [];
    for (const r of sorted) {
      const ws = getWeekStart(r.date);
      const last = groups[groups.length - 1];
      if (last && last.week === ws) last.days.push(r);
      else groups.push({ week: ws, days: [r] });
    }
    return groups;
  }, [routingDates]);

  const cols = `${RAIL_W}px repeat(${people.length}, ${PERSON_W}px)`;
  const stickyLeft: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--lp-panel)' };
  const headCell: React.CSSProperties = {
    padding: '8px 6px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--lp-text-secondary)',
    background: 'var(--lp-surface)',
    borderBottom: '1px solid var(--lp-border)',
    textAlign: 'center',
  };

  if (people.length === 0) {
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>No personnel on this tour yet.</div>;
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 'fit-content' }}>
        {/* header */}
        <div style={{ ...headCell, ...stickyLeft, textAlign: 'left' }}>Day</div>
        {people.map((p) => {
          const { forename, surname } = splitName(p.person_name);
          return (
            <div key={p.id} style={headCell} title={`${p.person_name}${p.role ? ` · ${p.role}` : ''}`}>
              <div style={{ fontWeight: 700, color: 'var(--lp-text)' }}>{forename}</div>
              <div style={{ fontWeight: 500, color: 'var(--lp-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{surname}</div>
            </div>
          );
        })}

        {weeks.map((wk) => (
          <div key={wk.week} style={{ display: 'contents' }}>
            {/* week divider */}
            <div
              style={{
                gridColumn: '1 / -1',
                position: 'sticky',
                left: 0,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
                background: 'var(--lp-bg-deep)',
                borderBottom: '1px solid var(--lp-border)',
                borderTop: '1px solid var(--lp-border)',
              }}
            >
              {formatWeekLabel(wk.week)}
            </div>
            {wk.days.map((r) => {
              const entry: RailEntry = { id: r.id, date: r.date, city: r.city, venueName: r.venue_name, dayType: r.day_type };
              return (
                <div key={r.id} style={{ display: 'contents' }}>
                  <div style={{ ...stickyLeft, padding: '8px 10px', borderBottom: '1px solid var(--lp-border-subtle)' }}>
                    <RailNightCell entry={entry} />
                  </div>
                  {people.map((p) => {
                    const status = statusOf(p.id, r.date.slice(0, 10));
                    return (
                      <div
                        key={p.id}
                        style={{
                          borderBottom: '1px solid var(--lp-border-subtle)',
                          borderLeft: '1px solid var(--lp-border-subtle)',
                          background: dayStatusTint(status),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <InlineEditCell
                          value={status}
                          type="select"
                          options={DAY_OPTIONS}
                          onSave={async (v) => saveDayStatus(p.id, r.date.slice(0, 10), String(v))}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
