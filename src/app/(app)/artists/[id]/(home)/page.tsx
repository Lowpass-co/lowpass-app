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
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getHomeData } from '@/server/home/getHomeData';
import { ArtistHero } from '@/components/artists/ArtistHero';
import { TourPicker } from '@/components/artists/TourPicker';
import { ArtistProductCards } from '@/components/artists/ArtistProductCards';
import { ArtistHomeStagger } from '@/components/artists/ArtistHomeStagger';
import { NewReleasesGrid } from '@/components/artists/NewReleasesGrid';
import {
  resolveArtistLogoUrl,
  resolveArtistBannerUrl,
  getArtistGradient,
} from '@/lib/artists/imageUrl';
import { getSpotifyArtistMeta } from '@/lib/spotify/server';
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

export default async function ArtistHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const data = await getHomeData(supabase, id);
  if (!data) notFound();

  const { artist, stats, tours, recentActivity, calendar } = data;

  // Sprint 7 §4 — extra fields for the redesigned hero. getHomeData
  // returns the resolved imageUrl already; we need branding +
  // spotify_id + spotify_banner_url separately so the hero can run
  // its full fallback chain (logo → spotify image → live fetch)
  // and the banner equivalent.
  const { data: artistRaw } = await supabase
    .from('artists')
    .select(
      'branding, spotify_id, spotify_image_url, spotify_banner_url',
    )
    .eq('id', id)
    .maybeSingle();

  type ArtistImageFields = {
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
    spotify_banner_url: string | null;
  };
  const imageFields = (artistRaw as ArtistImageFields | null) ?? {
    branding: null,
    spotify_id: null,
    spotify_image_url: null,
    spotify_banner_url: null,
  };

  const [logoUrl, bannerUrl, spotifyMeta] = await Promise.all([
    resolveArtistLogoUrl(imageFields),
    resolveArtistBannerUrl(imageFields),
    imageFields.spotify_id
      ? getSpotifyArtistMeta(imageFields.spotify_id)
      : Promise.resolve(null),
  ]);

  const recentTourId = tours[0]?.id ?? null;

  // Sprint 8.4 §2 — lean projection for the Edit profile slide-over,
  // mounted via <EditArtistButton> inside <ArtistHero>. Branding is
  // narrowed to the three fields the slide-over edits.
  const branding = (imageFields.branding ?? {}) as Record<string, unknown>;
  const editArtist = {
    id: artist.id,
    name: artist.name,
    spotify_id: imageFields.spotify_id,
    spotify_image_url: imageFields.spotify_image_url,
    spotify_banner_url: imageFields.spotify_banner_url,
    branding: {
      logo_url:
        typeof branding.logo_url === 'string' ? branding.logo_url : null,
      banner_url:
        typeof branding.banner_url === 'string'
          ? branding.banner_url
          : null,
      genre:
        typeof branding.genre === 'string' ? branding.genre : null,
    },
  };

  return (
    <ArtistHomeStagger>
        {/* Hero — full-width banner + logo + identity strip. */}
        <ArtistHero
          artistId={artist.id}
          artistName={artist.name}
          logoUrl={logoUrl}
          bannerUrl={bannerUrl}
          bannerGradient={getArtistGradient(artist.name)}
          spotifyLinked={!!imageFields.spotify_id}
          primaryGenre={spotifyMeta?.genres[0] ?? null}
          monthlyListeners={spotifyMeta?.followers ?? null}
          editArtist={editArtist}
        />

        {/* Sections below — page-edge padding mirrors the rest of
            the app. The banner above is full-width on purpose. */}
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: 1280,
            padding:
              'var(--lp-space-6) var(--lp-space-6) var(--lp-space-6)',
          }}
        >
          {/* IA tour-flow fix §3 — primary tour-selection surface. When
              no tour is selected it's the hero CTA; once one is, it
              collapses to a compact "Active tour" banner. */}
          <TourPicker tours={tours} />

          <div style={{ height: 'var(--lp-space-6)' }} />

          <section
            className="grid"
            style={{
              gap: 'var(--lp-space-3)',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(200px, 1fr))',
            }}
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
              // UX-walk §A.7 — state the display currency so the amount reads as
              // an intentional single-currency figure, not currency whiplash.
              label={`Budget committed · ${(stats.budgetCurrency ?? 'GBP').toUpperCase()}`}
              value={abbrevCurrency(stats.budgetCommitted, stats.budgetCurrency)}
            />
          </section>

          <div style={{ height: 'var(--lp-space-6)' }} />

          <CalendarStrip
            cells={calendar}
            tours={tours.map((t) => ({ id: t.id, name: t.name }))}
          />

          <div style={{ height: 'var(--lp-space-6)' }} />

          <ArtistProductCards
            artistId={artist.id}
            recentTourId={recentTourId}
          />

          {imageFields.spotify_id ? (
            <>
              <div style={{ height: 'var(--lp-space-6)' }} />
              <section className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h2
                    className="lp-label-caps"
                    style={{
                      margin: 0,
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    New releases
                  </h2>
                  <span
                    className="lp-label-caps"
                    style={{
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    From Spotify
                  </span>
                </div>
                <NewReleasesGrid artistName={artist.name} />
              </section>
            </>
          ) : null}

          <div style={{ height: 'var(--lp-space-6)' }} />

          {/* Recent activity — 5 rows + actor column. */}
          <RecentActivityTable rows={recentActivity.slice(0, 5)} />
        </div>
      </ArtistHomeStagger>
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
/* Tour palette references the --color-lp-tour-color-{1..6} tokens
   defined in globals.css. Tour 1 is brand orange (the artist's "current"
   tour reads as Lowpass); the rest cycle around the colour wheel for
   visual disambiguation on the calendar. Token values can be tuned in
   one place without touching this file. */
const TOUR_PALETTE = [
  'var(--color-lp-tour-color-1)',
  'var(--color-lp-tour-color-2)',
  'var(--color-lp-tour-color-3)',
  'var(--color-lp-tour-color-4)',
  'var(--color-lp-tour-color-5)',
  'var(--color-lp-tour-color-6)',
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
              {/* UX-walk §A.4 — Actor column dropped: only budget rows resolve
                  an actor (advance / tour-metadata rows have none), so the
                  column was mostly "—" and read as broken. */}
              <Th>Product</Th>
              <Th>Tour</Th>
              <Th>Summary</Th>
              <Th align="right">When</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
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
