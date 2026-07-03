/* ============================================================
   LOWPASS — Stage Plot amps & cabinets icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const ampIcons: IconDescriptor[] = [
  {
    "name": "amp-combo-1x12",
    "category": "amps",
    "label": "Guitar combo",
    "footprint": {
      "width_ft": 1.8,
      "depth_ft": 1.8
    },
    "viewBox": "0 0 180 180",
    "keywords": [
      "combo",
      "1x12",
      "2x12",
      "guitar",
      "twin",
      "amp"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"174\" height=\"174\" rx=\"10\"/><circle cx=\"36\" cy=\"20\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"70\" cy=\"20\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"104\" cy=\"20\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"138\" cy=\"20\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"104\" r=\"52\" class=\"lp-ico-tone\"/><circle cx=\"90\" cy=\"104\" r=\"9.4\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "amp-cab-4x12",
    "category": "amps",
    "label": "Amp cab / stack",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 250 120",
    "keywords": [
      "cabinet",
      "4x12",
      "stack",
      "svt",
      "amp"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"244\" height=\"114\" rx=\"7\"/><circle cx=\"82\" cy=\"42\" r=\"24\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"42\" r=\"4.3\" class=\"lp-ico-detail\"/><circle cx=\"168\" cy=\"42\" r=\"24\" class=\"lp-ico-tone\"/><circle cx=\"168\" cy=\"42\" r=\"4.3\" class=\"lp-ico-detail\"/><circle cx=\"82\" cy=\"90\" r=\"24\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"90\" r=\"4.3\" class=\"lp-ico-detail\"/><circle cx=\"168\" cy=\"90\" r=\"24\" class=\"lp-ico-tone\"/><circle cx=\"168\" cy=\"90\" r=\"4.3\" class=\"lp-ico-detail\"/>"
  },
];
