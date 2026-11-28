/* ============================================
   POST /api/gear/lookup { query } — look an item up online (Nov 2026, Adam:
   "you should be able to google search for an item though to pull retail
   value, basic info, weight and picture").

   The model searches the web (Anthropic's web search tool, ≤ 3 searches)
   and answers with one product's facts; `parseLookup` is the gate — nothing
   it says is used unchecked. Its photo link is fetched through safeFetch and
   a COPY stored (shop images move). It only proposes: the new-item form
   shows the result and the person saves it.

   Gate: requireWrite (the same people who can add stock). Every call goes
   through withAiUsage (per-user cap + workspace budget, logged — web
   searches are billed too, see pricing.ts), plus a per-user brake below.
   ============================================ */
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { aiCapExceededResponse, withAiUsage } from '@/lib/ai/usage';
import { GEAR_LOOKUP_MAX_SEARCHES, GEAR_LOOKUP_MODEL, LOOKUP_SYSTEM, jsonOf, lookupPrompt, parseLookup } from '@/lib/gear/lookup';
import { GearPhotoError, photoBytesFromLink, storeGearPhoto } from '@/server/gear/photos';
import { FetchRefused } from '@/server/net/safeFetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* A brake, not a boundary (in memory; a cold start resets it). */
const RECENT = new Map<string, number[]>();
const MAX = 20;
const WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Online lookup isn’t set up on this server.' }, { status: 503 });
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (query.length < 2) return NextResponse.json({ error: 'Type what you’re looking for — a make and model works best.' }, { status: 400 });
  if (query.length > 200) return NextResponse.json({ error: 'That’s too long to look up.' }, { status: 400 });

  const now = Date.now();
  const mine = (RECENT.get(auth.user.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= MAX) return NextResponse.json({ error: 'That’s a lot of lookups at once — wait a few minutes.' }, { status: 429 });
  RECENT.set(auth.user.id, [...mine, now]);
  if (RECENT.size > 5000) RECENT.clear();

  let reply: string;
  try {
    const r = await withAiUsage(
      { workspaceId: auth.workspaceId, userId: auth.user.id, endpoint: 'gear.lookup', model: GEAR_LOOKUP_MODEL, metadata: { query } },
      async (anthropic) => {
        /* A server-tool turn can come back 'pause_turn' (still working); it's
           continued by sending the reply back. Usage is summed over every
           call so the budget sees all of it. */
        const messages: Anthropic.MessageParam[] = [{ role: 'user', content: lookupPrompt(query) }];
        const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };
        let m: Anthropic.Message | null = null;
        for (let turn = 0; turn < 3; turn++) {
          m = await anthropic.messages.create({
            model: GEAR_LOOKUP_MODEL,
            max_tokens: 1500,
            system: LOOKUP_SYSTEM,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: GEAR_LOOKUP_MAX_SEARCHES }],
            messages,
          });
          usage.input_tokens += m.usage.input_tokens ?? 0;
          usage.output_tokens += m.usage.output_tokens ?? 0;
          usage.cache_read_input_tokens += m.usage.cache_read_input_tokens ?? 0;
          usage.cache_creation_input_tokens += m.usage.cache_creation_input_tokens ?? 0;
          usage.server_tool_use.web_search_requests += m.usage.server_tool_use?.web_search_requests ?? 0;
          if (m.stop_reason !== 'pause_turn') break;
          messages.push({ role: 'assistant', content: m.content });
        }
        return { result: m!, usage };
      },
    );
    if (r.blocked) return aiCapExceededResponse(r.blockReason!);
    reply = r.result!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  } catch (e) {
    console.error('[gear lookup]', e);
    const msg = e instanceof Error ? e.message : '';
    // Web search has to be switched on for the API key's organisation.
    if (/web.?search/i.test(msg)) return NextResponse.json({ error: 'Web search isn’t switched on for this server’s AI key.' }, { status: 502 });
    return NextResponse.json({ error: 'The lookup didn’t work just now. Try again.' }, { status: 502 });
  }

  const found = parseLookup(jsonOf(reply));
  if (!found) return NextResponse.json({ error: `Nothing clear came back for “${query}”. Try the make and model.` }, { status: 404 });

  /* The photo: the model's link, else the first source page's og:image. A
     failure just means no photo — the facts still come back. */
  let photo: { path: string; url: string } | null = null;
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  for (const link of [found.imageUrl, ...found.sources].filter((u): u is string => !!u).slice(0, 3)) {
    try {
      photo = await storeGearPhoto(service, auth.workspaceId, await photoBytesFromLink(link));
      break;
    } catch (e) {
      if (!(e instanceof FetchRefused) && !(e instanceof GearPhotoError)) console.warn('[gear lookup photo]', e);
    }
  }

  return NextResponse.json({ result: { ...found, imageUrl: photo?.url ?? null } }, { headers: { 'Cache-Control': 'no-store' } });
}
