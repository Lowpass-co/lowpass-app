/* ============================================
   /api/tours/[id]/riders — the tour's two rider documents (rebuild, Nov 2026)

   GET   → everything the Riders page shows (loadRiderEditor), for a refresh.
   POST  { action, … }:
     start         { kind, source: {starter}|{template}|{rider}|{blank}, replace }
     title         { riderId, title }
     party         { size: number | null }      (null = count the crew)
     publish       { bump: 'minor'|'major', note }
     template      { riderId, name }            save as a workspace template
     links         { routingIds: (uuid|null)[] } one live link per show (null = tour)
     replace-link  { linkId }                   old URL off, a fresh one on
     sends         { sends: [{ linkId, versionId, email, name }] }  the TM sent it
     reply         { linkId, blockId, body }    answer a promoter on a line
     resolve       { linkId, blockId, reopen? }
     state         { routingId, blockId, state: confirmed|substitute|cut|null, note }
   Production EDIT on this tour for all of them (requireWrite area
   'production'); saving a template is a library write ({ library: true }).
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { loadRiderEditor } from '@/server/riders/data';
import {
  RiderError,
  answerReply,
  ensureLinks,
  publish,
  recordSends,
  replaceLink,
  resolveThread,
  saveAsTemplate,
  setLineState,
  setParty,
  setTitle,
  startFrom,
  type StartSource,
} from '@/server/riders/actions';
import { riderErrorResponse } from '@/server/riders/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  try {
    const data = await loadRiderEditor(supabase as unknown as SupabaseClient, tourId);
    if (!data) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return riderErrorResponse(e, 'load');
  }
}

function source(raw: unknown): StartSource {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof s.starter === 'string') return { starter: s.starter };
  if (typeof s.template === 'string') return { template: s.template };
  if (typeof s.rider === 'string') return { rider: s.rider };
  if (s.blank === true) return { blank: true };
  throw new RiderError(400, 'Start from what?');
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  const action = body.action;
  const auth = await requireWrite(supabase, action === 'template' ? { library: true } : { area: 'production', tourId });
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const client = supabase as unknown as SupabaseClient;
  const ws = auth.workspaceId;
  const uid = auth.user.id;
  try {
    switch (action) {
      case 'start': {
        const riderId = await startFrom(client, tourId, ws, body.kind, source(body.source), { replace: body.replace === true, userId: uid });
        return NextResponse.json({ riderId });
      }
      case 'title':
        await setTitle(client, tourId, String(body.riderId ?? ''), typeof body.title === 'string' ? body.title : '');
        return new NextResponse(null, { status: 204 });
      case 'party': {
        const n = body.size === null ? null : Number(body.size);
        if (n !== null && (!Number.isFinite(n) || n < 1)) throw new RiderError(400, 'A touring party of at least 1');
        await setParty(client, tourId, ws, n, uid);
        return new NextResponse(null, { status: 204 });
      }
      case 'publish':
        return NextResponse.json(await publish(client, tourId, ws, { bump: body.bump, note: body.note }, uid));
      case 'template':
        return NextResponse.json({ id: await saveAsTemplate(client, tourId, ws, body.riderId, body.name, uid) });
      case 'links':
        return NextResponse.json({ links: await ensureLinks(client, tourId, ws, body.routingIds as unknown[], uid) });
      case 'replace-link':
        return NextResponse.json({ link: await replaceLink(client, tourId, ws, body.linkId, uid) });
      case 'sends':
        return NextResponse.json({ recorded: await recordSends(client, tourId, ws, body.sends as never[], uid) });
      case 'reply': {
        const { data: me } = await supabase.from('profiles').select('name').eq('id', uid).maybeSingle();
        const name = ((me as { name: string | null } | null)?.name ?? '').trim() || null;
        return NextResponse.json({ reply: await answerReply(client, tourId, ws, body, { id: uid, name }) });
      }
      case 'resolve':
        await resolveThread(client, tourId, body, uid);
        return new NextResponse(null, { status: 204 });
      case 'state':
        await setLineState(client, tourId, ws, body, uid);
        return new NextResponse(null, { status: 204 });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return riderErrorResponse(e, String(action));
  }
}
