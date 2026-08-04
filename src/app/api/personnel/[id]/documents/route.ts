/* ============================================
   LOWPASS — Personnel roster document uploads

   POST: multipart form — file, kind = head_shot | passport_scan
   DELETE: JSON { kind: "head_shot" } | { kind: "passport_scan", path: string }
   Stores refs in personnel.extended_profile.documents; files in personnel-files bucket.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { PersonnelDocumentsBlock, PersonnelStoredDocument } from '@/lib/personnel-extended-profile';

const BUCKET = 'personnel-files';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

function pathBelongsToPerson(path: string, workspaceId: string, personnelId: string) {
  const prefix = `${workspaceId}/${personnelId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes('..') && !rest.startsWith('/');
}

function parseDocuments(raw: unknown): PersonnelDocumentsBlock {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const head = o.head_shot;
  const scans = o.passport_scans;
  return {
    head_shot:
      head && typeof head === 'object' && head !== null && 'url' in (head as object) && 'path' in (head as object)
        ? (head as PersonnelStoredDocument)
        : head === null
          ? null
          : undefined,
    passport_scans: Array.isArray(scans)
      ? scans.filter(
          (x): x is PersonnelStoredDocument =>
            x && typeof x === 'object' && typeof (x as PersonnelStoredDocument).path === 'string'
        )
      : undefined,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: personnelId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data: row, error: rowErr } = await supabase
    .from('personnel')
    .select('id, extended_profile')
    .eq('id', personnelId)
    .eq('workspace_id', workspaceId)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const kind = (formData.get('kind') as string | null)?.trim();
  if (!file || file.size === 0) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (kind !== 'head_shot' && kind !== 'passport_scan') {
    return NextResponse.json({ error: 'kind must be head_shot or passport_scan' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Allowed: PDF, JPEG, PNG, GIF, WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const safeExt = ALLOWED_EXT.includes(ext) ? ext : 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
  const baseName = safeName.replace(/\.[^.]+$/, '');
  const filename =
    kind === 'head_shot'
      ? `head-shot-${baseName}-${Date.now()}.${safeExt}`
      : `passport-${baseName}-${Date.now()}.${safeExt}`;
  const path = `${workspaceId}/${personnelId}/${filename}`;

  const prevExt = ((row as { extended_profile?: Record<string, unknown> }).extended_profile ?? {}) as Record<
    string,
    unknown
  >;
  const prevDocs = parseDocuments(prevExt.documents);

  if (kind === 'head_shot' && prevDocs.head_shot?.path) {
    await supabase.storage.from(BUCKET).remove([prevDocs.head_shot.path]);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    if (uploadError.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Storage bucket "personnel-files" not found. Run migration 027 or create the bucket in Supabase.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  /* Sprint 10 Phase 2.1 §5.2 — migration 085 flipped the
     personnel-files bucket to public=false. getPublicUrl()
     returned a /object/public/... URL that 404s ("Bucket not
     found") for non-public buckets. Switch to createSignedUrl
     with a 1-year expiry; the signed URL embeds a JWT and
     remains valid against the workspace-scoped RLS policies.
     Long-term refactor (Sprint 11): drop URL storage in JSONB
     and re-sign on each read via a dedicated endpoint. */
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message ?? 'Could not generate signed URL.' },
      { status: 500 },
    );
  }
  const ref: PersonnelStoredDocument = {
    url: signed.signedUrl,
    path: uploadData.path,
    file_name: file.name,
    uploaded_at: new Date().toISOString(),
    content_type: file.type,
  };

  const nextDocs: PersonnelDocumentsBlock =
    kind === 'head_shot'
      ? { ...prevDocs, head_shot: ref }
      : { ...prevDocs, passport_scans: [...(prevDocs.passport_scans ?? []), ref] };

  const nextExt = { ...prevExt, documents: nextDocs };

  const { data: updated, error: upErr } = await supabase
    .from('personnel')
    .update({ extended_profile: nextExt, updated_at: new Date().toISOString() })
    .eq('id', personnelId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (upErr) {
    await supabase.storage.from(BUCKET).remove([uploadData.path]);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: personnelId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data: row, error: rowErr } = await supabase
    .from('personnel')
    .select('id, extended_profile')
    .eq('id', personnelId)
    .eq('workspace_id', workspaceId)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { kind?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prevExt = ((row as { extended_profile?: Record<string, unknown> }).extended_profile ?? {}) as Record<
    string,
    unknown
  >;
  const prevDocs = parseDocuments(prevExt.documents);

  if (body.kind === 'head_shot') {
    const p = prevDocs.head_shot?.path;
    if (p && pathBelongsToPerson(p, workspaceId, personnelId)) {
      await supabase.storage.from(BUCKET).remove([p]);
    }
    const nextDocs: PersonnelDocumentsBlock = { ...prevDocs, head_shot: null };
    const nextExt = { ...prevExt, documents: nextDocs };
    const { data: updated, error: upErr } = await supabase
      .from('personnel')
      .update({ extended_profile: nextExt, updated_at: new Date().toISOString() })
      .eq('id', personnelId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  if (body.kind === 'passport_scan' && typeof body.path === 'string') {
    const p = body.path.trim();
    if (!pathBelongsToPerson(p, workspaceId, personnelId)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    await supabase.storage.from(BUCKET).remove([p]);
    const nextScans = (prevDocs.passport_scans ?? []).filter((d) => d.path !== p);
    const nextDocs: PersonnelDocumentsBlock = { ...prevDocs, passport_scans: nextScans };
    const nextExt = { ...prevExt, documents: nextDocs };
    const { data: updated, error: upErr } = await supabase
      .from('personnel')
      .update({ extended_profile: nextExt, updated_at: new Date().toISOString() })
      .eq('id', personnelId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'kind must be head_shot or passport_scan (with path)' }, { status: 400 });
}
