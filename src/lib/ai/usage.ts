/* ============================================================
   LOWPASS — AI usage wrapper (CC_AI_USAGE_TRACKING §AI-2)

   `withAiUsage()` is the single load-bearing path every Anthropic
   call goes through (§AI-3 wraps the 6 existing endpoints). It:

     1. PRE-FLIGHT cap check (per-user hard cap, then workspace
        monthly budget) — blocks BEFORE spending the API key.
     2. Calls Anthropic via the caller-supplied closure.
     3. Records one ai_usage_events row (ok / error / blocked_cap)
        with token counts + micro-USD cost.
     4. Fires the budget-alert check fire-and-forget (§AI-6).

   All writes go through the service-role client (RLS forbids client
   inserts — see migration 114). Reads for the cap sum also use the
   service-role client so a member without admin can't see other
   users' rows yet still be capped against the shared budget.

   Cost is micro-USD (1e-6 USD); see src/lib/ai/pricing.ts for the
   rate table and the micros identity.

   Corrections carried from §AI-1 review:
   - service-role helper is `createServiceSupabaseClient` (NOT
     `createServiceRoleClient`, which doesn't exist).
   - month-range scans use the (workspace_id, created_at DESC) index;
     there is no date_trunc index (not IMMUTABLE).
   ============================================================ */

import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { computeCostMicros, type AnthropicUsageLike } from '@/lib/ai/pricing';
import { maybeFireBudgetAlerts } from '@/lib/ai/budget-alerts';

/* ── Default limits (mirror migration 114 defaults; used when a
      workspace has no ai_usage_limits row yet). ─────────────────── */
const DEFAULT_MONTHLY_BUDGET_MICROS = 25_000_000; // $25 / month / workspace
const DEFAULT_PER_USER_SOFT_CAP_MICROS = 2_000_000; // $2
const DEFAULT_PER_USER_HARD_CAP_MICROS = 8_000_000; // $8

export type BlockReason = 'user_hard_cap' | 'workspace_budget';

export interface AiUsageContext {
  workspaceId: string;
  userId: string | null;
  /** Stable endpoint key, e.g. 'budget.ai.suggest'. */
  endpoint: string;
  /** Model id (may be dated, e.g. 'claude-haiku-4-5-20251001'). */
  model: string;
  /** Free-form context stored on the event (pack_id, tour_id, …). */
  metadata?: Record<string, unknown>;
}

export interface AiUsageResult<T> {
  result: T | null;
  blocked: boolean;
  blockReason?: BlockReason;
  costUsdMicros: number;
}

/**
 * Wrap one Anthropic call with cap-check + usage recording.
 *
 * The closure receives the shared `anthropic` client and must return
 * `{ result, usage }` where `usage` is the message's `.usage` object.
 * On a successful call the result is returned with `blocked: false`.
 * On a cap hit, `result` is null and `blocked` is true with a reason —
 * the call to Anthropic is never made. On an Anthropic error the event
 * is recorded as 'error' and the error is re-thrown for the route to
 * handle as it did before (the 6 endpoints already catch their own).
 */
export async function withAiUsage<T>(
  ctx: AiUsageContext,
  call: (anthropic: Anthropic) => Promise<{ result: T; usage: AnthropicUsageLike }>,
): Promise<AiUsageResult<T>> {
  const svc = createServiceSupabaseClient();

  // 1. Pre-flight cap check.
  const cap = await checkCaps(svc, ctx.workspaceId, ctx.userId);
  if (cap.blocked) {
    await recordEvent(svc, {
      ctx,
      status: 'blocked_cap',
      errorMessage: cap.reason ?? null,
    });
    return { result: null, blocked: true, blockReason: cap.reason, costUsdMicros: 0 };
  }

  // 2. Call Anthropic. Construct the client lazily (reads
  //    ANTHROPIC_API_KEY from env, matching the existing routes).
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const anthropic = new AnthropicSdk();
  const t0 = Date.now();
  try {
    const { result, usage } = await call(anthropic);
    const latencyMs = Date.now() - t0;
    const { micros, priced } = computeCostMicros(ctx.model, usage);
    if (!priced) {
      console.warn(`[ai-usage] no price card for model "${ctx.model}" — recording cost 0`);
    }
    await recordEvent(svc, { ctx, status: 'ok', usage, costMicros: micros, latencyMs });
    // 4. Fire-and-forget budget alert (§AI-6). Never block the response.
    void maybeFireBudgetAlerts(svc, ctx.workspaceId).catch((e) =>
      console.error('[ai-usage] budget alert check failed', e),
    );
    return { result, blocked: false, costUsdMicros: micros };
  } catch (err: unknown) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : 'unknown error';
    await recordEvent(svc, { ctx, status: 'error', errorMessage: msg, latencyMs });
    throw err;
  }
}

/**
 * Build the typed 429 response for a blocked call. §AI-3 / §AI-8 use
 * this so every endpoint returns an identical shape.
 */
export function aiCapExceededResponse(reason: BlockReason): NextResponse {
  return NextResponse.json(
    { error: 'ai_usage_cap_exceeded', reason, retry_at: nextMonthStartIso() },
    { status: 429 },
  );
}

/* ── Cap check ───────────────────────────────────────────────────── */

interface CapCheck {
  blocked: boolean;
  reason?: BlockReason;
}

/**
 * Block when the user's month-to-date spend ≥ their hard cap, OR the
 * workspace's month-to-date spend ≥ its monthly budget. User cap is
 * checked first so an over-budget workspace still reports the more
 * specific reason for the offending user.
 */
async function checkCaps(
  svc: SupabaseClient,
  workspaceId: string,
  userId: string | null,
): Promise<CapCheck> {
  const limits = await loadLimits(svc, workspaceId);
  const monthStart = monthStartIso();

  if (userId) {
    const hardCap = await resolveUserHardCap(svc, workspaceId, userId, limits.hardCap);
    const userSpend = await sumMonthCost(svc, workspaceId, monthStart, userId);
    if (userSpend >= hardCap) return { blocked: true, reason: 'user_hard_cap' };
  }

  const wsSpend = await sumMonthCost(svc, workspaceId, monthStart, null);
  if (wsSpend >= limits.monthlyBudget) return { blocked: true, reason: 'workspace_budget' };

  return { blocked: false };
}

interface ResolvedLimits {
  monthlyBudget: number;
  softCap: number;
  hardCap: number;
}

async function loadLimits(svc: SupabaseClient, workspaceId: string): Promise<ResolvedLimits> {
  const { data } = await svc
    .from('ai_usage_limits')
    .select('monthly_budget_usd_micros, per_user_soft_cap_usd_micros, per_user_hard_cap_usd_micros')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return {
    monthlyBudget: numOr(data?.monthly_budget_usd_micros, DEFAULT_MONTHLY_BUDGET_MICROS),
    softCap: numOr(data?.per_user_soft_cap_usd_micros, DEFAULT_PER_USER_SOFT_CAP_MICROS),
    hardCap: numOr(data?.per_user_hard_cap_usd_micros, DEFAULT_PER_USER_HARD_CAP_MICROS),
  };
}

/** Per-user override hard cap if set, else the workspace default. */
async function resolveUserHardCap(
  svc: SupabaseClient,
  workspaceId: string,
  userId: string,
  defaultHardCap: number,
): Promise<number> {
  const { data } = await svc
    .from('ai_usage_user_overrides')
    .select('hard_cap_usd_micros')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  const override = data?.hard_cap_usd_micros;
  return typeof override === 'number' && Number.isFinite(override) ? override : defaultHardCap;
}

/**
 * Sum cost_usd_micros for the current month, optionally for one user.
 * Sums in JS over the single-column projection — month volume is
 * bounded by the budget itself, and micro sums stay well under 2^53.
 */
async function sumMonthCost(
  svc: SupabaseClient,
  workspaceId: string,
  monthStartIsoStr: string,
  userId: string | null,
): Promise<number> {
  let q = svc
    .from('ai_usage_events')
    .select('cost_usd_micros')
    .eq('workspace_id', workspaceId)
    // Anthropic dollar-caps are Anthropic-only. Google calls share this
    // table (migration 205, provider='google') but have their own
    // request-count limiter (src/lib/external/googleUsage.ts), so they must
    // NOT consume the Anthropic monthly budget. provider defaults to
    // 'anthropic' for every pre-205 row, so this stays historically correct.
    .neq('provider', 'google')
    .gte('created_at', monthStartIsoStr);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error || !data) return 0;
  return data.reduce(
    (acc: number, r: { cost_usd_micros: number | null }) => acc + numOr(r.cost_usd_micros, 0),
    0,
  );
}

/* ── Event recording ─────────────────────────────────────────────── */

interface RecordEventArgs {
  ctx: AiUsageContext;
  status: 'ok' | 'error' | 'blocked_cap';
  usage?: AnthropicUsageLike;
  costMicros?: number;
  latencyMs?: number;
  errorMessage?: string | null;
}

async function recordEvent(svc: SupabaseClient, args: RecordEventArgs): Promise<void> {
  const { ctx, status, usage, costMicros, latencyMs, errorMessage } = args;
  const { error } = await svc.from('ai_usage_events').insert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    endpoint: ctx.endpoint,
    model: ctx.model,
    input_tokens: numOr(usage?.input_tokens, 0),
    output_tokens: numOr(usage?.output_tokens, 0),
    cache_read_tokens: numOr(usage?.cache_read_input_tokens, 0),
    cache_write_tokens: numOr(usage?.cache_creation_input_tokens, 0),
    cost_usd_micros: numOr(costMicros, 0),
    latency_ms: typeof latencyMs === 'number' ? latencyMs : null,
    status,
    error_message: errorMessage ?? null,
    metadata: ctx.metadata ?? {},
  });
  if (error) {
    // Never let a logging failure break the AI response — record-keeping
    // is best-effort. Surface it in server logs for follow-up.
    console.error('[ai-usage] failed to record event', { endpoint: ctx.endpoint, status, error });
  }
}

/* ── Date helpers (UTC month boundaries) ─────────────────────────── */

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function nextMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function numOr(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
