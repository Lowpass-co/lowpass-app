/* ============================================
   LOWPASS — Export Template config (#8 Document Export, Template Builder)

   The PRESENTATION-ONLY config that drives the body builders + shell. It can
   reorder/hide sections, set the page size, toggle the logo, AND (Phase 2) restyle
   the document — fonts, scale, B&W, dividers, borderless, the letterhead header
   (logo align/size, background image, element show/hide/reorder) and the footer.
   It can NEVER change the numbers (the P&L still comes from computeBudgetPnl;
   reconciliation holds). DEFAULT_*_CONFIG reproduces today's output byte-for-byte,
   so "no customisation" === the current export (EXP-BUD-01 / EXP-ROOM-01 stay
   green): every style group's default emits NO extra CSS / today's exact HTML.

   PURE + client-safe (no server deps) — the editor imports this for the config
   shape, defaults, section ids + labels. The server builders import it too, so
   there is ONE config contract. Generic: Payroll/Routing add their section ids
   here later with no rework.
   ============================================ */

export type ExportSurface = 'budget' | 'rooming' | 'payroll';
export type PageSize = 'A4' | 'Letter';
export type BudgetScope = 'projected' | 'actual' | 'both';

/** A section in the document. Order = array position; `show` = visibility. */
export interface TemplateSection {
  id: string;
  show: boolean;
}

// ---- Phase 2 styling groups -------------------------------------------------

export type FontFamily = 'system' | 'serif' | 'mono';
export type Align = 'left' | 'center' | 'right';

/** Document-wide presentation. Each field's DEFAULT emits NO extra CSS, so the
 *  default doc is byte-for-byte today's output. */
export interface GeneralStyle {
  fontFamily: FontFamily; // 'system' = the existing stack (no override)
  fontScale: number; // 1 = unchanged; clamp 0.85–1.2 (applied via body { zoom })
  monochrome: boolean; // false; true → grayscale(100%) the whole doc
  dividers: boolean; // false; true → dashed rule above each .lp-sec-head
  hideBoxes: boolean; // false; true → borderless tables (no cell/section borders)
}

/** The letterhead's reorderable who/what/when elements (left meta zone). */
export type HeaderElementId = 'artist' | 'tour' | 'dates';
export interface HeaderElement {
  id: HeaderElementId;
  show: boolean;
}

/** Letterhead config. Defaults reproduce today's letterhead byte-for-byte. */
export interface HeaderStyle {
  show: boolean; // true — show the letterhead at all
  logoAlign: Align; // 'left' (the logo is the first flex child today)
  logoMaxHeight: number; // 48 (matches .lp-lh-logo height)
  logoRadius: number; // 0
  logoAssetPath: string | null; // null — an uploaded header logo (storage path); overrides the artist logo
  bgAssetPath: string | null; // null — a faded background image (storage path)
  bgOpacity: number; // 0.15 (only applies when bgAssetPath set)
  elements: HeaderElement[]; // [artist, tour, dates], all shown
  showTitle: boolean; // true — the doc title (e.g. "Budget")
  showSubtitle: boolean; // true — the version/scope subtitle
  showGenerated: boolean; // true — "Generated <date>"
}

/** Footer config (the page.pdf footer template — print-only, not in the live
 *  iframe preview). Defaults reproduce today's footer. */
export interface FooterStyle {
  show: boolean; // true
  pageNumbers: boolean; // true — "Page x / y"
  summaryLine: boolean; // true — the "Artist — Tour · Surface" note + mark
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
  /** Phase 2 — document styling. */
  general: GeneralStyle;
  /** Phase 2 — letterhead/header styling. */
  header: HeaderStyle;
  /** Phase 2 — footer styling. */
  footer: FooterStyle;
}

/** The section ids each surface's body builder owns (coarse, P1). Additive — new
 *  ids can be appended later without breaking a saved config. */
export const BUDGET_SECTION_IDS = ['pnl-summary', 'income-detail', 'expense-detail'] as const;
export const ROOMING_SECTION_IDS = ['hotels'] as const;
export const PAYROLL_SECTION_IDS = ['run-sheet', 'statements'] as const;

/** Human labels for the editor's section list. */
export const SECTION_LABELS: Record<string, string> = {
  'pnl-summary': 'P&L summary',
  'income-detail': 'Income detail (by show)',
  'expense-detail': 'Expense detail (by section)',
  hotels: 'Hotel rooming list',
  'run-sheet': 'Run sheet (all crew)',
  statements: 'Per-person statements',
};

export const HEADER_ELEMENT_LABELS: Record<HeaderElementId, string> = {
  artist: 'Artist name',
  tour: 'Tour name',
  dates: 'Tour dates',
};

// ---- Style-group defaults (each = today's output) ---------------------------

export const DEFAULT_GENERAL: GeneralStyle = {
  fontFamily: 'system',
  fontScale: 1,
  monochrome: false,
  dividers: false,
  hideBoxes: false,
};

export const DEFAULT_HEADER: HeaderStyle = {
  show: true,
  logoAlign: 'left',
  logoMaxHeight: 48,
  logoRadius: 0,
  logoAssetPath: null,
  bgAssetPath: null,
  bgOpacity: 0.15,
  elements: [
    { id: 'artist', show: true },
    { id: 'tour', show: true },
    { id: 'dates', show: true },
  ],
  showTitle: true,
  showSubtitle: true,
  showGenerated: true,
};

export const DEFAULT_FOOTER: FooterStyle = {
  show: true,
  pageNumbers: true,
  summaryLine: true,
};

export const DEFAULT_BUDGET_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'budget',
  pageSize: 'A4',
  logo: true,
  scope: 'both',
  sections: BUDGET_SECTION_IDS.map((id) => ({ id, show: true })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
};

export const DEFAULT_ROOMING_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'rooming',
  pageSize: 'A4',
  logo: true,
  sections: ROOMING_SECTION_IDS.map((id) => ({ id, show: true })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
};

export const DEFAULT_PAYROLL_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'payroll',
  pageSize: 'A4',
  logo: true,
  sections: PAYROLL_SECTION_IDS.map((id) => ({ id, show: true })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
};

export function defaultConfig(surface: ExportSurface): TemplateConfig {
  if (surface === 'budget') return structuredClone(DEFAULT_BUDGET_CONFIG);
  if (surface === 'payroll') return structuredClone(DEFAULT_PAYROLL_CONFIG);
  return structuredClone(DEFAULT_ROOMING_CONFIG);
}

const PAGE_SIZES: PageSize[] = ['A4', 'Letter'];
const SCOPES: BudgetScope[] = ['projected', 'actual', 'both'];
const FONT_FAMILIES: FontFamily[] = ['system', 'serif', 'mono'];
const ALIGNS: Align[] = ['left', 'center', 'right'];
const HEADER_ELEMENT_IDS: HeaderElementId[] = ['artist', 'tour', 'dates'];

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function normalizeGeneral(input: unknown): GeneralStyle {
  const base: GeneralStyle = { ...DEFAULT_GENERAL };
  if (!input || typeof input !== 'object') return base;
  const g = input as Partial<GeneralStyle>;
  if (g.fontFamily && FONT_FAMILIES.includes(g.fontFamily)) base.fontFamily = g.fontFamily;
  base.fontScale = clamp(g.fontScale, 0.85, 1.2, DEFAULT_GENERAL.fontScale);
  base.monochrome = bool(g.monochrome, DEFAULT_GENERAL.monochrome);
  base.dividers = bool(g.dividers, DEFAULT_GENERAL.dividers);
  base.hideBoxes = bool(g.hideBoxes, DEFAULT_GENERAL.hideBoxes);
  return base;
}

function normalizeHeader(input: unknown): HeaderStyle {
  const base: HeaderStyle = { ...DEFAULT_HEADER, elements: DEFAULT_HEADER.elements.map((e) => ({ ...e })) };
  if (!input || typeof input !== 'object') return base;
  const h = input as Partial<HeaderStyle>;
  base.show = bool(h.show, DEFAULT_HEADER.show);
  if (h.logoAlign && ALIGNS.includes(h.logoAlign)) base.logoAlign = h.logoAlign;
  base.logoMaxHeight = clamp(h.logoMaxHeight, 16, 160, DEFAULT_HEADER.logoMaxHeight);
  base.logoRadius = clamp(h.logoRadius, 0, 40, DEFAULT_HEADER.logoRadius);
  base.bgOpacity = clamp(h.bgOpacity, 0, 1, DEFAULT_HEADER.bgOpacity);
  base.bgAssetPath = typeof h.bgAssetPath === 'string' && h.bgAssetPath.trim() ? h.bgAssetPath.trim() : null;
  base.logoAssetPath = typeof h.logoAssetPath === 'string' && h.logoAssetPath.trim() ? h.logoAssetPath.trim() : null;
  base.showTitle = bool(h.showTitle, DEFAULT_HEADER.showTitle);
  base.showSubtitle = bool(h.showSubtitle, DEFAULT_HEADER.showSubtitle);
  base.showGenerated = bool(h.showGenerated, DEFAULT_HEADER.showGenerated);
  if (Array.isArray(h.elements)) {
    const known = new Set(HEADER_ELEMENT_IDS);
    const seen = new Set<HeaderElementId>();
    const ordered: HeaderElement[] = [];
    for (const e of h.elements) {
      if (!e || typeof e !== 'object') continue;
      const id = (e as HeaderElement).id;
      if (HEADER_ELEMENT_IDS.includes(id) && known.has(id) && !seen.has(id)) {
        seen.add(id);
        ordered.push({ id, show: (e as HeaderElement).show !== false });
      }
    }
    for (const id of HEADER_ELEMENT_IDS) if (!seen.has(id)) ordered.push({ id, show: true });
    if (ordered.length) base.elements = ordered;
  }
  return base;
}

function normalizeFooter(input: unknown): FooterStyle {
  const base: FooterStyle = { ...DEFAULT_FOOTER };
  if (!input || typeof input !== 'object') return base;
  const f = input as Partial<FooterStyle>;
  base.show = bool(f.show, DEFAULT_FOOTER.show);
  base.pageNumbers = bool(f.pageNumbers, DEFAULT_FOOTER.pageNumbers);
  base.summaryLine = bool(f.summaryLine, DEFAULT_FOOTER.summaryLine);
  return base;
}

/** Coerce an untrusted (request-body) config onto the surface's default — keeps
 *  the canonical section set + order rules, drops unknown ids, restores any
 *  missing section, clamps page size / scope / every style field. A malformed
 *  config can never crash the builder or smuggle a non-section. */
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

  base.general = normalizeGeneral(c.general);
  base.header = normalizeHeader(c.header);
  base.footer = normalizeFooter(c.footer);
  return base;
}
