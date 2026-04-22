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
    return <div className="p-6 text-sm text-neutral-500">No workspace found.</div>;
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Rider / Pack</h1>
      </header>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
          New artist pack
        </div>
        <NewPackForm artists={artists ?? []} />
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
          Packs
        </div>
        {!packs || packs.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">No packs yet. Create one above.</div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {packs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/rider-packs/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title || '(untitled)'}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {artistMap.get(p.artist_id) ?? 'Unknown artist'}
                      {' · '}
                      <span className="uppercase tracking-wide">{p.scope}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-400">
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
