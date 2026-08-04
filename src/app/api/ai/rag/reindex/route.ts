/* ============================================
   LOWPASS — RAG reindex (ingestion / backfill)

   POST { source_kind?, since? } → re-embeds the caller's workspace's
   records (one v1 kind, or all) into rag_chunks. Admin-gated; the embed
   calls ride the google rate-limit lane (guardGoogleCall). This endpoint
   IS the backfill — Adam runs it once per workspace.

   Workspace scoping: reindexWorkspace only ever reads/writes the caller's
   own workspace_id (resolved server-side) — never cross-workspace.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { guardGoogleCall } from '@/lib/external/googleUsage';
import { reindexWorkspace } from '@/lib/ai/rag/reindex';
import { RAG_SOURCE_KINDS, type RagSourceKind } from '@/lib/ai/rag/sources';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin-gated (same pattern as deal-memos delete / tour-personnel).
  const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_workspace_admin');
  if (rpcErr) return NextResponse.json({ error: 'Admin check failed' }, { status: 500 });
  if (!isAdmin) return NextResponse.json({ error: 'Workspace admin required' }, { status: 403 });

  let body: { source_kind?: string; since?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — reindex all kinds */
  }

  let sourceKind: RagSourceKind | undefined;
  if (body.source_kind) {
    if (!(RAG_SOURCE_KINDS as readonly string[]).includes(body.source_kind)) {
      return NextResponse.json(
        { error: `source_kind must be one of ${RAG_SOURCE_KINDS.join(', ')}` },
        { status: 400 },
      );
    }
    sourceKind = body.source_kind as RagSourceKind;
  }

  // Pre-flight google rate-limit + workspace/user resolution.
  const g = await guardGoogleCall('ai.embeddings');
  if (!g.ok) return g.response;

  try {
    const results = await reindexWorkspace(
      { workspaceId: g.ctx.workspaceId, userId: g.ctx.userId },
      { sourceKind, since: body.since },
    );
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('[rag] reindex failed', err);
    const message = err instanceof Error ? err.message : 'reindex failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
