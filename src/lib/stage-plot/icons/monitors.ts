/* ============================================
   LOWPASS — Stage Plot monitors & IEM icons (§SP1c)

   Generated against the locked icon contract (top-down, no
   colour attrs, footprint outline unclassed, details in
   .lp-ico-detail, letters in .lp-ico-label). Footprints are
   real-world feet. Hand-tunable — edit freely.
   ============================================ */

import type { IconDescriptor } from './types';

export const monitorIcons: IconDescriptor[] = [
  {
    "name": "monitor-wedge",
    "category": "monitors",
    "label": "Wedge",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1.4
    },
    "keywords": [
      "floor wedge",
      "monitor",
      "stage monitor",
      "foldback"
    ],
    "body": "<path d=\"M20 62 L80 62 L66 38 L34 38 Z\"/><line x1=\"34\" y1=\"50\" x2=\"66\" y2=\"50\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-wedge-dual",
    "category": "monitors",
    "label": "Dual wedge",
    "footprint": {
      "width_ft": 3.6,
      "depth_ft": 1.4
    },
    "keywords": [
      "dual wedge",
      "double monitor",
      "floor wedges",
      "foldback"
    ],
    "body": "<path d=\"M8 62 L46 62 L40 38 L14 38 Z\"/><path d=\"M54 62 L92 62 L86 38 L60 38 Z\"/><line x1=\"15\" y1=\"50\" x2=\"39\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"61\" y1=\"50\" x2=\"85\" y2=\"50\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-side-fill",
    "category": "monitors",
    "label": "Side fill",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 2
    },
    "keywords": [
      "side fill",
      "sidefill",
      "stage speaker",
      "monitor stack"
    ],
    "body": "<rect x=\"32\" y=\"20\" width=\"36\" height=\"60\" rx=\"3\"/><circle cx=\"50\" cy=\"38\" r=\"10\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"62\" r=\"7\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-drum-sub",
    "category": "monitors",
    "label": "Drum sub",
    "footprint": {
      "width_ft": 1.8,
      "depth_ft": 1.8
    },
    "keywords": [
      "drum sub",
      "subwoofer",
      "drum fill",
      "low end"
    ],
    "body": "<rect x=\"24\" y=\"24\" width=\"52\" height=\"52\" rx=\"3\"/><circle cx=\"50\" cy=\"50\" r=\"18\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-iem-pack",
    "category": "monitors",
    "label": "IEM pack",
    "footprint": {
      "width_ft": 0.4,
      "depth_ft": 0.4
    },
    "keywords": [
      "iem",
      "beltpack",
      "in-ear",
      "bodypack",
      "wireless"
    ],
    "body": "<rect x=\"38\" y=\"40\" width=\"24\" height=\"32\" rx=\"4\"/><line x1=\"50\" y1=\"40\" x2=\"50\" y2=\"22\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"58\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-iem-rack",
    "category": "monitors",
    "label": "IEM rack",
    "footprint": {
      "width_ft": 1.6,
      "depth_ft": 1.2
    },
    "keywords": [
      "iem rack",
      "transmitter",
      "wireless rack",
      "in-ear rack"
    ],
    "body": "<rect x=\"22\" y=\"38\" width=\"56\" height=\"36\" rx=\"3\"/><line x1=\"34\" y1=\"38\" x2=\"34\" y2=\"22\" class=\"lp-ico-detail\"/><line x1=\"66\" y1=\"38\" x2=\"66\" y2=\"22\" class=\"lp-ico-detail\"/><rect x=\"32\" y=\"48\" width=\"36\" height=\"16\" rx=\"2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-mix-station",
    "category": "monitors",
    "label": "Mix station",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.8
    },
    "keywords": [
      "personal mixer",
      "mix station",
      "monitor mixer",
      "aviom"
    ],
    "body": "<rect x=\"24\" y=\"34\" width=\"52\" height=\"32\" rx=\"3\"/><line x1=\"33\" y1=\"42\" x2=\"33\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"41\" y1=\"42\" x2=\"41\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"49\" y1=\"42\" x2=\"49\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"57\" y1=\"42\" x2=\"57\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"65\" y1=\"42\" x2=\"65\" y2=\"58\" class=\"lp-ico-detail\"/>"
  }
];
