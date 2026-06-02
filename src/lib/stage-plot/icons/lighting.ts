/* ============================================
   LOWPASS — Stage Plot lighting icons (§SP1c)

   Generated against the locked icon contract (top-down, no
   colour attrs, footprint outline unclassed, details in
   .lp-ico-detail, letters in .lp-ico-label). Footprints are
   real-world feet. Hand-tunable — edit freely.
   ============================================ */

import type { IconDescriptor } from './types';

export const lightingIcons: IconDescriptor[] = [
  {
    "name": "light-moving-head",
    "category": "lighting",
    "label": "Moving head",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 1
    },
    "keywords": [
      "moving head",
      "mover",
      "intelligent light",
      "spot",
      "beam"
    ],
    "body": "<circle cx=\"50\" cy=\"50\" r=\"22\"/><line x1=\"24\" y1=\"38\" x2=\"24\" y2=\"62\" class=\"lp-ico-detail\"/><line x1=\"76\" y1=\"38\" x2=\"76\" y2=\"62\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-par",
    "category": "lighting",
    "label": "PAR",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 0.8
    },
    "keywords": [
      "par",
      "par can",
      "wash",
      "fixture"
    ],
    "body": "<circle cx=\"50\" cy=\"50\" r=\"26\"/><circle cx=\"50\" cy=\"50\" r=\"16\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-wash",
    "category": "lighting",
    "label": "Wash",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.9
    },
    "keywords": [
      "wash",
      "led wash",
      "fixture",
      "flood"
    ],
    "body": "<circle cx=\"50\" cy=\"50\" r=\"26\"/><circle cx=\"42\" cy=\"42\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"58\" cy=\"42\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"42\" cy=\"58\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"58\" cy=\"58\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"50\" r=\"3\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-strobe",
    "category": "lighting",
    "label": "Strobe",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.6
    },
    "keywords": [
      "strobe",
      "flash",
      "blitz"
    ],
    "body": "<rect x=\"28\" y=\"34\" width=\"44\" height=\"32\" rx=\"3\"/><polyline points=\"52,40 44,50 54,50 46,60\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-blinder",
    "category": "lighting",
    "label": "Blinder",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 0.8
    },
    "keywords": [
      "blinder",
      "audience light",
      "molefay"
    ],
    "body": "<rect x=\"22\" y=\"34\" width=\"56\" height=\"32\" rx=\"3\"/><line x1=\"50\" y1=\"34\" x2=\"50\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"22\" y1=\"50\" x2=\"78\" y2=\"50\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-strip",
    "category": "lighting",
    "label": "Strip",
    "footprint": {
      "width_ft": 3.3,
      "depth_ft": 0.4
    },
    "keywords": [
      "strip",
      "led bar",
      "batten",
      "pixel bar"
    ],
    "body": "<rect x=\"14\" y=\"44\" width=\"72\" height=\"12\" rx=\"2\"/><rect x=\"20\" y=\"47\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"32\" y=\"47\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"44\" y=\"47\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"56\" y=\"47\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"68\" y=\"47\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-hazer",
    "category": "lighting",
    "label": "Hazer",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1
    },
    "keywords": [
      "hazer",
      "fogger",
      "fog",
      "haze",
      "smoke"
    ],
    "body": "<rect x=\"26\" y=\"36\" width=\"44\" height=\"28\" rx=\"3\"/><polygon points=\"70,44 82,40 82,60 70,56\"/><line x1=\"32\" y1=\"44\" x2=\"42\" y2=\"44\" class=\"lp-ico-detail\"/><line x1=\"32\" y1=\"50\" x2=\"42\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"32\" y1=\"56\" x2=\"42\" y2=\"56\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-followspot",
    "category": "lighting",
    "label": "Spot",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 3
    },
    "keywords": [
      "followspot",
      "follow spot",
      "spotlight",
      "operator"
    ],
    "body": "<rect x=\"40\" y=\"14\" width=\"20\" height=\"50\" rx=\"10\"/><circle cx=\"50\" cy=\"76\" r=\"14\"/>"
  },
  {
    "name": "light-backdrop",
    "category": "lighting",
    "label": "Cyc",
    "footprint": {
      "width_ft": 12,
      "depth_ft": 0.5
    },
    "keywords": [
      "backdrop",
      "cyc",
      "cyclorama",
      "drop",
      "scrim"
    ],
    "body": "<rect x=\"6\" y=\"46\" width=\"88\" height=\"8\" rx=\"1\"/>"
  }
];
