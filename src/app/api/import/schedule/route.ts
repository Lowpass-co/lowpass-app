/* ============================================
   LOWPASS — POST /api/import/schedule — read a tour book with AI (Oct 2026)

   JSON: { paths: string[] } — files the browser already uploaded to storage
   via /api/import/schedule/upload (Vercel caps request bodies at 4.5 MB, so
   files never come through here) — and/or { text } (pasted), plus optional
   { tour_id } (an existing tour — its name and dates help the model pick the
   right year). Each uploaded file is deleted once read. Returns PROPOSED days for the review panel. It writes
   NOTHING; the user approves, edits, and the apply route writes.

   Reading:
     • PDF → its text layer (cheap, and long books split across parallel
       calls). A scanned PDF with no text goes to the model as a document.
     • Images → vision. Excel/CSV → each sheet as CSV text. .txt → text.
     • Word files are refused with "save it as PDF" — no parser here.
   The model answers through a tool schema (record_schedule), so the output
   is structured JSON, then normaliseExtraction validates every date and
   maps day types onto the app's vocabulary.

   Cost is metered + capped by withAiUsage like every AI route.
   ============================================ */

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { IMPORT_BUCKET, isOwnImportPath } from '@/lib/import/importStorage';
import { requireTourInWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';
import {
  chunkText,
  mergeExtractions,
  normaliseExtraction,
  type NormalisedExtraction,
} from '@/lib/import/scheduleImport';

export const dynamic = 'force-dynamic';
// A long tour book read in parallel chunks can take a minute or two.
export const maxDuration = 300;

const MODEL = process.env.LP_IMPORT_MODEL || 'claude-sonnet-4-5';
const RATE_LIMIT_MS = 5_000;
const lastCallByUser = new Map<string, number>();

const MAX_FILE = 25 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_CHUNKS = 6;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageType; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

const TOOL = {
  name: 'record_schedule',
  description: 'Record every dated day of the tour found in the document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tour: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tour name if stated' },
          artist: { type: 'string', description: 'Artist / band name if stated' },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
      days: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            day_type: { type: 'string', description: 'show | festival | rehearsal | press | radio | tv | travel | off — comma-join if several' },
            venue_name: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
            address: { type: 'string' },
            notes: { type: 'string', description: 'Short facts for this day that fit no other field' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            source: { type: 'string', description: 'A short quote from the document, ≤ 80 chars' },
          },
          required: ['date', 'day_type', 'confidence'],
        },
      },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Anything ambiguous the user should check' },
    },
    required: ['days'],
  },
};

function systemPrompt(today: string, tour: { name: string; start: string | null; end: string | null } | null): string {
  return `You read touring documents (tour books, routing grids, itineraries, day sheets, spreadsheets) for a tour manager and record the tour's day-by-day SCHEDULE.

Rules:
- Exactly one entry per calendar date that the document schedules (shows, festivals, travel, days off, rehearsals, press). Never invent a date the document does not give.
- Dates as YYYY-MM-DD. If the year is missing, infer it from context: the tour name, other dated entries, and weekday names (a "Fri 9 Apr" must be a Friday). Today is ${today}; touring documents are usually about upcoming dates. If the year is still a guess, set confidence "low" and add a warning.
- day_type: show | festival | rehearsal | press | radio | tv | travel | off. A show day the band also travels on is "show,travel". "Day off" / "dark" → off. "Drive" / "fly" days → travel. Production / tech days → rehearsal.
- venue_name is the venue only (no city). city is the city only. country as written (e.g. UK, USA, Spain). address only if the document gives it.
- notes: at most ~200 characters of facts for that day that fit no other field — e.g. support act, key times ("Load-in 14:00 · Doors 19:00 · Set 21:15"), hotel name, drive length. No contacts, phone numbers or guest lists.
- confidence: high = stated plainly; medium = inferred (year, city from a known venue); low = a guess.
- source: a short quote you read it from.
- Put anything ambiguous (conflicting dates, two venues on one day, a missing year) in warnings, in plain English.
${tour ? `\nThis is for the tour "${tour.name}"${tour.start && tour.end ? ` currently set to ${tour.start} – ${tour.end}` : ''}. Dates outside that range are fine if the document says so.` : ''}
Always answer by calling record_schedule.`;
}

async function pdfText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const PDFParse = (mod as { PDFParse: new (opts: { data: ArrayBuffer | Uint8Array }) => { getText: () => Promise<{ text: string }> } }).PDFParse;
  const parser = new PDFParse({ data: buffer });
  try {
    return ((await parser.getText())?.text ?? '').trim();
  } finally {
    const p = parser as unknown as { destroy?: () => Promise<void> };
    if (typeof p.destroy === 'function') await p.destroy();
  }
}

/** A workbook → one CSV block per sheet. Dates are written as YYYY-MM-DD
 *  (xlsx's own CSV writer prints them US-style — "10/20/26" — which a UK
 *  tour book would misread), times as HH:MM. */
function sheetText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pad = (n: number) => String(n).padStart(2, '0');
  const cell = (v: unknown): string => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      const date = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
      const time = v.getUTCHours() || v.getUTCMinutes() ? ` ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : '';
      // A time-only cell is anchored on 1899-12-30 — print just the time.
      return date.startsWith('1899-12-3') ? time.trim() : `${date}${time}`;
    }
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return wb.SheetNames.map((n) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false });
    const csv = rows.map((r) => r.map(cell).join(',')).filter((l) => l.replace(/,/g, '').trim()).join('\n');
    return csv ? `[Sheet: ${n}]\n${csv}` : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { user, workspaceId } = auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable — contact support.' }, { status: 503 });
  }
  const limited = checkRateLimit(lastCallByUser, user.id, RATE_LIMIT_MS);
  if (limited) return limited;

  let body: { paths?: unknown; text?: unknown; tour_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Optional tour context (and its workspace gate).
  const tourId = typeof body.tour_id === 'string' ? body.tour_id.trim() : '';
  let tourCtx: { name: string; start: string | null; end: string | null } | null = null;
  if (tourId) {
    const gate = await requireTourInWorkspace(supabase, tourId, workspaceId);
    if (gate) return gate;
    const { data: t } = await supabase.from('tours').select('name, start_date, end_date').eq('id', tourId).maybeSingle();
    if (t) tourCtx = { name: String((t as { name?: string }).name ?? ''), start: (t as { start_date?: string | null }).start_date ?? null, end: (t as { end_date?: string | null }).end_date ?? null };
  }

  const paths = Array.isArray(body.paths) ? (body.paths as unknown[]).map(String) : [];
  const pasted = typeof body.text === 'string' ? body.text.trim() : '';
  if (!paths.length && !pasted) {
    return NextResponse.json({ error: 'Add a file or paste some text.' }, { status: 400 });
  }
  if (paths.length > 10) return NextResponse.json({ error: 'At most 10 files at once.' }, { status: 400 });
  if (paths.some((p) => !isOwnImportPath(p, workspaceId))) {
    return NextResponse.json({ error: 'Unknown file.' }, { status: 403 });
  }

  // Fetch the uploads (service role — the path fence above is the authorisation).
  const svc = createServiceSupabaseClient();
  const removeUploads = () => (paths.length ? svc.storage.from(IMPORT_BUCKET).remove(paths).then(() => undefined, () => undefined) : Promise.resolve());
  const files: Array<{ name: string; type: string; buf: Buffer }> = [];
  for (const p of paths) {
    const { data, error } = await svc.storage.from(IMPORT_BUCKET).download(p);
    if (error || !data) {
      await removeUploads();
      return NextResponse.json({ error: 'An uploaded file went missing — try again.' }, { status: 400 });
    }
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > MAX_FILE) {
      await removeUploads();
      return NextResponse.json({ error: 'Each file must be under 25 MB.' }, { status: 400 });
    }
    // "imports/<ws>/<batch>/<i>-<name>" → the original-ish name
    const name = p.split('/').pop()!.replace(/^\d+-/, '');
    files.push({ name, type: data.type || '', buf });
  }
  if (files.reduce((s, f) => s + f.buf.length, 0) > MAX_TOTAL) {
    await removeUploads();
    return NextResponse.json({ error: 'Files must total under 40 MB.' }, { status: 400 });
  }
  // Read once — the files aren't needed after this request.
  await removeUploads();

  const texts: string[] = [];
  const media: Block[] = [];
  const read: string[] = [];
  for (const f of files) {
    const name = f.name || 'file';
    const lower = name.toLowerCase();
    const buf = f.buf;
    try {
      if (f.type === 'application/pdf' || lower.endsWith('.pdf')) {
        const text = await pdfText(buf);
        if (text.replace(/\s+/g, '').length >= 200) texts.push(`[File: ${name}]\n${text}`);
        else media.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } });
      } else if ((IMAGE_TYPES as readonly string[]).includes(f.type)) {
        media.push({ type: 'image', source: { type: 'base64', media_type: f.type as ImageType, data: buf.toString('base64') } });
      } else if (/\.(xlsx|xlsm|xls|ods)$/.test(lower) || f.type.includes('spreadsheet') || f.type.includes('ms-excel')) {
        texts.push(`[File: ${name}]\n${sheetText(buf)}`);
      } else if (f.type.startsWith('text/') || /\.(csv|txt|md|tsv)$/.test(lower)) {
        // CSV / text as written — no re-parsing, so dates stay as the author typed them.
        texts.push(`[File: ${name}]\n${buf.toString('utf8')}`);
      } else if (/\.(docx?|pages)$/.test(lower)) {
        return NextResponse.json({ error: `“${name}” is a Word/Pages file — save it as PDF and drop that instead.` }, { status: 400 });
      } else {
        return NextResponse.json({ error: `Can't read “${name}”. Use PDF, an image, Excel/CSV or text.` }, { status: 400 });
      }
      read.push(name);
    } catch {
      return NextResponse.json({ error: `Couldn't open “${name}”. Is it a valid file?` }, { status: 400 });
    }
  }
  if (pasted) texts.push(`[Pasted text]\n${pasted.slice(0, 400_000)}`);

  const chunks = texts.length ? chunkText(texts.join('\n\n---\n\n')) : [];
  if (chunks.length > MAX_CHUNKS) {
    return NextResponse.json({ error: 'That document is too long to read in one go — split it (e.g. per leg) and import each part.' }, { status: 413 });
  }

  // One call per text chunk (parallel); images / scanned PDFs ride the first.
  const calls: Block[][] = chunks.length ? chunks.map((c, i) => {
    const intro: Block = {
      type: 'text',
      text: chunks.length > 1 ? `Part ${i + 1} of ${chunks.length} of the same material. Record the days in this part.\n\n${c}` : c,
    };
    return i === 0 ? [...media, intro] : [intro];
  }) : [[...media, { type: 'text', text: 'Record the schedule shown in the attached file(s).' }]];

  const today = new Date().toISOString().slice(0, 10);
  const system = systemPrompt(today, tourCtx);

  let parts: NormalisedExtraction[];
  try {
    const results = await Promise.all(
      calls.map((content, i) =>
        withAiUsage(
          {
            workspaceId,
            userId: user.id,
            endpoint: 'import.schedule',
            model: MODEL,
            metadata: { tour_id: tourId || null, chunk: i + 1, chunks: calls.length, files: read },
          },
          async (anthropic) => {
            const r = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 16_000,
              system,
              tools: [TOOL],
              tool_choice: { type: 'tool', name: TOOL.name },
              // The SDK's content-block union is wider than ours; the shapes match.
              messages: [{ role: 'user', content: content as never }],
            });
            return { result: r, usage: r.usage };
          },
        ),
      ),
    );
    const blocked = results.find((r) => r.blocked);
    if (blocked) return aiCapExceededResponse(blocked.blockReason ?? 'workspace_budget');
    parts = results.map((r) => {
      const msg = r.result;
      const tool = msg?.content?.find((c) => c.type === 'tool_use') as { input?: unknown } | undefined;
      const n = normaliseExtraction(tool?.input ?? {});
      if (msg?.stop_reason === 'max_tokens') n.warnings.push('The document was very long — some days near the end may be missing. Check the last dates.');
      return n;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reading failed';
    return NextResponse.json({ error: `The AI couldn't read that: ${message}` }, { status: 502 });
  }

  markRateLimit(lastCallByUser, user.id);
  const merged = mergeExtractions(parts);
  if (!merged.days.length) {
    merged.warnings.unshift('No dated days were found. Is this the schedule / routing page of the document?');
  }
  return NextResponse.json({ ...merged, filesRead: read, model: MODEL, chunks: calls.length });
}
