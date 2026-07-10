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
  type IntakeSection,
  type AdvanceData,
} from '@/lib/advance/intake';
import { flattenToPending } from '@/lib/advance/intake-pending';
import { markVenueCompleted } from '@/lib/intake/reminders-server';

export const dynamic = 'force-dynamic';

interface LinkRow {
  id: string;
  workspace_id: string;
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
    prefill?: Record<string, Record<string, string>>;
    /** Per-field autosave (Checkpoint D): store pending WITHOUT marking the link
     *  submitted / firing the TM notification. The final "Finish" sends draft=false. */
    draft?: boolean;
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
    .select('id, workspace_id, routing_id, advance_instance_id, status, expires_at, revoked_at')
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

  // Q7 STORE-PENDING: sanitise against the live schema, then store the answers as
  // PENDING rows — do NOT merge into advance_instances.data here. The TM reviews
  // them (ChangeReviewQueue) and mergeIntakeIntoAdvance runs at ACCEPT-time.
  const schema = buildIntakeFormSchema(instance.sections);
  const clean = sanitizeSubmission(schema, rawData);
  const pending = flattenToPending(clean);

  const nowIso = new Date().toISOString();

  // Checkpoint B — an unedited confirmed proposal submits as source='prefill'
  // (with its provenance); everything else is source='venue'.
  const prefillMap = body.prefill && typeof body.prefill === 'object' ? body.prefill : {};
  if (pending.length > 0) {
    const rows = pending.map((p) => {
      const prov = prefillMap[p.section_id]?.[p.field_id];
      const isPrefill = typeof prov === 'string' && prov.length > 0;
      return {
        workspace_id: link.workspace_id,
        advance_instance_id: instanceId,
        link_id: link.id,
        section_id: p.section_id,
        field_id: p.field_id,
        value: p.value,
        source: isPrefill ? 'prefill' : 'venue',
        provenance: isPrefill ? prov : null,
        status: 'pending',
        reviewed_at: null,
        reviewed_by: null,
      };
    });
    const { error: pErr } = await service
      .from('intake_pending_answers')
      .upsert(rows, { onConflict: 'advance_instance_id,section_id,field_id,source' });
    if (pErr) {
      return NextResponse.json(
        { error: 'Could not save your answers. Please try again.' },
        { status: 500 },
      );
    }
  }

  // Draft autosave keeps the snapshot current but never flips the link to
  // 'submitted' (the TM-notification signal). The final Finish (draft=false) does.
  const linkUpdate: Record<string, unknown> = {
    submitted_data: clean,
    advance_instance_id: instanceId,
  };
  if (!body.draft) {
    linkUpdate.status = 'submitted';
    linkUpdate.submitted_at = nowIso;
    linkUpdate.submitted_by_name = submitterName;
    linkUpdate.submitted_by_email = submitterEmail;
  }
  await service.from('advance_intake_links').update(linkUpdate).eq('id', link.id);

  // Final submit → queue the one "venue completed" note to the TM. The same
  // cron + sent_at guard sends it once; a draft autosave never queues it.
  if (!body.draft) {
    await markVenueCompleted(service, {
      linkId: link.id,
      workspaceId: link.workspace_id,
      nowIso,
    });
  }

  return NextResponse.json({ ok: true });
}
