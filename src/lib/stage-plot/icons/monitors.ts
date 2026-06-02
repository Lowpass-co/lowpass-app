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
    "label": "IEM pack (P10)",
    "footprint": {
      "width_ft": 0.4,
      "depth_ft": 0.4
    },
    "keywords": [
      "iem",
      "in-ear",
      "bodypack",
      "shure",
      "p10r",
      "monitor",
      "wireless"
    ],
    "body": "<rect x=\"30\" y=\"28\" width=\"40\" height=\"48\" rx=\"7\"/><rect x=\"38\" y=\"36\" width=\"24\" height=\"16\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"62\" y1=\"28\" x2=\"72\" y2=\"14\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"64\" r=\"4\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-iem-rack",
    "category": "monitors",
    "label": "IEM rack (PSM1000)",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 1.6
    },
    "keywords": [
      "iem",
      "rack",
      "psm1000",
      "shure",
      "6u",
      "monitor",
      "wireless",
      "transmitter"
    ],
    "body": "<rect x=\"22\" y=\"14\" width=\"56\" height=\"72\" rx=\"3\"/><line x1=\"22\" y1=\"26\" x2=\"78\" y2=\"26\" class=\"lp-ico-detail\"/><line x1=\"22\" y1=\"38\" x2=\"78\" y2=\"38\" class=\"lp-ico-detail\"/><line x1=\"22\" y1=\"50\" x2=\"78\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"22\" y1=\"62\" x2=\"78\" y2=\"62\" class=\"lp-ico-detail\"/><line x1=\"22\" y1=\"74\" x2=\"78\" y2=\"74\" class=\"lp-ico-detail\"/><line x1=\"34\" y1=\"14\" x2=\"34\" y2=\"6\" class=\"lp-ico-detail\"/><line x1=\"66\" y1=\"14\" x2=\"66\" y2=\"6\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-console",
    "category": "monitors",
    "label": "Monitor console",
    "footprint": {
      "width_ft": 6,
      "depth_ft": 3
    },
    "keywords": [
      "monitor",
      "console",
      "mixing",
      "desk",
      "faders",
      "wedge",
      "stage"
    ],
    "body": "<rect x=\"8\" y=\"30\" width=\"84\" height=\"40\" rx=\"3\"/><rect x=\"14\" y=\"34\" width=\"72\" height=\"10\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"20\" y1=\"50\" x2=\"20\" y2=\"64\" class=\"lp-ico-detail\"/><line x1=\"30\" y1=\"50\" x2=\"30\" y2=\"64\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"50\" x2=\"40\" y2=\"64\" class=\"lp-ico-detail\"/><line x1=\"50\" y1=\"50\" x2=\"50\" y2=\"64\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"50\" x2=\"60\" y2=\"64\" class=\"lp-ico-detail\"/><line x1=\"70\" y1=\"50\" x2=\"70\" y2=\"64\" class=\"lp-ico-detail\"/><line x1=\"80\" y1=\"50\" x2=\"80\" y2=\"64\" class=\"lp-ico-detail\"/>"
  }
];
