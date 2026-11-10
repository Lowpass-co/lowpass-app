/* ============================================
   POST /api/tours/[id]/parking/[routingId]/drawings/read — AI reads a venue
   drawing (Nov 2026, Adam: "drop a venue drawing in and have it on a map")

     { stage: 'overview', image }                     → OverviewRead
     { stage: 'refine', text, metres, angle, images }  → { ends: [pt|null, pt|null] }

   image = { data: base64, type: 'image/jpeg' | 'image/png', w, h } — the
   browser renders the page (or two close-ups) itself; nothing is stored.
   Coordinates come back in each image's pixels, parsed and bounded by
   src/lib/parking/drawingRead.ts; the wizard maps them to the drawing and
   CHECKS them (two dimensions must agree) before anyone relies on them.

   Gate: requireWrite (a person setting up a map) + tourGate. Every call goes
   through withAiUsage (per-user cap + workspace budget, logged), plus a
   per-user burst limit. Images ≤ 3.5 MB each, ≤ 2 per call.
   ============================================ */

import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { aiCapExceededResponse, withAiUsage } from '@/lib/ai/usage';
import { DRAWING_READ_MODEL, READ_SYSTEM, jsonOf, overviewPrompt, parseOverview, parseRefine, refinePrompt } from '@/lib/parking/drawingRead';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store' };
type Params = { params: Promise<{ id: string; routingId: string }> };

const MAX_B64 = Math.ceil((3.5 * 1024 * 1024 * 4) / 3);
const BURST = { calls: 12, perMs: 60_000 };
const recent = new Map<string, number[]>();

type Img = { data: string; type: 'image/jpeg' | 'image/png'; w: number; h: number };

function image(v: unknown): Img | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.data !== 'string' || !o.data || o.data.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(o.data.slice(0, 200))) return null;
  if (o.type !== 'image/jpeg' && o.type !== 'image/png') return null;
  const w = Number(o.w);
  const h = Number(o.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 50 || h < 50 || w > 3000 || h > 3000) return null;
  return { data: o.data, type: o.type, w, h };
}

const block = (i: Img): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } });

export async function POST(request: Request, { params }: Params) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI isn’t set up on this server.' }, { status: 503 });
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;

  const now = Date.now();
  const mine = (recent.get(auth.user.id) ?? []).filter((t) => now - t < BURST.perMs);
  if (mine.length >= BURST.calls) return NextResponse.json({ error: 'Too many drawing reads — wait a minute.' }, { status: 429 });
  recent.set(auth.user.id, [...mine, now]);

  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  let content: Anthropic.MessageParam['content'];
  let parse: (reply: string) => unknown;
  if (body.stage === 'overview') {
    const img = image(body.image);
    if (!img) return NextResponse.json({ error: 'Send the page as a JPEG / PNG under 3.5 MB, ≤ 3000 px.' }, { status: 400 });
    content = [block(img), { type: 'text', text: overviewPrompt(img.w, img.h) }];
    parse = (reply) => parseOverview(jsonOf(reply), img.w, img.h);
  } else if (body.stage === 'refine') {
    const imgs = Array.isArray(body.images) ? body.images.map(image) : [];
    const metres = Number(body.metres);
    const angle = Number(body.angle);
    if (imgs.length !== 2 || imgs.some((i) => !i) || !(metres > 0 && metres < 2000) || !Number.isFinite(angle)) {
      return NextResponse.json({ error: 'Send two close-ups, the dimension and its angle.' }, { status: 400 });
    }
    const [a, b] = imgs as [Img, Img];
    const text = typeof body.text === 'string' ? body.text.slice(0, 40) : String(metres);
    content = [block(a), block(b), { type: 'text', text: refinePrompt(text, metres, angle) }];
    parse = (reply) => ({ ends: parseRefine(jsonOf(reply), [a, b]) });
  } else {
    return NextResponse.json({ error: 'stage must be overview or refine' }, { status: 400 });
  }

  try {
    const r = await withAiUsage(
      { workspaceId: auth.workspaceId, userId: auth.user.id, endpoint: `parking.drawing.${body.stage}`, model: DRAWING_READ_MODEL, metadata: { tourId, routingId } },
      async (anthropic) => {
        const m = await anthropic.messages.create({
          model: DRAWING_READ_MODEL,
          max_tokens: 1200,
          system: READ_SYSTEM,
          messages: [{ role: 'user', content }],
        });
        return { result: m, usage: m.usage };
      },
    );
    if (r.blocked) return aiCapExceededResponse(r.blockReason!);
    const reply = r.result!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    return NextResponse.json(parse(reply), { headers: NO_STORE });
  } catch (e) {
    console.error('[parking drawing read]', e);
    return NextResponse.json({ error: 'The drawing couldn’t be read just now.' }, { status: 502 });
  }
}
