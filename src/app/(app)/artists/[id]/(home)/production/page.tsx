/* ============================================================
   LOWPASS — /artists/[id]/production (Stage C · §C2)

   The "Library" tab (labelled Production until Nov 2026 — "Production" now
   means the tour's riders / plots / gear). Groups the artist-library surfaces under one entry so
   the hero tab row has a destination. Stage C replaced the empty card grid with
   a COMPACT ASSET LIST — one row per surface with a live item count + last-edited
   stamp — and killed the "Financials" card (its deal-memo/payroll defaults live
   on the tour tier, not here).

   Channel lists / stage plots are artist-scope `rider_packs` discriminated by
   `kind` (one query, grouped in JS); riders are the artist's tours' documents
   + rider templates (Nov 2026 rebuild). Files is still a
   placeholder surface, so it shows no count. Each row links to its existing
   library route (unchanged).

   Sits in the (home) route group → inherits ProductShell active="home".
   ============================================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  ListChecks,
  Presentation,
  FolderOpen,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistHeroTabs } from '@/components/artists/ArtistHeroTabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ProductionSurface {
  key: string;
  label: string;
  description: string;
  slug: string;
  Icon: LucideIcon;
  /** rider_packs.kind this surface counts; null = no backing table yet (Files). */
  kind: 'rider' | 'channel_list' | 'stage_plot' | null;
}

const SURFACES: ReadonlyArray<ProductionSurface> = [
  { key: 'riders', label: 'Riders', description: 'Each tour’s Tech & Hospitality riders, and rider templates.', slug: 'riders', Icon: FileText, kind: 'rider' },
  { key: 'channel-lists', label: 'Channel lists', description: 'Reusable input lists that seed each tour.', slug: 'channel-lists', Icon: ListChecks, kind: 'channel_list' },
  { key: 'stage-plots', label: 'Stage plots', description: 'Stage layouts and backline diagrams.', slug: 'stage-plots', Icon: Presentation, kind: 'stage_plot' },
  { key: 'files', label: 'Files', description: 'Artist-level documents and assets.', slug: 'files', Icon: FolderOpen, kind: null },
];

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default async function ArtistProductionPage({ params }: PageProps) {
  const { id: artistId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artistData } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', artistId)
    .maybeSingle();
  const artist = artistData as { id: string; name: string } | null;
  if (!artist) notFound();

  // Channel lists + stage plots are artist-scope rider_packs (one query,
  // grouped by kind). Riders (Nov 2026 rebuild, migration 301) are each tour's
  // Tech / Hospitality documents + rider templates tagged with this artist.
  const [{ data: packData }, { data: tourRows }, { data: templateRows }] = await Promise.all([
    supabase.from('rider_packs').select('kind, updated_at').eq('artist_id', artistId).eq('scope', 'artist').in('kind', ['channel_list', 'stage_plot']),
    supabase.from('tours').select('id').eq('artist_id', artistId),
    supabase.from('rider_templates').select('updated_at').eq('artist_id', artistId),
  ]);
  const tourIds = ((tourRows ?? []) as Array<{ id: string }>).map((t) => t.id);
  const [{ data: riderRows }, { data: lastBlock }] = tourIds.length
    ? await Promise.all([
        supabase.from('riders').select('updated_at').in('tour_id', tourIds),
        supabase.from('rider_blocks').select('updated_at').in('tour_id', tourIds).order('updated_at', { ascending: false }).limit(1),
      ])
    : [{ data: [] }, { data: [] }];
  const statByKind = new Map<string, { count: number; lastEdited: string | null }>();
  const bump = (kind: string, updatedAt: string | null, count = 1) => {
    const cur = statByKind.get(kind) ?? { count: 0, lastEdited: null };
    cur.count += count;
    if (updatedAt && (!cur.lastEdited || updatedAt > cur.lastEdited)) cur.lastEdited = updatedAt;
    statByKind.set(kind, cur);
  };
  for (const r of (packData ?? []) as Array<{ kind: string | null; updated_at: string | null }>) if (r.kind) bump(r.kind, r.updated_at);
  for (const r of [...((riderRows ?? []) as Array<{ updated_at: string | null }>), ...((templateRows ?? []) as Array<{ updated_at: string | null }>)]) bump('rider', r.updated_at);
  const blockEdit = ((lastBlock ?? []) as Array<{ updated_at: string | null }>)[0]?.updated_at ?? null;
  if (blockEdit && statByKind.has('rider')) bump('rider', blockEdit, 0);

  return (
    <div className="lp-view-tier">
      {/* Slim header + the shared hero tab row (Library active). */}
      <div style={{ padding: 'var(--lp-space-6) var(--lp-space-6) 0' }}>
        <div className="lp-label-caps" style={{ color: 'var(--lp-text-tertiary)' }}>
          {artist.name}
        </div>
        <h1
          className="mt-1"
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text)',
            lineHeight: 1.1,
          }}
        >
          Library
        </h1>
      </div>
      <div className="mt-3">
        <ArtistHeroTabs artistId={artist.id} active="production" />
      </div>

      <div
        className="mx-auto w-full"
        style={{ maxWidth: 880, padding: 'var(--lp-space-6)' }}
      >
        {/* Compact asset list — one row per surface, hairline separators. */}
        <div
          className="overflow-hidden"
          style={{
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-lg)',
            background: 'var(--lp-panel)',
          }}
        >
          {SURFACES.map((s, i) => {
            const stat = s.kind ? statByKind.get(s.kind) : undefined;
            const count = stat?.count ?? 0;
            const edited = formatRelative(stat?.lastEdited ?? null);
            return (
              <Link
                key={s.key}
                href={`/artists/${artistId}/${s.slug}`}
                className="btn-transition flex items-center gap-3"
                style={{
                  padding: 'var(--lp-space-3) var(--lp-space-4)',
                  borderTop: i === 0 ? 'none' : '1px solid var(--lp-border-subtle)',
                  textDecoration: 'none',
                }}
              >
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 'var(--lp-radius-md)',
                    background: 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
                    color: 'var(--color-lp-orange)',
                  }}
                >
                  <s.Icon size={18} strokeWidth={2} />
                </span>

                <div className="min-w-0 flex-1">
                  <div
                    style={{
                      fontSize: 'var(--lp-text-sm)',
                      fontWeight: 'var(--lp-weight-semibold)',
                      color: 'var(--lp-text)',
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}
                  >
                    {s.description}
                  </div>
                </div>

                {/* Right meta — count + last-edited. Files (no backing table)
                    reads a quiet "—" rather than a false "0 items". */}
                <div
                  className="shrink-0 text-right"
                  style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}
                >
                  {s.kind ? (
                    <>
                      <span className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>
                        {count}
                      </span>{' '}
                      {count === 1 ? 'item' : 'items'}
                      {edited ? (
                        <span> · edited <span className="lp-mono">{edited}</span></span>
                      ) : null}
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>

                <ChevronRight
                  aria-hidden
                  size={18}
                  strokeWidth={2}
                  className="shrink-0"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
