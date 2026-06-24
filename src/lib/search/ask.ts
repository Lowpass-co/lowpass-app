/* ============================================================
   LOWPASS — ⌘K "ask your history" client helper

   Thin wrapper over POST /api/ai/rag/ask. The proving surface for the
   RAG substrate (build #2): a grounded, source-cited answer from the
   workspace's own records. Gated upstream by the build-#1 opt-in.
   ============================================================ */

export interface AskSource {
  source_kind: string;
  source_id: string;
  snippet: string;
  city: string | null;
  date: string | null;
}

export interface AskResult {
  answer: string | null;
  sources: AskSource[];
  gated?: boolean;
  error?: string;
}

/** A query "looks like a question" — used to surface the Ask affordance. */
export function looksLikeQuestion(query: string): boolean {
  const q = query.trim();
  if (q.length < 8) return false;
  if (q.endsWith('?')) return true;
  return /^(what|how much|how many|when|where|who|did we|do we|have we|which)\b/i.test(q);
}

export async function askHistory(question: string): Promise<AskResult> {
  try {
    const res = await fetch('/api/ai/rag/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) {
      return { answer: null, sources: [], error: `Ask failed (${res.status})` };
    }
    const json = (await res.json()) as AskResult;
    return {
      answer: json.answer ?? null,
      sources: Array.isArray(json.sources) ? json.sources : [],
      gated: json.gated,
    };
  } catch {
    return { answer: null, sources: [], error: 'Ask failed' };
  }
}
