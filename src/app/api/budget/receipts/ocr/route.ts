/* ============================================
   LOWPASS — Receipt OCR (Claude Vision)

   POST: Accept image/PDF upload, extract receipt data via Claude, return JSON.
   ============================================ */

import { NextResponse } from 'next/server';
import Anthropic, { APIError } from '@anthropic-ai/sdk';

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

const BILLING_ERROR_USER_MSG =
  'Receipt scan uses the Anthropic API (Claude), which is billed separately from your Lowpass subscription. Add credits or a payment method at console.anthropic.com for the org that owns ANTHROPIC_API_KEY, or set a new key in the Vercel project environment.';

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

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

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse receipt' }, { status: 422 });
    }

    const receiptData = JSON.parse(jsonMatch[0]);
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
