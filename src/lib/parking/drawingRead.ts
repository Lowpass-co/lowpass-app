/* ============================================
   LOWPASS — Parking: reading a venue drawing with AI (Nov 2026, Adam)

   "Drop a venue drawing in" → the model proposes what a person would
   otherwise click in the setup wizard: the crop, two printed dimensions and
   the north arrow. Nothing here is trusted as is:

     1. OVERVIEW — the whole page (≤ 2,576 px): crop, up to a few printed
        dimensions with their ends (approximate — the model's coordinates are
        a few pixels out on a whole page), north, any printed scale
     2. REFINE — for each of the two dimensions used, close-ups around both
        ends rendered at high resolution; the model points at the arrow tip /
        tick. A ~37 pt box at 1,200 px makes each pixel ~0.03 pt, so the same
        pixel slip is ~15× smaller on the drawing (a 15 px slip on a 16 m bay:
        ~11 % from the overview, under 1 % from close-ups — tested)
     3. the wizard then CHECKS: the two dimensions must agree (drawings.ts
        agreement, CHECK_WARN_PCT) and both are drawn on the page for the
        person to see before Next; pinning stays a person's two clicks

   Everything the model says is parsed here: numbers bounded, points inside
   the image, junk dropped. Coordinates come back in the IMAGE's pixels;
   toSourcePt maps them to source units (PDF points / image px).
   ============================================ */

import { normDeg } from './geo';
import type { SrcPt } from './model';

/** Sonnet 5.5: reads small dimension text far better than Haiku; ~2 ¢ a call. */
export const DRAWING_READ_MODEL = process.env.LP_DRAWING_MODEL || 'claude-sonnet-5-5';

/** The overview image's long edge (the high-resolution tier's cap). */
export const OVERVIEW_MAX_PX = 2576;
/** Each close-up's long edge. */
export const REFINE_PX = 1200;

export interface PxPt {
  x: number;
  y: number;
}

export interface ReadDimension {
  text: string;
  metres: number;
  a: PxPt;
  b: PxPt;
  confidence: number;
}

export interface OverviewRead {
  crop: { x0: number; y0: number; x1: number; y1: number } | null;
  dimensions: ReadDimension[];
  /** Degrees clockwise from up the page that the north arrow points; null = none. */
  north: number | null;
  scaleText: string | null;
}

/* ── Prompts ──────────────────────────────────────────────── */

export const READ_SYSTEM =
  'You read venue site drawings for touring productions: CAD plans of car parks, loading docks, roads and arena perimeters. ' +
  'You report what is printed, with pixel positions. You never guess a number that is not printed. Reply with ONE JSON object and nothing else.';

export function overviewPrompt(w: number, h: number): string {
  return [
    `The image is one whole page of a venue drawing, ${w} × ${h} pixels (x right, y down from the top-left).`,
    'Return JSON with:',
    '"crop": [x0, y0, x1, y1] — the rectangle round the plan itself (roads, bays, buildings, the car park). Leave out title blocks, logos, legends, borders and captions.',
    '"dimensions": up to 4 printed dimensions — a number on the drawing with a dimension line, arrows or ticks showing a length (e.g. "16", "24.08", "3.74 m"). For each:',
    '  "text": exactly as printed;',
    '  "metres": that length in metres (convert mm / ft when units are printed; a bare number on a site plan is usually metres; a bare number over 1000 is usually mm);',
    '  "a", "b": [x, y] of the two ends of the measured length — the arrow tips or tick / extension lines where it stops, NOT the number;',
    '  "confidence": 0–1.',
    '  Prefer the longest dimensions, and two that run in different directions. If none is printed, return [].',
    '"north": the direction the north arrow points, in degrees clockwise from straight up the page (0 = up the page is north, 90 = north is to the right), or null if there is no north arrow.',
    '"scale": any printed scale such as "1:500 @ A1", or null.',
  ].join('\n');
}

export function refinePrompt(text: string, metres: number, angleDeg: number): string {
  return [
    `Two close-up images follow, each centred near one END of the printed dimension "${text}" (${metres} m) on a venue drawing.`,
    `In both, the dimension line runs at about ${Math.round(normDeg(angleDeg))}° (clockwise from pointing right).`,
    'For each image give the exact pixel [x, y] (x right, y down) where the measured length ENDS: the tip of the arrowhead, or the point where the dimension line meets its tick / extension line. Not the number, not the middle of the line.',
    'If you cannot see that end in an image, give null for it.',
    'Return JSON: {"ends": [[x, y] or null, [x, y] or null]}',
  ].join('\n');
}

/* ── Parsing what comes back ──────────────────────────────── */

/** The first {...} in a reply, parsed; null if there is none. */
export function jsonOf(reply: string): unknown {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function px(v: unknown, w: number, h: number): PxPt | null {
  if (!Array.isArray(v) || v.length < 2 || !fin(v[0]) || !fin(v[1])) return null;
  const [x, y] = v as number[];
  // A point a hair outside the image is the model rounding; further out is wrong.
  if (x < -2 || y < -2 || x > w + 2 || y > h + 2) return null;
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

export function parseOverview(raw: unknown, w: number, h: number): OverviewRead {
  const o = isObj(raw) ? raw : {};
  let crop: OverviewRead['crop'] = null;
  if (Array.isArray(o.crop) && o.crop.length === 4 && o.crop.every(fin)) {
    const [a, b, c, d] = (o.crop as number[]).map((n, i) => Math.max(0, Math.min(i % 2 ? h : w, n)));
    const x0 = Math.min(a, c);
    const x1 = Math.max(a, c);
    const y0 = Math.min(b, d);
    const y1 = Math.max(b, d);
    // A crop under a tenth of the page each way is the model pointing at a detail.
    if (x1 - x0 >= w * 0.1 && y1 - y0 >= h * 0.1) crop = { x0, y0, x1, y1 };
  }
  const diag = Math.hypot(w, h);
  const dimensions: ReadDimension[] = [];
  for (const r of Array.isArray(o.dimensions) ? o.dimensions.slice(0, 8) : []) {
    if (!isObj(r)) continue;
    const metres = r.metres;
    const a = px(r.a, w, h);
    const b = px(r.b, w, h);
    if (!fin(metres) || metres < 0.2 || metres > 2000 || !a || !b) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < diag * 0.01) continue; // too short to measure from
    dimensions.push({
      text: typeof r.text === 'string' ? r.text.slice(0, 40) : String(metres),
      metres,
      a,
      b,
      confidence: fin(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
    });
  }
  const north = fin(o.north) ? normDeg(o.north) : null;
  const scaleText = typeof o.scale === 'string' && o.scale.trim() ? o.scale.trim().slice(0, 60) : null;
  return { crop, dimensions, north, scaleText };
}

/** The refined ends, each a point in its close-up or null. */
export function parseRefine(raw: unknown, sizes: [{ w: number; h: number }, { w: number; h: number }]): [PxPt | null, PxPt | null] {
  const ends = isObj(raw) && Array.isArray(raw.ends) ? raw.ends : [];
  return [px(ends[0], sizes[0].w, sizes[0].h), px(ends[1], sizes[1].w, sizes[1].h)];
}

/* ── Choosing, and back to drawing units ──────────────────── */

/** The two dimensions to measure from: the most trustworthy long one, then
 *  the best that isn't the same line (ideally another direction). */
export function pickDimensions(dims: ReadDimension[]): ReadDimension[] {
  const len = (d: ReadDimension) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
  const score = (d: ReadDimension) => d.confidence * Math.sqrt(len(d));
  const sorted = [...dims].sort((p, q) => score(q) - score(p));
  const first = sorted[0];
  if (!first) return [];
  const angle = (d: ReadDimension) => Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x);
  const sameLine = (d: ReadDimension) =>
    Math.hypot(d.a.x - first.a.x, d.a.y - first.a.y) + Math.hypot(d.b.x - first.b.x, d.b.y - first.b.y) < len(first) * 0.1 ||
    Math.hypot(d.a.x - first.b.x, d.a.y - first.b.y) + Math.hypot(d.b.x - first.a.x, d.b.y - first.a.y) < len(first) * 0.1;
  const rest = sorted.slice(1).filter((d) => !sameLine(d));
  const turned = rest.find((d) => Math.abs(Math.sin(angle(d) - angle(first))) > 0.5);
  const second = turned && score(turned) >= score(rest[0]) * 0.6 ? turned : rest[0];
  return second ? [first, second] : [first];
}

/** A point in an image of a region → source units. */
export function toSourcePt(p: PxPt, region: { u0: number; v0: number; u1: number; v1: number }, img: { w: number; h: number }): SrcPt {
  return { u: region.u0 + (p.x / img.w) * (region.u1 - region.u0), v: region.v0 + (p.y / img.h) * (region.v1 - region.v0) };
}

/** The close-up round one end of a dimension, source units: big enough to hold
 *  the overview's slip, small enough to make each pixel tiny. */
export function endBox(end: SrcPt, length: number, page: { w: number; h: number }): { u0: number; v0: number; u1: number; v1: number } {
  const diag = Math.hypot(page.w, page.h);
  const half = Math.max(diag * 0.01, Math.min(diag * 0.04, length * 0.15));
  return { u0: end.u - half, v0: end.v - half, u1: end.u + half, v1: end.v + half };
}

/** The drawing's "up" as a compass bearing, from where its north arrow points. */
export function rotationFromNorth(north: number): number {
  return normDeg(-north);
}
