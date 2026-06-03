/* ============================================================
   LOWPASS — AI budget email alerts (CC_AI_USAGE_TRACKING §AI-6)

   STUB — wired now, implemented in §AI-6.

   `withAiUsage()` calls `maybeFireBudgetAlerts()` fire-and-forget
   after every successful AI call (see src/lib/ai/usage.ts). §AI-6
   will fill in the body: read ai_usage_limits, sum the current
   month's workspace spend, and fire a Resend email at the 50/80/100%
   thresholds (debounced via the last_*_alert_sent_at columns).

   Until §AI-6 lands this is a no-op. It must never throw — the
   caller invokes it as `void maybeFireBudgetAlerts(...)` and does
   not await it, but a synchronous throw before the first await would
   still surface. Keep the whole body inside the try/catch the caller
   wraps it in, and return early here.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check the workspace's month-to-date AI spend against its budget and
 * fire threshold alert emails. Fire-and-forget; never throws.
 *
 * STUB — §AI-6 implements. No-op for now.
 */
export async function maybeFireBudgetAlerts(
  _svc: SupabaseClient,
  _workspaceId: string,
): Promise<void> {
  // Intentionally empty until §AI-6. Do not throw. (Params referenced
  // to keep the no-unused-vars baseline clean until the body lands.)
  void _svc;
  void _workspaceId;
}
