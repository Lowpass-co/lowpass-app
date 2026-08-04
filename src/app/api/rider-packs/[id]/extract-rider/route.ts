/* ============================================
   LOWPASS — Rider PDF AI import  (V1-2)

   POST multipart { file }: upload an existing rider PDF; Claude extracts its
   structure into OUR rider-builder shape (sections → fields). Returns the
   proposal for TM review — NOTHING writes. Same grammar as the deal-memo /
   tech-pack pipelines: metered via withAiUsage, "AI drafts, you approve."

   The client renders the proposal in <ChangeReviewQueue> and, on apply, creates
   the accepted sections through the existing POST /api/rider-packs/[id]/sections
   path — no parallel write.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import { requireWrite } from '@/lib/auth/workspace-check';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_LIMIT_MS = 3_000;
const lastCallByUser = new Map<string, number>();
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PDF_TYPE = 'application/pdf';

export interface ExtractedRiderField {
  label: string;
  value: string;
}
export interface ExtractedRiderSection {
  title: string;
  fields: ExtractedRiderField[];
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const PDFParse = (mod as { PDFParse: new (opts: { data: ArrayBuffer | Uint8Array }) => { getText: () => Promise<{ text: string }>; destroy?: () => Promise<void> } }).PDFParse;
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result?.text ?? '').trim();
  } finally {
    const p = parser as unknown as { destroy?: () => Promise<void> };
    if (typeof p.destroy === 'function') await p.destroy();
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: packId } = await params;
  const supabase = await createServerSupabaseClient();

  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { user, workspaceId } = auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable — contact support.' }, { status: 503 });
  }

  // Confirm the pack is a rider in the caller's workspace (RLS-scoped read).
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, kind, workspace_id')
    .eq('id', packId)
    .maybeSingle();
  if (!pack || pack.workspace_id !== workspaceId) {
    return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
  }
  if (pack.kind !== 'rider') {
    return NextResponse.json({ error: 'Import is only for rider packs' }, { status: 400 });
  }

  const limited = checkRateLimit(lastCallByUser, user.id, RATE_LIMIT_MS);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'A rider PDF is required' }, { status: 400 });
  if (file.type !== PDF_TYPE) return NextResponse.json({ error: 'Upload a PDF' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'PDF exceeds 10MB' }, { status: 400 });

  const text = await extractTextFromPdf(Buffer.from(await file.arrayBuffer()));
  if (!text) return NextResponse.json({ error: 'No extractable text in that PDF' }, { status: 400 });

  const systemPrompt = `You are a tour manager assistant. A production/hospitality RIDER PDF is given as text.
Extract its structure into sections and fields. Return ONLY valid JSON:
{"sections":[{"title":"<section name>","fields":[{"label":"<field name>","value":"<the requirement/detail>"}]}]}
Group related requirements under clear section titles (e.g. Sound, Lighting, Backline, Stage, Hospitality, Catering, Dressing Rooms, Parking, Security). Keep each field's value concise. No markdown, no commentary, JSON only.`;

  try {
    const { result: message, blocked, blockReason } = await withAiUsage(
      {
        workspaceId,
        userId: user.id,
        endpoint: 'rider-packs.extract-rider',
        model: 'claude-haiku-4-5-20251001',
        metadata: { pack_id: packId },
      },
      async (anthropic) => {
        const r = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Extract this rider:\n\n${text.slice(0, 60_000)}` }],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return aiCapExceededResponse(blockReason ?? 'workspace_budget');
    if (!message) return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });

    const textBlock = message.content?.find((c) => c.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
    let parsed: { sections?: ExtractedRiderSection[] };
    try {
      parsed = JSON.parse(cleaned) as { sections?: ExtractedRiderSection[] };
    } catch {
      return NextResponse.json({ error: 'Could not parse extracted rider' }, { status: 502 });
    }

    // Sanitize to well-formed sections with at least a title.
    const sections: ExtractedRiderSection[] = (parsed.sections ?? [])
      .filter((s) => s && typeof s.title === 'string' && s.title.trim())
      .map((s) => ({
        title: s.title.trim().slice(0, 120),
        fields: (Array.isArray(s.fields) ? s.fields : [])
          .filter((f) => f && typeof f.label === 'string' && f.label.trim())
          .map((f) => ({ label: String(f.label).trim().slice(0, 120), value: String(f.value ?? '').trim().slice(0, 2000) })),
      }));

    markRateLimit(lastCallByUser, user.id);
    return NextResponse.json({ sections });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Extraction failed' }, { status: 500 });
  }
}
