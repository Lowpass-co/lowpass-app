/* ============================================
   LOWPASS — POST /api/export/assets  (#8 Document Export, Template Builder P2)

   Upload a header background / header logo image for an export template into the
   PRIVATE `export-assets` bucket at `{workspace_id}/{uuid}.{ext}` (migration 223,
   workspace-scoped RLS). Returns `{ path }` — the editor stores the path in the
   TemplateConfig (header.bgAssetPath / header.logoAssetPath); the render resolves
   it to a base64 data-URI server-side (logo.ts fetchExportAssetDataUri). The
   browser never gets a URL → private-bucket-safe, no cross-workspace leak.

   READ of the asset is workspace-scoped by RLS; this route only writes the
   caller's own workspace folder.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { randomUUID } from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const BUCKET = 'export-assets';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function extFor(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Allowed types: ${ALLOWED_TYPES.join(', ')}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` }, { status: 400 });
  }

  const path = `${profile.workspace_id}/${randomUUID()}.${extFor(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    if (upErr.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: `Storage bucket "${BUCKET}" not found. Run migration 223_storage_export_assets.sql.` },
        { status: 503 },
      );
    }
    console.error('[export-assets] upload failed:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ path });
}
