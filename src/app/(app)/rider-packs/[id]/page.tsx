import Link from 'next/link';
import { builderAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { PackEditor } from '@/components/rider-pack/PackEditor';

export const dynamic = 'force-dynamic';

export default async function RiderPackEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { id } = await params;

  // Light existence check for a better 404 than surfacing a fetch error.
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, title')
    .eq('id', id)
    .maybeSingle();

  if (!pack) {
    return <div className="p-6 text-sm text-lp-text-secondary">Pack not found.</div>;
  }

  return builderAppPageShell(
    <div>
      <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-6 py-3 text-sm">
        {/* IA Cleanup §I1.2 — /rider-packs index now
            redirects to /artists. Breadcrumb points there
            directly so back-nav lands cleanly. */}
        <Link href="/artists" className="text-lp-text-secondary hover:text-lp-text">
          ← Artists
        </Link>
        <span className="text-lp-text-tertiary">/</span>
        <span className="font-semibold text-lp-text">{pack.title || '(untitled)'}</span>
      </div>
      <PackEditor packId={id} />
    </div>,
    {
      kind: 'docSections',
      activeId: 'doc',
      sections: [{ id: 'doc', label: 'Document', href: `/rider-packs/${id}` }],
    }
  );
}
