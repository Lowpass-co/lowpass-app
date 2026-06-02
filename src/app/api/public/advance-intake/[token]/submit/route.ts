/* ============================================
   LOWPASS — Public Advance Intake · submit (T3)

   POST /api/public/advance-intake/[token]/submit
     { data: { sectionId: { fieldId: value } }, submitterName?, submitterEmail? }

   Token-gated, unauthenticated. The venue's answers are sanitised
   against the live form schema (no arbitrary keys), merged back into
   the show's advance_instances.data (venue authoritative for answered
   fields; blanks never clobber), and the link is marked submitted with
   the raw answers retained for audit. Service-role client.

   Notifies the TM: setting submitted_at + status='submitted' is the
   queue signal the 5-minute cron (dispatchPendingNotifications →
   processAdvanceIntakeRows) reads to email the link's creator once.
   Dedup via advance_intake_links.notification_email_sent_to (migration
   108) — no inline send here.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import {
  buildIntakeFormSchema,
  sanitizeSubmission,
  mergeIntakeIntoAdvance,
  type IntakeSection,
  type AdvanceData,
} from '@/lib/advance/intake';

export const dynamic = 'force-dynamic';

interface LinkRow {
  id: string;
  routing_id: string;
  advance_instance_id: string | null;
  status: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  let body: {
    data?: unknown;
    submitterName?: unknown;
    submitterEmail?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const rawData =
    body.data && typeof body.data === 'object'
      ? (body.data as AdvanceData)
      : {};
  const submitterName =
    typeof body.submitterName === 'string' && body.submitterName.trim()
      ? body.submitterName.trim().slice(0, 200)
      : null;
  const submitterEmail =
    typeof body.submitterEmail === 'string' && body.submitterEmail.trim()
      ? body.submitterEmail.trim().slice(0, 200)
      : null;

  const service = createServiceSupabaseClient();
  const { data: link } = await service
    .from('advance_intake_links')
    .select('id, routing_id, advance_instance_id, status, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle<LinkRow>();

  if (!link || link.revoked_at || link.status === 'revoked') {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  }

  // Resolve the write-back instance (prefer the stored id, fall back to
  // routing_id in case the advance was initialised after link creation).
  let instanceId = link.advance_instance_id;
  let instanceQuery = service
    .from('advance_instances')
    .select('id, sections, data');
  instanceQuery = instanceId
    ? instanceQuery.eq('id', instanceId)
    : instanceQuery.eq('routing_id', link.routing_id);
  const { data: instance } = await instanceQuery.maybeSingle<{
    id: string;
    sections: IntakeSection[] | null;
    data: AdvanceData | null;
  }>();

  if (!instance) {
    return NextResponse.json(
      { error: 'This show is not ready to receive submissions yet.' },
      { status: 409 },
    );
  }
  instanceId = instance.id;

  // Sanitise against the live schema, then merge.
  const schema = buildIntakeFormSchema(instance.sections);
  const clean = sanitizeSubmission(schema, rawData);
  const merged = mergeIntakeIntoAdvance(instance.data, clean);

  const nowIso = new Date().toISOString();

  const { error: writeErr } = await service
    .from('advance_instances')
    .update({ data: merged, last_updated_at: nowIso })
    .eq('id', instanceId);
  if (writeErr) {
    return NextResponse.json(
      { error: 'Could not save your answers. Please try again.' },
      { status: 500 },
    );
  }

  await service
    .from('advance_intake_links')
    .update({
      status: 'submitted',
      submitted_at: nowIso,
      submitted_data: clean,
      submitted_by_name: submitterName,
      submitted_by_email: submitterEmail,
      // keep the link's stored target current if it was resolved by routing
      advance_instance_id: instanceId,
    })
    .eq('id', link.id);

  return NextResponse.json({ ok: true });
}
