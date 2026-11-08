/* ============================================
   /api/file-links — files linked to shows, venues and people (Nov 2026)

     GET    ?type=show|venue|person&id=…  → { files, venue }  what that page shows (+ a show's venue)
     GET    ?fileId=…                     → { links }   a file's links (Link to… dialog)
     POST   { fileId, type, entityId }    → { id }      link (idempotent)
     DELETE ?id=…                         → { ok }      unlink (never deletes the file)

   READ CHECK: session + active membership; everything scoped to that
   workspace in src/server/files/entityLinks.ts (venues are shared across
   workspaces, so the workspace filter is what keeps files private).
   WRITES: requireWrite — same gate as uploading to Files.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { getActiveMembership } from '@/lib/permissions/server';
import { ENTITY_TYPES, LinkError, addLink, linkedFiles, linksOfFile, removeLink, showVenue, type EntityType } from '@/server/files/entityLinks';
import { readJson, str } from '@/server/files/shareResponse';

const NO_STORE = { 'Cache-Control': 'no-store' };
const fail = (e: unknown) =>
  e instanceof LinkError
    ? NextResponse.json({ error: e.message }, { status: e.status })
    : (console.error('[file-links]', e), NextResponse.json({ error: 'Something went wrong.' }, { status: 500 }));
const isType = (v: unknown): v is EntityType => typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v);

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const m = await getActiveMembership(supabase, user.id);
  if (!m) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const q = new URL(request.url).searchParams;
  try {
    const fileId = q.get('fileId');
    if (fileId) return NextResponse.json({ links: await linksOfFile(supabase, { workspaceId: m.workspace_id, fileId }) }, { headers: NO_STORE });
    const type = q.get('type');
    const id = q.get('id');
    if (!isType(type) || !id) return NextResponse.json({ error: 'Send ?type=show|venue|person&id=… or ?fileId=…' }, { status: 400 });
    const files = await linkedFiles(supabase, { workspaceId: m.workspace_id, type, id });
    // A show's venue, so the panel can offer "every show at <venue>".
    const venue = type === 'show' ? await showVenue(supabase, { workspaceId: m.workspace_id, showId: id }) : null;
    return NextResponse.json({ files, venue }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const fileId = str(body.fileId);
  const entityId = str(body.entityId);
  if (!fileId || !entityId || !isType(body.type)) return NextResponse.json({ error: 'Send { fileId, type: show|venue|person, entityId }' }, { status: 400 });
  try {
    return NextResponse.json(await addLink(supabase, { workspaceId: auth.workspaceId, userId: auth.user.id, fileId, type: body.type, entityId }));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    await removeLink(supabase, { workspaceId: auth.workspaceId, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
