import { Suspense } from 'react';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listUnifiedTemplates } from '@/lib/templates/listUnifiedTemplates';
import { TemplatesLibraryClient } from '@/components/templates/TemplatesLibraryClient';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
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

  const initial = await listUnifiedTemplates(supabase).catch(() => []);

  return listAppPageShell(
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Templates</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Consolidated catalogue of reusable rider packs and Advance artefacts. Editing stays in each template&apos;s native surface.
        </p>
      </div>

      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />}
      >
        <TemplatesLibraryClient initial={initial} />
      </Suspense>
    </div>
  );
}
