/* ============================================
   LOWPASS — Production Home (Phase 1 §B)

   Mounted at /artists/[id]. Replaces the prior Artist Hub edit
   form (which now lives at /artists/[id]/edit). Stage C · §C1 — the
   artist-scope overview is now: hero + hero tabs + a lean derived
   stat line + the VIS-AR-02/03 tour ROWS (fingerprints + week
   markers, inside <TourPicker>) + Spotify new-releases + a compressed
   5-row Recent Activity table. The old four stat boxes, the 30-day
   calendar strip, and the three product cards were retired.

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
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getHomeData } from '@/server/home/getHomeData';
import { ArtistHero } from '@/components/artists/ArtistHero';
import { ArtistHeroTabs } from '@/components/artists/ArtistHeroTabs';
import { TourPicker } from '@/components/artists/TourPicker';
import { ArtistHomeStagger } from '@/components/artists/ArtistHomeStagger';
import { NewReleasesGrid } from '@/components/artists/NewReleasesGrid';
import {
  resolveArtistLogoUrl,
  resolveArtistBannerUrl,
  getArtistGradient,
} from '@/lib/artists/imageUrl';
import { getSpotifyArtistMeta } from '@/lib/spotify/server';
import type { HomeActivityRow } from '@/server/home/getHomeData';

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

export default async function ArtistHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const data = await getHomeData(supabase, id);
  if (!data) notFound();

  const { artist, stats, tours, recentActivity } = data;

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

        {/* VIS-AR-01 — hero tab row merged under the hero. Tours is the
            active surface here; Production groups the artist-library
            surfaces; Business is manager-locked. */}
        <ArtistHeroTabs artistId={artist.id} active="tours" />

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
          {/* §C1 — the lean header stat line that replaces the four stat boxes.
              Active-tours is date-derived via tourStatus (countOnTourNow); the
              rest are the home aggregates. The legacy "next 30 days" calendar
              strip + the three product cards are retired — the tour rows below
              (with their fingerprints) are the artist-scope surface. */}
          <ArtistStatLine
            activeTours={stats.activeTours}
            showsThisMonth={stats.showsThisMonth}
            personnelActive={stats.personnelActive}
            budgetCommitted={stats.budgetCommitted}
            budgetCurrency={stats.budgetCurrency ?? 'GBP'}
          />

          <div style={{ height: 'var(--lp-space-5)' }} />

          {/* Primary tour-selection surface — VIS-AR-02/03 tour ROWS with
              <TourFingerprint size="row" weekMarkers> + one status line live
              inside here. When no tour is selected it's the hero CTA; once one
              is, it collapses to a compact "Active tour" banner. */}
          <TourPicker tours={tours} />

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

function ArtistStatLine({
  activeTours,
  showsThisMonth,
  personnelActive,
  budgetCommitted,
  budgetCurrency,
}: {
  activeTours: number;
  showsThisMonth: number;
  personnelActive: number;
  budgetCommitted: number;
  budgetCurrency: string;
}) {
  // §C1 — one lean line replaces the four stat boxes. Mono value + caps label,
  // dot-separated; wraps gracefully on narrow widths. Token-clean.
  const parts: { value: string; label: string }[] = [
    { value: String(activeTours), label: activeTours === 1 ? 'tour on the road' : 'tours on the road' },
    { value: String(showsThisMonth), label: 'shows this month' },
    { value: String(personnelActive), label: 'personnel assigned' },
    {
      value: abbrevCurrency(budgetCommitted, budgetCurrency),
      label: `committed · ${budgetCurrency.toUpperCase()}`,
    },
  ];
  return (
    <div
      className="flex flex-wrap items-baseline"
      style={{ gap: 'var(--lp-space-4)' }}
    >
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-baseline" style={{ gap: 6 }}>
          <span
            className="lp-mono"
            style={{
              fontSize: 'var(--lp-text-lg)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            {p.value}
          </span>
          <span
            className="lp-label-caps"
            style={{
              letterSpacing: 'var(--lp-tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {p.label}
          </span>
        </span>
      ))}
    </div>
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
