/* ============================================================
   LOWPASS — Stage Plot lighting icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const lightingIcons: IconDescriptor[] = [
  {
    "name": "light-moving-head",
    "category": "lighting",
    "label": "Moving head",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 1.5
    },
    "viewBox": "0 0 130 150",
    "keywords": [
      "moving head",
      "mover",
      "spot"
    ],
    "body": "<rect x=\"10\" y=\"15\" width=\"110\" height=\"120\" rx=\"12\"/><circle cx=\"65\" cy=\"75\" r=\"40\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"75\" r=\"17\" class=\"lp-ico-detail\"/><line x1=\"65\" y1=\"35\" x2=\"65\" y2=\"20\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-par",
    "category": "lighting",
    "label": "PAR",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 90 120",
    "keywords": [
      "par",
      "can",
      "led par"
    ],
    "body": "<line x1=\"10\" y1=\"32\" x2=\"10\" y2=\"88\" class=\"lp-ico-detail\"/><line x1=\"80\" y1=\"32\" x2=\"80\" y2=\"88\" class=\"lp-ico-detail\"/><line x1=\"10\" y1=\"60\" x2=\"20\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"70\" y1=\"60\" x2=\"80\" y2=\"60\" class=\"lp-ico-detail\"/><circle cx=\"45\" cy=\"60\" r=\"37\"/><circle cx=\"45\" cy=\"60\" r=\"21\" class=\"lp-ico-tone\"/><line x1=\"45\" y1=\"97\" x2=\"45\" y2=\"110\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-wash",
    "category": "lighting",
    "label": "Wash",
    "footprint": {
      "width_ft": 1.1,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 110 130",
    "keywords": [
      "wash",
      "led wash"
    ],
    "body": "<rect x=\"10\" y=\"14\" width=\"90\" height=\"102\" rx=\"24\"/><circle cx=\"55\" cy=\"65\" r=\"30\" class=\"lp-ico-tone\"/><circle cx=\"25\" cy=\"27\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"85\" cy=\"27\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"25\" cy=\"103\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"85\" cy=\"103\" r=\"3\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-strobe",
    "category": "lighting",
    "label": "Strobe",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 0.7
    },
    "viewBox": "0 0 130 70",
    "keywords": [
      "strobe",
      "atomic"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"124\" height=\"64\" rx=\"8\"/><rect x=\"16\" y=\"26\" width=\"98\" height=\"18\" rx=\"9\" class=\"lp-ico-tone\"/><line x1=\"38\" y1=\"26\" x2=\"38\" y2=\"44\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"26\" x2=\"60\" y2=\"44\" class=\"lp-ico-detail\"/><line x1=\"82\" y1=\"26\" x2=\"82\" y2=\"44\" class=\"lp-ico-detail\"/><line x1=\"104\" y1=\"26\" x2=\"104\" y2=\"44\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-blinder",
    "category": "lighting",
    "label": "Blinder",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 170 90",
    "keywords": [
      "blinder",
      "2-lite",
      "mole"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"164\" height=\"84\" rx=\"8\"/><circle cx=\"46\" cy=\"45\" r=\"28\" class=\"lp-ico-tone\"/><circle cx=\"46\" cy=\"45\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"124\" cy=\"45\" r=\"28\" class=\"lp-ico-tone\"/><circle cx=\"124\" cy=\"45\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-strip",
    "category": "lighting",
    "label": "Strip",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 0.5
    },
    "viewBox": "0 0 400 50",
    "keywords": [
      "strip",
      "batten",
      "led bar"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"394\" height=\"44\" rx=\"6\"/><circle cx=\"28\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"77\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"175\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"224\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"273\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"322\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"371\" cy=\"25\" r=\"14\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "light-hazer",
    "category": "lighting",
    "label": "Hazer",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.1
    },
    "viewBox": "0 0 150 110",
    "keywords": [
      "hazer",
      "smoke",
      "fog"
    ],
    "body": "<rect x=\"3\" y=\"13\" width=\"144\" height=\"94\" rx=\"10\"/><path d=\"M104 34 L140 22 L140 46 Z\" class=\"lp-ico-tone\"/><line x1=\"20\" y1=\"40\" x2=\"80\" y2=\"40\" class=\"lp-ico-detail\"/><line x1=\"20\" y1=\"58\" x2=\"80\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"20\" y1=\"76\" x2=\"80\" y2=\"76\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-floor-fan",
    "category": "lighting",
    "label": "Floor fan",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 1.7
    },
    "viewBox": "0 0 170 170",
    "keywords": [
      "fan",
      "floor fan",
      "hair"
    ],
    "outline": true,
    "body": "<circle cx=\"85\" cy=\"76\" r=\"62\"/><circle cx=\"85\" cy=\"76\" r=\"15\" class=\"lp-ico-tone\"/><path d=\"M85 30 Q110 46 97 64\" class=\"lp-ico-detail\"/><path d=\"M126 96 Q100 104 91 88\" class=\"lp-ico-detail\"/><path d=\"M44 96 Q58 122 76 90\" class=\"lp-ico-detail\"/><line x1=\"55\" y1=\"130\" x2=\"40\" y2=\"164\" class=\"lp-ico-detail\"/><line x1=\"115\" y1=\"130\" x2=\"130\" y2=\"164\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"164\" x2=\"130\" y2=\"164\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "light-spot",
    "category": "lighting",
    "label": "Follow spot",
    "footprint": {
      "width_ft": 1.8,
      "depth_ft": 3
    },
    "viewBox": "0 0 180 300",
    "keywords": [
      "follow spot",
      "spotlight",
      "super trouper"
    ],
    "body": "<path d=\"M62 70 L118 70 L106 18 L74 18 Z\"/><rect x=\"76\" y=\"30\" width=\"28\" height=\"14\" rx=\"6\" class=\"lp-ico-tone\"/><rect x=\"52\" y=\"70\" width=\"76\" height=\"160\" rx=\"16\"/><line x1=\"90\" y1=\"230\" x2=\"90\" y2=\"242\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"242\" x2=\"30\" y2=\"292\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"242\" x2=\"150\" y2=\"292\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"242\" x2=\"90\" y2=\"296\" class=\"lp-ico-detail\"/>"
  },
];
