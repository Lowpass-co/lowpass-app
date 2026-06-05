/* ============================================
   LOWPASS — Stage Plot utility & annotations icons (§SP1c)

   Generated against the locked icon contract (top-down, no
   colour attrs, footprint outline unclassed, details in
   .lp-ico-detail, letters in .lp-ico-label). Footprints are
   real-world feet. Hand-tunable — edit freely.
   ============================================ */

import type { IconDescriptor } from './types';

export const utilityIcons: IconDescriptor[] = [
  {
    "name": "util-rectangle",
    "category": "utility",
    "label": "Rectangle",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 2
    },
    "keywords": [
      "rectangle",
      "box",
      "shape",
      "annotation",
      "markup"
    ],
    "body": "<rect x=\"24\" y=\"30\" width=\"52\" height=\"40\" rx=\"5\"/>"
  },
  {
    "name": "util-circle",
    "category": "utility",
    "label": "Circle",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 2
    },
    "keywords": [
      "circle",
      "round",
      "shape",
      "annotation",
      "markup"
    ],
    "body": "<circle cx=\"50\" cy=\"50\" r=\"24\"/>"
  },
  {
    "name": "util-polygon",
    "category": "utility",
    "label": "Polygon",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 2
    },
    "keywords": [
      "polygon",
      "pentagon",
      "shape",
      "annotation",
      "markup"
    ],
    "body": "<path d=\"M50 26 L74 43 L65 72 L35 72 L26 43 Z\"/>"
  },
  {
    "name": "util-line",
    "category": "utility",
    "label": "Line",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 0.3
    },
    "keywords": [
      "line",
      "stroke",
      "divider",
      "annotation",
      "markup"
    ],
    "body": "<rect x=\"22\" y=\"47\" width=\"56\" height=\"6\" rx=\"3\"/>"
  },
  {
    "name": "util-arrow",
    "category": "utility",
    "label": "Arrow",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1
    },
    "keywords": [
      "arrow",
      "pointer",
      "direction",
      "annotation",
      "markup"
    ],
    "body": "<path d=\"M22 47 L60 47 L60 38 L78 50 L60 62 L60 53 L22 53 Z\"/>"
  },
  {
    "name": "util-text",
    "category": "utility",
    "label": "Text",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 0.8
    },
    "keywords": [
      "text",
      "label",
      "tag",
      "annotation",
      "markup"
    ],
    "body": "<rect x=\"24\" y=\"38\" width=\"52\" height=\"24\" rx=\"4\"/><text class=\"lp-ico-label\" x=\"50\" y=\"50\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"16\">T</text>"
  },
  {
    "name": "util-callout",
    "category": "utility",
    "label": "Callout",
    "footprint": {
      "width_ft": 1.8,
      "depth_ft": 1.2
    },
    "keywords": [
      "callout",
      "speech",
      "bubble",
      "note",
      "annotation"
    ],
    "body": "<path d=\"M24 30 L76 30 Q80 30 80 34 L80 58 Q80 62 76 62 L46 62 L36 74 L38 62 L24 62 Q20 62 20 58 L20 34 Q20 30 24 30 Z\"/>"
  },
  {
    "name": "util-exclamation",
    "category": "utility",
    "label": "Warning",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.4
    },
    "keywords": [
      "warning",
      "exclamation",
      "caution",
      "alert",
      "annotation"
    ],
    "body": "<path d=\"M50 24 L78 74 L22 74 Z\"/><text class=\"lp-ico-label\" x=\"50\" y=\"56\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"22\">!</text>"
  },
  {
    "name": "util-power-symbol",
    "category": "utility",
    "label": "Power",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 1
    },
    "keywords": [
      "power",
      "on",
      "off",
      "switch",
      "annotation"
    ],
    "body": "<circle cx=\"50\" cy=\"50\" r=\"24\"/><path d=\"M40 42 A14 14 0 1 0 60 42\" class=\"lp-ico-detail\"/><line x1=\"50\" y1=\"34\" x2=\"50\" y2=\"50\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "util-north",
    "category": "utility",
    "label": "North",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 1.2
    },
    "keywords": [
      "north",
      "compass",
      "orientation",
      "marker",
      "annotation"
    ],
    "body": "<circle cx=\"50\" cy=\"54\" r=\"22\"/><polygon points=\"50,18 56,30 44,30\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"56\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"18\">N</text>"
  }
];
