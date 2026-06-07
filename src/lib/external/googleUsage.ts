/* ============================================================
   LOWPASS — Google API usage guard + meter (Security audit §H2)

   Mirrors src/lib/ai/usage.ts (withAiUsage) for Google API calls. Until
   now the Google proxy routes (geocode, directions, places/*, find-image)
   were UNAUTHENTICATED and UNMETERED — anyone could loop them to drain the
   Google billing key. This module closes that:

     guardGoogleCall(endpoint)
       1. Authenticates the caller (Supabase session) + resolves workspace.
       2. PRE-FLIGHT request-count rate limit:
            • per-user   — default 300 Google calls / rolling hour
            • per-workspace — default 5,000 Google calls / rolling 24h
          Counts prior provider='google' events in ai_usage_events (the
          same table the AI usage system uses — migration 205 adds the
          `provider` column). On a hit it logs a 'blocked_cap' event and
          returns a typed 429; the upstream Google call is never made.
       3. Returns { userId, workspaceId } for the route to proceed.

     logGoogleCall(ctx, status)
       Records one ai_usage_events row (provider='google') with the flat
       per-request cost from src/lib/google/pricing.ts. Call it right after
       the upstream fetch resolves (status 'ok' on res.ok, else 'error').
       Best-effort: a logging failure never breaks the response.

   Limits are overridable via env (numeric):
     GOOGLE_RL_USER_PER_HOUR   (default 300)
     GOOGLE_RL_WS_PER_DAY      (default 5000)

   All DB access uses the service-role client (RLS forbids client inserts;
   the per-user/workspace count must see all rows) — identical trust model
   to withAiUsage.
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { googleCostMicros, type GoogleEndpoint } from '@/lib/google/pricing';

const USER_PER_HOUR = intEnv(process.env.GOOGLE_RL_USER_PER_HOUR, 300);
const WS_PER_DAY = intEnv(process.env.GOOGLE_RL_WS_PER_DAY, 5000);

export interface GoogleCallContext {
  userId: string;
  workspaceId: string;
  endpoint: GoogleEndpoint;
}

export type GoogleGuard =
  | { ok: true; ctx: GoogleCallContext }
  | { ok: false; response: NextResponse };

/**
 * Authenticate + rate-limit a Google proxy call. Returns the call context
 * on success, or a ready-to-return NextResponse (401/403/429) on failure.
 *
 * Usage in a route:
 *   const g = await guardGoogleCall('google.geocode');
 *   if (!g.ok) return g.response;
 *   ... do the upstream fetch ...
 *   await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');
 */
export async function guardGoogleCall(endpoint: GoogleEndpoint): Promise<GoogleGuard> {
  // 1. Authenticate (anon client validates the JWT against the auth server).
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return { ok: false, response: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }

  const ctx: GoogleCallContext = { userId: user.id, workspaceId: profile.workspace_id, endpoint };

  // 2. Pre-flight rate limit (service-role so the count sees all rows).
  const svc = createServiceSupabaseClient();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [userCount, wsCount] = await Promise.all([
    countGoogleEvents(svc, { userId: ctx.userId, since: hourAgo }),
    countGoogleEvents(svc, { workspaceId: ctx.workspaceId, since: dayAgo }),
  ]);

  if (userCount >= USER_PER_HOUR || wsCount >= WS_PER_DAY) {
    const reason = userCount >= USER_PER_HOUR ? 'user_rate_limit' : 'workspace_rate_limit';
    await logGoogleCall(ctx, 'blocked_cap', reason);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'google_rate_limit_exceeded', reason, retry_after_seconds: 3600 },
        { status: 429, headers: { 'Retry-After': '3600' } },
      ),
    };
  }

  return { ok: true, ctx };
}

/**
 * Record one Google call in ai_usage_events (provider='google'). Best-effort.
 * `status`: 'ok' (billable success), 'error' (upstream failure), or
 * 'blocked_cap' (rate-limited; cost 0, set internally by guardGoogleCall).
 */
export async function logGoogleCall(
  ctx: GoogleCallContext,
  status: 'ok' | 'error' | 'blocked_cap',
  note?: string,
): Promise<void> {
  try {
    const svc = createServiceSupabaseClient();
    const costMicros = status === 'ok' ? googleCostMicros(ctx.endpoint) : 0;
    const { error } = await svc.from('ai_usage_events').insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      provider: 'google',
      endpoint: ctx.endpoint,
      model: ctx.endpoint, // no model concept for Google; mirror the endpoint
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: costMicros,
      status,
      error_message: note ?? null,
      metadata: {},
    });
    if (error) {
      console.error('[google-usage] failed to record event', { endpoint: ctx.endpoint, status, error });
    }
  } catch (e) {
    console.error('[google-usage] record threw', e);
  }
}

/* ── helpers ─────────────────────────────────────────────────────── */

async function countGoogleEvents(
  svc: ReturnType<typeof createServiceSupabaseClient>,
  opts: { userId?: string; workspaceId?: string; since: string },
): Promise<number> {
  let q = svc
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'google')
    .in('status', ['ok', 'error'])
    .gte('created_at', opts.since);
  if (opts.userId) q = q.eq('user_id', opts.userId);
  if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
  const { count, error } = await q;
  if (error) {
    // Fail CLOSED on the rate-limit count: if we can't verify, assume the
    // limit is hit rather than letting an attacker drain the key blind.
    console.error('[google-usage] count failed — failing closed', error);
    return Number.MAX_SAFE_INTEGER;
  }
  return count ?? 0;
}

function intEnv(v: string | undefined, fallback: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
