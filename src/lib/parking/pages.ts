/* ============================================
   LOWPASS — Parking maps: the PDF's pages (Nov 2026, Adam)

   "would also be awesome to add more than two pages" → a page list: any
   number of overhead (plan) and 3D pages, each named, in order.

     plan, fit    frames the whole drawing at the most detailed scale that
                  fits ('auto') or a chosen 1:N; prints at the editor's rotation
     plan, fixed  a view you added: its own centre, rotation and 1:N — e.g. a
                  route overview at 1:2,500 beside a close-up at 1:500
     3d           a camera you added in 3D (null = the default view)

   Stored on the map's `view.pages` (jsonb, validated by parsePages). A map
   that has never set pages gets defaultPages(): the plan, a street map and
   the 3D view.
   ============================================ */

import { PRINT_SCALES, printScaleFor, type Camera3d, type View } from './geo';
import { PRINT_FRAME_MM, printFrame, type PrintFrame, type PrintScaleChoice } from './print';
import { LIMITS, type ParkingItem } from './model';

export type PrintScale = (typeof PRINT_SCALES)[number];

/** `level`: a page for one level of a stacked venue (drawings.ts levelsOf); absent = every level.
 *  `base`: 'street' = Google's street map (roads, names) under the items instead of the satellite
 *  photo — a clean map for getting there (Nov 2026, Adam); absent = the map's own look. */
export type PlanFitPage = { id: string; kind: 'plan'; title: string; fit: true; scale: 'auto' | PrintScale; level?: number; base?: 'street' };
export type PlanFixedPage = { id: string; kind: 'plan'; title: string; fit: false; cx: number; cy: number; rotation: number; scale: PrintScale; level?: number; base?: 'street' };
export type Page3d = { id: string; kind: '3d'; title: string; cam: Camera3d | null };
export type PdfPage = PlanFitPage | PlanFixedPage | Page3d;

export const MAX_PAGES = LIMITS.pages;
export const PAGE_TITLE_MAX = LIMITS.pageTitle;

/** A street map wide enough to see the roads in: 1:2,500 (~490 m across the frame). */
export const STREET_SCALE: PrintScale = 2500;

export function defaultPages(cam3d?: Camera3d): PdfPage[] {
  return [
    { id: 'plan', kind: 'plan', title: 'Plan', fit: true, scale: 'auto' },
    { id: 'street', kind: 'plan', title: 'Street map', fit: true, scale: STREET_SCALE, base: 'street' },
    { id: '3d', kind: '3d', title: '3D', cam: cam3d ?? null },
  ];
}

/** The pages a map prints: its own list, or the defaults. */
export const pagesOf = (view: Pick<View, 'pages' | 'cam3d'>): PdfPage[] => view.pages ?? defaultPages(view.cam3d);

const newId = () => Math.random().toString(36).slice(2, 10);

function nextTitle(pages: PdfPage[], base: string): string {
  const used = new Set(pages.map((p) => p.title));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** The scale that fits what's on screen onto the page's map frame. */
export function screenScale(view: View, viewport: { w: number; h: number }): PrintScale {
  return Math.max(printScaleFor(viewport.w / view.ppm, PRINT_FRAME_MM.w), printScaleFor(viewport.h / view.ppm, PRINT_FRAME_MM.h)) as PrintScale;
}

export function addPlanPage(pages: PdfPage[], view: View, viewport: { w: number; h: number }): PdfPage[] {
  if (pages.length >= MAX_PAGES) return pages;
  const page: PlanFixedPage = {
    id: newId(),
    kind: 'plan',
    title: nextTitle(pages, 'Plan'),
    fit: false,
    cx: Math.round(view.cx * 100) / 100,
    cy: Math.round(view.cy * 100) / 100,
    rotation: Math.round(view.rotation * 10) / 10,
    scale: screenScale(view, viewport),
    ...(view.level != null ? { level: view.level } : {}),
  };
  return [...pages, page];
}

/** A close-up of what's selected (Nov 2026, Adam: "select smaller plan areas
 *  … so that it's not … super zoomed out"): a fixed page framing just those
 *  items at the most detailed scale that holds them (printFrame — never under
 *  ~70 m across, so there's still road to read), at the editor's rotation. At
 *  that size the vehicles are big enough to carry their names. */
export function addCloseUpPage(pages: PdfPage[], selected: ParkingItem[], view: View, viewport: { w: number; h: number }): PdfPage[] {
  if (pages.length >= MAX_PAGES || !selected.length) return pages;
  const f = printFrame(selected, view, viewport, 'auto');
  const page: PlanFixedPage = {
    id: newId(),
    kind: 'plan',
    title: nextTitle(pages, 'Close-up'),
    fit: false,
    cx: Math.round(f.cx * 100) / 100,
    cy: Math.round(f.cy * 100) / 100,
    rotation: Math.round(view.rotation * 10) / 10,
    scale: f.scale as PrintScale,
    ...(view.level != null ? { level: view.level } : {}),
  };
  return [...pages, page];
}

/** A street-map page framing the parking at 1:2,500. */
export function addStreetPage(pages: PdfPage[]): PdfPage[] {
  if (pages.length >= MAX_PAGES) return pages;
  return [...pages, { id: newId(), kind: 'plan', title: nextTitle(pages, 'Street map'), fit: true, scale: STREET_SCALE, base: 'street' }];
}

export function add3dPage(pages: PdfPage[], cam: Camera3d): PdfPage[] {
  if (pages.length >= MAX_PAGES) return pages;
  return [...pages, { id: newId(), kind: '3d', title: nextTitle(pages, '3D'), cam }];
}

export function movePage(pages: PdfPage[], id: string, by: -1 | 1): PdfPage[] {
  const i = pages.findIndex((p) => p.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= pages.length) return pages;
  const next = [...pages];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const removePage = (pages: PdfPage[], id: string): PdfPage[] => pages.filter((p) => p.id !== id);

export const updatePage = (pages: PdfPage[], id: string, patch: Partial<PdfPage>): PdfPage[] =>
  pages.map((p) => (p.id === id ? ({ ...p, ...patch } as PdfPage) : p));

/** Where a plan page prints: its frame (centre, 1:N, ground size) and rotation. */
export function planFrame(
  page: PlanFitPage | PlanFixedPage,
  items: ParkingItem[],
  view: View,
  viewport: { w: number; h: number },
): { frame: PrintFrame; rotation: number } {
  if (page.fit) return { frame: printFrame(items, view, viewport, page.scale as PrintScaleChoice), rotation: view.rotation };
  return {
    frame: { cx: page.cx, cy: page.cy, scale: page.scale, wM: (PRINT_FRAME_MM.w * page.scale) / 1000, hM: (PRINT_FRAME_MM.h * page.scale) / 1000 },
    rotation: page.rotation,
  };
}
