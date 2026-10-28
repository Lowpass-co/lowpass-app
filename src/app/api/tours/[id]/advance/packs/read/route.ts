/* POST /api/tours/[id]/advance/packs/read — read venue info packs with AI.
   { mode: 'identify', paths }            → which show each file is for
   { mode: 'extract', paths, routingId }  → suggested answers for that show's
        questions, each with the quote + page it came from, plus useful extras
        and the questions nothing answered.
   Writes nothing: the review screen decides, the save route writes. Files
   stay in storage (fenced to this workspace + tour). Metered by withAiUsage. */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';
import { mergeExtras, mergeSuggestions, matchShow, unansweredAfter, type ShowRef } from '@/lib/advance/packs';
import { questionSections } from '@/lib/advance/board';
import {
  PackReadError,
  extractFromContent,
  isOwnPackPath,
  readPackFile,
  toContent,
  type PackContent,
} from '@/server/advance/packReader';
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
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'The AI reader isn’t set up on this server.' }, { status: 503 });

  const body = await readJson<{ mode?: unknown; paths?: unknown; routingId?: unknown }>(request);
  const paths = Array.isArray(body?.paths) ? body!.paths : [];
  if (!paths.length || paths.length > 10) return NextResponse.json({ error: 'Send 1–10 files' }, { status: 400 });
  if (!paths.every((p) => isOwnPackPath(p, auth.workspaceId, tourId))) return NextResponse.json({ error: 'Not your file' }, { status: 403 });
  const limited = checkRateLimit(lastCall, `${auth.user.id}:${body?.mode}`, 3_000);
  if (limited) return limited;
  markRateLimit(lastCall, `${auth.user.id}:${body?.mode}`);

  const client = supabase as unknown as SupabaseClient;
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  const blocked: BlockedFlag = { blocked: false };

  const contents: (PackContent | { error: string; name: string })[] = await Promise.all(
    (paths as string[]).map(async (p) => {
      try {
        return await toContent(await readPackFile(service, p));
      } catch (e) {
        return { error: e instanceof PackReadError ? e.message : 'Couldn’t read this file', name: p.split('/').pop() ?? 'file' };
      }
    }),
  );
  const fileInfo = contents.map((c, i) => ({
    path: paths[i] as string,
    name: 'error' in c ? c.name.replace(/^\d+-/, '') : c.name,
    kind: 'error' in c ? null : c.kind,
    mime: 'error' in c ? null : c.mime,
    pageCount: 'error' in c ? null : c.pageCount,
    error: 'error' in c ? c.error : null,
    // Spreadsheets / text have no rendering of their own: send the text so the
    // review screen can show (and highlight) it. PDFs render from the file.
    textPages: !('error' in c) && c.kind === 'text' && c.mime !== 'application/pdf' ? c.pages.map((p) => ({ num: p.num, text: p.text.slice(0, 60_000) })) : null,
  }));

  /* ---- identify: which show is each file for ---- */
  if (body?.mode === 'identify') {
    const board = await loadAdvanceBoard(client, tourId);
    const shows: ShowRef[] = (board?.rows ?? []).flatMap((r) =>
      r.kind === 'show' ? [{ routingId: r.routingId, date: r.date, venue: r.venue, city: r.city }] : [],
    );
    const out = await Promise.all(
      contents.map(async (c, i) => {
        if ('error' in c) return { ...fileInfo[i], routingId: null, guess: null };
        const blocks =
          c.kind === 'text'
            ? [{ type: 'text', text: c.pages.slice(0, 2).map((p) => p.text).join('\n').slice(0, 8000) }]
            : c.kind === 'image'
              ? [{ type: 'image', source: { type: 'base64', media_type: c.mime, data: c.base64 } }]
              : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.base64 } }];
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
        return { ...fileInfo[i], routingId: guess ? matchShow(guess, shows) : null, guess };
      }),
    );
    if (blocked.blocked) return aiCapExceededResponse(blocked.reason as never);
    return NextResponse.json({ files: out });
  }

  /* ---- extract: answers for one show ---- */
  if (body?.mode !== 'extract' || typeof body.routingId !== 'string') return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
  const show = await loadAdvanceShow(client, tourId, body.routingId);
  if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  const sections = questionSections(show.allSections);
  if (!sections.length) return NextResponse.json({ error: 'This day has no questions yet — pick a template first.' }, { status: 400 });
  const ctx = { venue: show.venue.name, city: show.venue.city, date: show.routing.date, artist: show.tour.artistName };

  const results = await Promise.all(
    contents.map(async (c, i) => {
      if ('error' in c) return null;
      return extractFromContent(c, sections, ctx, i, async (fn) => {
        const r = await withAiUsage(
          { workspaceId: auth.workspaceId, userId: auth.user.id, endpoint: 'advance.packs.read', model: process.env.LP_IMPORT_MODEL || 'claude-sonnet-4-5', metadata: { routing_id: show.routing.id } },
          fn as never,
        );
        if (r.blocked) Object.assign(blocked, { blocked: true, reason: r.blockReason });
        return r.result;
      });
    }),
  );
  if (blocked.blocked) return aiCapExceededResponse(blocked.reason as never);

  const ok = results.filter((r): r is NonNullable<typeof r> => !!r);
  const suggestions = mergeSuggestions(ok.map((r) => r.suggestions));
  const extras = mergeExtras(ok.map((r) => r.extras), sections);
  const labels: Record<string, { section: string; label: string; type: string }> = {};
  for (const s of sections) for (const f of s.fields ?? []) labels[`${s.template_id}:${f.id}`] = { section: s.label, label: f.label, type: f.type };
  const existing: Record<string, unknown> = {};
  for (const sg of suggestions) {
    const v = show.data[sg.section_id]?.[sg.field_id];
    if (v !== null && v !== undefined && v !== '') existing[`${sg.section_id}:${sg.field_id}`] = v;
  }
  return NextResponse.json({
    files: fileInfo.map((f, i) => ({ ...f, found: results[i]?.suggestions.length ?? 0, show: results[i]?.show ?? null, truncated: results[i]?.truncated ?? false })),
    suggestions,
    extras,
    unanswered: unansweredAfter(sections, show.data, suggestions),
    labels,
    existing,
    sections: sections.map((s) => ({ template_id: s.template_id, label: s.label })),
  });
}
