/* ============================================
   LOWPASS — Artist Hub (Phase B nav redesign)

   Home for artist-level information. Two-column layout:

     Left  — TOURS list (cards with status pill + date range + show count)
     Right — ARTIST LIBRARY (Riders / Tech specs / Financial admin /
             Stage plot)

   Above the columns: a top strip ("← All artists" + Settings + "+ Add
   new artist") and a hero (avatar, artist name, "N tours · M active
   shows · K upcoming" sub-line).

   The previous edit form + budget summary moved to /artists/[id]/edit
   when this route became the hub. The hub's Settings button links
   there.
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Music2, Receipt, MicVocal, Plus } from 'lucide-react';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistHubHeaderActions } from '@/components/artists/ArtistHubHeaderActions';
import { ArtistLibraryCard } from '@/components/artists/ArtistLibraryCard';
import type { Artist, Tour, TourStatus } from '@/types';

type TourWithCounts = Pick<
  Tour,
  'id' | 'name' | 'status' | 'start_date' | 'end_date'
> & { showCount: number };

/** Maps tour status → palette token for the small status pill. */
function statusTokens(status: TourStatus): { color: string; label: string } {
  switch (status) {
    case 'active':
      return { color: 'var(--color-lp-status-complete)', label: 'Active' };
    case 'planning':
      return { color: 'var(--color-lp-status-needs-review)', label: 'Planning' };
    case 'completed':
      return { color: 'var(--color-lp-status-not-started)', label: 'Completed' };
    case 'archived':
      return { color: 'var(--color-lp-status-not-started)', label: 'Archived' };
    default:
      return { color: 'var(--color-lp-status-not-started)', label: status };
  }
}

/** Format a tour's date range compactly — collapses repeated year. */
function formatTourDateRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  if (s.getFullYear() === e.getFullYear()) {
    const sm = s.toLocaleDateString('en-GB', { month: 'short' });
    const em = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return `${sm} – ${em}`;
  }
  const a = s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const b = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

function deriveInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

/** Pick a usable image URL out of `branding` JSONB. */
function pickArtistImage(
  branding: unknown,
  spotify: string | null | undefined,
): string | null {
  if (spotify && spotify.trim()) return spotify;
  if (!branding || typeof branding !== 'object') return null;
  const b = branding as Record<string, unknown>;
  const candidates = [b.logo_url, b.logoUrl, b.image_url, b.imageUrl];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

export default async function ArtistHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist, error } = await supabase
    .from('artists')
    .select('id, name, slug, spotify_image_url, branding')
    .eq('id', id)
    .single();

  if (error || !artist) {
    notFound();
  }

  const a = artist as Pick<
    Artist,
    'id' | 'name' | 'slug' | 'spotify_image_url' | 'branding'
  >;

  // Parallel-fetch the data we need to populate the columns and the
  // hero sub-line counts. Aggregating shows in JS keeps this to two
  // queries even for artists with many tours.
  const today = new Date().toISOString().slice(0, 10);
  const [toursRes, riderPacksRes] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, status, start_date, end_date')
      .eq('artist_id', a.id)
      .order('start_date', { ascending: false }),
    // Just the IDs — we count rows. cheaper than count() RPC for the
    // typical "<200 packs" workspace.
    supabase
      .from('rider_packs')
      .select('id')
      .eq('artist_id', a.id),
  ]);

  const tours = (toursRes.data ?? []) as Pick<
    Tour,
    'id' | 'name' | 'status' | 'start_date' | 'end_date'
  >[];
  const riderCount = (riderPacksRes.data ?? []).length;

  // Show counts per tour + global "active" / "upcoming" tallies. A
  // routing row counts as a show if its day_type CSV mentions "show"
  // or "festival". "Active" = anywhere in this artist's catalogue;
  // "upcoming" = date >= today.
  const showCountByTour = new Map<string, number>();
  let totalShows = 0;
  let upcomingShows = 0;
  if (tours.length > 0) {
    const tourIds = tours.map((t) => t.id);
    const { data: routing } = await supabase
      .from('routing')
      .select('tour_id, day_type, date')
      .in('tour_id', tourIds);
    for (const r of routing ?? []) {
      const dt = (r.day_type ?? '').toLowerCase();
      if (!dt.includes('show') && !dt.includes('festival')) continue;
      totalShows += 1;
      if (typeof r.date === 'string' && r.date >= today) upcomingShows += 1;
      showCountByTour.set(r.tour_id, (showCountByTour.get(r.tour_id) ?? 0) + 1);
    }
  }

  const toursWithCounts: TourWithCounts[] = tours.map((t) => ({
    ...t,
    showCount: showCountByTour.get(t.id) ?? 0,
  }));

  const imageUrl = pickArtistImage(a.branding, a.spotify_image_url);
  const initials = deriveInitials(a.name);

  return listAppPageShell(
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Top strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/artists"
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          All artists
        </Link>
        <ArtistHubHeaderActions artistId={a.id} />
      </div>

      {/* Hero */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{
            background: imageUrl ? 'var(--lp-bg-tertiary)' : 'var(--color-lp-orange)',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              aria-hidden
              style={{
                color: 'var(--lp-text-inverse, #FFFFFF)',
                fontSize: 'var(--lp-text-lg)',
                fontWeight: 'var(--lp-weight-semibold)',
              }}
            >
              {initials}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate"
            style={{
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-3xl)',
              fontWeight: 'var(--lp-weight-semibold)',
              lineHeight: 'var(--lp-leading-tight)',
            }}
          >
            {a.name ?? 'Artist'}
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            <span style={{ color: 'var(--color-lp-orange)', fontWeight: 'var(--lp-weight-semibold)' }}>
              {tours.length}
            </span>{' '}
            {tours.length === 1 ? 'tour' : 'tours'} ·{' '}
            <span style={{ color: 'var(--color-lp-orange)', fontWeight: 'var(--lp-weight-semibold)' }}>
              {totalShows}
            </span>{' '}
            active {totalShows === 1 ? 'show' : 'shows'} ·{' '}
            <span style={{ color: 'var(--color-lp-orange)', fontWeight: 'var(--lp-weight-semibold)' }}>
              {upcomingShows}
            </span>{' '}
            upcoming
          </p>
        </div>
      </div>

      {/* Two-column body */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}
      >
        {/* Left — Tours */}
        <section className="min-w-0 space-y-3">
          <h2
            style={{
              color: 'var(--lp-text-tertiary)',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              letterSpacing: 'var(--lp-tracking-caps)',
              textTransform: 'uppercase',
            }}
          >
            Tours
          </h2>
          <div className="space-y-2">
            {toursWithCounts.length === 0 ? (
              <div
                className="rounded-xl border-2 border-dashed py-10 text-center"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <p style={{ color: 'var(--lp-text-secondary)' }}>No tours yet.</p>
                <p
                  className="mt-1 text-sm"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  Create the first tour to start working.
                </p>
              </div>
            ) : (
              toursWithCounts.map((t) => {
                const tokens = statusTokens(t.status);
                const range = formatTourDateRange(t.start_date, t.end_date);
                return (
                  <Link
                    key={t.id}
                    href={`/tours/${t.id}`}
                    className="block rounded-lg border p-4 transition-colors"
                    style={{
                      borderColor: 'var(--lp-border)',
                      background: 'var(--lp-surface)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate"
                          style={{
                            color: 'var(--lp-text)',
                            fontSize: 'var(--lp-text-base)',
                            fontWeight: 'var(--lp-weight-medium)',
                          }}
                        >
                          {t.name}
                        </div>
                        <div
                          className="mt-1 truncate text-sm"
                          style={{ color: 'var(--lp-text-secondary)' }}
                        >
                          {range ? `${range} · ` : ''}
                          {t.showCount} {t.showCount === 1 ? 'show' : 'shows'}
                        </div>
                      </div>
                      <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5"
                        style={{
                          background: `color-mix(in srgb, ${tokens.color} 15%, transparent)`,
                          color: tokens.color,
                          fontSize: 'var(--lp-text-xs)',
                          fontWeight: 'var(--lp-weight-medium)',
                        }}
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: tokens.color }}
                        />
                        {tokens.label}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
          <Link
            href="/tours/create"
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: 'var(--color-lp-orange)',
              color: 'var(--color-lp-orange)',
              background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
            }}
          >
            <Plus className="h-4 w-4" />
            New tour
          </Link>
        </section>

        {/* Right — Artist Library */}
        <section className="min-w-0 space-y-3">
          <h2
            style={{
              color: 'var(--lp-text-tertiary)',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              letterSpacing: 'var(--lp-tracking-caps)',
              textTransform: 'uppercase',
            }}
          >
            Artist Library
          </h2>
          <div className="space-y-2">
            <ArtistLibraryCard
              title="Riders"
              count={riderCount}
              countLabel="rider packs"
              href={`/rider-packs?artist_id=${a.id}`}
              icon={Music2}
            />
            {/* TODO(artist-library-data-model): wire real counts once the
                data model for tech specs / financial admin / stage plot
                exists. Each currently reports zero and links to the stub
                empty-state at /artists/[id]/library/[category]. */}
            <ArtistLibraryCard
              title="Tech specs"
              count={0}
              countLabel="documents"
              href={`/artists/${a.id}/library/tech-specs`}
              icon={FileText}
            />
            <ArtistLibraryCard
              title="Financial admin"
              count={0}
              countLabel="files"
              href={`/artists/${a.id}/library/financial-admin`}
              icon={Receipt}
            />
            <ArtistLibraryCard
              title="Stage plot"
              count={0}
              countLabel="files"
              href={`/artists/${a.id}/library/stage-plot`}
              icon={MicVocal}
            />
          </div>
        </section>
      </div>
    </div>,
  );
}
