/* ============================================
   LOWPASS — POST /api/tours/[id]/routing/import — write approved import days

   The last step of the AI schedule import (Oct 2026). Body:
     { days: [{ date, fields: { day_type?, venue_name?, city?, country?,
                                address?, notes? } }] }
   — exactly what the review panel approved (toApplyDays), nothing else.

   MERGE-ONLY. The Schedule's own save (POST ../routing) replaces the whole
   day list and deletes any date not in it; this route never deletes. Each
   date is updated in place (routing.id kept, so its advance, income, files
   and budget links survive) or inserted if new. Only the fields sent change.

   If an approved day falls outside the tour's dates, the tour's start/end
   widen to include it — otherwise the Schedule (one row per date between
   start and end) wouldn't show it, and its next save would delete it.

   A day whose venue NAME changes loses its library-venue link (the link
   would keep showing the old venue). Budget lines that follow day types are
   refreshed afterwards (withDerivedRefresh), like the Schedule's own save.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { tourFromParams, withDerivedRefresh } from '@/server/budget/withDerivedRefresh';
import { IMPORT_FIELDS, isRealDate, normaliseDayType, rangeToCover, type ImportField } from '@/lib/import/scheduleImport';

const MAX_DAYS = 400;
const LIMIT: Record<ImportField, number> = { day_type: 60, venue_name: 160, city: 120, country: 80, address: 300, notes: 4000 };

async function postHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { user, workspaceId } = auth;
  const { id: tourId } = await params;

  const { data: tour } = await supabase
    .from('tours')
    .select('id, start_date, end_date')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  let body: { days?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const raw = Array.isArray(body.days) ? (body.days as Array<{ date?: unknown; fields?: unknown }>) : [];
  if (!raw.length) return NextResponse.json({ error: 'No days to import' }, { status: 400 });
  if (raw.length > MAX_DAYS) return NextResponse.json({ error: `At most ${MAX_DAYS} days at once` }, { status: 400 });

  // Validate: real dates, known fields, strings within limits, one entry per date.
  const byDate = new Map<string, Partial<Record<ImportField, string>>>();
  for (const d of raw) {
    const date = String(d?.date ?? '');
    if (!isRealDate(date)) return NextResponse.json({ error: `Not a real date: ${date.slice(0, 20)}` }, { status: 400 });
    const f = (d?.fields ?? {}) as Record<string, unknown>;
    const clean: Partial<Record<ImportField, string>> = {};
    for (const k of Object.keys(f)) {
      if (!(IMPORT_FIELDS as readonly string[]).includes(k)) {
        return NextResponse.json({ error: `Unknown field: ${k}` }, { status: 400 });
      }
      const field = k as ImportField;
      const v = String(f[k] ?? '').trim().slice(0, LIMIT[field]);
      if (!v) continue;
      clean[field] = field === 'day_type' ? normaliseDayType(v) || v.toLowerCase() : v;
    }
    if (Object.keys(clean).length) byDate.set(date, { ...(byDate.get(date) ?? {}), ...clean });
  }
  if (!byDate.size) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  const dates = [...byDate.keys()].sort();
  const t = tour as { start_date: string | null; end_date: string | null };

  // Widen the tour first, so the Schedule shows every imported day.
  const widen = rangeToCover(dates, t.start_date, t.end_date);
  if (widen.start || widen.end) {
    const patch: Record<string, string> = {};
    if (widen.start) patch.start_date = widen.start;
    if (widen.end) patch.end_date = widen.end;
    const { error } = await supabase.from('tours').update(patch).eq('id', tourId).eq('workspace_id', workspaceId);
    if (error) return NextResponse.json({ error: `Couldn't extend the tour dates: ${error.message}` }, { status: 500 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('routing')
    .select('id, date, venue_name')
    .eq('tour_id', tourId)
    .in('date', dates);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  const existingByDate = new Map(
    ((existing ?? []) as Array<{ id: string; date: string; venue_name: string | null }>).map((r) => [String(r.date).slice(0, 10), r]),
  );

  let updated = 0;
  const inserts: Array<Record<string, unknown>> = [];
  for (const date of dates) {
    const fields = byDate.get(date)!;
    const ex = existingByDate.get(date);
    if (ex) {
      const patch: Record<string, unknown> = { ...fields };
      if (fields.venue_name !== undefined && (ex.venue_name ?? '').trim().toLowerCase() !== fields.venue_name.toLowerCase()) {
        patch.canonical_venue_id = null;
      }
      const { error } = await supabase.from('routing').update(patch).eq('id', ex.id).eq('tour_id', tourId);
      if (error) return NextResponse.json({ error: `${date}: ${error.message}`, updated }, { status: 500 });
      updated += 1;
    } else {
      inserts.push({
        tour_id: tourId,
        date,
        day_type: fields.day_type ?? '',
        city: fields.city ?? '',
        country: fields.country ?? null,
        address: fields.address ?? '',
        venue_name: fields.venue_name ?? null,
        notes: fields.notes ?? null,
        transport_to_next: 'default',
        sequence: 0,
      });
    }
  }
  let anchorId: string | null = existingByDate.values().next().value?.id ?? null;
  if (inserts.length) {
    const { data: ins, error } = await supabase.from('routing').insert(inserts).select('id');
    if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 });
    anchorId = anchorId ?? (ins as Array<{ id: string }> | null)?.[0]?.id ?? null;
  }

  // One audit row per import (the Schedule's "Last edit by …" line reads it).
  if (anchorId) {
    await supabase.from('audit_log').insert({
      workspace_id: workspaceId,
      actor_user_id: user.id,
      action: 'updated',
      entity_type: 'routing',
      entity_id: anchorId,
      field_changes: { tour_id: tourId, inserted: inserts.length, updated, source: 'ai_schedule_import' },
    }).then(() => undefined, () => undefined);
  }

  return NextResponse.json({
    inserted: inserts.length,
    updated,
    tourDates: widen.start || widen.end ? { start_date: widen.start ?? t.start_date, end_date: widen.end ?? t.end_date } : null,
  });
}

export const POST = withDerivedRefresh(postHandler, 'routing', tourFromParams);
