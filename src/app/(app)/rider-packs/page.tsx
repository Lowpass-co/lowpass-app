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
      .select('id, title, scope, artist_id, tour_id, routing_id, updated_at')
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
        style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
      >
        <div
          className="border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          Packs
        </div>
        {!packs || packs.length === 0 ? (
          <div className="p-4 text-sm text-lp-text-secondary">No packs yet. Create one above.</div>
        ) : (
          <ul>
            {packs.map((p, index) => (
              <li
                key={p.id}
                style={index > 0 ? { borderTop: '1px solid var(--lp-border)' } : undefined}
              >
                <Link
                  href={`/rider-packs/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-lp-surface-hover"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-lp-text">{p.title || '(untitled)'}</div>
                    <div className="truncate text-xs text-lp-text-secondary">
                      {artistMap.get(p.artist_id) ?? 'Unknown artist'}
                      {' · '}
                      <span className="uppercase tracking-wide">{p.scope}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-lp-text-tertiary">
                    {new Date(p.updated_at).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
