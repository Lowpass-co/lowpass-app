/* ============================================
   LOWPASS — POST /api/rider-packs/[id]/convert-section (decouple phase B1)

   One-click "Convert to attached document" for a rider's embedded (OWNED)
   channel_list section. Body: { section_id } →

     1. saveVersion(onlySectionId, kindOverride: 'channel_list', asRoot) —
        copies JUST that section (rows + sub-snakes + stage boxes) into a NEW
        standalone channel_list document that starts its own version family.
     2. attachDocument(…, { riderPackId: id }) — attaches it to this rider,
        which is what the tech section renders from now on.

   The original section is NOT deleted — the attachment takes precedence in
   the editor, and keeping the rows makes the conversion reversible by hand.
   Inherited sections are refused: their rows live on the PARENT pack, so a
   section-scoped copy of THIS pack would produce an empty document. Convert
   those at their owning scope.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { saveVersion } from '@/lib/rider-packs/saveVersion';
import { attachDocument } from '@/lib/rider-packs/attachments';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { section_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.section_id) return NextResponse.json({ error: 'section_id required' }, { status: 400 });

  // The section must be OWNED by this pack (an inherited section's rows live
  // on the parent — see header). saveVersion re-checks existence; this check
  // exists to return a message a human can act on.
  const { data: section } = await supabase
    .from('rider_sections')
    .select('id, title, section_type, pack_id')
    .eq('id', body.section_id)
    .eq('pack_id', id)
    .maybeSingle();
  if (!section) {
    return NextResponse.json(
      { error: 'Section not owned by this pack — inherited sections convert at the scope that owns them' },
      { status: 400 },
    );
  }
  if (section.section_type !== 'channel_list') {
    return NextResponse.json({ error: 'Only channel_list sections convert to documents' }, { status: 400 });
  }

  const label = (section.title as string | null)?.trim() || 'Channel list';
  const copy = await saveVersion(supabase, profile.workspace_id, user.id, id, label, {
    onlySectionId: body.section_id,
    kindOverride: 'channel_list',
    asRoot: true,
  });
  if (!copy.ok) return NextResponse.json({ error: copy.error }, { status: copy.status });

  const attach = await attachDocument(supabase, profile.workspace_id, user.id, copy.packId, {
    riderPackId: id,
  });
  if (!attach.ok) return NextResponse.json({ error: attach.error }, { status: attach.status });

  return NextResponse.json({ id: copy.packId, attachment_id: attach.id });
}
