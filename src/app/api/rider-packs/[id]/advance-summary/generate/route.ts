/* ============================================
   LOWPASS — POST /api/rider-packs/[id]/advance-summary/generate
   (Sprint 12 §9d.b)

   Calls Claude (haiku-4-5) to autofill the advance_summary
   section's body rows from the rider's other content. Adam
   clicks "Generate from rider content" in the editor;
   the endpoint pulls every non-summary section's text,
   builds the §9 prompt template, and returns one one-line
   summary per subject the rider currently has.

   Auth: workspace member (RLS scopes the pack lookup).
   Rate limit: 60s per pack via an in-memory Map on the
     Vercel function instance. Cold starts reset it; that's
     fine — the limit is a "don't burn the API key" guard,
     not a security boundary.

   Model: claude-haiku-4-5-20251001 (per §9 spec — fast +
   cheap for summarisation, ~$0.01 per call).
   Max output tokens: 500.

   Response parse: model returns one line per subject in the
   same order as the prompt, prefixed with the subject and
   an em-dash. We split on em-dash to map back to rows by
   POSITION (not by subject name — the model occasionally
   rephrases the subject heading). If the line count doesn't
   match the subject count, retry once with temperature=0
   for determinism. Second failure returns 422.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { withAiUsage, aiCapExceededResponse, type BlockReason } from '@/lib/ai/usage';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { RiderPack, RiderSection, FieldText, Field } from '@/lib/rider-packs/types';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 500;
const RATE_LIMIT_MS = 60_000;

/** Per-pack last-call timestamp. Lives on the function
 *  instance — Vercel cold-starts will reset; that's
 *  acceptable behaviour for this guard. */
const lastCallByPack = new Map<string, number>();

const PROMPT_HEADER = `You are summarising a music tour rider for a busy promoter who only has 30 seconds to scan it.

The rider's body content is below. For each subject listed at the end, write ONE clear, scannable line that captures the most important fact about that subject from the body content. Keep each line under 90 characters.

If a subject isn't covered in the body content, return "Not specified in rider" for that subject.`;

const PROMPT_FORMAT_TAIL = `RESPONSE FORMAT: Return one line per subject, in the same order, prefixed with the subject and an em-dash. Example:
Schedule — Access 1p, Load 2p, Soundcheck 4p, Doors 7p, Curfew 12a
Transport — 3 SUVs or 2 vans; parking must be confirmed 1hr pre/post

Now produce the response.`;

interface SummaryRow {
  subject: string;
  body: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI generate not configured — ANTHROPIC_API_KEY missing.' },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;

  /* Rate limit. */
  const now = Date.now();
  const last = lastCallByPack.get(packId);
  if (last && now - last < RATE_LIMIT_MS) {
    const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
    return NextResponse.json(
      { error: `Hold on — try again in ${wait}s.`, retry_after_seconds: wait },
      { status: 429 },
    );
  }

  /* Pack lookup. RLS scopes by workspace. */
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', packId)
    .maybeSingle<RiderPack>();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  /* Pull every section so we can pick the summary target +
     concatenate the rest's text. */
  const { data: sectionsData, error: secErr } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('pack_id', packId)
    .order('sort_order');
  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }
  const sections = (sectionsData ?? []) as RiderSection[];

  /* Find the advance_summary section. If multiple exist (Adam
     can in principle add several), use the first one — the
     UI's generate button maps to ONE active section anyway. */
  const summarySection = sections.find((s) => s.section_type === 'advance_summary');
  if (!summarySection) {
    return NextResponse.json(
      { error: 'No advance_summary section on this pack.' },
      { status: 400 },
    );
  }

  const summaryRows = parseSummaryRows(summarySection.metadata);
  if (summaryRows.length === 0) {
    return NextResponse.json(
      { error: 'Advance summary section has no rows to fill.' },
      { status: 400 },
    );
  }

  /* Concatenate the rider's body content from sections other
     than the summary itself. Two text sources: legacy
     FieldText.value strings + Tiptap docs on rich_text
     sections (we walk + extract text nodes). channel_list
     sections are skipped — too structured for the summary
     prompt. */
  const riderBody = sections
    .filter((s) => s.id !== summarySection.id)
    .map((s) => extractSectionText(s))
    .filter((t) => t.trim().length > 0)
    .join('\n\n');

  if (!riderBody.trim()) {
    return NextResponse.json(
      {
        error:
          'No rider body content to summarise. Add some content to your rider sections first.',
      },
      { status: 400 },
    );
  }

  const subjectList = summaryRows.map((r) => r.subject).join('\n');
  const prompt = `${PROMPT_HEADER}\n\nRIDER BODY:\n${riderBody}\n\nSUBJECTS:\n${subjectList}\n\n${PROMPT_FORMAT_TAIL}`;

  const usageCtx = {
    workspaceId: pack.workspace_id,
    userId: user.id,
    endpoint: 'rider-packs.advance-summary',
    model: MODEL,
    metadata: { pack_id: packId },
  };

  /* First attempt with the model's default temperature. */
  let attempt = await callAndParse(usageCtx, prompt, summaryRows, undefined);
  if (attempt.blocked) return aiCapExceededResponse(attempt.blockReason ?? 'workspace_budget');
  let attemptRows = attempt.rows;
  /* Retry once at temperature=0 for determinism if the parse
     didn't match the subject count. */
  if (attemptRows === null) {
    attempt = await callAndParse(usageCtx, prompt, summaryRows, 0);
    if (attempt.blocked) return aiCapExceededResponse(attempt.blockReason ?? 'workspace_budget');
    attemptRows = attempt.rows;
  }
  if (attemptRows === null) {
    return NextResponse.json(
      {
        error:
          'AI response didn\'t match the expected shape. Try again or fill the summary manually.',
      },
      { status: 422 },
    );
  }

  /* Stamp the rate limit AFTER a successful call so a 503/422
     failure path doesn't lock the operator out. */
  lastCallByPack.set(packId, Date.now());

  return NextResponse.json({ rows: attemptRows });
}

interface CallAndParseResult {
  rows: SummaryRow[] | null;
  blocked: boolean;
  blockReason?: BlockReason;
}

async function callAndParse(
  usageCtx: {
    workspaceId: string;
    userId: string | null;
    endpoint: string;
    model: string;
    metadata?: Record<string, unknown>;
  },
  prompt: string,
  subjectRows: SummaryRow[],
  temperature: number | undefined,
): Promise<CallAndParseResult> {
  try {
    const { result: response, blocked, blockReason } = await withAiUsage(
      usageCtx,
      async (anthropic) => {
        const r = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          ...(temperature !== undefined ? { temperature } : {}),
          messages: [{ role: 'user', content: prompt }],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return { rows: null, blocked: true, blockReason };
    if (!response) return { rows: null, blocked: false };
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length !== subjectRows.length) return { rows: null, blocked: false };
    /* Each line should split on em-dash (—) into [subject, body].
       Operators rephrase subjects sometimes; trust positional
       order and only consume the body half. */
    const out: SummaryRow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split('—');
      if (parts.length < 2) {
        /* No em-dash — fall back to taking the whole line as
           the body. Preserves graceful degradation. */
        out.push({ subject: subjectRows[i].subject, body: line });
      } else {
        const body = parts.slice(1).join('—').trim();
        out.push({ subject: subjectRows[i].subject, body });
      }
    }
    return { rows: out, blocked: false };
  } catch {
    return { rows: null, blocked: false };
  }
}

/** Extract free-text content from a section for the prompt
 *  body. Skips channel_list (structured, not summary
 *  material); reads legacy FieldText + rich_text Tiptap. */
function extractSectionText(section: RiderSection): string {
  const parts: string[] = [];
  if (section.title?.trim()) {
    parts.push(`## ${section.title.trim()}`);
  }
  if (section.section_type === 'rich_text') {
    const content = (section.metadata as { content?: unknown } | null)?.content;
    if (content) {
      parts.push(extractTiptapText(content));
    }
  } else if (
    section.section_type === 'channel_list' ||
    section.section_type === 'advance_summary'
  ) {
    /* skip — structured content, not appropriate for the
       summary prompt. */
  } else {
    /* legacy 'fields' section. Pull FieldText.value strings. */
    const fields = (section.fields ?? []) as Field[];
    for (const f of fields) {
      if (f.type === 'text' && typeof (f as FieldText).value === 'string') {
        const value = (f as FieldText).value.trim();
        if (value) {
          if (f.label?.trim()) parts.push(`${f.label.trim()}: ${value}`);
          else parts.push(value);
        }
      }
    }
  }
  return parts.join('\n');
}

interface TiptapNode {
  type?: string;
  content?: TiptapNode[];
  text?: string;
}

function extractTiptapText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as TiptapNode;
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) {
    const inner = n.content.map(extractTiptapText).join('');
    /* Inject a newline after block-level nodes to keep the
       prompt body readable. */
    if (n.type === 'heading' || n.type === 'paragraph' || n.type === 'listItem') {
      return inner + '\n';
    }
    return inner;
  }
  return '';
}

function parseSummaryRows(metadata: unknown): SummaryRow[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const summary = (metadata as { summary?: unknown }).summary;
  if (!Array.isArray(summary)) return [];
  return summary
    .map((row): SummaryRow | null => {
      if (!row || typeof row !== 'object') return null;
      const r = row as { subject?: unknown; body?: unknown };
      const subject = typeof r.subject === 'string' ? r.subject : '';
      const body = typeof r.body === 'string' ? r.body : '';
      if (!subject.trim()) return null;
      return { subject, body };
    })
    .filter((r): r is SummaryRow => r !== null);
}
