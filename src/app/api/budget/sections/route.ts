/* ============================================
   LOWPASS — Budget Sections API (Budget redesign Phase A/C)

   Per-tour, user-defined section headers (budget_sections).
   GET    ?tour_id=uuid       — list sections for a tour (sort_order)
   POST   { tour_id, name }   — create a section (sort_order = max+1)
   PATCH  { id, name?, sort_order? } — rename / reorder
   DELETE ?id=uuid (or body)  — delete; lines' section_id → NULL via FK.
                                Refused: 404 not yours, 409 VERSION_LOCKED
                                (approved budget), 409 DERIVED_LINES (holds
                                automatic lines — reconcile files them
                                there), 403 when RLS lets you read but not
                                delete (it used to answer 204 for that).

   Workspace-scoped throughout (RLS + explicit workspace_id filter).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  isSingletonSectionKind,
  normalizeSectionKind,
} from '@/lib/budget/sectionKinds';
import { planSectionDelete } from '@/lib/budget/rowDelete';
import { resolveLockState } from '@/server/budget/versions';
import type { BudgetLineItem } from '@/types';

async function resolveWorkspace() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }
  return { supabase, workspaceId: profile.workspace_id as string };
}

export async function GET(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('budget_sections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('tour_id', tourId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sections: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;

  let body: {
    tour_id?: string;
    name?: string;
    sort_order?: number;
    kind?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const tourId = body.tour_id;
  const name = (body.name ?? '').trim();
  if (!tourId || !name) {
    return NextResponse.json(
      { error: 'tour_id and name are required' },
      { status: 400 },
    );
  }
  // Phase 3 — locked formula section kind (default 'custom'). Unknown
  // values normalise to 'custom' so a bad client can't write a stray kind.
  const kind = normalizeSectionKind(body.kind);

  // Confirm the tour is in this workspace before writing.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let sortOrder = body.sort_order;
  if (sortOrder == null || !Number.isFinite(Number(sortOrder))) {
    const { data: maxRow } = await supabase
      .from('budget_sections')
      .select('sort_order')
      .eq('workspace_id', workspaceId)
      .eq('tour_id', tourId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = Number(maxRow?.sort_order ?? -1) + 1;
  }

  const baseRow = {
    tour_id: tourId,
    workspace_id: workspaceId,
    name,
    sort_order: Math.max(0, Math.floor(Number(sortOrder))),
  };

  let { data, error } = await supabase
    .from('budget_sections')
    .insert({ ...baseRow, kind })
    .select()
    .maybeSingle();

  // Phase 3 — resilience: if migration 203 (the `kind` column) hasn't been
  // applied yet, Postgres/PostgREST reject the unknown column (42703 /
  // PGRST204). Fall back to a plain insert so custom sections still work;
  // formula kinds genuinely need the migration, so surface that.
  if (
    error &&
    (error.code === '42703' || error.code === 'PGRST204') &&
    /kind/i.test(error.message)
  ) {
    if (isSingletonSectionKind(kind)) {
      return NextResponse.json(
        { error: 'Formula sections require migration 203 — run npm run db:migrate.' },
        { status: 409 },
      );
    }
    ({ data, error } = await supabase
      .from('budget_sections')
      .insert(baseRow)
      .select()
      .maybeSingle());
  }

  if (error) {
    // The partial unique index (one formula section per kind per tour)
    // surfaces as 23505. Translate to a friendly 409.
    if (error.code === '23505' && isSingletonSectionKind(kind)) {
      return NextResponse.json(
        { error: `This tour already has ${kind === 'income' ? 'an Other income' : `a ${kind}`} section.` },
        { status: 409 },
      );
    }
    // Migration 274 adds 'income' to budget_sections_kind_check; before it is
    // pasted the insert fails the CHECK (23514).
    if (error.code === '23514' && kind === 'income') {
      return NextResponse.json(
        { error: 'Other income needs migration 274 — paste it into the Supabase SQL Editor.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    // BUD-15 disease — never let an RLS-filtered insert throw "no rows".
    return NextResponse.json({ error: 'Insert returned no row' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

  let body: { id?: string; name?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    payload.name = name;
  }
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) {
    payload.sort_order = Math.max(0, Math.floor(Number(body.sort_order)));
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  // maybeSingle so a 0-row update (deleted / RLS-filtered) returns null
  // instead of throwing "Cannot coerce the result to a single JSON object".
  const { data, error } = await supabase
    .from('budget_sections')
    .update(payload)
    .eq('id', body.id)
    .eq('workspace_id', workspaceId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

  const { searchParams } = new URL(request.url);
  let id = searchParams.get('id');
  if (!id) {
    try {
      const body = (await request.json()) as { id?: string };
      id = body.id ?? null;
    } catch {
      // no body — fall through to the missing-id error
    }
  }
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data: section, error: readErr } = await supabase
    .from('budget_sections')
    .select('id, tour_id, name')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }
  const tourId = (section as { tour_id: string }).tour_id;

  // An approved & locked budget refuses structure changes, like adding or
  // deleting a line does.
  const { locked, version } = await resolveLockState(supabase, tourId, workspaceId);
  if (locked) {
    return NextResponse.json(
      { error: 'This budget is approved & locked.', code: 'VERSION_LOCKED', versionId: version?.id ?? null },
      { status: 409 },
    );
  }

  // Automatic lines are filed by reconcile — the same rule the grid applies
  // before asking (planSectionDelete).
  const { data: lines, error: linesErr } = await supabase
    .from('budget_line_items')
    .select('id, section_id, source_entity_type, hotel_id, room_id, flight_id, gear_id, tour_gear_id')
    .eq('section_id', id)
    .eq('workspace_id', workspaceId);
  if (linesErr) {
    return NextResponse.json({ error: linesErr.message }, { status: 500 });
  }
  const plan = planSectionDelete(id, (lines ?? []) as unknown as BudgetLineItem[]);
  if (plan.auto.length) {
    const sources = [...new Set(plan.auto.map((a) => a.source))].join(', ');
    return NextResponse.json(
      {
        error: `“${(section as { name: string }).name}” holds automatic rows (${sources}) — Lowpass files them there, so it can’t be deleted.`,
        code: 'DERIVED_LINES',
      },
      { status: 409 },
    );
  }

  // Lines pointing at this section have section_id reset to NULL by the
  // FK (ON DELETE SET NULL) — they fall into "Uncategorised", not deleted.
  const { data: gone, error } = await supabase
    .from('budget_sections')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!gone?.length) {
    // RLS let us read it but not delete it (a view-only member).
    return NextResponse.json({ error: 'You can’t change this budget.' }, { status: 403 });
  }
  return new Response(null, { status: 204 });
}
