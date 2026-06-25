/* ============================================
   LOWPASS — RAG "ask your history" (proving surface)

   POST { question } → retrieve workspace-scoped chunks → Haiku grounds a
   short answer ON THE RETRIEVED CONTEXT ONLY, citing the sources it used.
   Numbers come from the chunks, never invented.

   Gated by the build-#1 opt-in (getSuggestionsEnabled) — consistent
   non-invasive behaviour. The Haiku call rides withAiUsage (Anthropic
   dollar-cap); the query embedding rides the google lane (inside retrieve).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import { getSuggestionsEnabled } from '@/lib/ai/suggestions-pref';
import { retrieve, type RagHit } from '@/lib/ai/rag/retrieve';

const RAG_ASK_MODEL = 'claude-haiku-4-5-20251001';

interface AskSource {
  source_kind: string;
  source_id: string;
  snippet: string;
  city: string | null;
  date: string | null;
}

function toSource(hit: RagHit): AskSource {
  const city = typeof hit.metadata.city === 'string' ? hit.metadata.city : null;
  const date =
    typeof hit.metadata.show_date === 'string'
      ? hit.metadata.show_date
      : null;
  return {
    source_kind: hit.source_kind,
    source_id: hit.source_id,
    snippet: hit.content.split('\n')[0]?.slice(0, 120) ?? '',
    city,
    date,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Ask not configured' }, { status: 503 });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const workspaceId = profile.workspace_id as string;

  // Opt-in gate (belt-and-braces; the ⌘K surface also hides when off).
  const svc = createServiceSupabaseClient();
  const enabled = await getSuggestionsEnabled(svc, workspaceId, user.id);
  if (!enabled) return NextResponse.json({ gated: true, answer: null, sources: [] });

  let body: { question?: string; tour_id?: string; artist_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const question = (body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });

  // Optional scope → tour ids. Resolved via the session client so RLS keeps
  // it workspace-local; the filter is additive to the workspace clause in
  // match_rag_chunks (cross-workspace isolation unchanged). Absent = whole
  // workspace (preserved default).
  let tourIds: string[] | null = null;
  if (body.tour_id) {
    tourIds = [body.tour_id];
  } else if (body.artist_id) {
    const { data: tours } = await supabase.from('tours').select('id').eq('artist_id', body.artist_id);
    tourIds = (tours ?? []).map((t) => (t as { id: string }).id);
    if (tourIds.length === 0) {
      // Scoped to an artist with no tours → nothing to answer from.
      return NextResponse.json({
        answer: "I couldn't find anything in your workspace history to answer that yet.",
        sources: [],
      });
    }
  }

  const hits = await retrieve(supabase, { workspaceId, userId: user.id }, question, 8, { tourIds });
  if (hits.length === 0) {
    return NextResponse.json({
      answer: "I couldn't find anything in your workspace history to answer that yet.",
      sources: [],
    });
  }

  const context = hits
    .map((h, i) => `[${i + 1}] (${h.source_kind})\n${h.content}`)
    .join('\n\n');

  try {
    const { result, blocked, blockReason } = await withAiUsage(
      {
        workspaceId,
        userId: user.id,
        endpoint: 'ai.rag.ask',
        model: RAG_ASK_MODEL,
        metadata: { hits: hits.length },
      },
      async (anthropic) => {
        const r = await anthropic.messages.create({
          model: RAG_ASK_MODEL,
          max_tokens: 400,
          messages: [
            {
              role: 'user',
              content: `You answer questions about a touring company's own records, using ONLY the context below. Do not invent figures — every number must come from the context. If the context doesn't answer the question, say so plainly. Cite the bracketed source numbers you used, e.g. [1].

Each line shows its own currency. Never add amounts across different currencies into one total. If results span multiple currencies, report a subtotal per currency (e.g. "GBP: £X across N lines; USD: $Y across M lines") and state that converting to a single figure needs exchange rates not provided.

Context:
${context}

Question: ${question}

Answer in 1-3 short sentences.`,
            },
          ],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return aiCapExceededResponse(blockReason ?? 'workspace_budget');
    if (!result) return NextResponse.json({ answer: null, sources: hits.map(toSource) });

    const block = result.content[0];
    const answer = block && block.type === 'text' ? block.text.trim() : '';
    return NextResponse.json({ answer, sources: hits.map(toSource) });
  } catch (err) {
    console.error('[rag] ask error', err);
    return NextResponse.json({ error: 'Ask failed' }, { status: 500 });
  }
}
