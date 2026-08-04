/* ============================================
   LOWPASS — Google Doc export endpoint

   POST /api/rider-packs/[id]/export/google-doc
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolvePack } from '@/lib/rider-packs/resolve';
import { appendHistory } from '@/lib/rider-packs/history';
import { GoogleAuthConfigError, getDocsClient, getDriveClient } from '@/lib/google/auth';
import { buildClearRequest, buildExport, buildInsertRequests } from '@/lib/google/docs-export';
import type { RiderPack } from '@/lib/rider-packs/types';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', packId)
    .maybeSingle<RiderPack>();

  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }
  let documentId: string;
  let webViewLink: string | null = pack.google_doc_url;
  const isNew = !pack.google_doc_id;

  try {
    const { data: artist } = await supabase
      .from('artists')
      .select('name')
      .eq('id', pack.artist_id)
      .maybeSingle();
    const artistName = artist?.name ?? 'Unknown artist';

    const resolved = await resolvePack(supabase, pack);
    const build = buildExport({ ...pack, artist_name: artistName }, resolved.sections);

    const exporterEmail = user.email || '';
    const docs = getDocsClient();
    const drive = getDriveClient();

    if (pack.google_doc_id) {
      documentId = pack.google_doc_id;

      const { data: doc } = await docs.documents.get({ documentId });
      const body = doc.body?.content ?? [];
      const endIndex = body.length > 0 ? (body[body.length - 1].endIndex ?? 2) : 2;

      const requests = [...buildClearRequest(endIndex), ...buildInsertRequests(build)];

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      await drive.files.update({
        fileId: documentId,
        requestBody: { name: build.title },
      });
    } else {
      const created = await docs.documents.create({
        requestBody: { title: build.title },
      });

      documentId = created.data.documentId!;

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: buildInsertRequests(build) },
      });

      if (exporterEmail) {
        try {
          await drive.permissions.create({
            fileId: documentId,
            sendNotificationEmail: false,
            requestBody: {
              role: 'writer',
              type: 'user',
              emailAddress: exporterEmail,
            },
          });
        } catch (err) {
          const shareMessage = err instanceof Error ? err.message : 'Drive share failed';
          console.error(`Drive share failed: ${shareMessage}`);
        }
      }

      const { data: meta } = await drive.files.get({
        fileId: documentId,
        fields: 'webViewLink',
      });

      webViewLink = meta.webViewLink ?? `https://docs.google.com/document/d/${documentId}/edit`;

      await supabase
        .from('rider_packs')
        .update({
          google_doc_id: documentId,
          google_doc_url: webViewLink,
        })
        .eq('id', pack.id);
    }
    await supabase.from('rider_pack_exports').insert({
      pack_id: pack.id,
      exported_by: user.id,
      export_type: 'google_doc',
      target_id: documentId,
      target_url: webViewLink,
      content_snapshot: {
        pack: {
          id: pack.id,
          title: pack.title,
          scope: pack.scope,
          artist_id: pack.artist_id,
        },
        sections: resolved.sections,
        exported_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    console.error('[rider-packs/export/google-doc] failed', err);

    if (err instanceof GoogleAuthConfigError) {
      return NextResponse.json(
        { error: message, code: 'GOOGLE_AUTH_CONFIG' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message, code: 'GOOGLE_API_ERROR' },
      { status: 502 },
    );
  }

  try {
    await appendHistory(supabase, {
      packId: pack.id,
      changedBy: user.id,
      changeType: 'pack.updated',
      sectionKey: null,
      fieldKey: null,
      oldValue: null,
      newValue: {
        google_doc_id: documentId,
        google_doc_url: webViewLink,
        action: isNew ? 'exported_new' : 'exported_update',
      },
    });
  } catch (err) {
    const historyMessage = err instanceof Error ? err.message : 'appendHistory failed';
    console.error(`appendHistory failed: ${historyMessage}`);
  }

  return NextResponse.json({
    document_id: documentId,
    document_url: webViewLink,
    is_new: isNew,
  });
}
