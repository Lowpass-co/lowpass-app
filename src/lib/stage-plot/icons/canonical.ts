/* ============================================================
   LOWPASS — Stage Plot CANONICAL ICONS + STYLE GUIDE (§SP-FIX-1a)

   The 8 style anchors for the whole ~140-icon library. Every
   other icon (hand-authored in §SP-FIX-1b, AI-generated in §SP11)
   must obey the grammar these establish. The MVP failed because
   it mixed three visual languages; this file is the single
   reference that prevents that recurring.

   ── DRAWING GRAMMAR (binding) ───────────────────────────────
   1. TOP-DOWN, REAL FOOTPRINT. Draw the object as seen from
      directly above, at its true real-world proportions. The
      viewBox aspect ratio MUST equal the footprint aspect ratio
      (units = feet × 100), because the canvas renders the body
      with preserveAspectRatio="xMidYMid meet" into a
      footprint-sized box — a square viewBox in a wide box
      letterboxes and renders too small. So: kick 1.8×1.4 ft →
      viewBox "0 0 180 140".
   2. ONE FILLED FOOTPRINT SHAPE. Exactly one closed shape
      (rect / rounded-rect / circle / ellipse / polygon) carries
      NO class — it is the footprint, flood-filled with the brand
      tint + category stroke on canvas, outline in the library.
      It spans the viewBox edge-to-edge (small inset only for the
      stroke). This is what makes scale read.
   3. STRUCTURE IS DETAIL, NEVER FILL. Every internal mark —
      hoops, grille lines, knob dots, lugs, jacks, subdivisions,
      bolts — goes in `class="lp-ico-detail"` so it is stroke-only
      (never flood-filled) and reads as line-work on top of the
      tint.
   4. CONSISTENT VOCABULARY. Reuse the same primitives across the
      set so detail stays coherent rather than noisy:
        · lug / screw   → short tick line (~10u) or r≈3 dot
        · hoop / ring   → concentric inset of the footprint shape
        · grille        → evenly-spaced parallel lines
        · jack / control→ small circle (r 3–4)
        · panel / strip → inset rounded-rect
      Do NOT invent a new way to draw a knob in every icon.
   5. STROKE + CAPS. 1.5px library / 1.75px canvas, non-scaling
      (globals.css). Round caps + joins everywhere. Authored
      bodies carry NO fill/stroke/colour attributes.
   6. NO IN-ICON TEXT. Identify by silhouette + signature detail,
      not letters. (The legacy snare "S" is being retired.)
   7. LEGIBILITY FLOOR. Must read at 16px: at that size only the
      footprint shape + the single most-identifying detail
      survive. Keep detail counts low enough that the 16px render
      is not a grey smudge (see the debug page at /stage-plot-icons).

   These 8 are NOT yet in ALL_ICONS — §SP-FIX-1b swaps them into
   their category files (replacing the legacy drum/amp/etc. art)
   after Adam signs off on the anchors here.
   ============================================================ */

import type { IconDescriptor } from './types';

export const canonicalIcons: IconDescriptor[] = [
  {
    // Anchor for: all drums with a rectangular top-down footprint.
    // A kick lies on its axis (front↔back), so top-down it is the
    // SHELL rectangle — diameter wide (1.8) × shell deep (1.4) —
    // NOT a circle. Heads/hoops sit on the front + back edges.
    name: 'drum-kick',
    category: 'drums',
    label: 'Kick drum',
    footprint: { width_ft: 1.8, depth_ft: 1.4 },
    viewBox: '0 0 180 140',
    keywords: ['bass drum', 'bd', '22', 'canonical'],
    body:
      '<rect x="5" y="5" width="170" height="130" rx="26"/>' +
      '<rect x="17" y="17" width="146" height="106" rx="18" class="lp-ico-detail"/>' +
      // lugs on the two head edges (top = back, bottom = front)
      '<line x1="50" y1="6" x2="50" y2="16" class="lp-ico-detail"/>' +
      '<line x1="90" y1="6" x2="90" y2="16" class="lp-ico-detail"/>' +
      '<line x1="130" y1="6" x2="130" y2="16" class="lp-ico-detail"/>' +
      '<line x1="50" y1="124" x2="50" y2="134" class="lp-ico-detail"/>' +
      '<line x1="90" y1="124" x2="90" y2="134" class="lp-ico-detail"/>' +
      '<line x1="130" y1="124" x2="130" y2="134" class="lp-ico-detail"/>' +
      // pedal mount, downstage (front) centre
      '<rect x="79" y="116" width="22" height="19" rx="3" class="lp-ico-detail"/>',
  },
  {
    // Anchor for: all round-footprint drums (snare, toms) + the
    // throne. Circle shell + concentric hoop + radial lugs.
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
      // throw-off strainer on the right rim
      '<rect x="106" y="49" width="13" height="22" rx="2" class="lp-ico-detail"/>',
  },
  {
    // Anchor for: all cymbals. Thin tilted ellipse (you see the
    // disc foreshortened on its stand) + centre bell + one tone
    // groove. Crash / ride / splash differ only by footprint size.
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
    // Anchor for: all amps + cabs. Cabinet rounded-rect + top
    // control strip with knob dots + speaker grille with parallel
    // lines + carry handle. Brand/size variants change footprint
    // + grille count, never the grammar.
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
  {
    // Anchor for: all stands + round-base supports. Filled base
    // disc + weight ring + thin shaft + capsule. Tripod variants
    // swap the disc for three legs but keep shaft + capsule.
    name: 'mic-stand-round',
    category: 'stands',
    label: 'Mic stand (round base)',
    footprint: { width_ft: 1.0, depth_ft: 1.0 },
    viewBox: '0 0 100 100',
    keywords: ['mic stand', 'round base', 'vocal', 'canonical'],
    body:
      '<circle cx="50" cy="62" r="33"/>' +
      '<circle cx="50" cy="62" r="21" class="lp-ico-detail"/>' +
      '<line x1="50" y1="62" x2="50" y2="20" class="lp-ico-detail"/>' +
      '<ellipse cx="50" cy="14" rx="8" ry="12" class="lp-ico-detail"/>',
  },
  {
    // Anchor for: all small I/O boxes (DI, splitter, ground-lift).
    // Filled box + in/out jack dots on opposite edges + side
    // switch. Keep tiny-footprint detail to 3 marks max.
    name: 'di-box',
    category: 'signal',
    label: 'DI box',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 50 50',
    keywords: ['direct box', 'di', 'canonical'],
    body:
      '<rect x="5" y="5" width="40" height="40" rx="5"/>' +
      '<circle cx="25" cy="44" r="4" class="lp-ico-detail"/>' +
      '<circle cx="25" cy="6" r="4" class="lp-ico-detail"/>' +
      '<rect x="38" y="20" width="9" height="10" rx="2" class="lp-ico-detail"/>',
  },
  {
    // Anchor for: power drops + distros. Filled disc + bolt
    // glyph (stroked outline, never filled — it is detail). The
    // voltage label is added by the canvas label layer, not here.
    name: 'power-drop',
    category: 'infrastructure',
    label: 'Power drop',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 50 50',
    keywords: ['power', 'edison', '120v', 'distro', 'canonical'],
    body:
      '<circle cx="25" cy="25" r="21"/>' +
      '<polygon points="27,9 15,27 23,27 21,41 35,21 27,21" class="lp-ico-detail"/>',
  },
  {
    // Anchor for: all racks (wireless, IEM, Kemper, stage rack).
    // Frame rounded-rect + rack ears + horizontal U dividers +
    // ear screws. U count scales with footprint depth.
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
