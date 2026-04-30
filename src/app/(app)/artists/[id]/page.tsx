/* ============================================
   LOWPASS — Production Home (Phase 1 §B)

   Mounted at /artists/[id]. Replaces the prior Artist Hub edit
   form (which now lives at /artists/[id]/edit). This page is the
   artist-scope overview: hero + stats + 30-day calendar widget +
   3 product cards (no tour list — single "what's hot" metric per
   card) + compressed 5-row Recent Activity table with actor
   column.

   Wraps in <ProductShell active="home"> (Phase 1 §A foundation).

   Inbound URLs:
     - / → Artist picker; once an artist is selected, lands here
     - Avatar dropdown / Top nav → here for the current artist

   Outbound links:
     - Product cards → /operations | /budget | /advance (top-level
       cross-tour dashboards, scaffolded as placeholders in §C)
     - Calendar cells → /advance/[tourId]/[routingId] (placeholder
       in §C; real Advance ports content in Phase 2)
     - "Edit artist" → /artists/[id]/edit (existing form moved)
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Pencil,
} from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getHomeData } from '@/server/home/getHomeData';
import { ProductShell } from '@/components/shell-v2';
import type {
  HomeActivityRow,
  HomeCalendarCell,
} from '@/server/home/getHomeData';

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
};

function abbrevCurrency(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${Math.round(value / 1_000)}K`;
  return `${sym}${Math.round(value)}`;
}

function deriveInitials(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Map routing day_type → one of the --lp-day-* tokens. */
function dayTypeToColor(dt: string): string {
  const norm = (dt ?? '').toLowerCase();
  if (norm.includes('festival')) return 'var(--color-lp-day-festival)';
  if (norm.includes('show')) return 'var(--color-lp-day-show)';
  if (norm.includes('travel')) return 'var(--color-lp-day-travel)';
  if (norm.includes('rehearsal')) return 'var(--color-lp-day-rehearsal)';
  if (norm.includes('press')) return 'var(--color-lp-day-press)';
  if (norm.includes('radio')) return 'var(--color-lp-day-radio)';
  if (norm.includes('tv')) return 'var(--color-lp-day-tv)';
  if (norm.includes('off')) return 'var(--color-lp-day-off)';
  return 'var(--lp-text-tertiary)';
}

const PRODUCT_CARDS = [
  {
    key: 'operations' as const,
    label: 'Operations',
    Icon: Briefcase,
    href: '/operations',
    description:
      'Routing, channel list, rooming, files, personnel, gear, riders.',
  },
  {
    key: 'budget' as const,
    label: 'Budget',
    Icon: DollarSign,
    href: '/budget',
    description: 'Line items, settlement, payroll, deal memos.',
  },
  {
    key: 'advance' as const,
    label: 'Advance',
    Icon: ClipboardList,
    href: '/advance',
    description: 'Per-show advance forms, day-view, contacts.',
  },
];

export default async function ArtistHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const data = await getHomeData(supabase, id);
  if (!data) notFound();

  const { artist, stats, tours, recentActivity, calendar, whatsHot } = data;

  return (
    <ProductShell
      active="home"
      artistId={artist.id}
      productName="Home"
      homeHref={`/artists/${artist.id}`}
    >
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-6 py-6">
        {/* Hero */}
        <header className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{
              background: artist.imageUrl
                ? 'var(--lp-bg-tertiary)'
                : 'var(--color-lp-orange)',
            }}
          >
            {artist.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                style={{
                  color: 'var(--lp-text-inverse, #FFFFFF)',
                  fontSize: 'var(--lp-text-lg)',
                  fontWeight: 'var(--lp-weight-semibold)',
                }}
              >
                {deriveInitials(artist.name)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {/* Phase 2 §F1.1 — h1 uses the canonical .lp-h1 utility (28px). */}
            <h1 className="lp-h1">{artist.name}</h1>
            <p
              className="mt-1"
              style={{
                fontSize: '14px',
                color: 'var(--lp-text-secondary)',
              }}
            >
              <span className="lp-mono">{stats.activeTours}</span> active ·{' '}
              <span className="lp-mono">{stats.showsThisMonth}</span> shows this month
            </p>
          </div>
          <Link
            href={`/artists/${artist.id}/edit`}
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
            style={{
              borderColor: 'var(--lp-border)',
              color: 'var(--lp-text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </header>

        {/* 4 dense stat tiles — Phase 1 keeps stats but reduces vertical
            footprint (smaller padding + smaller numbers vs. Phase 0). */}
        <section
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          <StatTile label="Active tours" value={String(stats.activeTours)} />
          <StatTile
            label="Shows this month"
            value={String(stats.showsThisMonth)}
          />
          <StatTile
            label="Personnel assigned"
            value={String(stats.personnelActive)}
          />
          <StatTile
            label="Budget committed"
            value={abbrevCurrency(stats.budgetCommitted, stats.budgetCurrency)}
          />
        </section>

        {/* Calendar widget — next 30 days, artist-scoped. Phase 2 §F1.3
            adds month header, show title + venue per cell, and tour-
            colour stripe when this artist has multiple tours. */}
        <CalendarStrip
          cells={calendar}
          tours={tours.map((t) => ({ id: t.id, name: t.name }))}
        />

        {/* 3 product cards — no tour list. Single "what's hot" metric. */}
        <section
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
        >
          {PRODUCT_CARDS.map((p) => {
            const hot = whatsHot[p.key];
            return (
              <ProductCard
                key={p.key}
                href={p.href}
                label={p.label}
                Icon={p.Icon}
                description={p.description}
                metricValue={hot.value}
                metricLabel={hot.label}
              />
            );
          })}
        </section>

        {/* Recent activity — 5 rows + actor column. */}
        <RecentActivityTable rows={recentActivity.slice(0, 5)} />
      </div>
    </ProductShell>
  );
}

/* ============================================
   Subcomponents
   ============================================ */

function StatTile({ label, value }: { label: string; value: string }) {
  // Phase 2 §F1.1 — uses .lp-stat-value (32px) + .lp-stat-label
  // utilities so all tiles match across the app.
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      <div className="lp-stat-label">{label}</div>
      <div className="lp-mono lp-stat-value mt-2">{value}</div>
    </div>
  );
}

function ProductCard({
  href,
  label,
  Icon,
  description,
  metricValue,
  metricLabel,
}: {
  href: string;
  label: string;
  Icon: typeof Briefcase;
  description: string;
  metricValue: number;
  metricLabel: string;
}) {
  return (
    <Link
      href={href}
      className="btn-transition flex flex-col gap-3 rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{
            background:
              'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
            color: 'var(--color-lp-orange)',
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--lp-text)',
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--lp-text-tertiary)',
              lineHeight: 1.4,
            }}
          >
            {description}
          </div>
        </div>
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--lp-text-tertiary)' }}
        />
      </div>
      {/* "What's hot" — single actionable metric. */}
      <div
        className="flex items-baseline gap-2 rounded-md border px-3 py-2"
        style={{
          borderColor: 'var(--lp-border-subtle)',
          background: 'var(--lp-bg-deep)',
        }}
      >
        <span
          className="lp-mono"
          style={{
            fontSize: '20px',
            fontWeight: 500,
            color:
              metricValue > 0
                ? 'var(--color-lp-orange)'
                : 'var(--lp-text-tertiary)',
            lineHeight: 1,
          }}
        >
          {metricValue}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {metricLabel}
        </span>
      </div>
    </Link>
  );
}

/* ============================================
   Phase 2 §F1.3 — enriched calendar widget

   Adds:
   - Month header above the strip (auto-toggles when the 30-day
     window straddles a month boundary)
   - Bigger day numbers + day-name letters
   - Show title + venue beneath the day number on show cells
   - Tour-colour stripe at top of each cell when the artist has
     multiple tours (disambiguates "is this Tour A or Tour B?")
   - Section fills its container instead of feeling stuck in a
     fixed-width slot
   ============================================ */
const TOUR_PALETTE = [
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#EF4444',
];

function tourColorFor(tourIndexById: Map<string, number>, tourId: string): string {
  const idx = tourIndexById.get(tourId) ?? 0;
  return TOUR_PALETTE[idx % TOUR_PALETTE.length];
}

function CalendarStrip({
  cells,
  tours,
}: {
  cells: HomeCalendarCell[];
  tours: { id: string; name: string }[];
}) {
  const byDate = new Map<string, HomeCalendarCell[]>();
  for (const c of cells) {
    const arr = byDate.get(c.date) ?? [];
    arr.push(c);
    byDate.set(c.date, arr);
  }

  // Tour → stripe colour mapping. Only render the stripe when the
  // artist has more than one tour in the calendar window — single-tour
  // artists get the day-type colour alone.
  const tourIndexById = new Map<string, number>();
  tours.forEach((t, i) => tourIndexById.set(t.id, i));
  const tourIdsInWindow = new Set(cells.map((c) => c.tourId));
  const showTourStripe = tourIdsInWindow.size > 1;

  // Build the 30-day window starting today.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days: {
    date: string;
    dayNum: string;
    weekday: string;
    monthShort: string;
    monthLong: string;
    year: number;
    isFirstOfMonth: boolean;
  }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      dayNum: d.toLocaleDateString('en-GB', { day: '2-digit' }),
      weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      monthShort: d.toLocaleDateString('en-GB', { month: 'short' }),
      monthLong: d.toLocaleDateString('en-GB', { month: 'long' }),
      year: d.getUTCFullYear(),
      isFirstOfMonth: d.getUTCDate() === 1 || i === 0,
    });
  }

  const headerLabel =
    days.length > 0
      ? days[days.length - 1].monthLong === days[0].monthLong
        ? `${days[0].monthLong} ${days[0].year}`
        : `${days[0].monthLong} ${days[0].year}  →  ${
            days[days.length - 1].monthLong
          } ${days[days.length - 1].year}`
      : '';

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="lp-h3" style={{ margin: 0 }}>
            {headerLabel}
          </h2>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Next 30 days
          </span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
          <span className="lp-mono">{cells.length}</span> dates
        </span>
      </div>
      <div
        className="overflow-x-auto rounded-lg border"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg-deep)',
        }}
      >
        <div
          className="grid gap-1 p-2"
          style={{
            gridTemplateColumns: 'repeat(30, minmax(72px, 1fr))',
            minWidth: 'max-content',
          }}
        >
          {days.map((d) => {
            const cellsForDate = byDate.get(d.date) ?? [];
            const primary = cellsForDate[0];
            const dtColor = primary
              ? dayTypeToColor(primary.dayType)
              : 'transparent';
            const tourColor =
              primary && showTourStripe
                ? tourColorFor(tourIndexById, primary.tourId)
                : null;
            const tooltip = primary
              ? `${d.date} · ${primary.dayType || 'date'}${
                  primary.city ? ` · ${primary.city}` : ''
                }${primary.venue ? ` · ${primary.venue}` : ''}`
              : d.date;
            const cellNode = (
              <div
                className="relative flex h-full flex-col gap-1 overflow-hidden rounded-md px-2 py-1.5"
                style={{
                  minHeight: 64,
                  background: primary
                    ? `color-mix(in srgb, ${dtColor} 10%, transparent)`
                    : 'transparent',
                  border: primary
                    ? `1px solid color-mix(in srgb, ${dtColor} 35%, transparent)`
                    : '1px solid var(--lp-border-subtle)',
                }}
                title={tooltip}
              >
                {/* Tour-colour stripe (multi-tour only) */}
                {tourColor ? (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 top-0"
                    style={{ height: 2, background: tourColor }}
                  />
                ) : null}
                {/* Month tick when the day is the 1st (or the very first
                    day in the window) — keeps the user oriented when the
                    strip crosses a month boundary. */}
                {d.isFirstOfMonth ? (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-lp-orange)',
                    }}
                  >
                    {d.monthShort}
                  </span>
                ) : null}
                <div className="flex items-baseline justify-between gap-1">
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--lp-text-tertiary)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {d.weekday.slice(0, 3)}
                  </span>
                  <span
                    className="lp-mono"
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      lineHeight: 1,
                      color: primary ? dtColor : 'var(--lp-text)',
                    }}
                  >
                    {d.dayNum}
                  </span>
                </div>
                {/* Show / venue body — only on cells with content */}
                {primary ? (
                  <div className="mt-auto min-w-0 space-y-0.5">
                    <div
                      className="truncate"
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: 'var(--lp-text)',
                        lineHeight: 1.2,
                      }}
                    >
                      {primary.city ?? primary.dayType ?? ''}
                    </div>
                    {primary.venue ? (
                      <div
                        className="truncate"
                        style={{
                          fontSize: '10px',
                          color: 'var(--lp-text-tertiary)',
                          lineHeight: 1.2,
                        }}
                      >
                        {primary.venue}
                      </div>
                    ) : null}
                    {cellsForDate.length > 1 ? (
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--lp-text-tertiary)',
                        }}
                      >
                        +{cellsForDate.length - 1} more
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );

            if (primary) {
              return (
                <Link
                  key={d.date}
                  href={`/advance/${primary.tourId}/${primary.routingId}`}
                  aria-label={tooltip}
                  className="btn-transition"
                >
                  {cellNode}
                </Link>
              );
            }
            return <div key={d.date}>{cellNode}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

function ActivityProductBadge({
  product,
}: {
  product: HomeActivityRow['product'];
}) {
  const tones: Record<typeof product, { tone: string; label: string }> = {
    budget: { tone: 'var(--color-lp-status-complete)', label: 'BUDGET' },
    advance: { tone: 'var(--color-lp-status-in-progress)', label: 'ADVANCE' },
    operations: { tone: 'var(--color-lp-orange)', label: 'OPS' },
  };
  const { tone, label } = tones[product];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5"
      style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        color: tone,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function RecentActivityTable({ rows }: { rows: HomeActivityRow[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Recent activity
        </h2>
        <span
          style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}
        >
          last 5
        </span>
      </div>
      <div
        className="overflow-hidden rounded-lg border"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg-deep)',
        }}
      >
        <table className="lp-dense w-full">
          <thead>
            <tr
              style={{
                background: 'var(--lp-panel)',
                borderBottom: '1px solid var(--lp-border-subtle)',
              }}
            >
              <Th>Product</Th>
              <Th>Actor</Th>
              <Th>Tour</Th>
              <Th>Summary</Th>
              <Th align="right">When</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  No recent activity for this artist.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderTop: '1px solid var(--lp-border-subtle)',
                  }}
                >
                  <Td>
                    <ActivityProductBadge product={row.product} />
                  </Td>
                  <Td>
                    <span style={{ color: 'var(--lp-text)' }}>
                      {row.actor || '—'}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className="truncate"
                      style={{ color: 'var(--lp-text)' }}
                    >
                      {row.tourName || '—'}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className="truncate"
                      style={{ color: 'var(--lp-text-secondary)' }}
                    >
                      {row.summary}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="lp-mono">
                      {formatRelative(row.occurredAt)}
                    </span>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td
      style={{
        textAlign: align ?? 'left',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}
