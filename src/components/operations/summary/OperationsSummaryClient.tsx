'use client';

/* ============================================
   LOWPASS — OperationsSummaryClient (Sprint 9 §8)

   Client side of /operations/[tourId]. Renders 4 summary cards
   + Quick actions + Recent activity + Upcoming shows + the
   inline Pending tasks panel that opens on the Pending card
   click.

   Server (page.tsx) hands in the prefetched data; this client
   handles interactions: opening Extend tour slide-over,
   triggering AddPersonnel via the existing operations slide-over,
   toggling the Pending detail panel.
   ============================================ */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseRoutingDate } from '@/lib/utils';
import {
  AlertTriangle,
  Download,
  ListChecks,
  MapPin,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { toTitleCase } from '@/lib/text/toTitleCase';
import { AddPersonnelSlideOver } from '@/components/operations/personnel/AddPersonnelSlideOver';
import { EditTourSlideOver } from './EditTourSlideOver';

interface ActivityRow {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor_name: string | null;
  field_changes: Record<string, unknown> | null;
}

interface UpcomingShow {
  id: string;
  date: string;
  city: string | null;
  venue_name: string | null;
  venue_capacity: number | null;
}

interface RoutingForExtendWindow {
  id: string;
  date: string;
  city: string | null;
  venue_name: string | null;
}

interface PendingPersonnel {
  id: string;
  display_name: string;
  role: string;
  status: string;
}

interface PendingShow {
  id: string;
  date: string;
  city: string | null;
}

interface OperationsSummaryClientProps {
  tourId: string;
  /** Sprint 9 §13.C.1 — tour-level fields the new
   *  EditTourSlideOver edits in addition to the date window. */
  tourName: string;
  tourCurrency: string | null;
  tourContinent: string | null;
  tourStartDate: string | null;
  tourEndDate: string | null;
  shows: { count: number; nextShowDate: string | null };
  crew: {
    count: number;
    excludePersonIds: string[];
  };
  conflicts: { count: number };
  pending: {
    awaitingContract: PendingPersonnel[];
    tentative: PendingPersonnel[];
    showsWithoutVenue: PendingShow[];
  };
  recentActivity: ActivityRow[];
  upcomingShows: UpcomingShow[];
  allRoutingDates: RoutingForExtendWindow[];
  canWrite: boolean;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

function formatShowDate(iso: string | null): string {
  if (!iso) return '—';
  // UX-walk §A.1 — date-only strings must parse as LOCAL (noon), not UTC
  // midnight, or every row renders a day early in negative-offset timezones.
  const d = parseRoutingDate(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function actionLabel(row: ActivityRow): string {
  switch (row.action) {
    case 'created':
      return row.entity_type === 'tour_personnel' ? 'assigned a person' : 'created a row';
    case 'updated':
      if (row.entity_type === 'routing') return 'updated routing';
      if (row.entity_type === 'tour_personnel') return 'updated personnel';
      if (row.entity_type === 'tour') return 'updated tour details';
      return 'updated a row';
    case 'deleted':
      return row.entity_type === 'tour_personnel' ? 'removed a person' : 'deleted a row';
    case 'status_changed':
      return 'changed personnel status';
    default:
      return row.action.replace(/_/g, ' ');
  }
}

export function OperationsSummaryClient({
  tourId,
  tourName,
  tourCurrency,
  tourContinent,
  tourStartDate,
  tourEndDate,
  shows,
  crew,
  conflicts,
  pending,
  recentActivity,
  upcomingShows,
  allRoutingDates,
  canWrite,
}: OperationsSummaryClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  // Sprint 9 §13.C.1 — Extend tour is folded into Edit tour.
  const [editOpen, setEditOpen] = useState(false);
  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const pendingCount =
    pending.awaitingContract.length +
    pending.tentative.length +
    pending.showsWithoutVenue.length;

  const tourWindow = useMemo(() => {
    if (!tourStartDate || !tourEndDate) return '—';
    const fmt = (iso: string) => {
      // UX-walk §A.1 — parse date-only as local, not UTC (off-by-one guard).
      const d = parseRoutingDate(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return `${fmt(tourStartDate)}–${fmt(tourEndDate)}`;
  }, [tourStartDate, tourEndDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--lp-space-3)',
        }}
      >
        <Card
          title="Shows"
          icon={<MapPin size={16} strokeWidth={2} />}
          headline={`${shows.count}`}
          subline={
            shows.nextShowDate
              ? `next ${formatShowDate(shows.nextShowDate)}`
              : 'no upcoming shows'
          }
          href={`/operations/${tourId}/routing`}
          ctaLabel="Routing →"
        />
        <Card
          title="Crew"
          icon={<Users size={16} strokeWidth={2} />}
          headline={`${crew.count}`}
          subline={tourWindow}
          href={`/operations/${tourId}/personnel`}
          ctaLabel="Personnel →"
        />
        {/* Sprint 9 §14.12 — Conflicts is a low-frequency
            kickoff-time concern. Hide the card when there's
            nothing to surface so the remaining 3 cards
            (Shows / Crew / Pending tasks) reflow to fill the
            grid. When a conflict exists the card reappears in
            warning tone. */}
        {conflicts.count > 0 ? (
          <Card
            title="Conflicts"
            icon={<AlertTriangle size={16} strokeWidth={2} />}
            headline={`${conflicts.count}`}
            subline="cross-tour overlap"
            href={`/operations/${tourId}/personnel?filter=conflicts`}
            ctaLabel="Review →"
            tone="warning"
          />
        ) : null}
        <CardButton
          title="Pending tasks"
          icon={<ListChecks size={16} strokeWidth={2} />}
          headline={`${pendingCount}`}
          subline={
            pendingCount === 0
              ? 'all clear'
              : `${pendingCount} item${pendingCount === 1 ? '' : 's'} need attention`
          }
          ctaLabel={pendingOpen ? 'Hide ▾' : 'Review →'}
          tone={pendingCount > 0 ? 'warning' : 'neutral'}
          onClick={() => setPendingOpen((o) => !o)}
        />
      </div>

      {/* Inline Pending tasks panel */}
      {pendingOpen ? (
        <PendingTasksPanel tourId={tourId} pending={pending} />
      ) : null}

      {/* Quick actions */}
      <div
        className="flex flex-wrap items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-3)',
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-subtle)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        <button
          type="button"
          onClick={() => setAddPersonnelOpen(true)}
          disabled={!canWrite}
          className="btn-transition btn-primary-press inline-flex items-center"
          style={{
            gap: 4,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: canWrite ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
            background: canWrite ? 'var(--color-lp-orange)' : 'var(--lp-surface-hover)',
            border: '1px solid transparent',
            borderRadius: 'var(--lp-radius-md)',
            cursor: canWrite ? 'pointer' : 'not-allowed',
          }}
          title={canWrite ? undefined : 'Read-only — ask your admin for write access'}
        >
          <Plus size={14} strokeWidth={2.4} />
          Add personnel
        </button>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={!canWrite}
          className="btn-transition inline-flex items-center"
          style={{
            gap: 4,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text)',
            background: 'transparent',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            cursor: canWrite ? 'pointer' : 'not-allowed',
            opacity: canWrite ? 1 : 0.55,
          }}
          title={canWrite ? undefined : 'Read-only — ask your admin for write access'}
        >
          <Settings size={14} strokeWidth={2} />
          Edit tour
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center"
          style={{
            gap: 4,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text-tertiary)',
            background: 'transparent',
            border: '1px solid var(--lp-border-subtle)',
            borderRadius: 'var(--lp-radius-md)',
            cursor: 'not-allowed',
          }}
          title="Coming in Sprint 10 — export to PDF / iCal"
        >
          <Download size={14} strokeWidth={2} />
          Export schedule
        </button>
      </div>

      {/* Recent activity */}
      <Section title="Recent activity (last 7 days)">
        {recentActivity.length === 0 ? (
          <EmptyHint>No activity in the last 7 days.</EmptyHint>
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
            {recentActivity.map((a) => (
              <li
                key={a.id}
                className="flex items-center"
                style={{
                  gap: 'var(--lp-space-2)',
                  padding: 'var(--lp-space-2) 0',
                  borderBottom: '1px solid var(--lp-border-subtle)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--color-lp-orange)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    {a.actor_name ? toTitleCase(a.actor_name) : 'Someone'}
                  </strong>{' '}
                  <span style={{ color: 'var(--lp-text-secondary)' }}>
                    {actionLabel(a)}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 'var(--lp-text-xs)',
                    color: 'var(--lp-text-tertiary)',
                    flexShrink: 0,
                  }}
                >
                  {relativeTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Upcoming shows */}
      <Section title="Upcoming shows">
        {upcomingShows.length === 0 ? (
          <EmptyHint>No upcoming shows.</EmptyHint>
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
            {upcomingShows.map((s) => (
              <li
                key={s.id}
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
                    width: 80,
                    flexShrink: 0,
                    color: 'var(--lp-text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatShowDate(s.date)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 'var(--lp-weight-medium)' }}>
                    {s.venue_name?.trim() || s.city || '—'}
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
                    flexShrink: 0,
                  }}
                >
                  {s.venue_capacity != null
                    ? `${s.venue_capacity.toLocaleString()} cap`
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Slide-overs */}
      <EditTourSlideOver
        open={editOpen}
        tourId={tourId}
        initial={{
          name: tourName,
          start_date: tourStartDate,
          end_date: tourEndDate,
          currency: tourCurrency,
          continent: tourContinent,
        }}
        routingDates={allRoutingDates}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          // Slide-over already calls router.refresh() and shows
          // a toast; nothing to do here other than the
          // close-on-success which the slide-over handles.
        }}
      />

      <AddPersonnelSlideOver
        open={addPersonnelOpen}
        tourId={tourId}
        excludePersonIds={crew.excludePersonIds}
        tourStartDate={tourStartDate}
        tourEndDate={tourEndDate}
        onClose={() => setAddPersonnelOpen(false)}
        onAdded={() => {
          showToast('Personnel added.');
          router.refresh();
        }}
      />
    </div>
  );
}

interface CardProps {
  /** Sprint 9 §13.A.8 — explicit per-card title (e.g. "Shows",
   *  "Crew", "Conflicts", "Pending tasks") replacing the prior
   *  generic "Overview" / "Attention" labels. */
  title: string;
  icon: React.ReactNode;
  headline: string;
  subline: string;
  href: string;
  ctaLabel: string;
  tone?: 'neutral' | 'warning';
}

function Card({ title, icon, headline, subline, href, ctaLabel, tone = 'neutral' }: CardProps) {
  const accentColor =
    tone === 'warning' ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)';
  return (
    <Link
      href={href}
      className="btn-transition flex flex-col"
      style={{
        gap: 'var(--lp-space-1)',
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border-subtle)',
        borderRadius: 'var(--lp-radius-md)',
        textDecoration: 'none',
        color: 'var(--lp-text)',
      }}
    >
      <div className="flex items-center" style={{ gap: 6, color: accentColor }}>
        {icon}
        <span
          className="lp-label-caps"
          style={{
            fontSize: 'var(--lp-text-2xs)',
            color: accentColor,
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          fontSize: 'var(--lp-text-xl)',
          fontWeight: 'var(--lp-weight-bold)',
          color: 'var(--lp-text)',
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 'var(--lp-text-xs)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {subline}
      </div>
      <div
        style={{
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-xs)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--color-lp-orange)',
        }}
      >
        {ctaLabel}
      </div>
    </Link>
  );
}

interface CardButtonProps {
  /** Sprint 9 §13.A.8 — explicit per-card title. */
  title: string;
  icon: React.ReactNode;
  headline: string;
  subline: string;
  ctaLabel: string;
  tone?: 'neutral' | 'warning';
  onClick: () => void;
}

function CardButton({
  title,
  icon,
  headline,
  subline,
  ctaLabel,
  tone = 'neutral',
  onClick,
}: CardButtonProps) {
  const accentColor =
    tone === 'warning' ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-transition flex flex-col text-left"
      style={{
        gap: 'var(--lp-space-1)',
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border-subtle)',
        borderRadius: 'var(--lp-radius-md)',
        cursor: 'pointer',
      }}
    >
      <div className="flex items-center" style={{ gap: 6, color: accentColor }}>
        {icon}
        <span
          className="lp-label-caps"
          style={{
            fontSize: 'var(--lp-text-2xs)',
            color: accentColor,
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          fontSize: 'var(--lp-text-xl)',
          fontWeight: 'var(--lp-weight-bold)',
          color: 'var(--lp-text)',
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 'var(--lp-text-xs)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {subline}
      </div>
      <div
        style={{
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-xs)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--color-lp-orange)',
        }}
      >
        {ctaLabel}
      </div>
    </button>
  );
}

interface PendingTasksPanelProps {
  tourId: string;
  pending: OperationsSummaryClientProps['pending'];
}

function PendingTasksPanel({ tourId, pending }: PendingTasksPanelProps) {
  return (
    <div
      style={{
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border-subtle)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap: 'var(--lp-space-2)',
          marginBottom: 'var(--lp-space-3)',
        }}
      >
        <ListChecks
          size={16}
          strokeWidth={2}
          style={{ color: 'var(--color-lp-orange)' }}
          aria-hidden
        />
        <h3
          className="lp-label-caps"
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Pending tasks
        </h3>
      </div>

      <PendingGroup
        title="Awaiting contract"
        items={pending.awaitingContract.map((p) => ({
          key: p.id,
          primary: toTitleCase(p.display_name),
          secondary: p.role,
          href: `/operations/${tourId}/personnel`,
        }))}
      />
      <PendingGroup
        title="Tentative"
        items={pending.tentative.map((p) => ({
          key: p.id,
          primary: toTitleCase(p.display_name),
          secondary: p.role,
          href: `/operations/${tourId}/personnel`,
        }))}
      />
      <PendingGroup
        title="Shows missing venue"
        items={pending.showsWithoutVenue.map((s) => ({
          key: s.id,
          primary: formatShowDate(s.date),
          secondary: s.city ?? '—',
          href: `/operations/${tourId}/routing`,
        }))}
      />

      {pending.awaitingContract.length === 0 &&
      pending.tentative.length === 0 &&
      pending.showsWithoutVenue.length === 0 ? (
        <EmptyHint>Nothing pending. 🎉</EmptyHint>
      ) : null}
    </div>
  );
}

interface PendingGroupProps {
  title: string;
  items: Array<{ key: string; primary: string; secondary: string; href: string }>;
}

function PendingGroup({ title, items }: PendingGroupProps) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 'var(--lp-space-2)' }}>
      <div
        className="lp-label-caps"
        style={{
          marginBottom: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-2xs)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {title} · {items.length}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {items.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              className="flex items-center"
              style={{
                gap: 'var(--lp-space-2)',
                padding: 'var(--lp-space-1) 0',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text)',
                textDecoration: 'none',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{it.primary}</strong>{' '}
                <span style={{ color: 'var(--lp-text-tertiary)' }}>{it.secondary}</span>
              </span>
              <span
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--color-lp-orange)',
                  flexShrink: 0,
                }}
              >
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ul>
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
