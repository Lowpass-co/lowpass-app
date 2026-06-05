/* ============================================================
   LOWPASS — AI cap client helper (CC_AI_USAGE_TRACKING §AI-8)

   The 6 wrapped AI endpoints return a typed 429
   `{ error: 'ai_usage_cap_exceeded', reason }` when a per-user hard
   cap or the workspace budget is hit (see aiCapExceededResponse in
   src/lib/ai/usage.ts). Client AI calls are NOT centralised — they're
   fanned out across ~7 components — so this tiny helper lets each call
   site detect a cap block + show a friendly toast in two lines:

     const res = await fetch('/api/budget/ai/suggest', …);
     const cap = await detectAiCap(res);
     if (cap) { showToast(aiCapMessage(cap), 'error'); return; }

   detectAiCap clones the response, so the caller can still read the
   body normally on the non-cap path.
   ============================================================ */

export const AI_CAP_EXCEEDED = 'ai_usage_cap_exceeded';

export type AiCapReason = 'user_hard_cap' | 'workspace_budget';

/** A user-facing sentence for a cap block, pointing at the settings. */
export function aiCapMessage(reason: AiCapReason | string | null): string {
  if (reason === 'user_hard_cap') {
    return 'You’ve hit your personal AI usage limit for this month. A workspace admin can raise it in Settings → AI limits.';
  }
  if (reason === 'workspace_budget') {
    return 'This workspace’s monthly AI budget is used up. A workspace admin can raise it in Settings → AI limits.';
  }
  return 'AI usage limit reached. See Settings → AI limits.';
}

/**
 * If `res` is a cap-exceeded 429, return its reason; otherwise null.
 * Clones the response so the caller's own `res.json()` still works on
 * the non-cap path. Never throws.
 */
export async function detectAiCap(res: Response): Promise<AiCapReason | null> {
  if (res.status !== 429) return null;
  try {
    const j = (await res.clone().json()) as {
      error?: string;
      reason?: string;
    } | null;
    if (j && j.error === AI_CAP_EXCEEDED) {
      return (j.reason as AiCapReason) ?? null;
    }
  } catch {
    /* body wasn't the typed JSON — treat as a normal 429 */
  }
  return null;
}
