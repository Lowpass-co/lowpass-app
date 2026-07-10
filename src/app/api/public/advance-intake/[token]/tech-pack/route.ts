/* ============================================
   LOWPASS — Public Advance Intake · tech-pack extraction (P7 · Checkpoint C)

   POST /api/public/advance-intake/[token]/tech-pack  (multipart: files[])
     The venue uploads its tech pack (PDF/images) INSTEAD of filling the form.
     Claude extracts values targeting the intake's fillable fields; results land
     PENDING (source='tech_pack') in the TM's Review queue — NOTHING auto-writes
     (same Q7 store-pending path). Metered via withAiUsage → ai_usage_events.

   Public + token-gated (service role). Extraction FAILURE degrades to the form
   ({ ok:false, message }) — never a dead end. Guards mirror the receipt upload.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { withAiUsage } from '@/lib/ai/usage';
import {
  buildIntakeFormSchema,
  sanitizeSubmission,
  type IntakeSection,
  type AdvanceData,
} from '@/lib/advance/intake';
import { flattenToPending } from '@/lib/advance/intake-pending';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (mirror receipts)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const PDF_TYPE = 'application/pdf';

/** A soft failure the client turns into "we couldn't read this — the form's
 *  still here" (200 so there is no error page / lost session). */
function softFail(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 200 });
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const PDFParse = (mod as { PDFParse: new (opts: { data: ArrayBuffer | Uint8Array }) => { getText: () => Promise<{ text: string }>; destroy?: () => Promise<void> } }).PDFParse;
  const parser = new PDFParse({ data: buffer });
  try {
    return ((await parser.getText())?.text ?? '').trim();
  } finally {
    if (typeof parser.destroy === 'function') await parser.destroy();
  }
}

interface LinkRow {
  id: string;
  workspace_id: string;
  routing_id: string;
  advance_instance_id: string | null;
  status: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const service = createServiceSupabaseClient();
  const { data: link } = await service
    .from('advance_intake_links')
    .select('id, workspace_id, routing_id, advance_instance_id, status, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle<LinkRow>();
  if (!link || link.revoked_at || link.status === 'revoked') return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });

  if (!process.env.ANTHROPIC_API_KEY) return softFail('The reader is unavailable right now — please fill in the form below.');

  // Resolve the advance + its fillable schema (the extraction target).
  let instanceQuery = service.from('advance_instances').select('id, sections');
  instanceQuery = link.advance_instance_id ? instanceQuery.eq('id', link.advance_instance_id) : instanceQuery.eq('routing_id', link.routing_id);
  const { data: instance } = await instanceQuery.maybeSingle<{ id: string; sections: IntakeSection[] | null }>();
  if (!instance) return NextResponse.json({ error: 'This show is not ready yet.' }, { status: 409 });
  const schema = buildIntakeFormSchema(instance.sections);
  if (schema.sections.length === 0) return softFail('There are no questions to answer yet — please check back later.');

  // Parse + guard the upload (mirror receipts).
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
  if (files.some((f) => f.size > MAX_FILE_SIZE)) return NextResponse.json({ error: 'File(s) exceed 10MB' }, { status: 400 });

  type ImageMediaType = (typeof IMAGE_TYPES)[number];
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } };
  const contentBlocks: ContentBlock[] = [];
  const textParts: string[] = [];
  for (const file of files) {
    if (file.type === PDF_TYPE) {
      const text = await extractTextFromPdf(Buffer.from(await file.arrayBuffer())).catch(() => '');
      if (text) textParts.push(`[File: ${file.name}]\n${text}`);
    } else if (IMAGE_TYPES.includes(file.type as ImageMediaType)) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: file.type as ImageMediaType, data: base64 } });
    } else {
      return NextResponse.json({ error: 'Allowed file types: PDF, JPEG, PNG, GIF, WebP' }, { status: 400 });
    }
  }

  // Field manifest for the model (id · label · type, grouped by section).
  const manifest = schema.sections
    .map((s) => `Section "${s.template_id}" (${s.label}):\n` + s.fields.map((f) => `  - ${f.id}: ${f.label} [${f.type}]`).join('\n'))
    .join('\n');
  const promptText =
    `Extract values for these venue advance fields from the attached tech pack. ` +
    `Return ONLY a JSON object shaped { "<sectionId>": { "<fieldId>": value } } using ONLY these exact ids; omit anything not found. No markdown, no prose.\n\n${manifest}`;
  contentBlocks.push({ type: 'text', text: textParts.length ? `${promptText}\n\nDocument text:\n${textParts.join('\n\n---\n\n')}` : promptText });

  let extracted: AdvanceData;
  try {
    const { result: message, blocked } = await withAiUsage(
      { workspaceId: link.workspace_id, userId: null, endpoint: 'advance.intake.tech-pack', model: 'claude-haiku-4-5-20251001', metadata: { routing_id: link.routing_id } },
      async (anthropic) => {
        const r = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: 'You extract structured venue advance data. Output only valid JSON.',
          messages: [{ role: 'user', content: contentBlocks }],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return softFail('The reader is busy right now — please fill in the form below.');
    const textBlock = message?.content?.find((c) => c.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
    if (!cleaned) return softFail('We couldn’t read this file — the form below is still here.');
    extracted = JSON.parse(cleaned) as AdvanceData;
  } catch {
    // Any failure (parse, model, PDF) → degrade to the form. Never a dead end.
    return softFail('We couldn’t read this file — the form below is still here.');
  }

  // Sanitise against the live schema, flatten, store PENDING (source='tech_pack').
  const clean = sanitizeSubmission(schema, extracted);
  const pending = flattenToPending(clean);
  if (pending.length === 0) return softFail('We couldn’t find matching answers in that file — the form below is still here.');

  const rows = pending.map((p) => ({
    workspace_id: link.workspace_id,
    advance_instance_id: instance.id,
    link_id: link.id,
    section_id: p.section_id,
    field_id: p.field_id,
    value: p.value,
    source: 'tech_pack',
    provenance: 'From your tech pack',
    status: 'pending',
    reviewed_at: null,
    reviewed_by: null,
  }));
  const { error: pErr } = await service
    .from('intake_pending_answers')
    .upsert(rows, { onConflict: 'advance_instance_id,section_id,field_id,source' });
  if (pErr) return softFail('We read your pack but couldn’t save it — please fill in the form below.');

  return NextResponse.json({ ok: true, count: pending.length });
}
