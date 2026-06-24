/* ============================================
   LOWPASS — AI suggestions preference API

   GET   → { suggestions_enabled, user_override, workspace_default }
           the resolved effective value for the current user plus the
           breakdown the UI shows (all three states).
   PATCH → { suggestions_enabled: boolean | null } upserts the caller's
           own user_ai_preferences row (null reverts to the workspace
           default).

   No Anthropic call here — this is preference plumbing, not metering.
   The user_id is always taken from the session, never the body; RLS
   already restricts writes to the caller's own row (migration 210).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { resolveSuggestionsPref } from '@/lib/ai/suggestions-pref';

async function getSession() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }
  return { userId: user.id, workspaceId: profile.workspace_id as string };
}

export async function GET() {
  const session = await getSession();
  if ('error' in session) return session.error;

  const svc = createServiceSupabaseClient();
  const { effective, userOverride, workspaceDefault } = await resolveSuggestionsPref(
    svc,
    session.workspaceId,
    session.userId,
  );
  return NextResponse.json({
    suggestions_enabled: effective,
    user_override: userOverride,
    workspace_default: workspaceDefault,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if ('error' in session) return session.error;

  let body: { suggestions_enabled?: boolean | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const value = body.suggestions_enabled;
  if (value !== true && value !== false && value !== null) {
    return NextResponse.json(
      { error: 'suggestions_enabled must be true, false, or null' },
      { status: 400 },
    );
  }

  // Write via the user-session client so RLS enforces the self-write
  // policy; user_id comes from the session, never the body.
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('user_ai_preferences').upsert(
    {
      workspace_id: session.workspaceId,
      user_id: session.userId,
      suggestions_enabled: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,user_id' },
  );
  if (error) {
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 });
  }

  const svc = createServiceSupabaseClient();
  const { effective, userOverride, workspaceDefault } = await resolveSuggestionsPref(
    svc,
    session.workspaceId,
    session.userId,
  );
  return NextResponse.json({
    suggestions_enabled: effective,
    user_override: userOverride,
    workspace_default: workspaceDefault,
  });
}
