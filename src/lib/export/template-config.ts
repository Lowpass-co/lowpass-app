/* ============================================
   LOWPASS — Export Template config (#8 Document Export, Template Builder P1)

   The PRESENTATION-ONLY config that drives the body builders + shell. It can
   reorder/hide sections, set the page size, and toggle the logo — it can NEVER
   change the numbers (the P&L still comes from computeBudgetPnl; reconciliation
   holds). DEFAULT_*_CONFIG reproduces today's output byte-for-byte, so "no
   customisation" === the current export (EXP-BUD-01 / EXP-ROOM-01 stay green).

   PURE + client-safe (no server deps) — the editor imports this for the config
   shape, defaults, section ids + labels. The server builders import it too, so
   there is ONE config contract. Generic: Payroll/Routing add their section ids
   here later with no rework.
   ============================================ */

export type ExportSurface = 'budget' | 'rooming';
export type PageSize = 'A4' | 'Letter';
export type BudgetScope = 'projected' | 'actual' | 'both';

/** A section in the document. Order = array position; `show` = visibility. */
export interface TemplateSection {
  id: string;
  show: boolean;
}

export interface TemplateConfig {
  /** Schema version (forward-compat). */
  v: 1;
  surface: ExportSurface;
  pageSize: PageSize;
  /** Show the artist logo / initials block in the letterhead. */
  logo: boolean;
  /** Budget only — Projected / Actual / Both+Variance columns. */
  scope?: BudgetScope;
  /** Ordered, toggleable sections (the body builder dispatches over these). */
  sections: TemplateSection[];
}

/** The section ids each surface's body builder owns (coarse, P1). Additive — new
 *  ids can be appended later without breaking a saved config. */
export const BUDGET_SECTION_IDS = ['pnl-summary', 'income-detail', 'expense-detail'] as const;
export const ROOMING_SECTION_IDS = ['hotels'] as const;

/** Human labels for the editor's section list. */
export const SECTION_LABELS: Record<string, string> = {
  'pnl-summary': 'P&L summary',
  'income-detail': 'Income detail (by show)',
  'expense-detail': 'Expense detail (by section)',
  hotels: 'Hotel rooming list',
};

export const DEFAULT_BUDGET_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'budget',
  pageSize: 'A4',
  logo: true,
  scope: 'both',
  sections: BUDGET_SECTION_IDS.map((id) => ({ id, show: true })),
};

export const DEFAULT_ROOMING_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'rooming',
  pageSize: 'A4',
  logo: true,
  sections: ROOMING_SECTION_IDS.map((id) => ({ id, show: true })),
};

export function defaultConfig(surface: ExportSurface): TemplateConfig {
  return surface === 'budget' ? structuredClone(DEFAULT_BUDGET_CONFIG) : structuredClone(DEFAULT_ROOMING_CONFIG);
}

const PAGE_SIZES: PageSize[] = ['A4', 'Letter'];
const SCOPES: BudgetScope[] = ['projected', 'actual', 'both'];

/** Coerce an untrusted (request-body) config onto the surface's default — keeps
 *  the canonical section set + order rules, drops unknown ids, restores any
 *  missing section, clamps page size / scope. A malformed config can never crash
 *  the builder or smuggle a non-section in. */
export function normalizeConfig(surface: ExportSurface, input: unknown): TemplateConfig {
  const base = defaultConfig(surface);
  if (!input || typeof input !== 'object') return base;
  const c = input as Partial<TemplateConfig>;

  if (c.pageSize && PAGE_SIZES.includes(c.pageSize)) base.pageSize = c.pageSize;
  if (typeof c.logo === 'boolean') base.logo = c.logo;
  if (surface === 'budget' && c.scope && SCOPES.includes(c.scope)) base.scope = c.scope;

  if (Array.isArray(c.sections)) {
    const known = new Set(base.sections.map((s) => s.id));
    const seen = new Set<string>();
    const ordered: TemplateSection[] = [];
    for (const s of c.sections) {
      if (!s || typeof s !== 'object') continue;
      const id = (s as TemplateSection).id;
      if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
        seen.add(id);
        ordered.push({ id, show: (s as TemplateSection).show !== false });
      }
    }
    // Append any canonical section the input omitted (kept visible by default).
    for (const s of base.sections) if (!seen.has(s.id)) ordered.push({ id: s.id, show: true });
    if (ordered.length) base.sections = ordered;
  }
  return base;
}
