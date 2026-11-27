/* ============================================
   Info pack reading — files from storage → what the model sees → suggestions.

   Files are uploaded by the browser straight to Storage (signed URLs; Vercel
   caps request bodies at 4.5 MB) under advance-packs/<workspace>/<tour>/ and
   KEPT — a pack saved with a show is reopened later to show where an answer
   came from. Paths are fenced to the caller's workspace + tour.

   Text PDFs go to the model as page-tagged text, so quotes can be checked
   against the page (findQuote) and highlighted. Scanned PDFs go as documents
   and images as images: the page is known, the exact line isn't.
   ============================================ */

import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/uploads/limits';
import type { AdvSection } from '@/lib/advance/board';
import { cleanExtraction, type Extra, type PackPage, type Suggestion } from '@/lib/advance/packs';

export const PACK_BUCKET = 'tour-files';
/** One upload cap for the whole app (src/lib/uploads/limits.ts — 100 MB,
 *  Nov 2026). The Supabase project's global limit must be at least this. */
export const MAX_PACK_FILE = MAX_UPLOAD_BYTES;
export const MAX_PACK_MB = MAX_UPLOAD_MB;
/** A scanned PDF (no text layer) goes to the model whole, base64-encoded, and
 *  the API caps a request at 32 MB — base64 adds a third, so ~22 MB of file.
 *  The API also reads at most 100 pages of a PDF at our context size. Text
 *  PDFs aren't affected: only their text is sent, whatever the file's size. */
const MAX_SCAN_BYTES = 22 * 1024 * 1024;
const MAX_SCAN_PAGES = 100;
export const MAX_PACK_FILES = 10;
const MAX_TEXT_CHARS = 160_000;
/** Speed (Nov 2026, Adam: "SLOW"): a read is as slow as its slowest call, and
 *  a call is slow because of what it WRITES (an answer + verbatim quote per
 *  question), not what it reads. So every document is split into small parts
 *  read side by side — each part only answers what's on its pages. Text: ~24k
 *  characters (~6k tokens) a part. Scans: 12 pages a part (pdf-lib). */
const CHUNK_CHARS = 24_000;
const SCAN_PART_PAGES = 12;

export function packPrefix(workspaceId: string, tourId: string): string {
  return `advance-packs/${workspaceId}/${tourId}/`;
}

export function isOwnPackPath(path: unknown, workspaceId: string, tourId: string): path is string {
  return (
    typeof path === 'string' &&
    path.length < 400 &&
    path.startsWith(packPrefix(workspaceId, tourId)) &&
    !path.includes('..') &&
    !path.includes('\\')
  );
}

export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'file';
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export type PackContent =
  | { kind: 'text'; name: string; mime: string; pages: PackPage[]; pageCount: number }
  | { kind: 'pdf'; name: string; mime: string; base64: string; pageCount: number | null }
  | { kind: 'image'; name: string; mime: ImageType; base64: string; pageCount: 1 };

export class PackReadError extends Error {}

async function pdfPages(buffer: Buffer): Promise<{ pages: PackPage[]; total: number }> {
  const mod = await import('pdf-parse');
  const PDFParse = (mod as unknown as {
    PDFParse: new (o: { data: Uint8Array }) => { getText: () => Promise<{ pages: { num: number; text: string }[]; total: number }>; destroy?: () => Promise<void> };
  }).PDFParse;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const r = await parser.getText();
    return { pages: (r.pages ?? []).map((p) => ({ num: p.num, text: p.text ?? '' })), total: r.total ?? r.pages?.length ?? 0 };
  } finally {
    if (typeof parser.destroy === 'function') await parser.destroy();
  }
}

function sheetPages(buffer: Buffer): PackPage[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return wb.SheetNames.map((n, i) => ({
    num: i + 1,
    text: `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`,
  }));
}

export async function readPackFile(service: SupabaseClient, path: string): Promise<{ buffer: Buffer; mime: string; name: string }> {
  const { data, error } = await service.storage.from(PACK_BUCKET).download(path);
  if (error || !data) throw new PackReadError(`Couldn’t open ${path.split('/').pop()}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length > MAX_PACK_FILE) throw new PackReadError(`${path.split('/').pop()} is over ${MAX_PACK_MB} MB`);
  const name = (path.split('/').pop() ?? 'file').replace(/^\d+-/, '');
  return { buffer, mime: data.type || '', name };
}

export async function toContent(file: { buffer: Buffer; mime: string; name: string }): Promise<PackContent> {
  const lower = file.name.toLowerCase();
  const mime = file.mime || '';
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const { pages, total } = await pdfPages(file.buffer);
    const chars = pages.reduce((n, p) => n + p.text.replace(/\s/g, '').length, 0);
    if (pages.length && chars >= Math.max(200, pages.length * 40)) {
      return { kind: 'text', name: file.name, mime: 'application/pdf', pages, pageCount: total || pages.length };
    }
    if (file.buffer.length > MAX_SCAN_BYTES) {
      throw new PackReadError(`“${file.name}” is a scan (no text in it) and too big for the AI to read as pictures (over 22 MB). Export it again with text, or in smaller parts.`);
    }
    if (total > MAX_SCAN_PAGES) {
      throw new PackReadError(`“${file.name}” is a scan of ${total} pages — the AI reads at most ${MAX_SCAN_PAGES}. Split it and drop the parts.`);
    }
    return { kind: 'pdf', name: file.name, mime: 'application/pdf', base64: file.buffer.toString('base64'), pageCount: total || null };
  }
  const img = IMAGE_TYPES.find((t) => t === mime) ?? (lower.match(/\.(jpe?g)$/) ? 'image/jpeg' : lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : null);
  if (img) return { kind: 'image', name: file.name, mime: img as ImageType, base64: file.buffer.toString('base64'), pageCount: 1 };
  if (/\.(xlsx|xls|ods)$/.test(lower)) {
    const pages = sheetPages(file.buffer);
    return { kind: 'text', name: file.name, mime, pages, pageCount: pages.length };
  }
  if (/\.(csv|txt|md|eml)$/.test(lower) || mime.startsWith('text/')) {
    return { kind: 'text', name: file.name, mime: mime || 'text/plain', pages: [{ num: 1, text: file.buffer.toString('utf8') }], pageCount: 1 };
  }
  if (/\.(docx?|pages)$/.test(lower)) throw new PackReadError(`“${file.name}” is a Word/Pages file — save it as PDF and drop that instead.`);
  throw new PackReadError(`“${file.name}” isn’t a file type the reader understands (PDF, image, Excel, CSV or text).`);
}

/* ---------- the model ---------- */

export const PACK_MODEL = process.env.LP_IMPORT_MODEL || 'claude-sonnet-5-5';

type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageType; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

const TOOL = {
  name: 'record_pack',
  description: 'Record what the venue document says.',
  input_schema: {
    type: 'object' as const,
    properties: {
      show: {
        type: 'object',
        description: 'Which show/venue the document is for, as it states it.',
        properties: { venue: { type: 'string' }, city: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD if a date is given' } },
      },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section_id: { type: 'string' },
            field_id: { type: 'string' },
            value: { type: 'string', description: 'The answer, short and in the document’s own facts. Times as HH:MM 24h. Yes/no questions: "yes" or "no".' },
            quote: { type: 'string', description: 'The exact words from the document this answer comes from, copied verbatim, at most ~200 characters.' },
            page: { type: 'integer', description: 'Page number the quote is on.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['section_id', 'field_id', 'value', 'quote', 'confidence'],
        },
      },
      extras: {
        type: 'array',
        description: 'Useful facts for a touring production that no question covers (max 15).',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'A short question-style label, e.g. "Bus shore power".' },
            value: { type: 'string' },
            quote: { type: 'string' },
            page: { type: 'integer' },
            section_id: { type: 'string', description: 'The section it belongs with, if one fits.' },
          },
          required: ['label', 'value', 'quote'],
        },
      },
    },
    required: ['answers'],
  },
};

function manifest(sections: AdvSection[]): string {
  return sections
    .map(
      (s) =>
        `Section "${s.label}" (section_id: ${s.template_id})\n` +
        (s.fields ?? [])
          .filter((f) => !['contact', 'file', 'labor_call'].includes(f.type))
          .map((f) => `  - field_id: ${f.id} · ${f.label} [${f.type}${f.options?.length ? `: ${f.options.join(' | ')}` : ''}]`)
          .join('\n'),
    )
    .join('\n');
}

function system(show: { venue: string | null; city: string | null; date: string; artist: string | null }, maxExtras: number): string {
  return `You read venue information packs (technical riders, production/hospitality sheets, site plans, emails) for a touring tour manager and answer their advance questions from them.

The show: ${show.artist ? `${show.artist} at ` : ''}${show.venue ?? 'the venue'}${show.city ? `, ${show.city}` : ''} on ${show.date}.

Rules:
- Answer a question ONLY when the document states it. Never guess, never use general knowledge. Leave a question out rather than invent.
- quote: copy the exact words you used from the document, verbatim (same spelling and numbers), at most ~200 characters. page: the page number it is on (pages are tagged <page n="…"> where the text is given).
- value: concise and practical, in the document's facts ("125A CEE 3-phase stage left, 15 m from the stage edge"). Times as HH:MM. Yes/no questions: "yes" or "no".
- If the document gives different values for the same thing, use the most specific and set confidence "low".
- extras: up to ${maxExtras} facts a touring production would want that none of the questions cover (power for buses, overtime/curfew penalties, forklift, Wi-Fi, parking limits, load limits…). Not contacts.
- show: the venue, city and date the document says it is for, if it says.
Always answer by calling record_pack.`;
}

function chunks(pages: PackPage[]): PackPage[][] {
  const out: PackPage[][] = [];
  let cur: PackPage[] = [];
  let n = 0;
  for (const p of pages) {
    if (n + p.text.length > CHUNK_CHARS && cur.length) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(p);
    n += p.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** A scan part's page numbers count from 1; put them back on the document's. */
export function shiftPages(raw: unknown, offset: number): unknown {
  if (!raw || typeof raw !== 'object' || !offset) return raw;
  const r = raw as { answers?: unknown; extras?: unknown };
  const shift = (list: unknown) =>
    Array.isArray(list) ? list.map((x) => (x && typeof x === 'object' && typeof (x as { page?: unknown }).page === 'number' ? { ...x, page: (x as { page: number }).page + offset } : x)) : list;
  return { ...r, answers: shift(r.answers), extras: shift(r.extras) };
}

export interface PackReadResult {
  suggestions: Suggestion[];
  extras: Extra[];
  show: { venue: string | null; city: string | null; date: string | null };
  truncated: boolean;
  /** Parts whose call failed — their pages weren't read. */
  failedParts: number;
  parts: number;
}

type Messages = { messages: { create: (req: unknown) => Promise<{ content: { type: string; name?: string; input?: unknown }[]; stop_reason?: string; usage: unknown }> } };

/** A scan split into parts of `size` pages, each its own small PDF. One part
 *  (the whole file) when it's short or pdf-lib can't open it. `first` is the
 *  part's first page in the original (1-based). */
export async function scanParts(base64: string, size = SCAN_PART_PAGES, limit = Infinity): Promise<{ base64: string; first: number; last: number }[]> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
    const n = Math.min(src.getPageCount(), limit);
    if (n <= size && n === src.getPageCount()) return [{ base64, first: 1, last: n }];
    const out: { base64: string; first: number; last: number }[] = [];
    for (let start = 0; start < n; start += size) {
      const doc = await PDFDocument.create();
      const idx = Array.from({ length: Math.min(size, n - start) }, (_, i) => start + i);
      for (const pg of await doc.copyPages(src, idx)) doc.addPage(pg);
      out.push({ base64: Buffer.from(await doc.save()).toString('base64'), first: start + 1, last: start + idx.length });
    }
    return out;
  } catch (e) {
    // Still read — whole, just slower. Logged so a pdf-lib failure isn't silent.
    console.warn('[advance/packs] couldn’t split the scan; reading it whole', e instanceof Error ? e.message : e);
    return [{ base64, first: 1, last: 0 }];
  }
}

/** Progress hooks for a background read: `planned` once per file with its
 *  number of parts, `done` after each part's call (answered or not). */
export interface ReadProgress {
  planned: (parts: number) => void;
  done: () => void;
}

/** Read one file against the day's questions. `run` is withAiUsage's runner. */
export async function extractFromContent(
  content: PackContent,
  sections: AdvSection[],
  show: { venue: string | null; city: string | null; date: string; artist: string | null },
  fileIndex: number,
  run: (fn: (anthropic: Messages) => Promise<{ result: unknown; usage: unknown }>) => Promise<unknown | null>,
  progress?: ReadProgress,
): Promise<PackReadResult> {
  const ask = `Questions:\n${manifest(sections)}`;
  // Each part carries the page its numbering starts at: text parts are tagged
  // with the real page numbers (offset 0); a scan part counts from 1, so its
  // pages are shifted back by `first - 1` before they're checked.
  const calls: { blocks: Block[]; offset: number }[] = [];
  let truncated = false;
  if (content.kind === 'text') {
    let pages = content.pages;
    const total = pages.reduce((n, p) => n + p.text.length, 0);
    if (total > MAX_TEXT_CHARS * 2) {
      truncated = true;
      let n = 0;
      pages = pages.filter((p) => (n += p.text.length) <= MAX_TEXT_CHARS * 2);
    }
    const groups = chunks(pages);
    for (const group of groups) {
      const text = group.map((p) => `<page n="${p.num}">\n${p.text}\n</page>`).join('\n');
      const part = groups.length > 1 ? ` (part: pages ${group[0].num}–${group[group.length - 1].num} of ${content.pageCount})` : '';
      calls.push({ blocks: [{ type: 'text', text: `Document “${content.name}”${part}:\n${text}\n\n${ask}` }], offset: 0 });
    }
  } else if (content.kind === 'pdf') {
    const parts = await scanParts(content.base64);
    for (const p of parts) {
      const part =
        parts.length > 1
          ? `These are pages ${p.first}–${p.last} of a ${content.pageCount ?? p.last}-page document; give page numbers counting from 1 at the first page shown here.`
          : 'Page numbers are the PDF’s pages.';
      calls.push({ blocks: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 } }, { type: 'text', text: `Document “${content.name}”. ${part}\n\n${ask}` }], offset: p.first - 1 });
    }
  } else {
    calls.push({ blocks: [{ type: 'image', source: { type: 'base64', media_type: content.mime, data: content.base64 } }, { type: 'text', text: `Image “${content.name}” (page 1).\n\n${ask}` }], offset: 0 });
  }
  progress?.planned(calls.length);
  let failedParts = 0;
  const maxExtras = calls.length > 1 ? 8 : 15;

  const outs = await Promise.all(
    calls.map(async ({ blocks, offset }) => {
      try {
        const raw = await run(async (anthropic) => {
          const r = await anthropic.messages.create({
            model: PACK_MODEL,
            max_tokens: 8000,
            system: system(show, maxExtras),
            tools: [TOOL],
            tool_choice: { type: 'tool', name: 'record_pack' },
            messages: [{ role: 'user', content: blocks }],
          });
          if (r.stop_reason === 'max_tokens') truncated = true;
          const tool = r.content.find((b) => b.type === 'tool_use' && b.name === 'record_pack');
          return { result: tool?.input ?? null, usage: r.usage };
        });
        return offset ? shiftPages(raw, offset) : raw;
      } catch (e) {
        // One part failing (overloaded, timeout) keeps the others' answers;
        // the read says it's incomplete rather than throwing them all away.
        console.error('[advance/packs] a part failed', content.name, e);
        failedParts += 1;
        return null;
      } finally {
        progress?.done();
      }
    }),
  );

  const pages = content.kind === 'text' ? content.pages : null;
  const suggestions: Suggestion[] = [];
  const extras: Extra[] = [];
  let guess: PackReadResult['show'] = { venue: null, city: null, date: null };
  for (const raw of outs) {
    if (!raw) continue;
    const cleaned = cleanExtraction(raw, sections, pages, fileIndex);
    suggestions.push(...cleaned.suggestions);
    extras.push(...cleaned.extras);
    const s = (raw as { show?: { venue?: string; city?: string; date?: string } }).show;
    if (s && !guess.venue) guess = { venue: s.venue ?? null, city: s.city ?? null, date: s.date ?? null };
  }
  return { suggestions, extras, show: guess, truncated, failedParts, parts: calls.length };
}
