/* ============================================================
   LOWPASS — POST /api/stage-plot/icons/generate (§SP-FIX-1b·5)

   Generate a custom top-down stage-plot icon from a label (+ optional
   reference photo) via Claude Sonnet, seeded with the 8 canonical
   anchors so output matches the house grammar. The returned SVG is
   sanitised before it's stored or rendered, then saved to
   public.stage_plot_custom_items for the workspace.

   Body: { label, category?, real_world_dimensions_ft?: {w,d}, reference_photo_url? }
   Rate limited to one generation per 10s per user.
   ============================================================ */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { GENERATOR_MODEL, SYSTEM_PROMPT, sanitizeSvgBody, isValidViewBox, isValidDim } from '@/lib/stage-plot/icon-generator';

const RATE_MS = 10_000;
const lastGen = new Map<string, number>();

interface GenBody {
  label?: string;
  category?: string;
  real_world_dimensions_ft?: { w?: number; d?: number };
  reference_photo_url?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Icon generation not configured' }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // Rate limit: one generation per 10s per user.
  const now = Date.now();
  if (now - (lastGen.get(user.id) ?? 0) < RATE_MS) {
    return NextResponse.json({ error: 'Rate limited — one generation per 10 seconds' }, { status: 429 });
  }

  // Two input modes: JSON (label + optional reference_photo_url), or
  // multipart/form-data (label + optional uploaded image — the custom
  // item library "generate from image" flow).
  let label = '';
  let category: string | null = null;
  let w: number | undefined;
  let d: number | undefined;
  let imageBlock: Anthropic.ImageBlockParam | null = null;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
    label = String(form.get('label') ?? '').trim();
    category = String(form.get('category') ?? '').trim() || null;
    const wv = form.get('w');
    const dv = form.get('d');
    w = wv != null ? Number(wv) : undefined;
    d = dv != null ? Number(dv) : undefined;
    const file = form.get('image');
    if (file instanceof File && file.size > 0) {
      const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
      if (!ALLOWED.includes(file.type)) {
        return NextResponse.json({ error: 'Image must be PNG, JPG, or WebP' }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image exceeds 5MB' }, { status: 400 });
      }
      const data = Buffer.from(await file.arrayBuffer()).toString('base64');
      imageBlock = { type: 'image', source: { type: 'base64', media_type: file.type as 'image/png' | 'image/jpeg' | 'image/webp', data } };
    }
  } else {
    let body: GenBody;
    try {
      body = (await request.json()) as GenBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    label = (body.label ?? '').trim();
    category = body.category?.trim() || null;
    w = body.real_world_dimensions_ft?.w;
    d = body.real_world_dimensions_ft?.d;
    const photoUrl = body.reference_photo_url;
    if (photoUrl) {
      if (!/^https:\/\//i.test(photoUrl)) {
        return NextResponse.json({ error: 'reference_photo_url must be https' }, { status: 400 });
      }
      imageBlock = { type: 'image', source: { type: 'url', url: photoUrl } };
    }
  }

  if (!label) {
    return NextResponse.json({ error: 'label required' }, { status: 400 });
  }
  const dims = w && d ? { w, d } : undefined;

  // Reserve the slot before the (slow) API call so concurrent calls bounce.
  lastGen.set(user.id, now);

  const userText =
    `Draw a top-down stage-plot icon for: "${label}"` +
    (category ? ` (category: ${category})` : '') +
    (dims ? ` Real-world footprint ≈ ${dims.w} × ${dims.d} ft.` : '') +
    (imageBlock ? ' Use the attached reference image for shape/proportions.' : '') +
    ' Match the canonical grammar and example density exactly. Return ONLY the JSON object.';

  const content: Anthropic.MessageParam['content'] = imageBlock
    ? [imageBlock, { type: 'text', text: userText }]
    : userText;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: GENERATOR_MODEL,
      max_tokens: 1500,
      // Big static style guide cached so repeated generations are cheap.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    });

    const first = response.content[0];
    const text = first && first.type === 'text' ? first.text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'Generator returned no JSON' }, { status: 502 });
    }

    let parsed: { viewBox?: string; body?: string; width_ft?: number; depth_ft?: number };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json({ error: 'Generator returned malformed JSON' }, { status: 502 });
    }

    const viewBox = String(parsed.viewBox ?? '').trim();
    if (!isValidViewBox(viewBox)) {
      return NextResponse.json({ error: 'Generated viewBox invalid' }, { status: 422 });
    }
    const widthFt = Number(parsed.width_ft ?? dims?.w);
    const depthFt = Number(parsed.depth_ft ?? dims?.d);
    if (!isValidDim(widthFt) || !isValidDim(depthFt)) {
      return NextResponse.json({ error: 'Generated dimensions out of range' }, { status: 422 });
    }
    const san = sanitizeSvgBody(String(parsed.body ?? ''));
    if (!san.ok || !san.body) {
      return NextResponse.json({ error: `Generated SVG rejected: ${san.reason}` }, { status: 422 });
    }

    const { data: saved, error } = await supabase
      .from('stage_plot_custom_items')
      .upsert(
        {
          workspace_id: profile.workspace_id,
          label,
          category,
          svg_content: san.body,
          source: 'ai-generated',
          ai_prompt: userText,
          default_width_ft: widthFt,
          default_depth_ft: depthFt,
          created_by: user.id,
        },
        { onConflict: 'workspace_id,label' },
      )
      .select('id')
      .single();

    if (error || !saved) {
      return NextResponse.json({ error: 'Could not save generated icon' }, { status: 500 });
    }

    return NextResponse.json({
      item: {
        name: `custom_${saved.id}`,
        label,
        category,
        viewBox,
        body: san.body,
        footprint: { width_ft: widthFt, depth_ft: depthFt },
        source: 'ai-generated',
      },
      usage: response.usage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'generation failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
