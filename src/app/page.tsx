/* ============================================
   LOWPASS — Root Page

   Phase 1 §D: /dashboard retired (folded into /). Root lands on the
   artist picker at /artists once an artist is selected.

   Salvage #5 — single-artist auto-skip. A workspace with exactly one
   artist has no picker decision to make, so we land straight on that
   artist's Home (/artists/[id]) instead of the picker. Reimplemented
   server-side here (not merged from the old branch): count artists for
   the signed-in user's workspace and skip only when the count is
   unambiguously 1. An explicit ?next= (safe internal path) always wins,
   so a post-auth resume target is never overridden by the auto-skip.
   ============================================ */

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No session → hand off to /artists (which redirects to /login when it
  // can't load workspace data). Stage 4 login fallback is /artists.
  if (!user) redirect('/artists');

  // Honour an explicit post-auth destination when it's a safe internal path
  // (leading single slash, not protocol-relative). This wins over auto-skip.
  const nextPath = Array.isArray(next) ? next[0] : next;
  if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
    redirect(nextPath);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  const workspaceId = (profile as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) redirect('/artists');

  // Fetch at most 2 ids: enough to tell "exactly one" from "more than one"
  // without counting the whole table. Auto-skip only on an unambiguous single.
  const { data: artists } = await supabase
    .from('artists')
    .select('id')
    .eq('workspace_id', workspaceId)
    .order('name')
    .limit(2);

  if (artists && artists.length === 1) {
    redirect(`/artists/${artists[0].id}`);
  }

  redirect('/artists');
}
