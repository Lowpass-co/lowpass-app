/* ============================================
   LOWPASS — /artists/[id]/financials (Sprint 12 §7, stub)

   No model yet for artist-level financial templates per Adam's
   call: "Financial templates land in a future sprint. For now,
   deal-memo defaults live in the per-tour budget surface."
   This page exists so the artist library URL space is
   complete; future sprints can light it up once Adam's
   workflow is nailed.
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui/PageHeader';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArtistFinancialsPage({ params }: PageProps) {
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-4)',
        padding: 'var(--lp-space-6)',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <PageHeader
        eyebrow={`${artist.name} · Financial templates`}
        title={`${artist.name} — Financial templates`}
      />

      <div
        style={{
          padding: 'var(--lp-space-6)',
          textAlign: 'center',
          border: '1px dashed var(--lp-border)',
          borderRadius: 'var(--lp-radius-lg)',
          background: 'var(--lp-panel)',
        }}
      >
        <Wallet
          size={28}
          style={{
            marginInline: 'auto',
            marginBottom: 'var(--lp-space-2)',
            color: 'var(--lp-text-tertiary)',
          }}
        />
        <p
          style={{
            margin: 0,
            marginBottom: 'var(--lp-space-2)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Financial templates (deal-memo shapes, payroll defaults)
          land in a future sprint.
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          For now, deal-memo defaults live in each tour&apos;s budget surface.
        </p>
        <Link
          href={`/artists/${artistId}`}
          style={{
            display: 'inline-block',
            marginTop: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-orange)',
            textDecoration: 'none',
          }}
        >
          ← Back to {artist.name}
        </Link>
      </div>
    </div>
  );
}
