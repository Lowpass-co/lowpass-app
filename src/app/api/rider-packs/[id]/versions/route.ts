/* ============================================
   LOWPASS — GET /api/rider-packs/[id]/versions (decouple phase A)
   All versions of this document's family: the root pack + every pack whose
   version_of_pack_id points at the root. Ordered root-first, then by name.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: pack, error } = await supabase
    .from('rider_packs')
    .select('id, version_of_pack_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rootId = (pack.version_of_pack_id as string | null) ?? pack.id;
  const { data: family, error: famErr } = await supabase
    .from('rider_packs')
    .select('id, title, kind, version_label, version_of_pack_id, updated_at')
    .or(`id.eq.${rootId},version_of_pack_id.eq.${rootId}`)
    .order('created_at', { ascending: true });
  if (famErr) return NextResponse.json({ error: famErr.message }, { status: 500 });

  return NextResponse.json({
    rootId,
    versions: (family ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      version_label: p.version_label,
      is_root: p.id === rootId,
      updated_at: p.updated_at,
    })),
  });
}
