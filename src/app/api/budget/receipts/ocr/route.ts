/* ============================================
   LOWPASS — Receipt OCR (Claude Vision)

   POST: Accept image/PDF upload, extract receipt data via Claude, return JSON.
   ============================================ */

import { NextResponse } from 'next/server';
import { APIError } from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';

/* Sprint 12 §SAFE — per-user rate limit so a runaway client
   (or hostile actor with valid creds) can't burn the AI key
   with rapid scans. 3s window matches the deal-memo extract
   endpoint. */
const RATE_LIMIT_MS = 3_000;
const lastCallByUser = new Map<string, number>();

/** Pull nested message from Anthropic error JSON (SDK puts API body on `.error`). */
function anthropicErrorText(err: APIError): string {
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  const body = err.error;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.message === 'string') parts.push(o.message);
    const inner = o.error;
    if (inner && typeof inner === 'object' && inner !== null) {
      const m = (inner as Record<string, unknown>).message;
      if (typeof m === 'string') parts.push(m);
    }
  }
  return parts.join(' ');
}

const BILLING_ERROR_USER_MSG = 'AI service unavailable — contact support.';

/** Works even when the SDK does not use APIError (or embeds 400 + JSON in Error.message). */
function looksLikeAnthropicCreditError(err: unknown): boolean {
  const chunks: string[] = [];
  if (err instanceof APIError) {
    chunks.push(anthropicErrorText(err), err.message ?? '', String(err.status ?? ''));
  } else if (err instanceof Error) {
    chunks.push(err.message);
  } else {
    chunks.push(String(err));
  }
  const t = chunks.join(' ').toLowerCase();
  if (t.includes('balance is too low') || t.includes('plans & billing')) return true;
  if (t.includes('credit') && (t.includes('too low') || t.includes('balance'))) return true;
  return false;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OCR not configured' }, { status: 503 });
  }

  /* Sprint 12 §SAFE — auth gate. Previously this endpoint
     was open: any caller with the URL could POST a file and
     burn the AI key. Now it requires a workspace member +
     a tour_id that belongs to that workspace. */
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const { user, workspaceId } = auth;

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

  const file = formData.get('file') as File | null;
  if (!file?.size) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const tourCurrency = (formData.get('currency') as string) || 'GBP';
  const mediaType = file.type as string;

  if (!ALLOWED_TYPES.includes(mediaType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: 'File must be an image (JPEG, PNG, WebP, GIF). PDF is not supported for vision.' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const { result: response, blocked, blockReason } = await withAiUsage(
      {
        workspaceId: workspaceId,
        userId: user.id,
        endpoint: 'budget.receipts.ocr',
        model: 'claude-haiku-4-5-20251001',
        metadata: { tour_id: tourId },
      },
      async (anthropic) => {
        const r = await anthropic.messages.create({
          /* Sprint 12 §SAFE — Haiku 4.5 supports vision and is ~10x
             cheaper than Sonnet. Receipt OCR is bounded extraction,
             not reasoning — Haiku handles it. */
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                    data: base64,
                  },
                },
                {
                  type: 'text',
                  text: `Extract receipt data from this image. Return ONLY valid JSON with these fields:
{
  "vendor": "string - business name",
  "date": "string - YYYY-MM-DD format",
  "total_amount": number,
  "currency": "string - 3-letter code e.g. GBP, USD, EUR",
  "category": "string - one of: hotel, transport, production, catering, misc",
  "description": "string - brief description of what was purchased",
  "payment_method": "string - one of: card, cash, bank_transfer",
  "line_items": [{"description": "string", "amount": number}]
}
If any field is unclear, use null. Tour currency is ${tourCurrency}.`,
                },
              ],
            },
          ],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return aiCapExceededResponse(blockReason ?? 'workspace_budget');
    if (!response) return NextResponse.json({ error: 'Receipt OCR failed' }, { status: 500 });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse receipt' }, { status: 422 });
    }

    const receiptData = JSON.parse(jsonMatch[0]);
    /* Stamp the rate limit only after success so a 5xx/422
       doesn't lock the operator out of retrying. */
    markRateLimit(lastCallByUser, user.id);
    return NextResponse.json(receiptData);
  } catch (err) {
    console.error('Receipt OCR error:', err);
    if (looksLikeAnthropicCreditError(err)) {
      return NextResponse.json({ error: BILLING_ERROR_USER_MSG, code: 'ANTHROPIC_BILLING' }, { status: 503 });
    }
    if (err instanceof APIError) {
      return NextResponse.json(
        { error: 'Could not read this receipt with the AI service. Try again or enter the receipt manually.', code: 'ANTHROPIC_API' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'Could not read this receipt. Try again or enter the details manually.', code: 'OCR_FAILED' },
      { status: 500 },
    );
  }
}
