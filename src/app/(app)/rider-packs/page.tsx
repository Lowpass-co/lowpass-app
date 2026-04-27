import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RiderPacksIndexToolbar } from '@/components/rider-pack/RiderPacksIndexToolbar';
import { RiderPacksUrlSync } from '@/components/rider-pack/RiderPacksUrlSync';
import { RiderPackGridCard } from '@/components/rider-pack/RiderPackGridCard';

export const dynamic = 'force-dynamic';

export default async function RiderPacksIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ artist_id?: string; all?: string }>;
}) {
  const params = await searchParams;
  const showAllWorkspace =
    params.all === '1' || params.all === 'true' || params.all === 'yes';
  const rawArtistId = params.artist_id?.trim() ?? null;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return <div className="p-6 text-sm text-lp-text-secondary">No workspace found.</div>;
  }

  const [{ data: artists }, { data: packs }] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name')
      .eq('workspace_id', profile.workspace_id)
      .order('name'),
    supabase
      .from('rider_packs')
      .select('id, title, scope, artist_id, tour_id, routing_id, updated_at, google_doc_id')
      .order('updated_at', { ascending: false }),
  ]);

  const list = artists ?? [];
  const contextArtist = showAllWorkspace
    ? null
    : rawArtistId && list.some((a) => a.id === rawArtistId)
      ? list.find((a) => a.id === rawArtistId) ?? null
      : null;
  const badArtistParam = !showAllWorkspace && rawArtistId && !contextArtist;

  const allPacks = packs ?? [];
  const displayedPacks = contextArtist
    ? allPacks.filter((p) => p.artist_id === contextArtist.id)
    : allPacks;

  const artistMap = new Map(list.map((a) => [a.id, a.name]));

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-5">
      <Suspense fallback={null}>
        <RiderPacksUrlSync />
      </Suspense>
      <header className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h1 className="text-2xl font-bold text-lp-text">Rider Packs</h1>
          {contextArtist && (
            <Link
              href="/rider-packs?all=1"
              className="shrink-0 text-xs text-[var(--lp-orange)] hover:underline"
            >
              All workspace packs
            </Link>
          )}
        </div>
        <p className="text-sm text-lp-text-secondary">
          {contextArtist ? (
            <>
              Riders for <span className="text-lp-text">{contextArtist.name}</span>. You can have
              many per band; each rider is one document. Tour- and show-level riders can inherit
              from artist-level riders.
            </>
          ) : (
            <>Many riders per artist, one document per rider. Open from the sidebar with a band selected to work in one act&apos;s list only.</>
          )}
        </p>
        {badArtistParam && (
          <p className="text-xs text-lp-text-tertiary">Unknown artist; showing all workspace packs.</p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Packs', value: String(displayedPacks.length) },
          { label: 'Artists', value: String(list.length) },
          {
            label: 'Recently edited',
            value: displayedPacks[0]
              ? new Date(displayedPacks[0].updated_at).toLocaleDateString()
              : '—',
          },
          {
            label: 'Exports',
            value: String(displayedPacks.filter((p) => p.google_doc_id).length),
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: 'var(--lp-surface)',
              border: '1px solid var(--lp-border)',
            }}
          >
            <div
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--lp-text-tertiary)' }}
            >
              {c.label}
            </div>
            <div className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <section
        className="overflow-hidden rounded-xl border"
        style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
      >
        <RiderPacksIndexToolbar
          artists={list}
          contextArtist={contextArtist}
          sectionLabel={contextArtist ? `New ${contextArtist.name} rider` : 'New rider (artist level)'}
        />
      </section>

      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
          {contextArtist ? `${contextArtist.name} riders` : 'All packs'}
        </h2>
        {displayedPacks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayedPacks.map((p) => (
              <RiderPackGridCard
                key={p.id}
                pack={p}
                showArtist={!contextArtist}
                artistName={artistMap.get(p.artist_id) ?? 'Unknown artist'}
                artists={list}
                contextArtistId={contextArtist?.id}
              />
            ))}
          </div>
        ) : (
          <div
            className="rounded-xl border px-4 py-10 text-center text-sm text-lp-text-secondary"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            No packs yet. Create one above
            {contextArtist ? ' or import from another band.' : '.'}
          </div>
        )}
      </section>
    </div>
  );
}
