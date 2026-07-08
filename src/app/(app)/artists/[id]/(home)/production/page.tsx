/* ============================================================
   LOWPASS — /artists/[id]/production (Design pass §9 · VIS-AR-01)

   The "Production" tab hub. It does NOT own any data — it groups the
   pre-existing artist-library surfaces (riders / channel-lists / stage-plots /
   financials / files) under one entry so the hero tab row has a destination.
   Each card links to its existing route (unchanged), so the library sub-routes
   are fully preserved — this page is purely additive.

   Sits in the (home) route group → inherits ProductShell active="home".
   ============================================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  ListChecks,
  Presentation,
  Wallet,
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
}

const SURFACES: ReadonlyArray<ProductionSurface> = [
  {
    key: 'riders',
    label: 'Riders',
    description: 'Technical & hospitality rider packs for this artist.',
    slug: 'riders',
    Icon: FileText,
  },
  {
    key: 'channel-lists',
    label: 'Channel lists',
    description: 'Reusable input lists that seed each tour.',
    slug: 'channel-lists',
    Icon: ListChecks,
  },
  {
    key: 'stage-plots',
    label: 'Stage plots',
    description: 'Stage layouts and backline diagrams.',
    slug: 'stage-plots',
    Icon: Presentation,
  },
  {
    key: 'financials',
    label: 'Financials',
    description: 'Deal-memo shapes and payroll defaults.',
    slug: 'financials',
    Icon: Wallet,
  },
  {
    key: 'files',
    label: 'Files',
    description: 'Artist-level documents and assets.',
    slug: 'files',
    Icon: FolderOpen,
  },
];

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

  return (
    <div className="lp-view-tier">
      {/* Slim header + the shared hero tab row (Production active). */}
      <div style={{ padding: 'var(--lp-space-6) var(--lp-space-6) 0' }}>
        <div
          className="lp-label-caps"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
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
          Production
        </h1>
      </div>
      <div className="mt-3">
        <ArtistHeroTabs artistId={artist.id} active="production" />
      </div>

      <div
        className="mx-auto w-full"
        style={{
          maxWidth: 1280,
          padding: 'var(--lp-space-6)',
        }}
      >
        <section
          className="grid"
          style={{
            gap: 'var(--lp-space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {SURFACES.map((s) => (
            <Link
              key={s.key}
              href={`/artists/${artistId}/${s.slug}`}
              className="btn-transition flex flex-col gap-3"
              style={{
                padding: 'var(--lp-space-4)',
                background: 'var(--lp-panel)',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-lg)',
                minHeight: 148,
                textDecoration: 'none',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--lp-radius-md)',
                    background:
                      'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
                    color: 'var(--color-lp-orange)',
                  }}
                >
                  <s.Icon size={20} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    style={{
                      fontSize: 'var(--lp-text-base)',
                      fontWeight: 'var(--lp-weight-semibold)',
                      color: 'var(--lp-text)',
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="mt-1"
                    style={{
                      fontSize: 'var(--lp-text-xs)',
                      color: 'var(--lp-text-tertiary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {s.description}
                  </div>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-end">
                <ChevronRight
                  aria-hidden
                  size={18}
                  strokeWidth={2}
                  style={{ color: 'var(--lp-text-tertiary)' }}
                />
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
