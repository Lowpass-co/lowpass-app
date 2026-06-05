/* ============================================================
   LOWPASS — Stage Plot AI icon generator (§SP-FIX-1b·5)

   Server-side helper: builds the Claude prompt (style guide + the
   canonical anchors as worked examples) and sanitises the SVG that
   comes back before it's ever stored or rendered. The route in
   app/api/stage-plot/icons/generate calls these; keep all
   model/prompt/validation logic here so it's testable in isolation.

   Model: claude-sonnet-4-6 (better at structured graphic generation
   than Haiku for this task, per the parked-doc cost note). The big
   static SYSTEM_PROMPT is byte-stable, so the route caches it with
   cache_control:ephemeral and repeated generations are cheap.
   ============================================================ */

import { canonicalIcons } from './icons/canonical';

/** Current Sonnet (no date suffix — the alias is complete as-is). */
export const GENERATOR_MODEL = 'claude-sonnet-4-6';

/** SVG tags allowed in a generated body. Inner markup only — no
 *  <svg> wrapper, no refs, no scripting, no embedded raster. */
const ALLOWED_TAGS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text']);

/** Tokens that must never appear — scripting, external refs, raster
 *  embeds, the <svg> wrapper, data/JS URIs. */
const BANNED = ['<script', '<style', '<image', '<foreignobject', '<use', '<iframe', '<a ', '<animate', '<svg', 'href', 'xlink', 'javascript:', 'data:', 'url(', '<!'];

function buildSystemPrompt(): string {
  const examples = canonicalIcons
    .filter((i) => i.keywords?.includes('canonical'))
    .map((i) => `• ${i.label} — ${i.footprint.width_ft}×${i.footprint.depth_ft} ft, viewBox "${i.viewBox ?? '0 0 100 100'}"\n  ${i.body}`)
    .join('\n');

  return [
    'You are a precise SVG draftsman for a top-down stage-plot editor. You draw a single piece of stage/touring gear as seen from DIRECTLY ABOVE, as inner SVG markup only.',
    '',
    'GRAMMAR — follow exactly:',
    '1. TOP-DOWN, real-world footprint. The viewBox aspect ratio MUST equal the footprint aspect ratio, in units of feet × 100 (e.g. 1.8 × 1.4 ft → viewBox "0 0 180 140"). Square footprint → square viewBox.',
    '2. ONE filled footprint shape with NO class — the outer silhouette (rect / rounded-rect / circle / ellipse / polygon), spanning the viewBox edge-to-edge.',
    '3. All internal structure (knobs, grilles, lugs, jacks, rings, bells, subdivisions) goes in elements with class="lp-ico-detail" so it renders stroke-only.',
    '4. NO colour, fill, stroke, or style attributes anywhere — CSS supplies them. NO in-icon text except short identity labels via class="lp-ico-label".',
    '5. Reuse a consistent vocabulary: lug/screw = short tick or small circle; ring = concentric inset; grille = evenly spaced parallel lines; jack/knob = small circle.',
    '6. Must read at 16px: keep detail minimal enough that the silhouette dominates at small sizes.',
    '7. Allowed elements ONLY: g, path, rect, circle, ellipse, line, polyline, polygon, text. No <svg> wrapper, no <image>/<use>/<script>/<style>, no href/xlink, no external refs.',
    '',
    'CANONICAL EXAMPLES — match this exact style and density:',
    examples,
    '',
    'OUTPUT: return ONLY a JSON object, no markdown, no prose:',
    '{"viewBox": "0 0 W H", "body": "<inner svg markup>", "width_ft": <number>, "depth_ft": <number>}',
  ].join('\n');
}

/** The cached system prefix (byte-stable across requests). */
export const SYSTEM_PROMPT = buildSystemPrompt();

export interface SanitizeResult {
  ok: boolean;
  body?: string;
  reason?: string;
}

/** Validate + clean a generated SVG body. Rejects anything outside
 *  the tag whitelist or containing scripting/external refs; strips
 *  any colour/style attributes so CSS theming stays in control. */
export function sanitizeSvgBody(raw: string): SanitizeResult {
  const body = (raw ?? '').trim();
  if (!body) return { ok: false, reason: 'empty body' };
  if (body.length > 8000) return { ok: false, reason: 'body too large' };

  const lower = body.toLowerCase();
  for (const token of BANNED) {
    if (lower.includes(token)) return { ok: false, reason: `banned token "${token.trim()}"` };
  }
  if (/\son\w+\s*=/i.test(body)) return { ok: false, reason: 'inline event handler' };

  const tags = [...body.matchAll(/<\s*([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase());
  if (!tags.length) return { ok: false, reason: 'no SVG elements' };
  for (const t of tags) {
    if (!ALLOWED_TAGS.has(t)) return { ok: false, reason: `disallowed element <${t}>` };
  }

  // Enforce CSS theming: drop any colour/style attributes the model added.
  const cleaned = body
    .replace(/\s(fill|stroke|style|color)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(fill|stroke|style|color)\s*=\s*'[^']*'/gi, '');

  return { ok: true, body: cleaned };
}

/** Validate a "0 0 W H" viewBox string (4 non-negative numbers). */
export function isValidViewBox(vb: string): boolean {
  if (!/^[\d.\s]+$/.test(vb)) return false;
  const parts = vb.trim().split(/\s+/);
  return parts.length === 4 && parts.every((p) => Number.isFinite(Number(p)));
}

/** Footprint sanity bounds (feet). */
export const isValidDim = (n: number): boolean => Number.isFinite(n) && n >= 0.1 && n <= 60;
