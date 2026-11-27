/* ============================================
   LOWPASS — Production › Riders (rebuild, Nov 2026 — migration 301)

   /operations/[tourId]/riders — the tour's two rider documents (Tech,
   Hospitality): write them, publish numbered versions, send each show its
   own live link, answer promoters' replies. Opening the page writes nothing.
   Who edits is the DATABASE's answer (tour access, production area): the
   same rule the API applies (requireWrite area 'production').
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { getViewerAccess, viewerAllows } from '@/lib/permissions/tourAccess';
import { loadRiderEditor } from '@/server/riders/data';
import { legacyCount } from '@/server/riders/legacy';
import { RIDER_DEFAULT_TITLE, RIDER_KINDS, type RiderKind } from '@/lib/riders/types';
import { RidersEditor } from '@/components/riders/RidersEditor';

export const dynamic = 'force-dynamic';

const SIDES = ['outline', 'changes', 'shows', 'replies'] as const;

export default async function RidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string }>;
  searchParams: Promise<{ doc?: string; panel?: string }>;
}) {
  const [{ tourId }, sp] = await Promise.all([params, searchParams]);
  const initialKind = (RIDER_KINDS as readonly string[]).includes(sp.doc ?? '') ? (sp.doc as RiderKind) : null;
  const initialSide = (SIDES as readonly string[]).includes(sp.panel ?? '') ? (sp.panel as (typeof SIDES)[number]) : null;
  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  // Production VIEW first: the input list / stage plot are read with the
  // service role (a show's own document is a manager-only row), so the page
  // must not load for someone the database wouldn't show them to.
  const access = await getViewerAccess(supabase, user.id, tourId);
  if (!viewerAllows(access, 'production', 'view')) notFound();
  const [data, membership, profileRes, othersRes] = await Promise.all([
    loadRiderEditor(supabase, tourId),
    getActiveMembership(supabase, user.id),
    supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
    supabase.from('riders').select('id, kind, title, tour_id, tour:tours(name)').neq('tour_id', tourId).order('updated_at', { ascending: false }).limit(200),
  ]);
  if (!data || !membership || membership.workspace_id !== data.tour.workspaceId) notFound();
  const canEdit = viewerAllows(access, 'production', 'edit');
  const manager = !!access?.manager;
  const otherRiders = ((othersRes.data ?? []) as { id: string; kind: RiderKind; title: string | null; tour: { name: string | null } | { name: string | null }[] | null }[]).map((r) => {
    const t = Array.isArray(r.tour) ? r.tour[0] : r.tour;
    return { id: r.id, kind: r.kind, title: r.title || RIDER_DEFAULT_TITLE[r.kind], tourName: t?.name ?? 'Another tour' };
  });
  const name = ((profileRes.data as { name: string | null } | null)?.name ?? '').trim() || user.email?.split('@')[0] || 'Me';
  return (
    <RidersEditor
      initial={data}
      tourId={tourId}
      me={{ id: user.id, name }}
      canEdit={canEdit}
      canBringOver={manager}
      legacyCount={manager ? await legacyCount(supabase, data.tour.workspaceId) : 0}
      otherRiders={otherRiders}
      initialKind={initialKind}
      initialSide={initialSide}
    />
  );
}
