/* ============================================
   LOWPASS — Receipt OCR (Claude Vision)

   POST: Accept image/PDF upload, extract receipt data via Claude, return JSON.
   ============================================ */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'OCR failed' },
      { status: 500 }
    );
  }
}
