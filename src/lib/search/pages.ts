/* ============================================
   LOWPASS — ⌘K finds pages and actions, not just records (Nov 2026)

   The palette searched shows, people, flights… but typing "payroll" or
   "import" found nothing. This adds every page of the sidebar — from ia.ts,
   so a page added to the rail is findable with no extra step — plus the
   Tour settings tabs and a few actions, each with the words people actually
   type for it ("schedule" finds Dates & routing; "edit tour" finds Details).

   Matching is by WORD, not by scattered letters: every word typed must start
   a word of the page's name or keywords ("hot" → Hotels & rooming; "pay" →
   Payroll). Letter-soup matching on two-word page names finds everything.
   Pure — the palette renders what this returns.
   ============================================ */

import { itemsFor, type NavContext } from '@/lib/nav/ia';
import type { SearchResult } from '@/lib/search/providers';

export type { PageCommandRun } from '@/lib/search/providers';
import type { PageCommandRun } from '@/lib/search/providers';

export interface PageCommand {
  id: string;
  label: string;
  /** Where it is: "This tour", "Workspace", "You", "Action". */
  where: string;
  keywords: string[];
  href?: string;
  run?: PageCommandRun;
}

/** Extra words a rail item answers to, by item id. */
const KEYWORDS: Record<string, string[]> = {
  overview: ['home', 'dashboard', 'to do', 'todo', 'needs'],
  advance: ['venue', 'advancing', 'questions', 'info pack', 'day sheet'],
  expenses: ['budget', 'expenses', 'costs', 'sheet', 'lines', 'p&l', 'commissions', 'overheads'],
  income: ['guarantee', 'deal', 'settlement', 'settle', 'revenue', 'income'],
  payroll: ['wages', 'salaries', 'rates', 'per diems', 'pay'],
  receipts: ['receipt', 'expense', 'scan'],
  riders: ['tech rider', 'hospitality', 'hospo'],
  'channel-list': ['inputs', 'input list', 'patch'],
  'stage-plot': ['stage', 'plot', 'backline'],
  assets: ['equipment', 'hire', 'rental', 'backline', 'gear'],
  crew: ['people', 'personnel', 'band', 'staff', 'roster'],
  rooming: ['hotel', 'hotels', 'rooms', 'accommodation'],
  travel: ['flights', 'trains', 'bus', 'transport'],
  files: ['documents', 'uploads', 'share', 'folders'],
  'tour-settings': ['settings', 'setup'],
  artists: ['artists', 'tours'],
  personnel: ['people', 'crew', 'contacts', 'personnel'],
  equipment: ['gear', 'equipment', 'rentals', 'assets'],
  venues: ['venue library'],
  account: ['profile', 'password', 'email'],
  preferences: ['settings', 'theme', 'currency'],
  team: ['members', 'invite', 'roles', 'permissions', 'users'],
  bugs: ['bug', 'feedback', 'problem', 'issue'],
};

export function pageCommands(ctx: { tourId: string | null; artistId: string | null }): PageCommand[] {
  const out: PageCommand[] = [];
  const add = (scope: 'tour' | 'artist' | 'workspace' | 'you', where: string) => {
    const nav: NavContext = { scope, tourId: ctx.tourId, artistId: ctx.artistId, mode: null };
    for (const i of itemsFor(scope, null)) {
      out.push({ id: `${scope}:${i.id}`, label: i.label, where, keywords: KEYWORDS[i.id] ?? [], href: i.href(nav) });
    }
  };
  if (ctx.tourId) {
    add('tour', 'This tour');
    const t = ctx.tourId;
    out.push(
      { id: 'tour:details', label: 'Tour details', where: 'Tour settings', keywords: ['edit tour', 'rename', 'tour name', 'dates', 'currency', 'region', 'delete tour'], href: `/operations/${t}/settings` },
      { id: 'tour:routing', label: 'Dates & routing', where: 'Tour settings', keywords: ['schedule', 'routing', 'itinerary', 'days', 'calendar', 'shows'], href: `/operations/${t}/routing` },
      { id: 'tour:money-settings', label: 'Money settings', where: 'Tour settings', keywords: ['approval', 'approve', 'overheads', 'commissions', 'exchange rates', 'fx', 'export', 'versions'], href: `/budget/${t}?tab=settings` },
      { id: 'tour:import', label: 'Import dates', where: 'Action', keywords: ['import', 'schedule', 'routing', 'tour book', 'daysheets', 'master tour', 'pdf'], href: `/operations/${t}/routing?import=1` },
      { id: 'tour:settlements', label: 'Settlements', where: 'This tour', keywords: ['settle', 'settlement', 'night'], href: `/budget/${t}/settlement` },
      { id: 'tour:advance-templates', label: 'Advance templates', where: 'This tour', keywords: ['templates', 'questions', 'day types'], href: `/advance/${t}/templates` },
    );
  }
  if (ctx.artistId && !ctx.tourId) add('artist', 'This artist');
  add('workspace', 'Workspace');
  add('you', 'You');
  out.push({ id: 'action:new-tour', label: 'New tour', where: 'Action', keywords: ['create tour', 'add tour', 'start tour'], run: 'new-tour' });
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^\p{L}\p{N}&]+/u).filter(Boolean);

/** Score a command for a query, or null. Label hits beat keyword hits;
 *  a label that starts with the query beats one that merely contains it. */
export function scorePage(cmd: PageCommand, query: string): { score: number; ranges: Array<[number, number]> } | null {
  const qWords = words(query);
  if (!qWords.length) return null;
  const labelWords = words(cmd.label);
  const allWords = [...labelWords, ...cmd.keywords.flatMap(words)];
  if (!qWords.every((q) => allWords.some((w) => w.startsWith(q)))) return null;
  const labelHits = qWords.filter((q) => labelWords.some((w) => w.startsWith(q))).length;
  const lf = fold(cmd.label);
  const qf = fold(query.trim());
  const at = lf.indexOf(qf);
  const score = labelHits * 10 + (lf.startsWith(qf) ? 20 : 0) + (at >= 0 ? 5 : 0);
  return { score, ranges: at >= 0 ? [[at, at + qf.length]] : [] };
}

/** Matching pages and actions as palette results, best first (max 6). */
export function searchPages(query: string, ctx: { tourId: string | null; artistId: string | null }): SearchResult[] {
  const hits: Array<SearchResult & { key: string }> = [];
  for (const c of pageCommands(ctx)) {
    const m = scorePage(c, query);
    if (!m) continue;
    hits.push({
      key: c.href ?? c.run ?? c.id,
      id: c.id,
      kind: 'page',
      label: c.label,
      secondary: c.where,
      score: m.score,
      ranges: m.ranges,
      action: c.run ? { type: 'command', run: c.run } : { type: 'navigate', href: c.href! },
    });
  }
  // One row per destination — the best-scoring name for it wins (Tour
  // settings and Tour details are the same page).
  const seen = new Set<string>();
  return hits
    .sort((a, b) => b.score - a.score)
    .filter((h) => (seen.has(h.key) ? false : (seen.add(h.key), true)))
    .slice(0, 6)
    .map(({ key: _key, ...r }) => r);
}
