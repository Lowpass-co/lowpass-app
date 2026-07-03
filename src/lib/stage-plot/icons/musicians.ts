/* ============================================================
   LOWPASS — Stage Plot musicians icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const musicianIcons: IconDescriptor[] = [
  {
    "name": "person-male",
    "category": "musicians",
    "label": "Person (male)",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 1.6
    },
    "viewBox": "0 0 220 160",
    "keywords": [
      "person",
      "musician",
      "performer",
      "man"
    ],
    "body": "<ellipse cx=\"110\" cy=\"78\" rx=\"102\" ry=\"52\"/><circle cx=\"110\" cy=\"78\" r=\"38\" class=\"lp-ico-tone\"/><line x1=\"110\" y1=\"116\" x2=\"110\" y2=\"132\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "person-female",
    "category": "musicians",
    "label": "Person (female)",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 1.6
    },
    "viewBox": "0 0 220 160",
    "keywords": [
      "person",
      "musician",
      "performer",
      "woman"
    ],
    "body": "<circle cx=\"110\" cy=\"32\" r=\"16\" class=\"lp-ico-tone\"/><ellipse cx=\"110\" cy=\"78\" rx=\"102\" ry=\"52\"/><circle cx=\"110\" cy=\"78\" r=\"38\" class=\"lp-ico-tone\"/><line x1=\"110\" y1=\"116\" x2=\"110\" y2=\"132\" class=\"lp-ico-detail\"/>"
  },
];
