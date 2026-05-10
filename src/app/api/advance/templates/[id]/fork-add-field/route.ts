/* ============================================
   LOWPASS — Sprint 8.6 §6 — workspace template fork API

   POST /api/advance/templates/[id]/fork-add-field

   When the user adds a custom field to a platform-template
   section in the canvas, this route forks the platform template
   into a workspace-scoped copy with the new field appended.
   Future tours in the workspace will see the workspace fork in
   the library instead of the platform original (the library API
   filters out platform templates that have a workspace fork —
   one entry per logical section).

   Request body:
     { field: { id, label, type, required } }

   Server logic:
     1. Look up the platform template by [id].
     2. Check if workspace already has a fork:
        SELECT * FROM advance_templates
         WHERE workspace_id = $w AND forked_from_id = $platformId
     3. If fork exists: append field to its fields JSONB.
     4. If not: INSERT new template with workspace_id=$w,
        forked_from_id=$platformId, name+icon copied, fields =
        [...platform.fields, field].

   Returns the (new or updated) workspace template.

   Sprint 8.6 §5 — the contact-only-in-Key-Contacts CHECK
   constraint applies here too. Attempting to add a 'contact'
   field to a non-Key-Contacts fork will reject at the DB layer.

   Sprint 8.6 §6 — existing tours' sections are NOT
   retroactively updated. Only future tours that drag the
   section from the library will get the new field. Existing
   advance instances retain their snapshot copy of the section
   structure. Adam's UX warning text emphasizes this: "Future
   Hospitality sections only — existing ones won't change."
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface FieldDef {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  [key: string]: unknown;
}

type ApiTemplate = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  fields: FieldDef[];
  forked_from_id: string | null;
};

async function getWorkspaceId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  return (profile as { workspace_id?: string } | null)?.workspace_id ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: templateId } = await params;

  let body: { field?: FieldDef };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const field = body.field;
  if (
    !field ||
    typeof field.id !== 'string' ||
    typeof field.label !== 'string' ||
    typeof field.type !== 'string'
  ) {
    return NextResponse.json(
      { error: 'field.id, field.label, field.type required' },
      { status: 400 },
    );
  }

  // 1. Fetch the template being forked. Could be platform
  // (workspace_id NULL) or a workspace template that the user
  // is extending further. Both supported.
  const { data: source, error: sourceErr } = await supabase
    .from('advance_templates')
    .select('id, workspace_id, name, description, icon, fields, forked_from_id')
    .eq('id', templateId)
    .maybeSingle();

  if (sourceErr || !source) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  const sourceTemplate = source as ApiTemplate;

  // The platform parent ID — for chaining: if the source IS
  // already a workspace fork, the forked_from_id points to the
  // platform original; reuse that as the new fork's parent.
  // If source is platform, source.id is the parent.
  // If source is a workspace original (no platform parent),
  // the new fork's forked_from_id will be source.id.
  const platformParentId = sourceTemplate.forked_from_id ?? sourceTemplate.id;

  // 2. Check if the workspace already has a fork of this
  // platform template.
  const { data: existingFork } = await supabase
    .from('advance_templates')
    .select('id, fields')
    .eq('workspace_id', workspaceId)
    .eq('forked_from_id', platformParentId)
    .limit(1)
    .maybeSingle();

  if (existingFork) {
    // 3. Update the existing fork — append field.
    const existing = existingFork as { id: string; fields: FieldDef[] };
    const existingFields = Array.isArray(existing.fields) ? existing.fields : [];
    // Reject duplicate field IDs.
    if (existingFields.some((f) => f.id === field.id)) {
      return NextResponse.json(
        { error: `Field id "${field.id}" already exists in this fork` },
        { status: 409 },
      );
    }
    const newFields = [...existingFields, field];

    const { data: updated, error: updErr } = await supabase
      .from('advance_templates')
      .update({ fields: newFields })
      .eq('id', existing.id)
      .select(
        'id, workspace_id, name, description, icon, fields, forked_from_id, sort_order',
      )
      .single();

    if (updErr) {
      // The Sprint 8.6 §5 CHECK constraint may reject contact
      // fields in non-Key-Contacts forks. Surface the message.
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }
    return NextResponse.json({ template: updated, action: 'extended' });
  }

  // 4. Create a new workspace fork. Copy fields from source +
  // append the new field.
  const sourceFields = Array.isArray(sourceTemplate.fields)
    ? sourceTemplate.fields
    : [];
  if (sourceFields.some((f) => f.id === field.id)) {
    return NextResponse.json(
      { error: `Field id "${field.id}" already exists in the source template` },
      { status: 409 },
    );
  }
  const newFields = [...sourceFields, field];

  const { data: inserted, error: insErr } = await supabase
    .from('advance_templates')
    .insert({
      workspace_id: workspaceId,
      template_type: 'section',
      name: sourceTemplate.name,
      description: sourceTemplate.description,
      icon: sourceTemplate.icon,
      fields: newFields,
      forked_from_id: platformParentId,
    })
    .select(
      'id, workspace_id, name, description, icon, fields, forked_from_id, sort_order',
    )
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }
  return NextResponse.json({ template: inserted, action: 'forked' });
}
