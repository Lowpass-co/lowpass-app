/* /api/tours/[id]/advance/[routingId]/request — Request from venue.
   POST  { recipientName?, recipientEmail?, askFields?: string[] | null }
         → a fresh venue link for this show (no automatic emails to the venue:
           you send it from your own inbox). askFields limits the form to those
           questions ("<section>:<field>"), e.g. only what's still missing.
   PATCH { linkId, sent: true } → marks it sent (Open in Gmail / Copy email). */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { generateToken } from '@/lib/rider-packs/web-links';
import { buildIntakeFormSchema, isEmptyAnswer } from '@/lib/advance/intake';
import { loadAdvanceShow } from '@/server/advance/show';
import { ensureAdvance } from '@/server/advance/ensure';
import { loadAdvanceSections } from '@/server/advance/advanceSections';
import { advanceError, readJson, tourGate } from '@/server/advance/routeGuard';

type Params = { params: Promise<{ id: string; routingId: string }> };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET — what a request for this show would ask, and who to: the questions a
 *  venue can answer (with which are already answered), the last recipient. */
export async function GET(_request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const client = supabase as unknown as SupabaseClient;
  try {
    const show = await loadAdvanceShow(client, tourId, routingId);
    if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    const schema = buildIntakeFormSchema(show.allSections);
    const contacts = Object.values(show.data).flatMap((v) => (Array.isArray((v as Record<string, unknown>)?.contacts) ? ((v as Record<string, unknown>).contacts as { first_name?: string; email?: string; role?: string }[]) : []));
    const withEmail = contacts.find((c) => c.email && /production|pm|tech/i.test(c.role ?? '')) ?? contacts.find((c) => c.email) ?? null;
    return NextResponse.json({
      show: { date: show.routing.date, venue: show.venue.name, city: show.venue.city, artist: show.tour.artistName },
      sections: schema.sections.map((s) => ({
        template_id: s.template_id,
        label: s.label,
        fields: s.fields.map((f) => ({ id: f.id, label: f.label, answered: !isEmptyAnswer(show.data[s.template_id]?.[f.id]) })),
      })),
      tmOnly: show.sections.filter((s) => s.tm_only).map((s) => s.label),
      recipient: {
        name: show.request.recipientName ?? withEmail?.first_name ?? '',
        email: show.request.recipientEmail ?? withEmail?.email ?? '',
      },
      request: { kind: show.request.kind, label: show.request.label },
    });
  } catch (e) {
    return advanceError(e);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ recipientName?: unknown; recipientEmail?: unknown; askFields?: unknown }>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const name = typeof body.recipientName === 'string' ? body.recipientName.trim().slice(0, 120) : '';
  const email = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim().slice(0, 200) : '';
  if (email && !EMAIL.test(email)) return NextResponse.json({ error: 'That email address doesn’t look right' }, { status: 400 });
  const client = supabase as unknown as SupabaseClient;
  try {
    const adv = await ensureAdvance(client, tourId, routingId, auth.user.id);
    const schema = buildIntakeFormSchema(await loadAdvanceSections(client, adv.formConfigId));
    const askable = new Set(schema.sections.flatMap((s) => s.fields.map((f) => `${s.template_id}:${f.id}`)));
    let askFields: string[] | null = null;
    if (Array.isArray(body.askFields)) {
      askFields = body.askFields.filter((k): k is string => typeof k === 'string' && askable.has(k));
      if (!askFields.length) return NextResponse.json({ error: 'Pick at least one question the venue can answer' }, { status: 400 });
      if (askFields.length === askable.size) askFields = null;
    }
    if (!askable.size) return NextResponse.json({ error: 'This day has no questions a venue can answer yet' }, { status: 400 });
    const { data: link, error } = await client
      .from('advance_intake_links')
      .insert({
        workspace_id: auth.workspaceId,
        tour_id: tourId,
        routing_id: routingId,
        advance_instance_id: adv.instanceId,
        token: generateToken(),
        recipient_name: name || null,
        recipient_email: email || null,
        ask_fields: askFields,
        created_by: auth.user.id,
      })
      .select('id, token, created_at')
      .single<{ id: string; token: string; created_at: string }>();
    if (error || !link) throw new Error(error?.message ?? 'Could not make the link');
    return NextResponse.json({ link: { ...link, path: `/advance-intake/${link.token}` }, questions: askFields?.length ?? askable.size }, { status: 201 });
  } catch (e) {
    return advanceError(e);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ linkId?: unknown; sent?: unknown }>(request);
  if (!body || typeof body.linkId !== 'string' || body.sent !== true) {
    return NextResponse.json({ error: 'linkId and sent: true are required' }, { status: 400 });
  }
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from('advance_intake_links')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', body.linkId)
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .is('sent_at', null)
    .select('id, sent_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: (data ?? []).length });
}
