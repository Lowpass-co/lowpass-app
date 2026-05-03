/**
 * UX08b — searchAll fan-out across the canonical entity registry + a
 * handful of non-entity tables (tours / budget lines / bug reports /
 * rider packs / rental jobs).
 *
 * Workspace scoping comes from RLS on the underlying tables; we don't
 * inline workspace lookups. Each canonical-entity descriptor's
 * `search()` already routes through its REST endpoint with the same
 * RLS guarantees.
 *
 * Result type is a unified shape — the consumer (CommandPalette) groups
 * by `kind`, scores via the fuzzy matcher, and dispatches `action` on
 * Enter (entity slide-over for canonical kinds, navigate for the rest).
 *
 * Deferred kinds per UX08b §10 + UX21 follow-up:
 *   - 'expense' (storage shape settled in UX19; not yet wired)
 *   - 'file'    (would need a file_references / rider_assets union)
 */

import { createClient } from '@/lib/supabase-client';
import type { EntityKind } from '@/lib/entities/types';
import { getEntityDescriptor } from '@/lib/entities/registry';
// Side-effect import: ensures entity descriptors are registered before searchAll runs.
import '@/lib/entities';
import { fuzzyMatch, type FuzzyMatch } from '@/lib/search/fuzzy';

export type SearchKind =
  // Canonical entity kinds (entity registry)
  | 'person'
  | 'flight'
  | 'room'
  | 'gear'
  | 'show'
  | 'deal-memo'
  // Non-entity searchable kinds (direct supabase queries)
  | 'tour'
  | 'budget-line'
  | 'bug-report'
  | 'rider-pack'
  | 'rental-job';

export type SearchAction =
  | { type: 'open-entity'; kind: EntityKind; id: string }
  | { type: 'navigate'; href: string };

export type SearchResult = {
  id: string;
  kind: SearchKind;
  label: string;
  secondary?: string;
  /** Scored against `label + secondary` by the fuzzy matcher. */
  score: number;
  /** Inclusive-exclusive ranges on the *label* string for highlight rendering. */
  ranges: Array<[number, number]>;
  action: SearchAction;
};

export type RecentItem = {
  id: string;
  kind: SearchKind;
  label: string;
  secondary?: string;
  action: SearchAction;
  /** ms since epoch. */
  openedAt: number;
};

const RECENT_KEY = (userId: string) => `lp:cmdk:recent:${userId}`;
const RECENT_LIMIT = 10;
const PER_KIND_LIMIT = 10;

export function loadRecent(userId: string | null | undefined): RecentItem[] {
  if (!userId) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecent(userId: string | null | undefined, item: Omit<RecentItem, 'openedAt'>): void {
  if (!userId) return;
  if (typeof window === 'undefined') return;
  try {
    const current = loadRecent(userId);
    const filtered = current.filter((r) => !(r.kind === item.kind && r.id === item.id));
    const next: RecentItem[] = [{ ...item, openedAt: Date.now() }, ...filtered].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY(userId), JSON.stringify(next));
  } catch {
    // localStorage write failure (private mode, quota exceeded) — ignored.
  }
}

export function clearRecent(userId: string | null | undefined): void {
  if (!userId) return;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_KEY(userId));
  } catch {
    // ignored
  }
}

/**
 * Score a candidate against the query. Returns null if no match.
 * The scorer fuzzy-matches the label first; if no match, tries the
 * secondary; the higher score wins, but ranges are kept against the
 * label string so the renderer doesn't have to cross-track which field.
 */
function scoreCandidate(
  query: string,
  label: string,
  secondary?: string,
): { score: number; ranges: Array<[number, number]> } | null {
  const labelMatch: FuzzyMatch | null = fuzzyMatch(label, query);
  const secondaryMatch: FuzzyMatch | null = secondary ? fuzzyMatch(secondary, query) : null;

  if (!labelMatch && !secondaryMatch) return null;

  // Label matches always win on ranges (they're highlighted on the label).
  if (labelMatch && (!secondaryMatch || labelMatch.score >= secondaryMatch.score - 50)) {
    return { score: labelMatch.score, ranges: labelMatch.ranges };
  }
  if (secondaryMatch) {
    // Apply a small penalty for matching only the secondary so the user sees
    // label-matched results first when scores are otherwise close.
    return { score: secondaryMatch.score - 25, ranges: [] };
  }
  return null;
}

type EntityShape = {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
  ownership?: string | null;
};

async function searchEntityKind(query: string, kind: EntityKind): Promise<SearchResult[]> {
  const desc = getEntityDescriptor<unknown>(kind);
  if (!desc) return [];
  let rows: unknown[] = [];
  try {
    rows = await desc.search(query, { limit: PER_KIND_LIMIT });
  } catch {
    return [];
  }
  // The descriptor's getLabel/getSecondary are typed against its specific T;
  // we fan out across mixed kinds and treat their entities as opaque rows.
  const getLabel = desc.getLabel as (entity: unknown) => string;
  const getSecondary = desc.getSecondary as ((entity: unknown) => string) | undefined;
  const results: SearchResult[] = [];
  for (const row of rows) {
    const r = row as EntityShape;
    if (!r?.id) continue;
    const label = getLabel(row) || (r.name ?? '');
    const secondaryRaw = getSecondary?.(row);
    const secondary = typeof secondaryRaw === 'string' && secondaryRaw.trim() ? secondaryRaw : undefined;
    const scored = scoreCandidate(query, label, secondary);
    if (!scored) continue;
    // Each canonical entity kind in this codebase is also a SearchKind; the
    // SearchKind union is intentionally a superset of EntityKind − 'tour'.
    const searchKind = kind as SearchKind;
    results.push({
      id: r.id,
      kind: searchKind,
      label,
      secondary,
      score: scored.score,
      ranges: scored.ranges,
      action: { type: 'open-entity', kind, id: r.id },
    });
  }
  return results;
}

async function searchTours(query: string): Promise<SearchResult[]> {
  const supabase = createClient();
  const q = query.trim();
  let req = supabase.from('tours').select('id, name, status').order('start_date', { ascending: false }).limit(PER_KIND_LIMIT);
  if (q) req = req.ilike('name', `%${q}%`);
  const { data, error } = await req;
  if (error || !data) return [];
  const results: SearchResult[] = [];
  for (const row of data as Array<{ id: string; name: string; status: string }>) {
    const label = row.name ?? '';
    const secondary = row.status ? `Tour · ${row.status}` : 'Tour';
    const scored = scoreCandidate(q, label, secondary);
    if (!scored && q) continue;
    results.push({
      id: row.id,
      kind: 'tour',
      label,
      secondary,
      score: scored?.score ?? 0,
      ranges: scored?.ranges ?? [],
      action: { type: 'navigate', href: `/tours/${row.id}` },
    });
  }
  return results;
}

async function searchBudgetLines(query: string): Promise<SearchResult[]> {
  const supabase = createClient();
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('budget_line_items')
    .select('id, label, category, tour_id')
    .ilike('label', `%${q}%`)
    .limit(PER_KIND_LIMIT);
  if (error || !data) return [];
  const results: SearchResult[] = [];
  for (const row of data as Array<{ id: string; label: string; category: string | null; tour_id: string }>) {
    const label = row.label ?? '';
    const secondary = row.category ? `Budget · ${row.category}` : 'Budget';
    const scored = scoreCandidate(q, label, secondary);
    if (!scored) continue;
    results.push({
      id: row.id,
      kind: 'budget-line',
      label,
      secondary,
      score: scored.score,
      ranges: scored.ranges,
      action: { type: 'navigate', href: `/budget/${row.tour_id}#line-${row.id}` },
    });
  }
  return results;
}

async function searchBugReports(query: string): Promise<SearchResult[]> {
  const supabase = createClient();
  const q = query.trim();
  let req = supabase
    .from('bug_reports')
    .select('id, title, severity, status')
    .order('created_at', { ascending: false })
    .limit(PER_KIND_LIMIT);
  if (q) req = req.ilike('title', `%${q}%`);
  // RLS on bug_reports gates non-admin users; the query simply returns no rows
  // for non-admins instead of erroring. Belt-and-braces — no client-side gate.
  const { data, error } = await req;
  if (error || !data) return [];
  const results: SearchResult[] = [];
  for (const row of data as Array<{ id: string; title: string | null; severity: string; status: string }>) {
    const label = row.title ?? '(untitled bug)';
    const secondary = `${row.severity} · ${row.status}`;
    const scored = scoreCandidate(q, label, secondary);
    if (!scored && q) continue;
    results.push({
      id: row.id,
      kind: 'bug-report',
      label,
      secondary,
      score: scored?.score ?? 0,
      ranges: scored?.ranges ?? [],
      action: { type: 'navigate', href: `/bugs?focus=${row.id}` },
    });
  }
  return results;
}

async function searchRiderPacks(query: string): Promise<SearchResult[]> {
  const supabase = createClient();
  const q = query.trim();
  let req = supabase
    .from('rider_packs')
    .select('id, title, scope, tour_id')
    .order('updated_at', { ascending: false })
    .limit(PER_KIND_LIMIT);
  if (q) req = req.ilike('title', `%${q}%`);
  const { data, error } = await req;
  if (error || !data) return [];
  const results: SearchResult[] = [];
  for (const row of data as Array<{ id: string; title: string | null; scope: string; tour_id: string | null }>) {
    const label = row.title ?? '(untitled pack)';
    const secondary = `Rider pack · ${row.scope}`;
    const scored = scoreCandidate(q, label, secondary);
    if (!scored && q) continue;
    const href = row.tour_id ? `/tours/${row.tour_id}/rider-packs/${row.id}` : `/rider-packs/${row.id}`;
    results.push({
      id: row.id,
      kind: 'rider-pack',
      label,
      secondary,
      score: scored?.score ?? 0,
      ranges: scored?.ranges ?? [],
      action: { type: 'navigate', href },
    });
  }
  return results;
}

async function searchRentalJobs(query: string): Promise<SearchResult[]> {
  const supabase = createClient();
  const q = query.trim();
  let req = supabase
    .from('rental_jobs')
    .select('id, name, client_name, status')
    .order('created_at', { ascending: false })
    .limit(PER_KIND_LIMIT);
  if (q) req = req.ilike('name', `%${q}%`);
  const { data, error } = await req;
  if (error || !data) return [];
  const results: SearchResult[] = [];
  for (const row of data as Array<{ id: string; name: string; client_name: string | null; status: string }>) {
    const label = row.name ?? '(untitled job)';
    const secondary = [row.client_name, row.status].filter(Boolean).join(' · ') || 'Rental job';
    const scored = scoreCandidate(q, label, secondary);
    if (!scored && q) continue;
    results.push({
      id: row.id,
      kind: 'rental-job',
      label,
      secondary,
      score: scored?.score ?? 0,
      ranges: scored?.ranges ?? [],
      action: { type: 'navigate', href: `/equipment?job=${row.id}` },
    });
  }
  return results;
}

const ENTITY_KINDS: EntityKind[] = ['person', 'flight', 'room', 'gear', 'show', 'deal-memo'];

/**
 * Fan-out search across all wired result kinds. Empty query returns an
 * empty list — caller is expected to render `loadRecent()` items
 * separately.
 */
export async function searchAll(query: string, opts?: { limit?: number }): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = opts?.limit ?? 50;

  const settled = await Promise.allSettled([
    ...ENTITY_KINDS.map((kind) => searchEntityKind(trimmed, kind)),
    searchTours(trimmed),
    searchBudgetLines(trimmed),
    searchBugReports(trimmed),
    searchRiderPacks(trimmed),
    searchRentalJobs(trimmed),
  ]);

  const all: SearchResult[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, limit);
}
