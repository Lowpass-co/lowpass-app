/* ============================================
   LOWPASS — <RiderPackEditorView> (shared rider editor body)

   The editor body, extracted from /rider-packs/[id]/page.tsx so BOTH that route
   and /operations/[tourId]/riders/[id] render it identically (Riders fix D1).

   `standalone`:
     true  (/rider-packs/[id])              → wraps in its own shell
            (ProductShell active=null, or builderAppPageShell for channel_list).
     false (/operations/[tourId]/riders/[id]) → returns INNER content only; the
            Operations layout (/operations/[tourId]/layout.tsx) supplies the
            ProductShell + TourHeader — so the editor keeps the SAME shell as the
            riders LIST it was opened from (D2).
   ============================================ */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { builderAppPageShell } from '@/components/shell/app-page-shells';
import { PackEditor } from '@/components/rider-pack/PackEditor';
import { ProductShell } from '@/components/shell-v2';
import { RiderPackHeader } from '@/components/rider-pack/RiderPackHeader';
import { RiderPackSidebar } from '@/components/rider-pack/RiderPackSidebar';
import { RiderBuilderShellClient } from '@/components/rider-pack/RiderBuilderShellClient';
import { RiderShowReadView } from '@/components/rider-pack/RiderShowReadView';
import { RiderShowRightRail } from '@/components/rider-pack/RiderShowRightRail';
import { computeRiderProgress } from '@/lib/rider-packs/progress';
import type { PackScope, RiderSection } from '@/lib/rider-packs/types';

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export async function RiderPackEditorView({
  packId,
  mode,
  standalone,
}: {
  packId: string;
  mode?: string;
  standalone: boolean;
}) {
  const id = packId;
  const isEdit = mode === 'edit';
  const activeTab: 'show' | 'builder' = isEdit ? 'builder' : 'show';

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, title, kind, scope, artist_id, tour_id, routing_id, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (!pack) notFound();

  // Channel-list packs keep the legacy PackEditor (it mounts ChannelListEditor
  // for channel_list sections, which the rider shells intentionally don't edit).
  if (pack.kind === 'channel_list') {
    const inner = (
      <div>
        <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-6 py-3 text-sm">
          <Link href="/artists" className="text-lp-text-secondary hover:text-lp-text">
            ← Artists
          </Link>
          <span className="text-lp-text-tertiary">/</span>
          <span className="font-semibold text-lp-text">{pack.title || '(untitled)'}</span>
        </div>
        <PackEditor packId={id} />
      </div>
    );
    if (!standalone) return inner;
    return builderAppPageShell(inner, {
      kind: 'docSections',
      activeId: 'doc',
      sections: [{ id: 'doc', label: 'Document', href: `/rider-packs/${id}` }],
    });
  }

  const scope = pack.scope as PackScope;

  const { data: sectionRows } = await supabase
    .from('rider_sections')
    .select('id, pack_id, section_key, title, sort_order, section_type, fields, status, created_at, updated_at')
    .eq('pack_id', id)
    .order('sort_order', { ascending: true });
  const sections = (sectionRows ?? []) as RiderSection[];

  let scopeContext: string | null = null;
  if (scope === 'tour' && pack.tour_id) {
    const { data: t } = await supabase.from('tours').select('name').eq('id', pack.tour_id).maybeSingle();
    scopeContext = t?.name ?? null;
  } else if (scope === 'artist' && pack.artist_id) {
    const { data: a } = await supabase.from('artists').select('name').eq('id', pack.artist_id).maybeSingle();
    scopeContext = a?.name ?? null;
  }

  const progress = computeRiderProgress(sections);
  const showHref = `/rider-packs/${id}`;
  const builderHref = `/rider-packs/${id}?mode=edit`;
  const templateName: string | null = null;

  const sidebarScope: 'tour' | 'artist' = scope === 'artist' ? 'artist' : 'tour';
  const sidebarContextId = scope === 'artist' ? pack.artist_id : pack.tour_id;

  const header = (
    <RiderPackHeader
      packTitle={pack.title || 'Untitled rider'}
      scope={scope}
      scopeContext={scopeContext}
      templateName={templateName}
      lastEditedRelative={relativeTime(pack.updated_at)}
      lastEditedBy={null}
      sectionsComplete={progress.sectionsComplete}
      sectionsTotal={progress.sectionsTotal}
      inProgressCount={progress.inProgressCount}
      needsReviewCount={progress.needsReviewCount}
      activeTab={activeTab}
      builderHref={builderHref}
      publicPreviewHref={null}
    />
  );

  const inner = (
    <div className="flex min-h-0 flex-1">
      {sidebarContextId ? (
        <RiderPackSidebar
          scope={sidebarScope}
          contextId={sidebarContextId}
          contextName={scopeContext ?? (sidebarScope === 'artist' ? 'Artist' : 'Tour')}
          activePackId={id}
        />
      ) : null}

      {isEdit ? (
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-4 pt-4" style={{ background: 'var(--lp-bg)' }}>
            {header}
          </div>
          <RiderBuilderShellClient
            packId={id}
            templateName={templateName}
            activeTab={activeTab}
            showHref={showHref}
            builderHref={builderHref}
          />
        </main>
      ) : (
        <>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1100px] space-y-4 px-6 py-6">
              {header}
              <RiderShowReadView packId={id} />
            </div>
          </main>
          <RiderShowRightRail sections={sections} scope={scope} scopeContext={scopeContext} templateName={templateName} />
        </>
      )}
    </div>
  );

  if (!standalone) return inner;
  return (
    <ProductShell active={null} artistId={pack.artist_id} tourId={pack.tour_id ?? undefined} productName="Rider">
      {inner}
    </ProductShell>
  );
}
