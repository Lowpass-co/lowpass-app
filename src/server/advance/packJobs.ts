/* ============================================
   Info pack reads as background jobs (Nov 2026, Adam: "SLOW, and gives you
   no info on how long it'll take, and doesnt encourage you to close the
   window and come back").

   POST starts a row in advance_pack_reads (migration 300) and answers at
   once; the read runs after the response (next/server `after`) and writes
   parts_done / parts_total as each part comes back, then the result. The
   browser polls; closing it changes nothing — the result waits on the show.

   Service role only (the table has no client policies): every caller has
   passed requireWrite({ area: 'advance', tourId }) first, and every read here
   is fenced by workspace + tour.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdvSection } from '@/lib/advance/board';
import { mergeExtras, mergeSuggestions } from '@/lib/advance/packs';
import { withAiUsage } from '@/lib/ai/usage';
import { PACK_MODEL, PackReadError, extractFromContent, readPackFile, toContent, type PackContent } from './packReader';

export type PackJobStatus = 'reading' | 'done' | 'failed';
export interface PackJobFile { path: string; name: string; size: number | null; type: string | null }

/** A read still "reading" after this is dead (the function was stopped at
 *  its 300 s limit, or the instance went away). Route maxDuration + margin. */
export const PACK_JOB_STALE_MS = 330_000;
/** Shown as "usually about…" until there are finished reads to go by. */
export const DEFAULT_ESTIMATE_S = 45;
/** Parts read at once per job — enough to be quick, few enough not to trip
 *  the API's rate limit when several shows are read together. */
const PARALLEL = 6;

export interface PackJobRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  user_id: string | null;
  files: PackJobFile[];
  status: PackJobStatus;
  parts_total: number;
  parts_done: number;
  result: PackJobResult | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  reviewed_at: string | null;
}

export interface PackJobResult {
  files: {
    path: string;
    name: string;
    kind: PackContent['kind'] | null;
    mime: string | null;
    pageCount: number | null;
    error: string | null;
    textPages: { num: number; text: string }[] | null;
    found: number;
    show: { venue: string | null; city: string | null; date: string | null } | null;
    truncated: boolean;
    failedParts: number;
  }[];
  suggestions: ReturnType<typeof mergeSuggestions>;
  extras: ReturnType<typeof mergeExtras>;
  labels: Record<string, { section: string; label: string; type: string }>;
  sections: { template_id: string; label: string }[];
  /** Set when the AI budget stopped the read. */
  blocked?: string;
}

/** The status a row really has: a "reading" row past its time is failed. */
export function effectiveStatus(row: Pick<PackJobRow, 'status' | 'created_at'>, now = Date.now()): PackJobStatus {
  if (row.status === 'reading' && now - new Date(row.created_at).getTime() > PACK_JOB_STALE_MS) return 'failed';
  return row.status;
}

/** Median seconds of the last finished reads — what "usually" means. */
export function medianSeconds(durationsMs: number[], fallback = DEFAULT_ESTIMATE_S): number {
  const xs = durationsMs.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (xs.length < 3) return fallback;
  const m = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return Math.max(5, Math.round(m / 1000));
}

export async function estimateSeconds(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('advance_pack_reads')
    .select('created_at, finished_at')
    .eq('status', 'done')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(30);
  const rows = (data ?? []) as { created_at: string; finished_at: string }[];
  return medianSeconds(rows.map((r) => new Date(r.finished_at).getTime() - new Date(r.created_at).getTime()));
}

/** Run `fn` over items with at most `n` running at once. */
export function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

export async function createPackJob(
  service: SupabaseClient,
  job: { workspaceId: string; tourId: string; routingId: string; userId: string; files: PackJobFile[] },
): Promise<string> {
  const { data, error } = await service
    .from('advance_pack_reads')
    .insert({ workspace_id: job.workspaceId, tour_id: job.tourId, routing_id: job.routingId, user_id: job.userId, files: job.files })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Couldn’t start the read');
  return (data as { id: string }).id;
}

/** The read itself — runs after the response. Never throws: a failure is
 *  written to the row, where the browser (or the TM, later) finds it. */
export async function runPackJob(
  service: SupabaseClient,
  job: { id: string; workspaceId: string; userId: string; routingId: string; paths: string[] },
  sections: AdvSection[],
  ctx: { venue: string | null; city: string | null; date: string; artist: string | null },
): Promise<void> {
  let total = 0;
  let done = 0;
  let lastWrite = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const writeProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 800) return;
    lastWrite = now;
    const snapshot = { parts_total: total, parts_done: done };
    pending = pending.then(() => service.from('advance_pack_reads').update(snapshot).eq('id', job.id).eq('status', 'reading'));
  };

  try {
    const contents: (PackContent | { error: string; name: string })[] = await Promise.all(
      job.paths.map(async (p) => {
        try {
          return await toContent(await readPackFile(service, p));
        } catch (e) {
          if (!(e instanceof PackReadError)) console.error('[advance/packs] reading failed', p, e);
          return { error: e instanceof PackReadError ? e.message : 'Couldn’t read this file', name: p.split('/').pop() ?? 'file' };
        }
      }),
    );

    const slot = limiter(PARALLEL);
    let blocked: string | undefined;
    const results = await Promise.all(
      contents.map(async (c, i) => {
        if ('error' in c) return null;
        return extractFromContent(
          c,
          sections,
          ctx,
          i,
          (fn) =>
            slot(async () => {
              const r = await withAiUsage(
                { workspaceId: job.workspaceId, userId: job.userId, endpoint: 'advance.packs.read', model: PACK_MODEL, metadata: { routing_id: job.routingId, read_id: job.id } },
                fn as never,
              );
              if (r.blocked) blocked = String(r.blockReason ?? 'cap');
              return r.result;
            }),
          {
            planned: (n) => {
              total += n;
              writeProgress(true);
            },
            done: () => {
              done += 1;
              writeProgress();
            },
          },
        );
      }),
    );

    const ok = results.filter((r): r is NonNullable<typeof r> => !!r);
    const labels: PackJobResult['labels'] = {};
    for (const s of sections) for (const f of s.fields ?? []) labels[`${s.template_id}:${f.id}`] = { section: s.label, label: f.label, type: f.type };
    const result: PackJobResult = {
      files: contents.map((c, i) => ({
        path: job.paths[i],
        name: 'error' in c ? c.name.replace(/^\d+-/, '') : c.name,
        kind: 'error' in c ? null : c.kind,
        mime: 'error' in c ? null : c.mime,
        pageCount: 'error' in c ? null : c.pageCount,
        error: 'error' in c ? c.error : null,
        // Spreadsheets / text have no rendering of their own: the review
        // screen shows (and highlights) this text. PDFs render from the file.
        textPages: !('error' in c) && c.kind === 'text' && c.mime !== 'application/pdf' ? c.pages.map((p) => ({ num: p.num, text: p.text.slice(0, 60_000) })) : null,
        found: results[i]?.suggestions.length ?? 0,
        show: results[i]?.show ?? null,
        truncated: results[i]?.truncated ?? false,
        failedParts: results[i]?.failedParts ?? 0,
      })),
      suggestions: mergeSuggestions(ok.map((r) => r.suggestions)),
      extras: mergeExtras(ok.map((r) => r.extras), sections),
      labels,
      sections: sections.map((s) => ({ template_id: s.template_id, label: s.label })),
      ...(blocked ? { blocked } : {}),
    };
    await pending;
    await service
      .from('advance_pack_reads')
      .update({ status: 'done', result, parts_total: total, parts_done: done, finished_at: new Date().toISOString() })
      .eq('id', job.id);
  } catch (e) {
    console.error('[advance/packs] read failed', job.id, e);
    await pending.catch(() => null);
    await service
      .from('advance_pack_reads')
      .update({ status: 'failed', error: 'The read stopped part-way. Try again — the files are kept.', finished_at: new Date().toISOString() })
      .eq('id', job.id);
  }
}
