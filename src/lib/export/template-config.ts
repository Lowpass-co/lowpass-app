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

/** Every export surface. The ONE list: the type, the templates API and the
 *  export_templates.surface CHECK (migration 272, pinned by a test) all derive
 *  from it — the API and the CHECK used to hold their own copy of the first
 *  four, so templates could never be saved for any surface added later. */
export const EXPORT_SURFACES = ['budget', 'rooming', 'payroll', 'routing', 'channel-list', 'stage-plot', 'settlement', 'daysheet', 'gear-manifest', 'carnet'] as const;
export type ExportSurface = (typeof EXPORT_SURFACES)[number];
export type PageSize = 'A4' | 'Letter';
/** Output format — a styled print PDF, or a flat machine-readable Excel grid. */
export type ExportFormat = 'pdf' | 'excel';
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

/** Per-element text overrides (Part D). null = use the real value (artist/tour
 *  name, surface title, version/scope subtitle). Presentation-only — overriding the
 *  DISPLAYED label never changes a number. */
export interface HeaderTextOverrides {
  artist: string | null;
  tour: string | null;
  title: string | null;
  subtitle: string | null;
}

/** Per-element font-size overrides in px (Part D). null = the shell's default size. */
export interface HeaderSizeOverrides {
  artist: number | null;
  tour: number | null;
  dates: number | null;
  title: number | null;
  subtitle: number | null;
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
  text: HeaderTextOverrides; // Part D — custom label text (all null = defaults)
  size: HeaderSizeOverrides; // Part D — custom font sizes (all null = defaults)
  notes: string | null; // Part D — a free-text note block under the letterhead
}

/** Footer config (the page.pdf footer template — print-only, not in the live
 *  iframe preview). Defaults reproduce today's footer. */
export interface FooterStyle {
  show: boolean; // true
  pageNumbers: boolean; // true — "Page x / y"
  summaryLine: boolean; // true — the "Artist — Tour · Surface" note + mark
}

/** Shared date-range filter (Part E) — null = the whole tour. Used by payroll /
 *  routing / rooming to export a slice. ISO yyyy-mm-dd strings. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Routing-surface options (Part F + v2.1 Part D). */
export type RoutingView = 'list' | 'calendar' | 'map' | 'both';
export interface RoutingColumns {
  country: boolean; // default on (v2.1 D)
  capacity: boolean; // default OFF (v2.1 D — removed from the list by default)
}
export interface RoutingOptions {
  view: RoutingView; // list | calendar | map (placeholder) | both (list + map)
  calendarTheme: 'light' | 'dark'; // calendar view only
  travelTimes: boolean; // show leg travel time between days (cache/approx)
  columns: RoutingColumns; // list column picker
}

/** Payroll-surface options (Part E). */
export type PayrollMode = 'combined' | 'individual';
export interface PayrollOptions {
  mode: PayrollMode; // 'combined' = run sheet + statements; 'individual' = statements only
  personId: string | null; // individual mode — narrow to one crew member's rate-card id (zip per-person)
  selectedPersonIds: string[] | null; // people picker — null = everyone; else the included rate-card ids
  daysGrid: boolean; // statement: the weekly Show/Off/Reh grid
  venuePerDay: boolean; // statement: a per-day routing list (date · city · venue)
  advance: boolean; // statement: the advance-fee line
}

/** D1-2 — Day Sheet audience templates. A template is a preset of section
 *  toggles + type scale, NOT a security slice (the TM building it has full data;
 *  the live-Day/token slices are the security layer). Driver/Big = larger type. */
export type DaySheetTemplate = 'standard' | 'crew' | 'driver' | 'band' | 'compact';
export interface DaySheetOptions {
  template: DaySheetTemplate;
  /** Larger body type for at-a-glance reading (driver default). */
  bigType: boolean;
}

/** Oct 2026 — channel-list export options (surface 'channel-list' only).
 *  The PDF reads like the editor: rows colour-coded by stage box, optional
 *  one-page-per-IO-box sheets and mic / stand / cable / loom pulls. */
export type ChannelListTheme = 'light' | 'dark';
/** Columns a per-box socket sheet can print. `socket` is always first. */
export const BOX_COLUMN_KEYS = ['channel', 'name', 'mic', 'sub_snake', 'phantom_power', 'stand', 'position', 'notes'] as const;
export type BoxColumnKey = (typeof BOX_COLUMN_KEYS)[number];
export const BOX_COLUMN_LABELS: Record<BoxColumnKey, string> = {
  channel: 'Ch', name: 'Name', mic: 'Mic / DI', sub_snake: 'Loom', phantom_power: '48V', stand: 'Stand', position: 'Pos', notes: 'Notes',
};
export interface ChannelListOptions {
  /** PDF only. Light is the default (dark burns ink on a printer). */
  theme: ChannelListTheme;
  /** Which stage boxes get a sheet. null = every box. */
  boxIds: string[] | null;
  /** Input-list columns. null = the editor's own enabled columns. */
  inputColumns: string[] | null;
  /** Columns on each stage box sheet. */
  boxColumns: BoxColumnKey[];
  /** Spares added to the pull lists, per line: a count, or a % rounded up. */
  spares: { mode: 'count' | 'percent'; mics: number; stands: number; cables: number };
}

export interface TemplateConfig {
  /** Schema version (forward-compat). */
  v: 1;
  surface: ExportSurface;
  /** Output format — PDF (styled print doc) or Excel (flat data grid). Default 'pdf'. */
  format: ExportFormat;
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
  /** Part E — shared date-range filter (null/null = whole tour). */
  dateRange: DateRange;
  /** Part E — payroll-surface options (only meaningful for surface 'payroll'). */
  payroll: PayrollOptions;
  /** Part F — routing-surface options (only meaningful for surface 'routing'). */
  routing: RoutingOptions;
  /** D1-2 — day-sheet options (only meaningful for surface 'daysheet'). */
  daysheet?: DaySheetOptions;
  /** Oct 2026 — channel-list options (surface 'channel-list'; also the IO-box
   *  and pull sections of 'stage-plot', which print the same tables). */
  channelList?: ChannelListOptions;
  /** Oct 2026 — stage-plot options (only meaningful for surface 'stage-plot'). */
  stagePlot?: StagePlotOptions;
}

/** Oct 2026 — stage-plot export options. The plot page is drawn like the
 *  editor; these choose what goes on it. `grid` / `rulers`: 'plot' = as the
 *  plot is saved, else forced on / off for this printout only. */
export type PlotToggle = 'plot' | 'on' | 'off';
export interface StagePlotOptions {
  /** PDF only. Light by default (dark burns ink on a printer). */
  theme: 'light' | 'dark';
  /** Subtitle · TM name · role · phone · email · version, under the letterhead. */
  contact: boolean;
  /** Channel key beside the plot: chip number → channel → item. */
  key: boolean;
  /** Channel-number chips on linked items, striped with the stage-box colour. */
  chips: boolean;
  grid: PlotToggle;
  rulers: PlotToggle;
  /** Item name pills (each item's own "hidden" still applies). */
  labels: boolean;
}
export const DEFAULT_STAGE_PLOT_OPTIONS: StagePlotOptions = {
  theme: 'light',
  contact: true,
  key: true,
  chips: true,
  grid: 'plot',
  rulers: 'plot',
  labels: true,
};

/** The section ids each surface's body builder owns (coarse, P1). Additive — new
 *  ids can be appended later without breaking a saved config. */
export const BUDGET_SECTION_IDS = ['pnl-summary', 'income-detail', 'expense-detail'] as const;
export const ROOMING_SECTION_IDS = ['hotels'] as const;
export const PAYROLL_SECTION_IDS = ['run-sheet', 'statements'] as const;
export const ROUTING_SECTION_IDS = ['days', 'advance-summary'] as const;
export const CHANNEL_LIST_SECTION_IDS = ['inputs', 'outputs', 'io-boxes', 'mic-pull', 'stand-pull', 'cable-pull', 'loom-pull'] as const;
/** New channel-list sections are OFF by default, so an existing saved template
 *  prints exactly what it did before until the TM ticks them. */
const CHANNEL_LIST_DEFAULT_ON = new Set<string>(['inputs', 'outputs']);
/** `input-list` = inputs + outputs (kept as one id — saved templates use it).
 *  The IO-box and pull sections are the channel-list export's, unchanged. */
export const STAGE_PLOT_SECTION_IDS = ['stage-diagram', 'input-list', 'io-boxes', 'mic-pull', 'stand-pull', 'cable-pull', 'loom-pull'] as const;
export const DAYSHEET_SECTION_IDS = ['schedule', 'venue', 'hotel', 'flights', 'contacts', 'notes'] as const;

/** Human labels for the editor's section list. */
export const SECTION_LABELS: Record<string, string> = {
  'pnl-summary': 'P&L summary',
  'income-detail': 'Income detail (by show)',
  'expense-detail': 'Expense detail (by section)',
  hotels: 'Hotel rooming list',
  'run-sheet': 'Run sheet (all crew)',
  statements: 'Per-person statements',
  days: 'Routing (all days)',
  'advance-summary': 'Advance summary (per day)',
  inputs: 'Input list',
  outputs: 'Outputs (IEM / mix)',
  'io-boxes': 'Stage box sheets (a page per box)',
  'mic-pull': 'Mic & DI pull',
  'stand-pull': 'Stand pull',
  'cable-pull': 'Cable pull',
  'loom-pull': 'Looms / sub-snakes',
  'stage-diagram': 'Stage diagram',
  'input-list': 'Input + output lists',
  schedule: 'Schedule',
  venue: 'Venue + address',
  hotel: 'Hotel',
  flights: 'Flights',
  contacts: 'Day-of contacts',
  notes: 'General notes',
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
  text: { artist: null, tour: null, title: null, subtitle: null },
  size: { artist: null, tour: null, dates: null, title: null, subtitle: null },
  notes: null,
};

export const DEFAULT_FOOTER: FooterStyle = {
  show: true,
  pageNumbers: true,
  summaryLine: true,
};

export const DEFAULT_DATE_RANGE: DateRange = { from: null, to: null };
export const DEFAULT_PAYROLL_OPTIONS: PayrollOptions = { mode: 'combined', personId: null, selectedPersonIds: null, daysGrid: true, venuePerDay: false, advance: true };
export const DEFAULT_ROUTING_OPTIONS: RoutingOptions = { view: 'list', calendarTheme: 'light', travelTimes: false, columns: { country: true, capacity: false } };

export const DEFAULT_BUDGET_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'budget',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  scope: 'both',
  sections: BUDGET_SECTION_IDS.map((id) => ({ id, show: true })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
};

export const DEFAULT_ROOMING_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'rooming',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  sections: ROOMING_SECTION_IDS.map((id) => ({ id, show: true })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
};

export const DEFAULT_PAYROLL_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'payroll',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  sections: PAYROLL_SECTION_IDS.map((id) => ({ id, show: true })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
};

/** Routing: the advance summary is OFF by default (D7 — itinerary first; the
 *  per-day advance summary is an opt-in toggle). */
export const DEFAULT_ROUTING_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'routing',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  sections: [
    { id: 'days', show: true },
    { id: 'advance-summary', show: false },
  ],
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
};

export const DEFAULT_CHANNEL_LIST_OPTIONS: ChannelListOptions = {
  theme: 'light',
  boxIds: null,
  inputColumns: null,
  boxColumns: ['channel', 'name', 'mic', 'sub_snake', 'phantom_power'],
  spares: { mode: 'count', mics: 0, stands: 0, cables: 0 },
};

export const DEFAULT_CHANNEL_LIST_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'channel-list',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  sections: CHANNEL_LIST_SECTION_IDS.map((id) => ({ id, show: CHANNEL_LIST_DEFAULT_ON.has(id) })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
  channelList: DEFAULT_CHANNEL_LIST_OPTIONS,
};

export const DEFAULT_STAGE_PLOT_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'stage-plot',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  // Only the diagram is on by default — every other section (including the
  // ones added Oct 2026) arrives switched off, so a saved template's page list
  // is unchanged until the TM ticks more.
  sections: STAGE_PLOT_SECTION_IDS.map((id) => ({ id, show: id === 'stage-diagram' })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
  channelList: DEFAULT_CHANNEL_LIST_OPTIONS,
  stagePlot: DEFAULT_STAGE_PLOT_OPTIONS,
};

export const DEFAULT_SETTLEMENT_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'settlement',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  sections: [
    { id: 'walk', show: true },
    { id: 'deductions', show: true },
    { id: 'expenses', show: true },
    { id: 'payments', show: true },
  ],
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
};

export const DEFAULT_DAYSHEET_OPTIONS: DaySheetOptions = { template: 'standard', bigType: false };

/** Audience preset → which sections show + type scale. Templates are section
 *  presets, not slices; the notes section is off for crew/driver/band/compact
 *  (it's the internal note) and on only for Standard. */
export const DAYSHEET_PRESETS: Record<DaySheetTemplate, { show: Record<string, boolean>; bigType: boolean }> = {
  standard: { show: { schedule: true, venue: true, hotel: true, flights: true, contacts: true, notes: true }, bigType: false },
  crew: { show: { schedule: true, venue: true, hotel: true, flights: true, contacts: true, notes: false }, bigType: false },
  driver: { show: { schedule: true, venue: true, hotel: true, flights: true, contacts: false, notes: false }, bigType: true },
  band: { show: { schedule: true, venue: true, hotel: true, flights: true, contacts: true, notes: false }, bigType: false },
  compact: { show: { schedule: true, venue: true, hotel: false, flights: false, contacts: true, notes: false }, bigType: false },
};

export const DAYSHEET_TEMPLATE_LABELS: Record<DaySheetTemplate, string> = {
  standard: 'Standard',
  crew: 'Crew',
  driver: 'Driver (big type)',
  band: 'Band',
  compact: 'Compact 1-pager',
};

export const DEFAULT_DAYSHEET_CONFIG: TemplateConfig = {
  v: 1,
  surface: 'daysheet',
  format: 'pdf',
  pageSize: 'A4',
  logo: true,
  sections: DAYSHEET_SECTION_IDS.map((id) => ({ id, show: DAYSHEET_PRESETS.standard.show[id] !== false })),
  general: DEFAULT_GENERAL,
  header: DEFAULT_HEADER,
  footer: DEFAULT_FOOTER,
  dateRange: DEFAULT_DATE_RANGE,
  payroll: DEFAULT_PAYROLL_OPTIONS,
  routing: DEFAULT_ROUTING_OPTIONS,
  daysheet: DEFAULT_DAYSHEET_OPTIONS,
};

/** Apply an audience template preset to a config — sets section visibility (in
 *  canonical order) + type scale + the template marker. Returns a new config. */
export function applyDaySheetTemplate(config: TemplateConfig, template: DaySheetTemplate): TemplateConfig {
  const preset = DAYSHEET_PRESETS[template];
  return {
    ...config,
    sections: DAYSHEET_SECTION_IDS.map((id) => ({ id, show: preset.show[id] !== false })),
    daysheet: { template, bigType: preset.bigType },
  };
}

export function defaultConfig(surface: ExportSurface): TemplateConfig {
  if (surface === 'budget') return structuredClone(DEFAULT_BUDGET_CONFIG);
  if (surface === 'payroll') return structuredClone(DEFAULT_PAYROLL_CONFIG);
  if (surface === 'routing') return structuredClone(DEFAULT_ROUTING_CONFIG);
  if (surface === 'channel-list') return structuredClone(DEFAULT_CHANNEL_LIST_CONFIG);
  if (surface === 'stage-plot') return structuredClone(DEFAULT_STAGE_PLOT_CONFIG);
  if (surface === 'settlement') return structuredClone(DEFAULT_SETTLEMENT_CONFIG);
  if (surface === 'daysheet') return structuredClone(DEFAULT_DAYSHEET_CONFIG);
  /* S1 D-1 — both gear documents are list-shaped, so they take the rooming
     defaults deliberately rather than gaining a near-identical constant each.
     Named explicitly instead of falling through, so the fallback below stays a
     genuine last resort rather than quietly serving two real surfaces. */
  if (surface === 'gear-manifest' || surface === 'carnet') return structuredClone(DEFAULT_ROOMING_CONFIG);
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

function strOrNull(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function numOrNull(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
}

function normalizeHeader(input: unknown): HeaderStyle {
  const base: HeaderStyle = {
    ...DEFAULT_HEADER,
    elements: DEFAULT_HEADER.elements.map((e) => ({ ...e })),
    text: { ...DEFAULT_HEADER.text },
    size: { ...DEFAULT_HEADER.size },
  };
  if (!input || typeof input !== 'object') return base;
  const h = input as Partial<HeaderStyle>;
  if (h.text && typeof h.text === 'object') {
    base.text = {
      artist: strOrNull(h.text.artist, 120),
      tour: strOrNull(h.text.tour, 120),
      title: strOrNull(h.text.title, 80),
      subtitle: strOrNull(h.text.subtitle, 160),
    };
  }
  if (h.size && typeof h.size === 'object') {
    base.size = {
      artist: numOrNull(h.size.artist, 6, 48),
      tour: numOrNull(h.size.tour, 8, 60),
      dates: numOrNull(h.size.dates, 6, 40),
      title: numOrNull(h.size.title, 6, 48),
      subtitle: numOrNull(h.size.subtitle, 6, 40),
    };
  }
  base.notes = strOrNull(h.notes, 600);
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

/** Accept only a plausible ISO yyyy-mm-dd date, else null. */
function isoDateOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function normalizeDateRange(input: unknown): DateRange {
  if (!input || typeof input !== 'object') return { from: null, to: null };
  const d = input as Partial<DateRange>;
  let from = isoDateOrNull(d.from);
  let to = isoDateOrNull(d.to);
  if (from && to && from > to) [from, to] = [to, from]; // swap if reversed
  return { from, to };
}

function normalizePayroll(input: unknown): PayrollOptions {
  const base: PayrollOptions = { ...DEFAULT_PAYROLL_OPTIONS };
  if (!input || typeof input !== 'object') return base;
  const p = input as Partial<PayrollOptions>;
  if (p.mode === 'combined' || p.mode === 'individual') base.mode = p.mode;
  base.personId = typeof p.personId === 'string' && p.personId.trim() ? p.personId.trim() : null;
  base.selectedPersonIds = Array.isArray(p.selectedPersonIds)
    ? p.selectedPersonIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : null;
  base.daysGrid = bool(p.daysGrid, DEFAULT_PAYROLL_OPTIONS.daysGrid);
  base.venuePerDay = bool(p.venuePerDay, DEFAULT_PAYROLL_OPTIONS.venuePerDay);
  base.advance = bool(p.advance, DEFAULT_PAYROLL_OPTIONS.advance);
  return base;
}

function normalizeRouting(input: unknown): RoutingOptions {
  const base: RoutingOptions = { ...DEFAULT_ROUTING_OPTIONS, columns: { ...DEFAULT_ROUTING_OPTIONS.columns } };
  if (!input || typeof input !== 'object') return base;
  const r = input as Partial<RoutingOptions>;
  if (r.view === 'list' || r.view === 'calendar' || r.view === 'map' || r.view === 'both') base.view = r.view;
  if (r.calendarTheme === 'light' || r.calendarTheme === 'dark') base.calendarTheme = r.calendarTheme;
  base.travelTimes = bool(r.travelTimes, DEFAULT_ROUTING_OPTIONS.travelTimes);
  if (r.columns && typeof r.columns === 'object') {
    base.columns = {
      country: bool(r.columns.country, DEFAULT_ROUTING_OPTIONS.columns.country),
      capacity: bool(r.columns.capacity, DEFAULT_ROUTING_OPTIONS.columns.capacity),
    };
  }
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
  if (c.format === 'pdf' || c.format === 'excel') base.format = c.format;
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
    // Append any canonical section the input omitted, keeping ITS default
    // visibility (so e.g. routing's advance-summary stays off-by-default when
    // a partial config omits it).
    for (const s of base.sections) if (!seen.has(s.id)) ordered.push({ id: s.id, show: s.show });
    if (ordered.length) base.sections = ordered;
  }

  base.general = normalizeGeneral(c.general);
  base.header = normalizeHeader(c.header);
  base.footer = normalizeFooter(c.footer);
  base.dateRange = normalizeDateRange(c.dateRange);
  if (surface === 'payroll') base.payroll = normalizePayroll(c.payroll);
  if (surface === 'routing') base.routing = normalizeRouting(c.routing);
  if (surface === 'daysheet') base.daysheet = normalizeDaySheet(c.daysheet);
  if (surface === 'channel-list' || surface === 'stage-plot') base.channelList = normalizeChannelList(c.channelList);
  if (surface === 'stage-plot') base.stagePlot = normalizeStagePlot(c.stagePlot);
  return base;
}

const PLOT_TOGGLES: PlotToggle[] = ['plot', 'on', 'off'];
/** Untrusted request body → stage-plot options (anything unknown → default). */
export function normalizeStagePlot(input: unknown): StagePlotOptions {
  const d = DEFAULT_STAGE_PLOT_OPTIONS;
  if (!input || typeof input !== 'object') return { ...d };
  const o = input as Partial<StagePlotOptions>;
  return {
    theme: o.theme === 'dark' ? 'dark' : 'light',
    contact: bool(o.contact, d.contact),
    key: bool(o.key, d.key),
    chips: bool(o.chips, d.chips),
    grid: o.grid && PLOT_TOGGLES.includes(o.grid) ? o.grid : d.grid,
    rulers: o.rulers && PLOT_TOGGLES.includes(o.rulers) ? o.rulers : d.rulers,
    labels: bool(o.labels, d.labels),
  };
}

const INPUT_COLUMN_KEYS = new Set(['number', 'name', 'position', 'stage_box', 'sub_snake', 'cable_length', 'mic', 'gain', 'stand', 'phantom_power', 'provider', 'notes']);
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
function stringList(v: unknown): string[] {
  return Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))) : [];
}
/** Untrusted request body → channel-list options. Unknown column keys are
 *  dropped; Name always prints (a row with no name is unreadable on paper). */
export function normalizeChannelList(input: unknown): ChannelListOptions {
  const d = DEFAULT_CHANNEL_LIST_OPTIONS;
  const base: ChannelListOptions = { ...d, boxColumns: [...d.boxColumns], spares: { ...d.spares } };
  if (!input || typeof input !== 'object') return base;
  const o = input as Partial<ChannelListOptions>;
  if (o.theme === 'light' || o.theme === 'dark') base.theme = o.theme;
  base.boxIds = o.boxIds === null || o.boxIds === undefined ? null : stringList(o.boxIds);
  if (o.inputColumns === null || o.inputColumns === undefined) base.inputColumns = null;
  else {
    const cols = stringList(o.inputColumns).filter((k) => INPUT_COLUMN_KEYS.has(k));
    base.inputColumns = cols.includes('name') ? cols : ['name', ...cols];
  }
  if (Array.isArray(o.boxColumns)) {
    const known = new Set<string>(BOX_COLUMN_KEYS);
    base.boxColumns = BOX_COLUMN_KEYS.filter((k) => (o.boxColumns as unknown[]).includes(k) && known.has(k));
  }
  if (o.spares && typeof o.spares === 'object') {
    const sp = o.spares as Partial<ChannelListOptions['spares']>;
    base.spares = {
      mode: sp.mode === 'percent' ? 'percent' : 'count',
      mics: clampInt(sp.mics, 0, 100, 0),
      stands: clampInt(sp.stands, 0, 100, 0),
      cables: clampInt(sp.cables, 0, 100, 0),
    };
  }
  return base;
}

const DAYSHEET_TEMPLATES: DaySheetTemplate[] = ['standard', 'crew', 'driver', 'band', 'compact'];
function normalizeDaySheet(input: unknown): DaySheetOptions {
  const base = { ...DEFAULT_DAYSHEET_OPTIONS };
  if (!input || typeof input !== 'object') return base;
  const d = input as Partial<DaySheetOptions>;
  if (d.template && DAYSHEET_TEMPLATES.includes(d.template)) base.template = d.template;
  base.bigType = bool(d.bigType, base.bigType);
  return base;
}
