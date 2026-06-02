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
      "lighting",
      "fixture"
    ],
    "body": "<rect x=\"20\" y=\"38\" width=\"24\" height=\"24\" rx=\"2\"/><path d=\"M52 36 A18 18 0 0 1 52 64\" class=\"lp-ico-detail\"/><path d=\"M60 30 A26 26 0 0 1 60 70\" class=\"lp-ico-detail\"/><path d=\"M68 24 A34 34 0 0 1 68 76\" class=\"lp-ico-detail\"/>"
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
      "array",
      "beam",
      "lighting"
    ],
    "body": "<rect x=\"18\" y=\"30\" width=\"44\" height=\"40\" rx=\"3\"/><circle cx=\"32\" cy=\"43\" r=\"7\" class=\"lp-ico-detail\"/><circle cx=\"48\" cy=\"43\" r=\"7\" class=\"lp-ico-detail\"/><circle cx=\"32\" cy=\"57\" r=\"7\" class=\"lp-ico-detail\"/><circle cx=\"48\" cy=\"57\" r=\"7\" class=\"lp-ico-detail\"/><line x1=\"64\" y1=\"38\" x2=\"82\" y2=\"34\" class=\"lp-ico-detail\"/><line x1=\"64\" y1=\"50\" x2=\"84\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"64\" y1=\"62\" x2=\"82\" y2=\"66\" class=\"lp-ico-detail\"/>"
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
      "haze",
      "fog",
      "machine",
      "lighting"
    ],
    "body": "<rect x=\"20\" y=\"34\" width=\"44\" height=\"36\" rx=\"3\"/><polygon points=\"64,46 78,40 78,64 64,58\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"42\" y=\"52\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"11\">HAZE</text>"
  },
  {
    "name": "light-floor-fan",
    "category": "lighting",
    "label": "Floor fan",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.5
    },
    "keywords": [
      "fan",
      "floor",
      "wind",
      "stage",
      "lighting"
    ],
    "body": "<circle cx=\"50\" cy=\"48\" r=\"30\"/><path d=\"M50 48 Q66 36 70 52\" class=\"lp-ico-detail\"/><path d=\"M50 48 Q60 66 44 72\" class=\"lp-ico-detail\"/><path d=\"M50 48 Q34 56 30 40\" class=\"lp-ico-detail\"/><path d=\"M50 48 Q44 30 62 26\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"48\" r=\"5\" class=\"lp-ico-detail\"/><rect x=\"40\" y=\"82\" width=\"20\" height=\"8\" rx=\"2\"/>"
  },
  {
    "name": "light-spot",
    "category": "lighting",
    "label": "Follow spot",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 3
    },
    "keywords": [
      "follow",
      "spot",
      "spotlight",
      "barrel",
      "lighting"
    ],
    "body": "<polygon points=\"30,14 70,14 62,58 38,58\"/><ellipse cx=\"50\" cy=\"14\" rx=\"20\" ry=\"5\" class=\"lp-ico-detail\"/><rect x=\"40\" y=\"58\" width=\"20\" height=\"14\" rx=\"2\"/><line x1=\"40\" y1=\"66\" x2=\"26\" y2=\"78\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"66\" x2=\"74\" y2=\"78\" class=\"lp-ico-detail\"/><rect x=\"42\" y=\"72\" width=\"16\" height=\"12\" rx=\"2\"/>"
  }
];
