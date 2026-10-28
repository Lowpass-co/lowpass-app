/* POST /api/tours/[id]/advance/[routingId]/answers
   { changes: { <section>: { <field>: value } }, sources?: { "<section>:<field>": source | null } }
   Starts the advance from its template on the first write, checks every change
   targets a real question on the day, then merges in one statement. */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { ensureAdvance } from '@/server/advance/ensure';
import { loadAdvanceSections } from '@/server/advance/advanceSections';
import { mergeAnswers, validateChanges, type AnswerChanges, type SourceChanges } from '@/server/advance/answers';
import { advanceError, readJson, tourGate } from '@/server/advance/routeGuard';
import type { AdvSection } from '@/lib/advance/board';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; routingId: string }> }) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ changes?: unknown; sources?: unknown }>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const client = supabase as unknown as SupabaseClient;
  try {
    const adv = await ensureAdvance(client, tourId, routingId, auth.user.id);
    const sections = (await loadAdvanceSections(client, adv.formConfigId)) as unknown as AdvSection[];
    const bad = validateChanges(sections, body.changes, body.sources);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const out = await mergeAnswers(client, adv.instanceId, body.changes as AnswerChanges, (body.sources ?? {}) as SourceChanges);
    return NextResponse.json({ instanceId: adv.instanceId, ...out });
  } catch (e) {
    return advanceError(e);
  }
}
