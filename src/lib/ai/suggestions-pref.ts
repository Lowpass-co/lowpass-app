/* ============================================================
   LOWPASS — AI suggestions preference resolver

   Folds the per-user tristate preference over the per-workspace
   default into a single effective boolean (plus the breakdown the
   settings UI needs).

   Reads go through the service-role client — same choice as
   src/lib/ai/usage.ts: a member without admin can still resolve
   their own effective preference without an RLS round-trip, and the
   workspace default lives on ai_usage_limits (admin-readable only via
   RLS, so the service-role read is the consistent path).

   Resolution:
     1. read user_ai_preferences.suggestions_enabled for (ws,user)
     2. if non-null → use it
     3. else read ai_usage_limits.ai_suggestions_default_enabled
        (default false when no limits row exists)
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Workspace default when no ai_usage_limits row exists (mirrors the
    migration 210 column default). */
const DEFAULT_SUGGESTIONS_ENABLED = false;

export interface SuggestionsPrefBreakdown {
  /** The resolved effective value the panel gates on. */
  effective: boolean;
  /** The user's explicit choice, or null when following the default. */
  userOverride: boolean | null;
  /** The workspace default the override folds over. */
  workspaceDefault: boolean;
}

/** Read the per-workspace default (false when no limits row yet). */
async function readWorkspaceDefault(
  svc: SupabaseClient,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await svc
    .from('ai_usage_limits')
    .select('ai_suggestions_default_enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const v = (data as { ai_suggestions_default_enabled?: boolean } | null)?.ai_suggestions_default_enabled;
  return typeof v === 'boolean' ? v : DEFAULT_SUGGESTIONS_ENABLED;
}

/** Read the user's tristate override (null = follow the default). */
async function readUserOverride(
  svc: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<boolean | null> {
  const { data } = await svc
    .from('user_ai_preferences')
    .select('suggestions_enabled')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  const v = (data as { suggestions_enabled?: boolean | null } | null)?.suggestions_enabled;
  return typeof v === 'boolean' ? v : null;
}

/** Effective value + the override/default breakdown (for the GET API). */
export async function resolveSuggestionsPref(
  svc: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<SuggestionsPrefBreakdown> {
  const [userOverride, workspaceDefault] = await Promise.all([
    readUserOverride(svc, workspaceId, userId),
    readWorkspaceDefault(svc, workspaceId),
  ]);
  return {
    effective: userOverride ?? workspaceDefault,
    userOverride,
    workspaceDefault,
  };
}

/** Just the effective boolean — the gate the panel reads. */
export async function getSuggestionsEnabled(
  svc: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { effective } = await resolveSuggestionsPref(svc, workspaceId, userId);
  return effective;
}
