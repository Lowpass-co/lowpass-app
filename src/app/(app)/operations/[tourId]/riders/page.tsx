/* ============================================
   LOWPASS — Operations · Riders

   /operations/[tourId]/riders — the real tour rider list
   (was a Phase-4 placeholder). Lists rider packs at
   scope='tour' AND kind='rider' for this tour. Click a row
   → /rider-packs/[id] (existing PackEditor).

   Chrome (ProductShell + sub-nav) comes from
   operations/[tourId]/layout.tsx, so this returns body content
   only. The glass hero pattern is borrowed from the Advance
   surface's AdvanceShowHeader (per Adam's request to bring
   the new chrome over) — soft brand glow top-right, glass
   panel border, title + meta + actions.

   Templates and creation flow live in the artist library
   (/artists/[id]/(library)/riders). Empty state cross-links
   there.
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  FileText,
  Calendar,
  Pencil,
  Layers,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface PackRow {
  id: string;
  title: string | null;
  updated_at: string;
  inherits_from_pack_id: string | null;
}

interface ParentRow {
  id: string;
  title: string | null;
}

interface SectionCountRow {
  pack_id: string;
  count: number;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  const diffYr = Math.round(diffMo / 12);
  return `${diffYr}y ago`;
}

export default async function OperationsTourRidersPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  /* Tour lookup — confirms RLS + workspace scoping. */
  const { data: tourData } = await supabase
    .from('tours')
    .select('id, name, artist_id')
    .eq('id', tourId)
    .maybeSingle();
  const tour = tourData as { id: string; name: string | null; artist_id: string | null } | null;
  if (!tour) notFound();

  /* Tour-scope rider packs. */
  const { data: packData } = await supabase
    .from('rider_packs')
    .select('id, title, updated_at, inherits_from_pack_id')
    .eq('tour_id', tourId)
    .eq('scope', 'tour')
    .eq('kind', 'rider')
    .order('updated_at', { ascending: false });
  const packs = (packData ?? []) as PackRow[];

  /* Resolve parent template titles so we can show
     "from {Template Name}" lineage. */
  const parentIds = packs
    .map((p) => p.inherits_from_pack_id)
    .filter((v): v is string => !!v);
  let parentMap = new Map<string, string | null>();
  if (parentIds.length > 0) {
    const { data: parentData } = await supabase
      .from('rider_packs')
      .select('id, title')
      .in('id', parentIds);
    const parents = (parentData ?? []) as ParentRow[];
    parentMap = parents.reduce(
      (acc, p) => acc.set(p.id, p.title),
      new Map<string, string | null>(),
    );
  }

  /* Per-pack section count for the meta line. */
  let sectionCountMap = new Map<string, number>();
  if (packs.length > 0) {
    const { data: sectionData } = await supabase
      .from('rider_sections')
      .select('pack_id')
      .in(
        'pack_id',
        packs.map((p) => p.id),
      );
    const sections = (sectionData ?? []) as Array<{ pack_id: string }>;
    sectionCountMap = sections.reduce((acc, s) => {
      acc.set(s.pack_id, (acc.get(s.pack_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const tourName = tour.name ?? 'Untitled tour';
  const artistLibraryHref = tour.artist_id
    ? `/artists/${tour.artist_id}/riders`
    : null;
  const channelListHref = `/operations/${tourId}/channel-list`;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 pb-16 pt-6 print:max-w-none print:pb-8">
      {/* Glass hero — same shape as AdvanceShowHeader. */}
      <header
        className="lp-riders-hero relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8 print:hidden"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        {/* Soft brand glow, top-right — Advance hero parity. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
          style={{
            background:
              'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
          }}
        />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1"
                style={{
                  borderColor: 'var(--lp-border-strong)',
                  background: 'var(--lp-bg-deep)',
                  color: 'var(--lp-text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <FileText className="h-3 w-3" />
                Riders
              </span>
            </div>

            <h1 className="lp-h1 truncate" style={{ letterSpacing: '-0.01em' }}>
              {tourName}
            </h1>

            <p
              className="mt-1.5 flex items-center gap-2"
              style={{ fontSize: '14px', color: 'var(--lp-text-secondary)' }}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {packs.length === 0
                  ? 'No rider packs assigned to this tour yet'
                  : packs.length === 1
                    ? '1 rider pack on this tour'
                    : `${packs.length} rider packs on this tour`}
              </span>
            </p>

            <div
              className="mt-2 flex flex-wrap items-center gap-2"
              style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
            >
              {artistLibraryHref ? (
                <Link
                  href={artistLibraryHref}
                  className="btn-transition inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                  style={{
                    borderColor: 'var(--lp-border-strong)',
                    background: 'var(--lp-bg-deep)',
                    color: 'var(--lp-text-secondary)',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  Browse artist templates
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
              <Link
                href={channelListHref}
                className="btn-transition inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                style={{
                  borderColor: 'var(--lp-border-strong)',
                  background: 'var(--lp-bg-deep)',
                  color: 'var(--lp-text-secondary)',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                Open channel list
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Actions — only show "New rider" if artist context exists. */}
          {artistLibraryHref ? (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={artistLibraryHref}
                className="btn-transition inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
                style={{
                  background: 'var(--color-lp-orange)',
                  color: '#fff',
                  fontSize: '14px',
                }}
              >
                <Plus className="h-4 w-4" />
                New rider
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      {/* Rider pack list — cards. */}
      {packs.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed bg-lp-surface/60 px-6 py-12 text-center"
          style={{ borderColor: 'var(--lp-border-strong)' }}
        >
          <FileText
            className="mx-auto h-8 w-8"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          <h2
            className="mt-3 text-lg font-semibold"
            style={{ color: 'var(--lp-text)' }}
          >
            No rider packs on this tour yet
          </h2>
          <p
            className="mx-auto mt-1 max-w-md text-sm"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            Rider templates live at the artist level and get assigned to tours.
            Open the artist library to create a new rider or assign an existing
            template.
          </p>
          {artistLibraryHref ? (
            <Link
              href={artistLibraryHref}
              className="btn-transition mt-5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-medium"
              style={{
                background: 'var(--color-lp-orange)',
                color: '#fff',
                fontSize: '14px',
              }}
            >
              <Plus className="h-4 w-4" />
              Open artist rider library
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packs.map((pack) => {
            const parentTitle = pack.inherits_from_pack_id
              ? parentMap.get(pack.inherits_from_pack_id) ?? null
              : null;
            const sectionCount = sectionCountMap.get(pack.id) ?? 0;
            return (
              <li key={pack.id}>
                <Link
                  href={`/rider-packs/${pack.id}`}
                  className="lp-riders-card group block h-full rounded-xl border p-4 transition hover:border-[var(--lp-border-stronger,var(--lp-border-strong))] hover:bg-[var(--lp-surface-hover,var(--lp-surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
                  style={{
                    borderColor: 'var(--lp-border)',
                    background: 'var(--lp-surface)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3
                        className="truncate font-semibold"
                        style={{
                          fontSize: '15px',
                          color: 'var(--lp-text)',
                        }}
                      >
                        {pack.title || 'Untitled rider'}
                      </h3>
                      {parentTitle ? (
                        <p
                          className="mt-0.5 truncate"
                          style={{
                            fontSize: '11px',
                            color: 'var(--lp-text-tertiary)',
                          }}
                        >
                          from {parentTitle}
                        </p>
                      ) : null}
                    </div>
                    <Pencil
                      className="h-4 w-4 shrink-0 transition group-hover:text-[var(--color-lp-orange)]"
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    />
                  </div>

                  <div
                    className="mt-3 flex items-center gap-3"
                    style={{ fontSize: '11px', color: 'var(--lp-text-secondary)' }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {sectionCount}{' '}
                      {sectionCount === 1 ? 'section' : 'sections'}
                    </span>
                    <span
                      aria-hidden
                      className="inline-block h-1 w-1 rounded-full"
                      style={{ background: 'var(--lp-border-strong)' }}
                    />
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {relativeTime(pack.updated_at)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
