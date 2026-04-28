/* ============================================
   LOWPASS — Performance Page
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { parseWorkspaceArtistId } from '@/lib/artist-scope';

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ artist_id?: string }>;
}) {
  const { artist_id: artistIdParam } = await searchParams;
  const artistId = parseWorkspaceArtistId(artistIdParam);

  let artistName: string | null = null;
  if (artistId) {
    const supabase = await createServerSupabaseClient();
    const { data: artist } = await supabase.from('artists').select('name').eq('id', artistId).maybeSingle();
    artistName = artist?.name ?? null;
  }

  return listAppPageShell(
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Performance</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          {artistId
            ? artistName
              ? `Analytics and insights for ${artistName}. Detailed modules coming soon.`
              : 'Analytics for the selected artist. Detailed modules coming soon.'
            : 'Workspace-wide analytics placeholder (all artists). Detailed performance modules coming soon.'}
        </p>
      </div>
      <div className="rounded-xl border border-lp-border bg-lp-surface p-6">
        <p className="text-sm text-lp-text-secondary">
          {artistId
            ? 'Placeholder for touring patterns, P/L trends, and performance metrics scoped to this artist.'
            : 'Placeholder for workspace-wide touring patterns, P/L trends, and cross-variable performance insights.'}
        </p>
      </div>
    </div>
  );
}
