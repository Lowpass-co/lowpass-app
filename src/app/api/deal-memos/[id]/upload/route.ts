/* ============================================
   LOWPASS — Deal memo document upload

   POST multipart form: "file".
   Paths: {workspace_id}/{deal_memo_id}/{filename} in bucket deal-memos.
   Updates deal_memos.document_url (storage path), document_filename.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type Params = { params: Promise<{ id: string }> };

const BUCKET = 'deal-memos';
const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data: memo, error: memoErr } = await supabase
    .from('deal_memos')
    .select('id, workspace_id')
    .eq('id', id)
    .maybeSingle();

  if (memoErr || !memo || (memo.workspace_id as string) !== workspaceId) {
    return NextResponse.json({ error: 'Deal memo not found' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Allowed types: PDF, JPEG, PNG, WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeExt = ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'bin';
  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 72) || 'document';
  const filename = `${Date.now()}_${safeBase.includes('.') ? safeBase.slice(0, safeBase.lastIndexOf('.')) : safeBase}.${safeExt}`;
  const path = `${workspaceId}/${id}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (upErr) {
    if (upErr.message?.includes('Bucket not found')) {
      return NextResponse.json({ error: 'Storage bucket deal-memos not found' }, { status: 503 });
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from('deal_memos')
    .update({
      document_url: path,
      document_filename: file.name.slice(0, 200),
      updated_by: user.id,
    })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    storagePath: path,
    filename: file.name.slice(0, 200),
  });
}
