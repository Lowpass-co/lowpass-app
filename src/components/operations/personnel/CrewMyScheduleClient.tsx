'use client';

/* ============================================
   LOWPASS — CrewMyScheduleClient (Sprint 9 §6)

   Read-only crew view of /operations/[tourId]/personnel.
   Renders the caller's own schedule: tour line + UPCOMING
   shows + PAY block. FLIGHTS and HOTELS are placeholders per
   the Phase 6 scope reduction (Sprint 10 ships those).

   Realtime: subscribes to tour_personnel filtered by tour_id.
   Crew users only get events for rows they can SELECT (RLS at
   the publication layer), so this naturally limits to their
   own assignment changes plus same-row updates.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plane, Hotel } from 'lucide-react';
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';
import { RealtimeIndicator } from '@/components/realtime/RealtimeIndicator';
import type { MyScheduleResponse } from '@/lib/personnel/types';

interface CrewMyScheduleClientProps {
  tourId: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  return `${fmt(start)}–${fmt(end)}`;
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'GBP',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency ?? ''} ${amount.toFixed(0)}`.trim();
  }
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'confirmed',
  tentative: 'tentative',
  awaiting_contract: 'awaiting contract',
  cancelled: 'cancelled',
  fired: 'cancelled',
};

export function CrewMyScheduleClient({ tourId }: CrewMyScheduleClientProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MyScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tours/${tourId}/personnel/my-schedule`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Failed to load (${res.status})`);
        return;
      }
      const body = (await res.json()) as MyScheduleResponse;
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [tourId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  const { connected: realtimeConnected } = useRealtimeRows({
    table: 'tour_personnel',
    filterColumn: 'tour_id',
    filterValue: tourId,
    onChange: () => {
      void fetchData();
    },
  });

  if (loading) {
    return (
      <div
        className="flex items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-6)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        Loading your schedule…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: 'var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--color-lp-error)',
          background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { tour, person, assignment, pay, shows } = data;
  // Show only in-window rows when an assignment exists; otherwise
  // show the full tour schedule (helps the user understand the
  // surrounding tour even if they're not formally assigned to dates).
  const visibleShows = assignment ? shows.filter((s) => s.in_window) : shows;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-4)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-baseline"
        style={{ gap: 'var(--lp-space-3)', flexWrap: 'wrap' }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-2xl)',
            fontWeight: 'var(--lp-weight-bold)',
            color: 'var(--lp-text)',
          }}
        >
          My schedule — {person.display_name}
        </h1>
        <RealtimeIndicator connected={realtimeConnected} />
      </div>
      <div
        style={{
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        Tour: <strong>{tour.name}</strong>
        {tour.start_date && tour.end_date
          ? ` (${formatRange(tour.start_date, tour.end_date)})`
          : ''}
        {assignment ? (
          <>
            {' · '}
            <span style={{ color: 'var(--lp-text-secondary)' }}>{assignment.role}</span>
            {' · '}
            <span style={{ color: 'var(--lp-text-tertiary)' }}>
              {STATUS_LABEL[assignment.status] ?? assignment.status}
            </span>
          </>
        ) : null}
      </div>

      {!assignment ? (
        <div
          style={{
            padding: 'var(--lp-space-4)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-base)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            Not assigned to this tour
          </h2>
          <p
            style={{
              marginTop: 'var(--lp-space-1)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            You don&apos;t have an active assignment on this tour. The schedule
            below is the full tour itinerary for context.
          </p>
        </div>
      ) : null}

      {/* UPCOMING — show schedule */}
      <Section title="Upcoming">
        {visibleShows.length === 0 ? (
          <EmptyHint>No shows in your assignment window.</EmptyHint>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {visibleShows.map((s) => (
              <li
                key={s.routing_id}
                className="flex items-center"
                style={{
                  gap: 'var(--lp-space-3)',
                  padding: 'var(--lp-space-2) 0',
                  borderBottom: '1px solid var(--lp-border-subtle)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                }}
              >
                <span
                  style={{
                    width: 110,
                    flexShrink: 0,
                    color: 'var(--lp-text-secondary)',
                  }}
                >
                  {formatDate(s.date)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 'var(--lp-weight-medium)' }}>
                    {s.venue_name?.trim() || s.city || s.day_type || '—'}
                  </span>
                  {s.venue_name && s.city ? (
                    <span style={{ color: 'var(--lp-text-tertiary)' }}>
                      {' · '}
                      {s.city}
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 'var(--lp-text-xs)',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  {s.day_type || '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* PAY */}
      {assignment ? (
        <Section title="Pay">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              rowGap: 'var(--lp-space-1)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text)',
            }}
          >
            <span style={{ color: 'var(--lp-text-secondary)' }}>Rate</span>
            <span>
              {formatMoney(pay.rate_amount, pay.rate_currency)}
              {pay.rate_period ? (
                <span
                  style={{
                    marginLeft: 4,
                    color: 'var(--lp-text-tertiary)',
                    fontSize: 'var(--lp-text-xs)',
                  }}
                >
                  per {pay.rate_period}
                </span>
              ) : null}
            </span>
            <span style={{ color: 'var(--lp-text-secondary)' }}>Period</span>
            <span>
              {formatRange(assignment.starts_on, assignment.ends_on) || '—'}
              {pay.days_in_window > 0 ? (
                <span
                  style={{
                    marginLeft: 4,
                    color: 'var(--lp-text-tertiary)',
                    fontSize: 'var(--lp-text-xs)',
                  }}
                >
                  ({pay.days_in_window} day{pay.days_in_window === 1 ? '' : 's'})
                </span>
              ) : null}
            </span>
            <span style={{ color: 'var(--lp-text-secondary)' }}>Total expected</span>
            <span style={{ fontWeight: 'var(--lp-weight-semibold)' }}>
              {formatMoney(pay.total_expected, pay.rate_currency)}
            </span>
          </div>
        </Section>
      ) : null}

      {/* FLIGHTS placeholder (Sprint 10) */}
      <Section title="Flights">
        <Placeholder
          icon={<Plane size={16} strokeWidth={2} aria-hidden />}
          headline="Flights — coming soon"
          body="Your flight bookings will appear here in a future update."
        />
      </Section>

      {/* HOTELS placeholder (Sprint 10) */}
      <Section title="Hotels">
        <Placeholder
          icon={<Hotel size={16} strokeWidth={2} aria-hidden />}
          headline="Hotels — coming soon"
          body="Your hotel bookings will appear here in a future update."
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border-subtle)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      <h2
        className="lp-label-caps"
        style={{
          margin: 0,
          marginBottom: 'var(--lp-space-2)',
          fontSize: 'var(--lp-text-2xs)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 'var(--lp-text-sm)',
        color: 'var(--lp-text-tertiary)',
        fontStyle: 'italic',
      }}
    >
      {children}
    </div>
  );
}

interface PlaceholderProps {
  icon: React.ReactNode;
  headline: string;
  body: string;
}

function Placeholder({ icon, headline, body }: PlaceholderProps) {
  return (
    <div
      className="flex items-start"
      style={{
        gap: 'var(--lp-space-2)',
        padding: 'var(--lp-space-3)',
        background: 'var(--lp-panel)',
        border: '1px dashed var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      <span style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }}>{icon}</span>
      <div>
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {headline}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
