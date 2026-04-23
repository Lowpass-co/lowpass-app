import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NewPackForm } from '@/components/rider-pack/PackEditor';

export const dynamic = 'force-dynamic';

export default async function RiderPacksIndexPage() {
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

  const artistMap = new Map((artists ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-lp-text">Rider Packs</h1>
        <p className="text-sm text-lp-text-secondary">
          You can have many riders per artist. Each rider is one document; tour- and show-level riders can inherit
          sections from artist-level riders via folder links.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Packs', value: String(packs?.length ?? 0) },
          { label: 'Artists', value: String(artists?.length ?? 0) },
          {
            label: 'Recently edited',
            value: packs?.[0] ? new Date(packs[0].updated_at).toLocaleDateString() : '—',
          },
          {
            label: 'Exports',
            value: String(packs?.filter((p) => p.google_doc_id).length ?? 0),
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
        <div
          className="border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          New rider (artist level)
        </div>
        <NewPackForm artists={artists ?? []} />
      </section>

      <section
        className="overflow-hidden rounded-xl border"
        style={{
          backgroundColor: 'var(--lp-surface)',
          borderColor: 'var(--lp-border)',
        }}
      >
        <div
          className="grid items-center gap-3 border-b px-4 py-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text"
          style={{
            gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 100px 140px',
            borderColor: 'var(--lp-border)',
          }}
        >
          <div>Pack</div>
          <div>Artist</div>
          <div>Scope</div>
          <div className="text-right">Updated</div>
        </div>
        {packs && packs.length > 0 ? (
          packs.map((p) => (
            <Link
              key={p.id}
              href={`/rider-packs/${p.id}`}
              className="grid cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-lp-surface-hover"
              style={{
                gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 100px 140px',
                borderColor: 'var(--lp-border)',
              }}
            >
              <div className="truncate text-sm font-semibold text-lp-text">{p.title || '(untitled)'}</div>
              <div className="truncate text-sm text-lp-text-secondary">
                {artistMap.get(p.artist_id) ?? 'Unknown artist'}
              </div>
              <div>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{
                    backgroundColor: '#FF45001a',
                    color: '#FF4500',
                    border: '1px solid #FF450033',
                  }}
                >
                  {p.scope}
                </span>
              </div>
              <div className="text-right text-[11px] text-lp-text-tertiary tabular-nums">
                {new Date(p.updated_at).toLocaleDateString()}
              </div>
            </Link>
          ))
        ) : (
          <div className="px-4 py-10 text-center text-sm text-lp-text-secondary">
            No packs yet. Create one above.
          </div>
        )}
      </section>
    </div>
  );
}
