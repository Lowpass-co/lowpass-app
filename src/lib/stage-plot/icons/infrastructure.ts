/* ============================================
   LOWPASS — Stage Plot stage infrastructure icons (§SP1c)

   Generated against the locked icon contract (top-down, no
   colour attrs, footprint outline unclassed, details in
   .lp-ico-detail, letters in .lp-ico-label). Footprints are
   real-world feet. Hand-tunable — edit freely.
   ============================================ */

import type { IconDescriptor } from './types';

export const infrastructureIcons: IconDescriptor[] = [
  {
    "name": "infra-riser-4x4",
    "category": "infrastructure",
    "label": "Riser 4x4",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 4
    },
    "keywords": [
      "riser",
      "platform",
      "stage",
      "deck",
      "4x4"
    ],
    "body": "<rect x=\"8\" y=\"8\" width=\"84\" height=\"84\" rx=\"5\"/>"
  },
  {
    "name": "infra-riser-4x8",
    "category": "infrastructure",
    "label": "Riser 4x8",
    "footprint": {
      "width_ft": 8,
      "depth_ft": 4
    },
    "keywords": [
      "riser",
      "platform",
      "stage",
      "deck",
      "4x8",
      "wide"
    ],
    "body": "<rect x=\"8\" y=\"8\" width=\"84\" height=\"84\" rx=\"5\"/>"
  },
  {
    "name": "infra-riser-8x8",
    "category": "infrastructure",
    "label": "Riser 8x8",
    "footprint": {
      "width_ft": 8,
      "depth_ft": 8
    },
    "keywords": [
      "riser",
      "platform",
      "stage",
      "deck",
      "8x8",
      "large"
    ],
    "body": "<rect x=\"8\" y=\"8\" width=\"84\" height=\"84\" rx=\"5\"/>"
  },
  {
    "name": "infra-riser-8x4",
    "category": "infrastructure",
    "label": "Riser 8x4",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 8
    },
    "keywords": [
      "riser",
      "platform",
      "stage",
      "deck",
      "8x4",
      "deep"
    ],
    "body": "<rect x=\"8\" y=\"8\" width=\"84\" height=\"84\" rx=\"5\"/>"
  },
  {
    "name": "infra-riser-custom",
    "category": "infrastructure",
    "label": "Custom riser",
    "footprint": {
      "width_ft": 6,
      "depth_ft": 4
    },
    "keywords": [
      "riser",
      "custom",
      "platform",
      "stage",
      "deck"
    ],
    "body": "<rect x=\"8\" y=\"8\" width=\"84\" height=\"84\" rx=\"5\"/>"
  },
  {
    "name": "infra-generator",
    "category": "infrastructure",
    "label": "Generator",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 2.5
    },
    "keywords": [
      "generator",
      "genset",
      "power",
      "fuel",
      "gen",
      "mains"
    ],
    "body": "<rect x=\"8\" y=\"22\" width=\"84\" height=\"56\" rx=\"5\"/><polyline points=\"24,30 16,46 24,46 19,60 34,42 25,42 30,30\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"30\" x2=\"60\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"68\" y1=\"30\" x2=\"68\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"76\" y1=\"30\" x2=\"76\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"84\" y1=\"30\" x2=\"84\" y2=\"70\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"38\" y=\"66\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"15\">GEN</text>"
  },
  {
    "name": "infra-cable-ramp",
    "category": "infrastructure",
    "label": "Cable ramp",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 1
    },
    "keywords": [
      "cable",
      "ramp",
      "protector",
      "channel",
      "crossover"
    ],
    "body": "<rect x=\"6\" y=\"34\" width=\"88\" height=\"32\" rx=\"4\"/><line x1=\"6\" y1=\"42\" x2=\"94\" y2=\"42\" class=\"lp-ico-detail\"/><line x1=\"6\" y1=\"50\" x2=\"94\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"6\" y1=\"58\" x2=\"94\" y2=\"58\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-barricade",
    "category": "infrastructure",
    "label": "Barricade",
    "footprint": {
      "width_ft": 3.3,
      "depth_ft": 0.8
    },
    "keywords": [
      "barricade",
      "barrier",
      "crowd",
      "fence",
      "front"
    ],
    "body": "<rect x=\"12\" y=\"44\" width=\"76\" height=\"12\" rx=\"2\"/><line x1=\"24\" y1=\"44\" x2=\"24\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"44\" x2=\"40\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"56\" y1=\"44\" x2=\"56\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"72\" y1=\"44\" x2=\"72\" y2=\"60\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-truss",
    "category": "infrastructure",
    "label": "Truss",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 1
    },
    "keywords": [
      "truss",
      "section",
      "rigging",
      "brace",
      "overhead"
    ],
    "body": "<rect x=\"12\" y=\"40\" width=\"76\" height=\"20\" rx=\"1\"/><line x1=\"12\" y1=\"40\" x2=\"31\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"31\" y1=\"40\" x2=\"12\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"31\" y1=\"40\" x2=\"50\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"50\" y1=\"40\" x2=\"31\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"50\" y1=\"40\" x2=\"69\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"69\" y1=\"40\" x2=\"50\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"69\" y1=\"40\" x2=\"88\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"88\" y1=\"40\" x2=\"69\" y2=\"60\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-lighting-tower",
    "category": "infrastructure",
    "label": "Light tower",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 2.5
    },
    "keywords": [
      "lighting",
      "tower",
      "truss",
      "vertical",
      "totem",
      "light"
    ],
    "body": "<rect x=\"30\" y=\"30\" width=\"40\" height=\"40\" rx=\"2\"/><line x1=\"30\" y1=\"30\" x2=\"70\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"70\" y1=\"30\" x2=\"30\" y2=\"70\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-tech-table",
    "category": "infrastructure",
    "label": "FOH table",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 2
    },
    "keywords": [
      "tech",
      "foh",
      "table",
      "console",
      "desk",
      "front of house"
    ],
    "body": "<rect x=\"16\" y=\"34\" width=\"68\" height=\"32\" rx=\"2\"/><rect x=\"34\" y=\"42\" width=\"32\" height=\"16\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"50\" x2=\"60\" y2=\"50\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-road-case",
    "category": "infrastructure",
    "label": "Road case",
    "footprint": {
      "width_ft": 2.5,
      "depth_ft": 1.5
    },
    "keywords": [
      "road",
      "case",
      "flight",
      "trunk",
      "transport"
    ],
    "body": "<rect x=\"22\" y=\"34\" width=\"56\" height=\"32\" rx=\"2\"/><rect x=\"26\" y=\"38\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"68\" y=\"38\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"26\" y=\"56\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"68\" y=\"56\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><line x1=\"44\" y1=\"32\" x2=\"56\" y2=\"32\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-power-1",
    "category": "infrastructure",
    "label": "Power 1",
    "footprint": {
      "width_ft": 0.5,
      "depth_ft": 0.5
    },
    "keywords": [
      "power",
      "edison",
      "socket",
      "outlet",
      "drop",
      "mains"
    ],
    "body": "<rect x=\"24\" y=\"24\" width=\"52\" height=\"52\" rx=\"4\"/><polyline points=\"52,32 42,52 50,52 46,68 60,46 52,46 56,32\" class=\"lp-ico-detail\"/><rect x=\"36\" y=\"56\" width=\"28\" height=\"16\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"45\" y1=\"60\" x2=\"45\" y2=\"68\" class=\"lp-ico-detail\"/><line x1=\"55\" y1=\"60\" x2=\"55\" y2=\"68\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-power-2",
    "category": "infrastructure",
    "label": "Power 2",
    "footprint": {
      "width_ft": 0.6,
      "depth_ft": 0.5
    },
    "keywords": [
      "power",
      "edison",
      "socket",
      "outlet",
      "duplex",
      "mains"
    ],
    "body": "<rect x=\"16\" y=\"24\" width=\"68\" height=\"52\" rx=\"4\"/><polyline points=\"52,28 44,42 50,42 46,52 58,38 52,38 56,28\" class=\"lp-ico-detail\"/><rect x=\"24\" y=\"54\" width=\"24\" height=\"16\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"32\" y1=\"58\" x2=\"32\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"58\" x2=\"40\" y2=\"66\" class=\"lp-ico-detail\"/><rect x=\"52\" y=\"54\" width=\"24\" height=\"16\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"58\" x2=\"60\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"68\" y1=\"58\" x2=\"68\" y2=\"66\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-power-4",
    "category": "infrastructure",
    "label": "Power 4",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 0.6
    },
    "keywords": [
      "power",
      "edison",
      "socket",
      "outlet",
      "quad",
      "mains"
    ],
    "body": "<rect x=\"14\" y=\"18\" width=\"72\" height=\"64\" rx=\"4\"/><polyline points=\"52,22 45,34 51,34 47,44 58,30 52,30 56,22\" class=\"lp-ico-detail\"/><rect x=\"22\" y=\"46\" width=\"26\" height=\"14\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"52\" y=\"46\" width=\"26\" height=\"14\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"22\" y=\"64\" width=\"26\" height=\"14\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"52\" y=\"64\" width=\"26\" height=\"14\" rx=\"2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-power-8",
    "category": "infrastructure",
    "label": "Power 8",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 0.6
    },
    "keywords": [
      "power",
      "edison",
      "socket",
      "outlet",
      "strip",
      "mains"
    ],
    "body": "<rect x=\"6\" y=\"26\" width=\"88\" height=\"48\" rx=\"4\"/><polyline points=\"50,30 44,40 49,40 46,48 56,36 51,36 54,30\" class=\"lp-ico-detail\"/><rect x=\"10\" y=\"42\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"42\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"54\" y=\"42\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"74\" y=\"42\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"10\" y=\"58\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"58\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"54\" y=\"58\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"74\" y=\"58\" width=\"16\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-distro",
    "category": "infrastructure",
    "label": "Power distro",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 1
    },
    "keywords": [
      "power",
      "distro",
      "distribution",
      "mains",
      "pwr",
      "edison"
    ],
    "body": "<rect x=\"10\" y=\"18\" width=\"80\" height=\"64\" rx=\"5\"/><polyline points=\"40,24 30,44 39,44 34,60 52,36 42,36 47,24\" class=\"lp-ico-detail\"/><rect x=\"54\" y=\"28\" width=\"30\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><rect x=\"54\" y=\"44\" width=\"30\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"40\" y=\"70\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"15\">PWR</text>"
  },
  {
    "name": "infra-truss-1x1",
    "category": "infrastructure",
    "label": "Truss 1x1",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 1
    },
    "keywords": [
      "truss",
      "tower",
      "stack",
      "rigging",
      "square"
    ],
    "body": "<rect x=\"18\" y=\"18\" width=\"64\" height=\"64\" rx=\"3\"/><line x1=\"22\" y1=\"22\" x2=\"78\" y2=\"78\" class=\"lp-ico-detail\"/><line x1=\"78\" y1=\"22\" x2=\"22\" y2=\"78\" class=\"lp-ico-detail\"/><circle cx=\"26\" cy=\"26\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"26\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"26\" cy=\"74\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"74\" r=\"6\" class=\"lp-ico-detail\"/>"
  }
];
