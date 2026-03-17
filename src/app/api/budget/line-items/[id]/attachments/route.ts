/* ============================================
   LOWPASS — Line Item Attachments API

   POST: Upload file to budget-files, create attachment record.
   DELETE: Remove file from storage and delete record (body: { id: attachment_id }).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'budget-files';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: lineItem } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('id', lineItemId)
    .eq('workspace_id', profile.workspace_id)
    .single();
  if (!lineItem) return NextResponse.json({ error: 'Line item not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: 'file required' }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Allowed: pdf, png, jpg, jpeg, gif, doc, docx, xls, xlsx' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
  const filename = `${safeName}-${Date.now()}.${ext}`;
  const path = `${profile.workspace_id}/line-items/${lineItemId}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    if (uploadError.message?.includes('Bucket not found')) {
      return NextResponse.json({ error: 'Storage bucket not found' }, { status: 503 });
    }
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path);

  const { data: attachment, error: insertError } = await supabase
    .from('budget_line_item_attachments')
    .insert({
      line_item_id: lineItemId,
      workspace_id: profile.workspace_id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(attachment);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: { id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const attachmentId = body.id;
  if (!attachmentId) return NextResponse.json({ error: 'id (attachment id) required' }, { status: 400 });

  const { data: attachment, error: fetchErr } = await supabase
    .from('budget_line_item_attachments')
    .select('id, file_url, line_item_id')
    .eq('id', attachmentId)
    .eq('line_item_id', lineItemId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (fetchErr || !attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

  try {
    const pathname = new URL(attachment.file_url as string).pathname;
    const pathInBucket = pathname.includes(`/${BUCKET}/`) ? pathname.split(`/${BUCKET}/`)[1] : null;
    if (pathInBucket) await supabase.storage.from(BUCKET).remove([pathInBucket]);
  } catch {
    // ignore URL parse / storage errors
  }

  const { error: delErr } = await supabase
    .from('budget_line_item_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('workspace_id', profile.workspace_id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
