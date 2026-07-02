/* ============================================================
   LOWPASS — Stage Plot utility & annotations icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const utilityIcons: IconDescriptor[] = [
  {
    "name": "util-rectangle",
    "category": "utility",
    "label": "Rectangle",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 2
    },
    "viewBox": "0 0 300 200",
    "keywords": [
      "rectangle",
      "box",
      "zone"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"294\" height=\"194\"/>"
  },
  {
    "name": "util-circle",
    "category": "utility",
    "label": "Circle",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 2
    },
    "viewBox": "0 0 200 200",
    "keywords": [
      "circle",
      "zone"
    ],
    "body": "<circle cx=\"100\" cy=\"100\" r=\"97\"/>"
  },
  {
    "name": "util-polygon",
    "category": "utility",
    "label": "Polygon",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 2.5
    },
    "viewBox": "0 0 250 250",
    "keywords": [
      "polygon",
      "shape",
      "zone"
    ],
    "body": "<path d=\"M125 8 L240 95 L196 238 L54 238 L10 95 Z\"/>"
  },
  {
    "name": "util-line",
    "category": "utility",
    "label": "Line",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 0.3
    },
    "viewBox": "0 0 400 30",
    "keywords": [
      "line",
      "divider"
    ],
    "outline": true,
    "body": "<line x1=\"6\" y1=\"15\" x2=\"394\" y2=\"15\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "util-arrow",
    "category": "utility",
    "label": "Arrow",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 2.5
    },
    "viewBox": "0 0 250 250",
    "keywords": [
      "arrow",
      "direction"
    ],
    "outline": true,
    "body": "<line x1=\"30\" y1=\"220\" x2=\"150\" y2=\"100\" class=\"lp-ico-detail\"/><path d=\"M210 40 L118 60 L190 132 Z\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "util-text",
    "category": "utility",
    "label": "Text",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 0.8
    },
    "viewBox": "0 0 200 80",
    "keywords": [
      "text",
      "label",
      "annotation"
    ],
    "outline": true,
    "body": "<text x=\"100\" y=\"58\" font-size=\"58\" text-anchor=\"middle\" class=\"lp-ico-label\">Aa</text><line x1=\"30\" y1=\"72\" x2=\"170\" y2=\"72\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "util-callout",
    "category": "utility",
    "label": "Callout",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 1.6
    },
    "viewBox": "0 0 250 160",
    "keywords": [
      "callout",
      "note",
      "speech"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"244\" height=\"118\" rx=\"16\"/><path d=\"M60 121 L92 121 L54 156 Z\"/><circle cx=\"103\" cy=\"62\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"125\" cy=\"62\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"147\" cy=\"62\" r=\"6\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "util-exclamation",
    "category": "utility",
    "label": "Warning",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 1
    },
    "viewBox": "0 0 100 100",
    "keywords": [
      "warning",
      "caution",
      "hazard"
    ],
    "body": "<path d=\"M50 6 L95 90 L5 90 Z\"/><rect x=\"44\" y=\"30\" width=\"12\" height=\"30\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"50\" cy=\"74\" r=\"7\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "util-power-symbol",
    "category": "utility",
    "label": "Power",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 1
    },
    "viewBox": "0 0 100 100",
    "keywords": [
      "power",
      "standby",
      "on"
    ],
    "outline": true,
    "body": "<path d=\"M31 26 A34 34 0 1 0 69 26\" class=\"lp-ico-detail\"/><line x1=\"50\" y1=\"10\" x2=\"50\" y2=\"48\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "util-north",
    "category": "utility",
    "label": "North",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 120 120",
    "keywords": [
      "north",
      "compass",
      "orientation"
    ],
    "body": "<circle cx=\"60\" cy=\"64\" r=\"50\"/><path d=\"M60 24 L78 72 L60 60 L42 72 Z\" class=\"lp-ico-tone\"/><line x1=\"60\" y1=\"60\" x2=\"60\" y2=\"100\" class=\"lp-ico-detail\"/>"
  },
];
