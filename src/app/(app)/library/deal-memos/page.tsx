import { Suspense } from 'react';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  DealMemoLibraryClient,
  type DealMemoTourOpt,
} from '@/components/deal-memos/DealMemoLibraryClient';

export const dynamic = 'force-dynamic';

export default async function DealMemosLibraryPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return listAppPageShell(
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">Please sign in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();

  if (!profile?.workspace_id) {
    return listAppPageShell(
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  const { data: tourRows } = await supabase
    .from('tours')
    .select('id, name')
    .eq('workspace_id', profile.workspace_id)
    .order('start_date', { ascending: false });

  const tours: DealMemoTourOpt[] = ((tourRows ?? []) as { id: string; name: string }[]).map((t) => ({
    id: t.id,
    name: t.name,
  }));

  return listAppPageShell(
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Deal memos</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Contracts and fee agreements across every tour — show-linked where it matters; tour-wide for buyouts or tour riders.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="h-48 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />
        }
      >
        <DealMemoLibraryClient tours={tours} />
      </Suspense>
    </div>
  );
}
