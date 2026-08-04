/* ============================================
   LOWPASS — POST /api/rider-packs/[id]/assign-to-tour
   (Sprint 12 §7)

   Instantiates an artist-scope rider_packs row as a fresh
   tour-scope copy. Used by /artists/[id]/{riders,channel-
   lists} when the operator picks a tour from the
   AssignToTourDialog.

   Server-side flow (RLS-gated by the caller's session):

     1. Look up the source pack. Must be scope='artist' AND
        same workspace as the caller. 404 otherwise.
     2. Look up the target tour. Must be the same workspace
        AND owned by the same artist as the source. 400
        otherwise.
     3. If a tour-scope pack already exists at this
        (artist, tour, kind) tuple with inherit_from_folder_id
        matching the source's folder, return 409. The operator
        should use the propagate-modal in §7.1 to refresh it
        instead of double-assigning.
     4. Create rider_folders row (scope='tour', tour_id, kind-
        agnostic — kind lives on the pack). inherit_from_
        folder_id points at the source's folder so the audit
        chain is intact.
     5. Create rider_packs row (folder_id=new folder, scope=
        'tour', same kind as source, propagated_from_template_
        at=now()).
     6. Copy rider_sections rows. The pack_id is remapped to
        the new pack id; section_key + title + sort_order +
        fields + section_type are preserved verbatim.

   NOT copied in v1:
     - sub_snakes / stage_boxes / channel_list_rows (only
       relevant when the pack contains channel_list sections;
       follows the same iteration pattern as
       /api/rider-packs/clone and lands in §7.1 alongside the
       propagate modal).
     - linked_rider_pack_id (set to NULL on the new tour pack
       — the operator can re-link from the editor to point at
       the matching tour-scope tech rider, if one exists).

   Failure handling: any step after the folder insert rolls
   back the folder (and its pack via FK CASCADE) before
   returning the error.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

interface SourcePackRow {
  id: string;
  workspace_id: string;
  artist_id: string;
  scope: string;
  kind: string | null;
  title: string | null;
  folder_id: string | null;
}

interface TourRow {
  id: string;
  workspace_id: string;
  artist_id: string;
  name: string;
}

interface SectionRow {
  id: string;
  pack_id: string;
  section_key: string;
  title: string;
  sort_order: number;
  fields: unknown;
  section_type: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tour_id?: string };
  try {
    body = (await request.json()) as { tour_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const tourId = body.tour_id;
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  /* 1. Look up source pack. RLS scopes by workspace, so a
        missing row could mean the id doesn't exist OR isn't in
        the caller's workspace — surface as 404 either way. */
  const { data: srcData, error: srcErr } = await supabase
    .from('rider_packs')
    .select('id, workspace_id, artist_id, scope, kind, title, folder_id')
    .eq('id', id)
    .maybeSingle();
  if (srcErr) {
    return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }
  const source = srcData as SourcePackRow | null;
  if (!source) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (source.scope !== 'artist') {
    return NextResponse.json(
      { error: 'Source pack must be artist-scope to assign to a tour' },
      { status: 400 },
    );
  }
  if (!source.folder_id) {
    return NextResponse.json(
      { error: 'Source pack is missing folder_id — data integrity issue' },
      { status: 500 },
    );
  }

  /* 2. Look up tour. Verify same artist + same workspace. */
  const { data: tourData, error: tourErr } = await supabase
    .from('tours')
    .select('id, workspace_id, artist_id, name')
    .eq('id', tourId)
    .maybeSingle();
  if (tourErr) {
    return NextResponse.json({ error: tourErr.message }, { status: 500 });
  }
  const tour = tourData as TourRow | null;
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  if (tour.workspace_id !== source.workspace_id) {
    return NextResponse.json(
      { error: 'Tour and template belong to different workspaces' },
      { status: 400 },
    );
  }
  if (tour.artist_id !== source.artist_id) {
    return NextResponse.json(
      { error: 'Tour is not owned by the template artist' },
      { status: 400 },
    );
  }

  const kind = source.kind ?? 'rider';

  /* 3. Duplicate guard. Check for an existing tour-scope pack
        that already inherits from this template's folder. */
  const { data: existingFolder } = await supabase
    .from('rider_folders')
    .select('id')
    .eq('artist_id', source.artist_id)
    .eq('tour_id', tour.id)
    .eq('scope', 'tour')
    .eq('inherit_from_folder_id', source.folder_id)
    .maybeSingle();
  if (existingFolder) {
    return NextResponse.json(
      {
        error: 'This template is already assigned to that tour. Use the propagate flow to refresh it.',
        code: 'ALREADY_ASSIGNED',
      },
      { status: 409 },
    );
  }

  /* 4. Create the tour-scope folder. */
  const { data: folder, error: folderErr } = await supabase
    .from('rider_folders')
    .insert({
      workspace_id: source.workspace_id,
      artist_id: source.artist_id,
      scope: 'tour',
      tour_id: tour.id,
      routing_id: null,
      title: source.title,
      inherit_from_folder_id: source.folder_id,
    })
    .select('id')
    .single();
  if (folderErr || !folder) {
    return NextResponse.json(
      { error: folderErr?.message ?? 'Failed to create folder' },
      { status: 500 },
    );
  }
  const newFolderId = folder.id as string;

  async function rollback() {
    /* rider_packs CASCADE deletes on folder removal, so wiping
       the folder is enough to undo any partial state. */
    await supabase.from('rider_folders').delete().eq('id', newFolderId);
  }

  /* 5. Create the tour-scope pack. */
  const { data: newPack, error: packErr } = await supabase
    .from('rider_packs')
    .insert({
      workspace_id: source.workspace_id,
      folder_id: newFolderId,
      scope: 'tour',
      artist_id: source.artist_id,
      tour_id: tour.id,
      routing_id: null,
      title: source.title,
      kind,
      created_by: user.id,
      propagated_from_template_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (packErr || !newPack) {
    await rollback();
    return NextResponse.json(
      { error: packErr?.message ?? 'Failed to create pack' },
      { status: 500 },
    );
  }
  const newPackId = newPack.id as string;

  /* 6. Deep-copy rider_sections. */
  const { data: sectionRows, error: secErr } = await supabase
    .from('rider_sections')
    .select('id, pack_id, section_key, title, sort_order, fields, section_type')
    .eq('pack_id', source.id)
    .order('sort_order');
  if (secErr) {
    await rollback();
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }
  const sections = (sectionRows ?? []) as SectionRow[];
  if (sections.length > 0) {
    const insertRows = sections.map((s) => ({
      pack_id: newPackId,
      section_key: s.section_key,
      title: s.title,
      sort_order: s.sort_order,
      fields: s.fields ?? [],
      section_type: s.section_type === 'channel_list' ? 'channel_list' : 'fields',
    }));
    const { error: secInsertErr } = await supabase
      .from('rider_sections')
      .insert(insertRows);
    if (secInsertErr) {
      await rollback();
      return NextResponse.json({ error: secInsertErr.message }, { status: 500 });
    }
  }

  /* History audit so the editor's change-log surface picks up
     the assignment as the originating event for the new pack. */
  await appendHistory(supabase, {
    packId: newPackId,
    changedBy: user.id,
    changeType: 'pack.assigned_from_template',
    newValue: {
      template_pack_id: source.id,
      template_folder_id: source.folder_id,
      tour_id: tour.id,
      tour_name: tour.name,
      kind,
      sections_copied: sections.length,
    },
  });

  return NextResponse.json(
    {
      id: newPackId,
      folder_id: newFolderId,
      tour_id: tour.id,
      tour_name: tour.name,
      sections_copied: sections.length,
    },
    { status: 201 },
  );
}
