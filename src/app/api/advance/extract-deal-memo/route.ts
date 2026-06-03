/* ============================================
   LOWPASS — Extract Deal Memo (AI)

   POST: multipart form with document_type, and one or more files (same type).
   document_type: Deal Memo | Tech Rider | Flight Ticket | Hotel Confirmation | Other
   Uses Anthropic Claude to extract: guarantee, guest list, transport, backline,
   key contacts, show date, venue. Returns JSON for review before saving.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';

/* Sprint 12 §SAFE — 3s per-user window. Document uploads are
   intentional one-off actions; the limit just prevents
   accidental double-clicks burning the key on big files. */
const RATE_LIMIT_MS = 3_000;
const lastCallByUser = new Map<string, number>();

const ALLOWED_DOC_TYPES = ['Deal Memo', 'Tech Rider', 'Flight Ticket', 'Hotel Confirmation', 'Other'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const PDF_TYPE = 'application/pdf';

export type ExtractedDealInfo = {
  guarantee?: string | null;
  guest_list?: string | null;
  transport_from_promoter?: string | null;
  backline_provisions?: string | null;
  notes?: string | null;
  key_contacts?: string | null;
  show_date?: string | null;
  venue?: string | null;
};

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const PDFParse = (mod as { PDFParse: new (opts: { data: ArrayBuffer | Uint8Array }) => { getText: () => Promise<{ text: string }> } }).PDFParse;
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result?.text ?? '').trim();
  } finally {
    const p = parser as unknown as { destroy?: () => Promise<void> };
    if (typeof p.destroy === 'function') await p.destroy();
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  /* Sprint 12 §SAFE — workspace gate. Pre-§SAFE this route
     accepted any signed-in user without validating the
     embedded tour_id, so a hostile workspace member could feed
     in another workspace's tour id and burn its AI budget. */
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const { user, workspaceId } = auth;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI service unavailable — contact support.' },
      { status: 503 }
    );
  }

  const limited = checkRateLimit(lastCallByUser, user.id, RATE_LIMIT_MS);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const tourId = (formData.get('tour_id') as string | null) ?? '';
  const tourGate = await requireTourInWorkspace(supabase, tourId, workspaceId);
  if (tourGate) return tourGate;

  const documentType = formData.get('document_type') as string | null;
  if (!documentType || !ALLOWED_DOC_TYPES.includes(documentType)) {
    return NextResponse.json(
      { error: `document_type must be one of: ${ALLOWED_DOC_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const files: File[] = [];
  const fileList = formData.getAll('files');
  if (fileList.length === 0) {
    const single = formData.get('file') as File | null;
    if (single) files.push(single);
  } else {
    fileList.forEach((f) => { if (f instanceof File) files.push(f); });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
  }

  const firstType = files[0].type;
  const allSameType = files.every((f) => f.type === firstType);
  if (!allSameType) {
    return NextResponse.json({ error: 'All files in one batch must be the same type' }, { status: 400 });
  }
  if (files.some((f) => f.size > MAX_FILE_SIZE)) {
    return NextResponse.json({ error: 'File(s) exceed 10MB' }, { status: 400 });
  }

  type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } };
  const contentBlocks: ContentBlock[] = [];
  const textParts: string[] = [];

  for (const file of files) {
    if (PDF_TYPE === file.type) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractTextFromPdf(buffer);
      if (text) textParts.push(`[File: ${file.name}]\n${text}`);
    } else if (IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mediaType = file.type as ImageMediaType;
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
    } else {
      return NextResponse.json(
        { error: 'Allowed file types: PDF, JPEG, PNG, GIF, WebP' },
        { status: 400 }
      );
    }
  }

  if (textParts.length > 0) {
    contentBlocks.push({
      type: 'text',
      text: `Document type: ${documentType}\n\nExtract structured data from the following text:\n\n${textParts.join('\n\n---\n\n')}`,
    });
  } else if (contentBlocks.length > 0) {
    contentBlocks.push({
      type: 'text',
      text: `Document type: ${documentType}. Extract structured data from the attached image(s).`,
    });
  }

  if (contentBlocks.length === 0) {
    return NextResponse.json({ error: 'No extractable content (e.g. PDF had no text)' }, { status: 400 });
  }

  const systemPrompt = `You are a tour manager assistant. Extract structured data from the provided document (deal memo, tech rider, flight/hotel doc, etc.).
Return a JSON object with only these keys (use null for missing): guarantee (currency string if present), guest_list (number + details), transport_from_promoter, backline_provisions, notes, key_contacts (names/roles), show_date (YYYY-MM-DD if possible), venue.
No markdown, no explanation, only valid JSON.`;

  try {
    const { result: message, blocked, blockReason } = await withAiUsage(
      {
        workspaceId: workspaceId,
        userId: user.id,
        endpoint: 'advance.extract-deal-memo',
        model: 'claude-haiku-4-5-20251001',
        metadata: { tour_id: tourId },
      },
      async (anthropic) => {
        const r = await anthropic.messages.create({
          /* Sprint 12 §SAFE — Haiku 4.5 supports vision and PDF
             extraction. Deal memo / rider parsing is structured
             field extraction, not reasoning; Haiku is fine. */
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: contentBlocks,
            },
          ],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return aiCapExceededResponse(blockReason ?? 'workspace_budget');
    if (!message) return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });

    const textBlock = message.content?.find((c) => c.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';
    if (!text) {
      return NextResponse.json({ error: 'No extraction result from model' }, { status: 502 });
    }

    const cleaned = text.replace(/^```json?\s*|\s*```$/g, '').trim();
    let extracted: ExtractedDealInfo;
    try {
      extracted = JSON.parse(cleaned) as ExtractedDealInfo;
    } catch {
      return NextResponse.json({ error: 'Could not parse extracted JSON' }, { status: 502 });
    }

    markRateLimit(lastCallByUser, user.id);
    return NextResponse.json({ extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
