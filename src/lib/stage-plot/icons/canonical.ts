/* ============================================================
   LOWPASS — Stage Plot CANONICAL ICONS + STYLE GUIDE
   (§SP-FIX-1a, revised v2)

   The style anchors for the whole ~140-icon library. Every other
   icon (hand-authored in §SP-FIX-1b, AI-generated in §SP11) must
   obey the grammar these establish. The MVP failed because it
   mixed three visual languages; this file is the single reference
   that prevents that recurring.

   ── DRAWING GRAMMAR (binding) ───────────────────────────────
   1. TOP-DOWN, REAL FOOTPRINT. Draw the object as seen from
      directly above, at its true real-world proportions. The
      viewBox aspect ratio MUST equal the footprint aspect ratio
      (units = feet × 100), because the canvas renders the body
      with preserveAspectRatio="xMidYMid meet" into a
      footprint-sized box — a square viewBox in a wide box
      letterboxes and renders too small. So: kick 1.8×1.4 ft →
      viewBox "0 0 180 140".
   2. ONE FILLED FOOTPRINT SHAPE. Exactly one closed shape carries
      NO class — it is the footprint, flood-filled with the brand
      tint + category stroke on canvas, outline in the library. It
      spans the viewBox edge-to-edge. This is what makes scale read.
   3. STRUCTURE IS DETAIL, NEVER FILL. Internal marks — hoops,
      grille lines, knob dots, lugs, jacks, subdivisions, bolts,
      tripod legs, booms — go in `class="lp-ico-detail"` (stroke
      only, never flood-filled).
   4. CONSISTENT VOCABULARY. Reuse the same primitives across the
      set: lug/screw → short tick or r≈3 dot; hoop/ring →
      concentric inset; grille → parallel lines; jack/control →
      small circle; panel → inset rounded-rect; leg/boom → line.
   5. STROKE + CAPS. 1.5px library / 1.75px canvas, non-scaling.
      Round caps + joins. Bodies carry NO colour attributes.
   6. NO IN-ICON TEXT — with two explicit exceptions: the DI box
      ("DI") and power count badge, where the label IS the
      identity. Use `class="lp-ico-label"` (filled, not stroked)
      so it reads at small sizes. Everything else identifies by
      silhouette + signature detail.
   7. LEGIBILITY FLOOR. Must read at 16px: at that size only the
      footprint shape + the single most-identifying detail survive.

   Orientation cue: items that have a "front" (kick pedal, mic
   capsule, DI input, amp face) carry a small directional marker so
   they stay legible — and orientable — after rotation.

   These anchors are NOT yet in ALL_ICONS — §SP-FIX-1b swaps them
   into their category files after Adam signs off here.
   ============================================================ */

import type { IconDescriptor } from './types';

// Shared bolt glyph for the power family (detail = stroked outline).
const BOLT = '<polygon points="27,9 15,27 23,27 21,41 35,21 27,21" class="lp-ico-detail"/>';
// Count badge (corner) for power drops with 2+ sockets.
const countBadge = (n: number): string =>
  `<circle cx="42" cy="10" r="8.5" class="lp-ico-detail"/>` +
  `<text class="lp-ico-label" x="42" y="10" text-anchor="middle" dominant-baseline="central" font-size="12">${n}</text>`;

/* ── KICK — 3 treatments for Adam to pick (debug page only) ────
   All: rounded-rect shell (1.8w × 1.4d), rx = 30% of the shorter
   side, thin vertical seam line. They differ only in the front
   (downstage) pedal-direction marker. Recommended = A. */
const KICK_SHELL = '<rect x="6" y="6" width="168" height="128" rx="42"/>';
const KICK_SEAM = '<line x1="90" y1="24" x2="90" y2="116" class="lp-ico-detail"/>';
export const kickTreatments: IconDescriptor[] = [
  {
    name: 'kick-a',
    category: 'drums',
    label: 'Kick · A (solid triangle)',
    footprint: { width_ft: 1.8, depth_ft: 1.4 },
    viewBox: '0 0 180 140',
    keywords: ['kick', 'treatment'],
    // Solid filled triangle at the front edge → clearest rotation cue.
    body: KICK_SHELL + KICK_SEAM + '<polygon points="78,118 102,118 90,134" class="lp-ico-label"/>',
  },
  {
    name: 'kick-b',
    category: 'drums',
    label: 'Kick · B (front dot)',
    footprint: { width_ft: 1.8, depth_ft: 1.4 },
    viewBox: '0 0 180 140',
    keywords: ['kick', 'treatment'],
    body: KICK_SHELL + KICK_SEAM + '<circle cx="90" cy="120" r="7" class="lp-ico-label"/>',
  },
  {
    name: 'kick-c',
    category: 'drums',
    label: 'Kick · C (pedal notch)',
    footprint: { width_ft: 1.8, depth_ft: 1.4 },
    viewBox: '0 0 180 140',
    keywords: ['kick', 'treatment'],
    body: KICK_SHELL + KICK_SEAM + '<rect x="79" y="118" width="22" height="16" rx="3" class="lp-ico-detail"/>',
  },
];

export const canonicalIcons: IconDescriptor[] = [
  // Anchor for rectangular-footprint drums. Recommended kick = A.
  { ...kickTreatments[0], name: 'drum-kick', label: 'Kick drum', keywords: ['bass drum', 'bd', '22', 'canonical'] },
  {
    // Anchor for round-footprint drums (snare, toms) + throne.
    name: 'drum-snare',
    category: 'drums',
    label: 'Snare',
    footprint: { width_ft: 1.2, depth_ft: 1.2 },
    viewBox: '0 0 120 120',
    keywords: ['sd', '14', 'canonical'],
    body:
      '<circle cx="60" cy="60" r="55"/>' +
      '<circle cx="60" cy="60" r="43" class="lp-ico-detail"/>' +
      '<line x1="110" y1="60" x2="120" y2="60" class="lp-ico-detail"/>' +
      '<line x1="95.4" y1="95.4" x2="102.4" y2="102.4" class="lp-ico-detail"/>' +
      '<line x1="60" y1="110" x2="60" y2="120" class="lp-ico-detail"/>' +
      '<line x1="24.6" y1="95.4" x2="17.6" y2="102.4" class="lp-ico-detail"/>' +
      '<line x1="10" y1="60" x2="0" y2="60" class="lp-ico-detail"/>' +
      '<line x1="24.6" y1="24.6" x2="17.6" y2="17.6" class="lp-ico-detail"/>' +
      '<line x1="60" y1="10" x2="60" y2="0" class="lp-ico-detail"/>' +
      '<line x1="95.4" y1="24.6" x2="102.4" y2="17.6" class="lp-ico-detail"/>' +
      '<rect x="106" y="49" width="13" height="22" rx="2" class="lp-ico-detail"/>',
  },
  {
    // Anchor for all cymbals. Thin tilted ellipse + bell + groove.
    name: 'drum-crash',
    category: 'drums',
    label: 'Crash cymbal',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    viewBox: '0 0 150 150',
    keywords: ['cymbal', '16', '18', 'canonical'],
    body:
      '<ellipse cx="75" cy="75" rx="68" ry="55" transform="rotate(-18 75 75)"/>' +
      '<ellipse cx="75" cy="75" rx="47" ry="37" transform="rotate(-18 75 75)" class="lp-ico-detail"/>' +
      '<circle cx="75" cy="75" r="11" class="lp-ico-detail"/>',
  },
  {
    // Anchor for all amps + cabs.
    name: 'amp-combo-1x12',
    category: 'amps',
    label: 'Combo 1×12',
    footprint: { width_ft: 2.0, depth_ft: 1.0 },
    viewBox: '0 0 200 100',
    keywords: ['combo', 'guitar amp', '1x12', 'canonical'],
    body:
      '<rect x="4" y="6" width="192" height="90" rx="10"/>' +
      '<rect x="86" y="2" width="28" height="8" rx="3" class="lp-ico-detail"/>' +
      '<rect x="14" y="14" width="172" height="18" rx="3" class="lp-ico-detail"/>' +
      '<circle cx="30" cy="23" r="3.5" class="lp-ico-detail"/>' +
      '<circle cx="62" cy="23" r="3.5" class="lp-ico-detail"/>' +
      '<circle cx="94" cy="23" r="3.5" class="lp-ico-detail"/>' +
      '<circle cx="126" cy="23" r="3.5" class="lp-ico-detail"/>' +
      '<circle cx="158" cy="23" r="3.5" class="lp-ico-detail"/>' +
      '<rect x="14" y="38" width="172" height="54" rx="4" class="lp-ico-detail"/>' +
      '<line x1="20" y1="50" x2="180" y2="50" class="lp-ico-detail"/>' +
      '<line x1="20" y1="61" x2="180" y2="61" class="lp-ico-detail"/>' +
      '<line x1="20" y1="72" x2="180" y2="72" class="lp-ico-detail"/>' +
      '<line x1="20" y1="83" x2="180" y2="83" class="lp-ico-detail"/>',
  },

  // ── MIC STANDS — 4 variants. Anchor = round-base-boom (default). ──
  {
    name: 'mic-stand-tripod',
    category: 'stands',
    label: 'Mic stand (tripod)',
    footprint: { width_ft: 2.0, depth_ft: 2.0 },
    viewBox: '0 0 200 200',
    keywords: ['mic stand', 'tripod', 'straight', 'canonical'],
    body:
      '<circle cx="100" cy="100" r="14"/>' +
      '<line x1="100" y1="100" x2="100" y2="18" class="lp-ico-detail"/>' +
      '<line x1="100" y1="100" x2="26" y2="150" class="lp-ico-detail"/>' +
      '<line x1="100" y1="100" x2="174" y2="150" class="lp-ico-detail"/>',
  },
  {
    name: 'mic-stand-tripod-boom',
    category: 'stands',
    label: 'Mic stand (tripod + boom)',
    footprint: { width_ft: 2.5, depth_ft: 1.8 },
    viewBox: '0 0 250 180',
    keywords: ['mic stand', 'tripod', 'boom', 'canonical'],
    body:
      '<circle cx="165" cy="118" r="13"/>' +
      '<line x1="165" y1="118" x2="165" y2="44" class="lp-ico-detail"/>' +
      '<line x1="165" y1="118" x2="112" y2="166" class="lp-ico-detail"/>' +
      '<line x1="165" y1="118" x2="218" y2="166" class="lp-ico-detail"/>' +
      '<line x1="165" y1="118" x2="58" y2="44" class="lp-ico-detail"/>' +
      '<ellipse cx="52" cy="40" rx="12" ry="15" transform="rotate(-35 52 40)" class="lp-ico-detail"/>',
  },
  {
    name: 'mic-stand-round-base',
    category: 'stands',
    label: 'Mic stand (round base)',
    footprint: { width_ft: 1.0, depth_ft: 1.0 },
    viewBox: '0 0 100 100',
    keywords: ['mic stand', 'round base', 'weighted', 'canonical'],
    body: '<circle cx="50" cy="52" r="34"/>' + '<circle cx="50" cy="52" r="21" class="lp-ico-detail"/>',
  },
  {
    // DEFAULT touring stand → the canonical mic anchor.
    name: 'mic-stand-round-base-boom',
    category: 'stands',
    label: 'Mic stand (round base + boom)',
    footprint: { width_ft: 1.5, depth_ft: 1.0 },
    viewBox: '0 0 150 100',
    keywords: ['mic stand', 'round base', 'boom', 'default', 'canonical'],
    body:
      '<circle cx="108" cy="58" r="29"/>' +
      '<circle cx="108" cy="58" r="18" class="lp-ico-detail"/>' +
      '<line x1="108" y1="58" x2="34" y2="30" class="lp-ico-detail"/>' +
      '<ellipse cx="27" cy="28" rx="10" ry="13" transform="rotate(-50 27 28)" class="lp-ico-detail"/>',
  },

  // ── DI BOXES — 2 variants. "DI" text + input dots (rule 6 exception). ──
  {
    name: 'di-mono',
    category: 'signal',
    label: 'DI (mono)',
    footprint: { width_ft: 0.5, depth_ft: 0.4 },
    viewBox: '0 0 50 40',
    keywords: ['direct box', 'di', 'mono', 'canonical'],
    body:
      '<rect x="4" y="4" width="42" height="32" rx="5"/>' +
      '<text class="lp-ico-label" x="25" y="16" text-anchor="middle" dominant-baseline="central" font-size="15">DI</text>' +
      '<circle cx="25" cy="33" r="3.2" class="lp-ico-detail"/>',
  },
  {
    name: 'di-stereo',
    category: 'signal',
    label: 'DI (stereo)',
    footprint: { width_ft: 0.5, depth_ft: 0.4 },
    viewBox: '0 0 50 40',
    keywords: ['direct box', 'di', 'stereo', 'canonical'],
    body:
      '<rect x="4" y="4" width="42" height="32" rx="5"/>' +
      '<text class="lp-ico-label" x="25" y="16" text-anchor="middle" dominant-baseline="central" font-size="15">DI</text>' +
      '<circle cx="18" cy="33" r="3.2" class="lp-ico-detail"/>' +
      '<circle cx="32" cy="33" r="3.2" class="lp-ico-detail"/>',
  },

  // ── POWER — socket-count family. Disc + bolt; corner count badge
  //    for 2+. Voltage label + size-gated badge are canvas-layer
  //    behaviours (§SP-FIX-2/6), not bakeable into a static glyph. ──
  {
    name: 'power-1',
    category: 'infrastructure',
    label: 'Power (single)',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 50 50',
    keywords: ['power', 'edison', '120v', 'single', 'canonical'],
    body: '<circle cx="25" cy="25" r="21"/>' + BOLT,
  },
  {
    name: 'power-2',
    category: 'infrastructure',
    label: 'Power (duplex ×2)',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 50 50',
    keywords: ['power', 'duplex', 'quad', '120v', 'canonical'],
    body: '<circle cx="25" cy="25" r="21"/>' + BOLT + countBadge(2),
  },
  {
    name: 'power-4',
    category: 'infrastructure',
    label: 'Power (4-way)',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 50 50',
    keywords: ['power', 'pigtail', '4-way', 'canonical'],
    body: '<circle cx="25" cy="25" r="21"/>' + BOLT + countBadge(4),
  },
  {
    name: 'power-6',
    category: 'infrastructure',
    label: 'Power (6-way distro)',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 50 50',
    keywords: ['power', 'distro', '6-way', 'canonical'],
    body: '<circle cx="25" cy="25" r="21"/>' + BOLT + countBadge(6),
  },

  {
    // Anchor for all racks (wireless, IEM, Kemper, stage rack).
    name: 'rack-4u',
    category: 'signal',
    label: 'Stage rack (4U)',
    footprint: { width_ft: 1.7, depth_ft: 1.5 },
    viewBox: '0 0 170 150',
    keywords: ['rack', '4u', 'wireless', 'iem', 'canonical'],
    body:
      '<rect x="5" y="5" width="160" height="140" rx="8"/>' +
      '<line x1="24" y1="10" x2="24" y2="140" class="lp-ico-detail"/>' +
      '<line x1="146" y1="10" x2="146" y2="140" class="lp-ico-detail"/>' +
      '<line x1="24" y1="40" x2="146" y2="40" class="lp-ico-detail"/>' +
      '<line x1="24" y1="75" x2="146" y2="75" class="lp-ico-detail"/>' +
      '<line x1="24" y1="110" x2="146" y2="110" class="lp-ico-detail"/>' +
      '<circle cx="14" cy="23" r="2.6" class="lp-ico-detail"/>' +
      '<circle cx="156" cy="23" r="2.6" class="lp-ico-detail"/>' +
      '<circle cx="14" cy="127" r="2.6" class="lp-ico-detail"/>' +
      '<circle cx="156" cy="127" r="2.6" class="lp-ico-detail"/>',
  },
];
