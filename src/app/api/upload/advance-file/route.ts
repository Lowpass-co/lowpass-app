/* ============================================
   LOWPASS — Advance File Upload

   POST: multipart form with "file", "advance_instance_id", "field_id".
   Uploads to Supabase Storage bucket "advance-files".
   Path: {workspace_id}/{advance_instance_id}/{field_id}/{filename}
   Accepts: .pdf, .jpg, .jpeg, .png, .gif — max 10MB.
   Returns { url } (public URL).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'advance-files';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
];
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const advanceInstanceId = formData.get('advance_instance_id') as string | null;
  const fieldId = formData.get('field_id') as string | null;

  if (!file || !advanceInstanceId?.trim() || !fieldId?.trim()) {
    return NextResponse.json(
      { error: 'Missing file, advance_instance_id, or field_id' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Allowed types: PDF, JPEG, PNG, GIF' },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const safeExt = ALLOWED_EXT.includes(ext) ? ext : 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
  const baseName = safeName.replace(/\.[^.]+$/, '');
  const filename = `${baseName}-${Date.now()}.${safeExt}`;
  const path = `${workspaceId}/${advanceInstanceId}/${fieldId}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    if (error.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Storage bucket "advance-files" not found. Create it in Supabase Dashboard → Storage.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl, path: data.path });
}

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  return profile?.workspace_id ?? null;
}

/** GET: List files for an advance instance (query: advance_instance_id). Returns { files: { path, name, created_at, url }[] } */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const advanceInstanceId = searchParams.get('advance_instance_id')?.trim();
  if (!advanceInstanceId) return NextResponse.json({ error: 'advance_instance_id required' }, { status: 400 });

  const prefix = `${workspaceId}/${advanceInstanceId}/documents/`;
  const { data: list, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 500 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files = (list ?? [])
    .filter((f) => f.name && (f.id != null || f.metadata))
    .map((f) => {
      const path = `${prefix}${f.name}`;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const created_at = (f as { created_at?: string }).created_at ?? (f as { updated_at?: string }).updated_at ?? null;
      return { path, name: f.name, created_at, url };
    });

  return NextResponse.json({ files });
}

/** DELETE: Remove one file (body: { path: string }) */
export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!path || !path.startsWith(workspaceId + '/')) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  const { error: delError } = await supabase.storage.from(BUCKET).remove([path]);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
