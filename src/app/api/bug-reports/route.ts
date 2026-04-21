/* ============================================
   LOWPASS — Bug Reports API (collection)

   POST multipart: description (required), title, stepsToReproduce,
   severity, pageUrl, pagePath, userAgent, browser, os,
   viewportWidth, viewportHeight, devicePixelRatio, screenshot (image File).

   GET JSON: list bug reports ordered by created_at desc, with
   signed URLs for screenshots and reporter name/email joined.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const runtime = 'nodejs';

const MAX_DESCRIPTION = 50_000;
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function toIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toNumOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null, max = 2048): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const description = (str(formData.get('description'), MAX_DESCRIPTION) ?? '').trim();
  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }

  const rawSeverity = (str(formData.get('severity'), 20) ?? 'medium').toLowerCase();
  const severity = ALLOWED_SEVERITIES.has(rawSeverity) ? rawSeverity : 'medium';

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();

  const { data: inserted, error: insertErr } = await supabase
    .from('bug_reports')
    .insert({
      reporter_id: user.id,
      workspace_id: profile?.workspace_id ?? null,
      title: str(formData.get('title'), 200),
      description,
      steps_to_reproduce: str(formData.get('stepsToReproduce'), MAX_DESCRIPTION),
      severity,
      page_url: str(formData.get('pageUrl'), 2048),
      page_path: str(formData.get('pagePath'), 512),
      user_agent: str(formData.get('userAgent'), 512),
      browser: str(formData.get('browser'), 64),
      os: str(formData.get('os'), 64),
      viewport_width: toIntOrNull(formData.get('viewportWidth')),
      viewport_height: toIntOrNull(formData.get('viewportHeight')),
      device_pixel_ratio: toNumOrNull(formData.get('devicePixelRatio')),
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[bug-reports] insert failed:', insertErr);
    return NextResponse.json({ error: insertErr?.message ?? 'Could not save bug report' }, { status: 500 });
  }

  const screenshot = formData.get('screenshot');
  let screenshotPath: string | null = null;

  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: 'Screenshot is too large' }, { status: 413 });
    }
    const mime = screenshot.type || 'image/png';
    const ext = mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';
    const path = `${inserted.id}/screenshot.${ext}`;
    const bytes = Buffer.from(await screenshot.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from('bug-reports')
      .upload(path, bytes, {
        contentType: mime.startsWith('image/') ? mime : 'image/png',
        upsert: true,
      });
    if (uploadErr) {
      console.error('[bug-reports] screenshot upload failed:', uploadErr);
    } else {
      screenshotPath = path;
      await supabase
        .from('bug_reports')
        .update({ screenshot_path: path })
        .eq('id', inserted.id);
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id, screenshotPath });
}

export async function GET() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const supabase = await createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from('bug_reports')
    .select(
      `id, title, description, steps_to_reproduce, severity, status,
       page_url, page_path, user_agent, browser, os,
       viewport_width, viewport_height, device_pixel_ratio,
       screenshot_path, resolution_notes, assigned_to, resolved_at,
       created_at, updated_at,
       reporter:profiles!reporter_id ( id, name, email, avatar_url ),
       assignee:profiles!assigned_to ( id, name, email )`
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = await Promise.all(
    (rows ?? []).map(async (r) => {
      let screenshotUrl: string | null = null;
      if (r.screenshot_path) {
        const { data: signed } = await supabase.storage
          .from('bug-reports')
          .createSignedUrl(r.screenshot_path, SIGNED_URL_TTL_SECONDS);
        screenshotUrl = signed?.signedUrl ?? null;
      }
      return { ...r, screenshot_url: screenshotUrl };
    })
  );

  return NextResponse.json({ reports: result });
}
