/* ============================================
   LOWPASS — Bug reports API

   POST multipart: description (required), pageUrl (optional),
   screenshot (optional image/png File).

   Stores files in Google Drive when configured; otherwise 503.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getDriveBugReportClient, uploadBugReportFile } from '@/lib/google-drive-bug-report';

export const runtime = 'nodejs';

const MAX_DESCRIPTION = 50_000;
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const drive = getDriveBugReportClient();
  if (!drive) {
    return NextResponse.json(
      { error: 'Bug report storage is not configured on the server.' },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const description = String(formData.get('description') ?? '').trim();
  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json({ error: 'Description is too long' }, { status: 400 });
  }

  const pageUrl = String(formData.get('pageUrl') ?? '').slice(0, 2048);
  const userAgent = String(formData.get('userAgent') ?? '').slice(0, 512);
  const screenshot = formData.get('screenshot');

  const prefix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${user.id.slice(0, 8)}`;

  const reportText = [
    `User id: ${user.id}`,
    `Email: ${user.email ?? '(none)'}`,
    `Time (UTC): ${new Date().toISOString()}`,
    `Page: ${pageUrl || '(unknown)'}`,
    `User-Agent: ${userAgent || '(unknown)'}`,
    '',
    '---',
    '',
    description,
  ].join('\n');

  try {
    await uploadBugReportFile(drive, {
      fileName: `${prefix}-report.txt`,
      mimeType: 'text/plain; charset=utf-8',
      body: Buffer.from(reportText, 'utf-8'),
    });

    if (screenshot instanceof File && screenshot.size > 0) {
      if (screenshot.size > MAX_SCREENSHOT_BYTES) {
        return NextResponse.json({ error: 'Screenshot is too large' }, { status: 413 });
      }
      const buf = Buffer.from(await screenshot.arrayBuffer());
      const mime = screenshot.type || 'image/png';
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
      await uploadBugReportFile(drive, {
        fileName: `${prefix}-screenshot.${ext}`,
        mimeType: mime.startsWith('image/') ? mime : 'image/png',
        body: buf,
      });
    }
  } catch (err) {
    console.error('[bug-reports] Drive upload failed:', err);
    return NextResponse.json(
      { error: 'Could not save bug report. Check Drive folder sharing and credentials.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
