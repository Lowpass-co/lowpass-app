/* ============================================
   LOWPASS — Artist Library category stub (Phase B nav redesign)

   Placeholder route for library categories that don't have a backing
   data model yet: tech-specs, financial-admin, stage-plot.

   Riders has its own real page (/rider-packs?artist_id=…) and
   bypasses this stub — the Artist Hub links straight there.

   TODO(artist-library-data-model): replace each stub with a real
   surface once the schema for these categories is designed. The
   shape will likely mirror rider_packs (workspace_id + artist_id +
   metadata + storage), but the cardinality and editing model needs
   product input first.
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Receipt, MicVocal, Plus } from 'lucide-react';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { Artist } from '@/types';

type CategoryDescriptor = {
  slug: 'tech-specs' | 'financial-admin' | 'stage-plot';
  title: string;
  blurb: string;
  // We type the icon as a generic component to avoid pulling in lucide's
  // ForwardRef shape here — the runtime is identical.
  Icon: typeof FileText;
};

const CATEGORIES: Record<string, CategoryDescriptor> = {
  'tech-specs': {
    slug: 'tech-specs',
    title: 'Tech specs',
    blurb:
      'Technical riders, input lists, audio specs — the artist-level technical reference docs that tours pull from.',
    Icon: FileText,
  },
  'financial-admin': {
    slug: 'financial-admin',
    title: 'Financial admin',
    blurb:
      'W-9s, tax forms, banking details, and other financial paperwork that lives at the artist level.',
    Icon: Receipt,
  },
  'stage-plot': {
    slug: 'stage-plot',
    title: 'Stage plot',
    blurb:
      'Stage layouts, monitor diagrams, and room schematics — the visual reference docs for FOH and crew.',
    Icon: MicVocal,
  },
};

export default async function ArtistLibraryCategoryPage({
  params,
}: {
  params: Promise<{ id: string; category: string }>;
}) {
  const { id, category } = await params;
  const descriptor = CATEGORIES[category];
  if (!descriptor) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: artist } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!artist) notFound();

  const a = artist as Pick<Artist, 'id' | 'name'>;
  const Icon = descriptor.Icon;

  return listAppPageShell(
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link
          href={`/artists/${a.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {a.name ?? 'artist'}
        </Link>
        <h1
          className="mt-2"
          style={{
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-2xl)',
            fontWeight: 'var(--lp-weight-semibold)',
          }}
        >
          {a.name ?? 'Artist'} · {descriptor.title}
        </h1>
      </div>

      <div
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
            color: 'var(--color-lp-orange)',
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <p
          style={{
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-lg)',
            fontWeight: 'var(--lp-weight-medium)',
          }}
        >
          No {descriptor.title.toLowerCase()} yet
        </p>
        <p
          className="max-w-md px-4 text-sm"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          {descriptor.blurb} Data model coming in a follow-up sprint.
        </p>
        <button
          type="button"
          // Stub button — clicking is currently a no-op pending the data
          // model. Marked as disabled visually so operators don't expect
          // it to work yet.
          disabled
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium opacity-60"
          style={{
            borderColor: 'var(--color-lp-orange)',
            color: 'var(--color-lp-orange)',
            background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
            cursor: 'not-allowed',
          }}
          title="Coming soon"
        >
          <Plus className="h-4 w-4" />
          Add {descriptor.title.toLowerCase()}
        </button>
      </div>
    </div>,
  );
}
