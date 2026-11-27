/* /api/tours/[id]/advance/packs/read — read venue info packs with AI.
   POST { mode: 'identify', paths }   → which show each file is for (quick:
        Haiku, a scan's first 3 pages only), answered in the request.
   POST { mode: 'extract', reads: [{ routingId, paths }] }  (or one
        { routingId, paths }) → starts one BACKGROUND read per show
        (advance_pack_reads, migration 300) and answers at once with the
        read ids + how long reads usually take. The read runs after the
        response (`after`); closing the browser doesn't stop it.
   GET ?read=<id>          → progress, then the suggestions (with the day's
                             current answers + what's still unanswered).
   GET ?pending=1[&routingId=] → this user's reads on this tour not yet
                             reviewed (the "ready to review" banners).
   PATCH { read, reviewed: true } → the TM has been through it.
   Answers are written only by the save route. Files stay in storage (fenced
   to this workspace + tour). Metered by withAiUsage. */

import { NextResponse, after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';
import { matchShow, unansweredAfter, type ShowRef } from '@/lib/advance/packs';
import { questionSections } from '@/lib/advance/board';
import { PackReadError, isOwnPackPath, readPackFile, scanParts, toContent, type PackContent } from '@/server/advance/packReader';
import { createPackJob, effectiveStatus, estimateSeconds, runPackJob, type PackJobRow } from '@/server/advance/packJobs';
import { loadAdvanceShow } from '@/server/advance/show';
import { loadAdvanceBoard } from '@/server/advance/board';
import { readJson, tourGate } from '@/server/advance/routeGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const lastCall = new Map<string, number>();
const IDENTIFY_MODEL = 'claude-haiku-4-5-20251001';

type BlockedFlag = { blocked: boolean; reason?: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { area: 'advance', tourId });
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'The AI reader isn’t set up on this server.' }, { status: 503 });

  const body = await readJson<{ mode?: unknown; paths?: unknown; routingId?: unknown; reads?: unknown; files?: unknown }>(request);
  const client = supabase as unknown as SupabaseClient;
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;

  /* ---- extract: start one background read per show ---- */
  if (body?.mode === 'extract') {
    const reads = (Array.isArray(body.reads) ? body.reads : [{ routingId: body.routingId, paths: body.paths }]) as { routingId?: unknown; paths?: unknown }[];
    const all = reads.flatMap((r) => (Array.isArray(r?.paths) ? r.paths : []));
    if (!reads.length || reads.some((r) => typeof r?.routingId !== 'string' || !Array.isArray(r.paths) || !r.paths.length) || all.length > 10)
      return NextResponse.json({ error: 'Send 1–10 files, each with its show' }, { status: 400 });
    if (!all.every((p) => isOwnPackPath(p, auth.workspaceId, tourId))) return NextResponse.json({ error: 'Not your file' }, { status: 403 });
    const limited = checkRateLimit(lastCall, `${auth.user.id}:extract`, 3_000);
    if (limited) return limited;
    markRateLimit(lastCall, `${auth.user.id}:extract`);
    // Sizes / types the browser knows (kept for the save step); names from the path.
    const meta = new Map<string, { size: number | null; type: string | null }>();
    for (const f of Array.isArray(body.files) ? (body.files as { path?: unknown; size?: unknown; type?: unknown }[]) : [])
      if (typeof f?.path === 'string') meta.set(f.path, { size: typeof f.size === 'number' ? f.size : null, type: typeof f.type === 'string' ? f.type : null });

    // Load every show (and its questions) with the CALLER's client before
    // anything starts — the background part only uses the service role.
    const planned: { routingId: string; paths: string[]; sections: ReturnType<typeof questionSections>; ctx: { venue: string | null; city: string | null; date: string; artist: string | null } }[] = [];
    for (const r of reads) {
      const show = await loadAdvanceShow(client, tourId, r.routingId as string);
      if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
      const sections = questionSections(show.allSections);
      if (!sections.length) return NextResponse.json({ error: `${show.venue.name ?? 'This day'} has no questions yet — pick a template first.` }, { status: 400 });
      planned.push({ routingId: r.routingId as string, paths: r.paths as string[], sections, ctx: { venue: show.venue.name, city: show.venue.city, date: show.routing.date, artist: show.tour.artistName } });
    }
    const started: { id: string; routingId: string }[] = [];
    for (const pl of planned) {
      const files = pl.paths.map((path) => ({ path, name: (path.split('/').pop() ?? 'file').replace(/^\d+-/, ''), size: meta.get(path)?.size ?? null, type: meta.get(path)?.type ?? null }));
      const id = await createPackJob(service, { workspaceId: auth.workspaceId, tourId, routingId: pl.routingId, userId: auth.user.id, files });
      started.push({ id, routingId: pl.routingId });
      after(() => runPackJob(service, { id, workspaceId: auth.workspaceId, userId: auth.user.id, routingId: pl.routingId, paths: pl.paths }, pl.sections, pl.ctx));
    }
    return NextResponse.json({ reads: started, estimateSeconds: await estimateSeconds(service) }, { status: 202 });
  }

  if (body?.mode !== 'identify') return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
  const paths = Array.isArray(body?.paths) ? body!.paths : [];
  if (!paths.length || paths.length > 10) return NextResponse.json({ error: 'Send 1–10 files' }, { status: 400 });
  if (!paths.every((p) => isOwnPackPath(p, auth.workspaceId, tourId))) return NextResponse.json({ error: 'Not your file' }, { status: 403 });
  const limited = checkRateLimit(lastCall, `${auth.user.id}:identify`, 3_000);
  if (limited) return limited;
  markRateLimit(lastCall, `${auth.user.id}:identify`);
  const blocked: BlockedFlag = { blocked: false };

  const contents: (PackContent | { error: string; name: string })[] = await Promise.all(
    (paths as string[]).map(async (p) => {
      try {
        return await toContent(await readPackFile(service, p));
      } catch (e) {
        if (!(e instanceof PackReadError)) console.error('[advance/packs/read] reading failed', p, e);
        return { error: e instanceof PackReadError ? e.message : 'Couldn’t read this file', name: p.split('/').pop() ?? 'file' };
      }
    }),
  );

  /* ---- identify: which show is each file for ---- */
  const board = await loadAdvanceBoard(client, tourId);
  const shows: ShowRef[] = (board?.rows ?? []).flatMap((r) =>
    r.kind === 'show' ? [{ routingId: r.routingId, date: r.date, venue: r.venue, city: r.city }] : [],
  );
  const out = await Promise.all(
    contents.map(async (c, i) => {
      const info = { path: paths[i] as string, name: 'error' in c ? c.name.replace(/^\d+-/, '') : c.name, error: 'error' in c ? c.error : null };
      if ('error' in c) return { ...info, routingId: null, guess: null };
      // The venue + date are on the first pages: a scan sends only those.
      const head = c.kind === 'pdf' ? (await scanParts(c.base64, 3, 3))[0].base64 : null;
      const blocks =
        c.kind === 'text'
          ? [{ type: 'text', text: c.pages.slice(0, 2).map((p) => p.text).join('\n').slice(0, 8000) }]
          : c.kind === 'image'
            ? [{ type: 'image', source: { type: 'base64', media_type: c.mime, data: c.base64 } }]
            : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: head } }];
      const r = await withAiUsage(
        { workspaceId: auth.workspaceId, userId: auth.user.id, endpoint: 'advance.packs.identify', model: IDENTIFY_MODEL, metadata: { tour_id: tourId } },
        async (anthropic) => {
          const m = await anthropic.messages.create({
            model: IDENTIFY_MODEL,
            max_tokens: 300,
            tools: [{ name: 'which_show', description: 'The show the document is for.', input_schema: { type: 'object', properties: { venue: { type: 'string' }, city: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' } } } }],
            tool_choice: { type: 'tool', name: 'which_show' },
            messages: [{ role: 'user', content: [...(blocks as never[]), { type: 'text', text: 'Which venue, city and show date is this venue document for? Only what it states.' }] }],
          });
          const t = m.content.find((b) => b.type === 'tool_use');
          return { result: (t && 'input' in t ? t.input : null) as { venue?: string; city?: string; date?: string } | null, usage: m.usage };
        },
      );
      if (r.blocked) Object.assign(blocked, { blocked: true, reason: r.blockReason });
      const guess = r.result ?? null;
      return { ...info, routingId: guess ? matchShow(guess, shows) : null, guess };
    }),
  );
  if (blocked.blocked) return aiCapExceededResponse(blocked.reason as never);
  return NextResponse.json({ files: out });
}

/* ---- GET: a read's progress / result, or this user's unreviewed reads ---- */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { area: 'advance', tourId });
  if ('error' in auth) return auth.error;
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  const url = new URL(request.url);

  if (url.searchParams.get('pending')) {
    let q = service
      .from('advance_pack_reads')
      .select('id, routing_id, status, created_at, parts_total, parts_done, result->suggestions')
      .eq('workspace_id', auth.workspaceId)
      .eq('tour_id', tourId)
      .eq('user_id', auth.user.id)
      .is('reviewed_at', null)
      .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    const rid = url.searchParams.get('routingId');
    if (rid) q = q.eq('routing_id', rid);
    const { data } = await q;
    const reads = ((data ?? []) as unknown as { id: string; routing_id: string; status: PackJobRow['status']; created_at: string; parts_total: number; parts_done: number; suggestions: unknown[] | null }[])
      .map((r) => ({ id: r.id, routingId: r.routing_id, status: effectiveStatus(r), createdAt: r.created_at, found: Array.isArray(r.suggestions) ? r.suggestions.length : 0 }))
      .filter((r) => r.status !== 'failed');
    return NextResponse.json({ reads });
  }

  const readId = url.searchParams.get('read');
  if (!readId) return NextResponse.json({ error: 'Which read?' }, { status: 400 });
  const { data } = await service
    .from('advance_pack_reads')
    .select('*')
    .eq('id', readId)
    .eq('workspace_id', auth.workspaceId)
    .eq('tour_id', tourId)
    .maybeSingle();
  const row = data as PackJobRow | null;
  if (!row) return NextResponse.json({ error: 'Read not found' }, { status: 404 });
  const status = effectiveStatus(row);
  const base = {
    id: row.id,
    routingId: row.routing_id,
    status,
    files: row.files,
    partsTotal: row.parts_total,
    partsDone: row.parts_done,
    startedAt: row.created_at,
    error: status === 'failed' ? (row.error ?? 'The read stopped part-way. Try again — the files are kept.') : null,
  };
  if (status !== 'done' || !row.result) return NextResponse.json(base);
  if (row.result.blocked && !row.result.suggestions.length) return aiCapExceededResponse(row.result.blocked as never);

  // What the day holds NOW — the TM may have typed answers while it read.
  const show = await loadAdvanceShow(supabase as unknown as SupabaseClient, tourId, row.routing_id);
  if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  const sections = questionSections(show.allSections);
  const existing: Record<string, unknown> = {};
  for (const sg of row.result.suggestions) {
    const v = show.data[sg.section_id]?.[sg.field_id];
    if (v !== null && v !== undefined && v !== '') existing[`${sg.section_id}:${sg.field_id}`] = v;
  }
  return NextResponse.json({
    ...base,
    result: { ...row.result, unanswered: unansweredAfter(sections, show.data, row.result.suggestions), existing },
  });
}

/* ---- PATCH: reviewed (saved or put aside) — stops the banner ---- */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { area: 'advance', tourId });
  if ('error' in auth) return auth.error;
  const body = await readJson<{ read?: unknown; reviewed?: unknown }>(request);
  if (typeof body?.read !== 'string' || body.reviewed !== true) return NextResponse.json({ error: 'Send { read, reviewed: true }' }, { status: 400 });
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  await service
    .from('advance_pack_reads')
    .update({ reviewed_at: new Date().toISOString() })
    .eq('id', body.read)
    .eq('workspace_id', auth.workspaceId)
    .eq('tour_id', tourId)
    .eq('user_id', auth.user.id);
  return new NextResponse(null, { status: 204 });
}
