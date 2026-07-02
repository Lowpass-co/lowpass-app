/* ============================================================
   LOWPASS — Stage Plot microphones icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const micIcons: IconDescriptor[] = [
  {
    "name": "mic-vocal",
    "category": "mics",
    "label": "Vocal (SM58)",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.35
    },
    "viewBox": "0 0 90 35",
    "keywords": [
      "sm58",
      "vocal",
      "handheld",
      "dynamic"
    ],
    "body": "<circle cx=\"19\" cy=\"17.5\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"8\" y1=\"11\" x2=\"30\" y2=\"11\" class=\"lp-ico-detail\"/><line x1=\"8\" y1=\"24\" x2=\"30\" y2=\"24\" class=\"lp-ico-detail\"/><path d=\"M31 8 L74 11 Q84 12.5 84 17.5 Q84 23 74 24 L31 27 Z\"/><line x1=\"84\" y1=\"17.5\" x2=\"88\" y2=\"17.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-vocal-wireless",
    "category": "mics",
    "label": "Wireless (SM58)",
    "footprint": {
      "width_ft": 0.85,
      "depth_ft": 0.35
    },
    "viewBox": "0 0 85 35",
    "keywords": [
      "wireless",
      "radio",
      "handheld"
    ],
    "body": "<circle cx=\"19\" cy=\"17.5\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"8\" y1=\"11\" x2=\"30\" y2=\"11\" class=\"lp-ico-detail\"/><line x1=\"8\" y1=\"24\" x2=\"30\" y2=\"24\" class=\"lp-ico-detail\"/><path d=\"M31 8 L72 11 Q81 12.5 81 17.5 Q81 23 72 24 L31 27 Z\"/><rect x=\"76\" y=\"14\" width=\"7\" height=\"7\" rx=\"3.5\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "mic-condenser-pencil",
    "category": "mics",
    "label": "Pencil condenser",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 0.25
    },
    "viewBox": "0 0 80 25",
    "keywords": [
      "sdc",
      "pencil",
      "km184",
      "sm81"
    ],
    "body": "<circle cx=\"13\" cy=\"12.5\" r=\"9\" class=\"lp-ico-tone\"/><rect x=\"20\" y=\"6\" width=\"54\" height=\"13\" rx=\"6.5\"/><line x1=\"74\" y1=\"12.5\" x2=\"78\" y2=\"12.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-condenser-large",
    "category": "mics",
    "label": "Large-diaphragm condenser",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.45
    },
    "viewBox": "0 0 90 45",
    "keywords": [
      "ldc",
      "condenser",
      "u87",
      "studio"
    ],
    "body": "<circle cx=\"21\" cy=\"22.5\" r=\"16\" class=\"lp-ico-tone\"/><circle cx=\"21\" cy=\"22.5\" r=\"19.5\" class=\"lp-ico-detail\"/><rect x=\"38\" y=\"7\" width=\"46\" height=\"31\" rx=\"14\"/>"
  },
  {
    "name": "mic-overhead",
    "category": "mics",
    "label": "Overhead (AKG C414)",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 0.4
    },
    "viewBox": "0 0 80 40",
    "keywords": [
      "overhead",
      "oh",
      "c414",
      "cymbal mic"
    ],
    "body": "<g transform=\"rotate(-16 40 20)\"><circle cx=\"14\" cy=\"20\" r=\"10\" class=\"lp-ico-tone\"/><rect x=\"22\" y=\"12\" width=\"48\" height=\"16\" rx=\"6\"/></g>"
  },
  {
    "name": "mic-lavalier",
    "category": "mics",
    "label": "Lavalier",
    "footprint": {
      "width_ft": 0.5,
      "depth_ft": 0.3
    },
    "viewBox": "0 0 50 30",
    "keywords": [
      "lav",
      "lapel",
      "clip"
    ],
    "body": "<circle cx=\"13\" cy=\"15\" r=\"9\" class=\"lp-ico-tone\"/><rect x=\"20\" y=\"9\" width=\"12\" height=\"12\" rx=\"3\"/><path d=\"M32 15 Q42 15 45 26\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-headset",
    "category": "mics",
    "label": "Headset",
    "footprint": {
      "width_ft": 0.55,
      "depth_ft": 0.5
    },
    "viewBox": "0 0 55 50",
    "keywords": [
      "headset",
      "headworn",
      "earset"
    ],
    "body": "<path d=\"M8 40 Q6 8 46 10\" class=\"lp-ico-detail\"/><circle cx=\"10\" cy=\"41\" r=\"8\" class=\"lp-ico-tone\"/><path d=\"M12 44 Q28 52 44 41\" class=\"lp-ico-detail\"/><circle cx=\"47\" cy=\"39\" r=\"5.5\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "mic-shotgun",
    "category": "mics",
    "label": "Shotgun",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 0.3
    },
    "viewBox": "0 0 130 30",
    "keywords": [
      "shotgun",
      "boom",
      "film"
    ],
    "body": "<rect x=\"22\" y=\"8\" width=\"102\" height=\"14\" rx=\"7\"/><rect x=\"22\" y=\"8\" width=\"26\" height=\"14\" rx=\"7\" class=\"lp-ico-tone\"/><line x1=\"58\" y1=\"15\" x2=\"68\" y2=\"15\" class=\"lp-ico-detail\"/><line x1=\"74\" y1=\"15\" x2=\"84\" y2=\"15\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"15\" x2=\"100\" y2=\"15\" class=\"lp-ico-detail\"/><line x1=\"124\" y1=\"15\" x2=\"128\" y2=\"15\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-kick",
    "category": "mics",
    "label": "Kick (D6)",
    "footprint": {
      "width_ft": 0.7,
      "depth_ft": 0.45
    },
    "viewBox": "0 0 70 45",
    "keywords": [
      "kick mic",
      "d6",
      "beta52",
      "d112"
    ],
    "body": "<circle cx=\"16\" cy=\"22.5\" r=\"13\" class=\"lp-ico-tone\"/><path d=\"M27 8 L56 12 Q66 15 66 22.5 Q66 30 56 33 L27 37 Z\"/><line x1=\"66\" y1=\"22.5\" x2=\"69\" y2=\"22.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-ribbon",
    "category": "mics",
    "label": "Ribbon",
    "footprint": {
      "width_ft": 0.85,
      "depth_ft": 0.4
    },
    "viewBox": "0 0 85 40",
    "keywords": [
      "ribbon",
      "r121",
      "fathead"
    ],
    "body": "<rect x=\"22\" y=\"6\" width=\"46\" height=\"28\" rx=\"13\"/><rect x=\"37\" y=\"12\" width=\"16\" height=\"16\" rx=\"7\" class=\"lp-ico-tone\"/><line x1=\"68\" y1=\"20\" x2=\"80\" y2=\"20\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-tom-clip",
    "category": "mics",
    "label": "Tom clip",
    "footprint": {
      "width_ft": 0.55,
      "depth_ft": 0.4
    },
    "viewBox": "0 0 55 40",
    "keywords": [
      "clip",
      "tom",
      "e604",
      "m201"
    ],
    "body": "<circle cx=\"14\" cy=\"20\" r=\"10\" class=\"lp-ico-tone\"/><rect x=\"22\" y=\"14\" width=\"15\" height=\"12\" rx=\"5\"/><path d=\"M39 10 L49 7 L49 33 L39 30\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "mic-talkback",
    "category": "mics",
    "label": "Talkback",
    "footprint": {
      "width_ft": 1.25,
      "depth_ft": 0.4
    },
    "viewBox": "0 0 125 40",
    "keywords": [
      "talkback",
      "shout",
      "comm",
      "tb",
      "sm58"
    ],
    "body": "<circle cx=\"19\" cy=\"20\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"8\" y1=\"13.5\" x2=\"30\" y2=\"13.5\" class=\"lp-ico-detail\"/><line x1=\"8\" y1=\"26.5\" x2=\"30\" y2=\"26.5\" class=\"lp-ico-detail\"/><path d=\"M31 10.5 L74 13.5 Q84 15 84 20 Q84 25.5 74 26.5 L31 29.5 Z\"/><line x1=\"84\" y1=\"20\" x2=\"88\" y2=\"20\" class=\"lp-ico-detail\"/><text x=\"107\" y=\"29\" font-size=\"26\" text-anchor=\"middle\" class=\"lp-ico-label\">TB</text>"
  },
  {
    "name": "mic-choir",
    "category": "mics",
    "label": "Hanging choir",
    "footprint": {
      "width_ft": 0.6,
      "depth_ft": 0.6
    },
    "viewBox": "0 0 60 60",
    "keywords": [
      "choir",
      "hanging",
      "overhead"
    ],
    "body": "<path d=\"M30 4 Q26 20 30 34\" class=\"lp-ico-detail\"/><rect x=\"25\" y=\"34\" width=\"10\" height=\"9\" rx=\"3\"/><circle cx=\"30\" cy=\"49\" r=\"9\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "mic-pad-trigger",
    "category": "mics",
    "label": "Drum trigger",
    "footprint": {
      "width_ft": 0.5,
      "depth_ft": 0.4
    },
    "viewBox": "0 0 50 40",
    "keywords": [
      "trigger",
      "pad",
      "ddrum"
    ],
    "body": "<path d=\"M9 8 L9 32 L21 32\" class=\"lp-ico-detail\"/><rect x=\"17\" y=\"11\" width=\"24\" height=\"17\" rx=\"4\"/><circle cx=\"45\" cy=\"19.5\" r=\"4\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "mic-area",
    "category": "mics",
    "label": "Area / ambient",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.7
    },
    "viewBox": "0 0 90 70",
    "keywords": [
      "area",
      "ambient",
      "pzm",
      "boundary"
    ],
    "body": "<rect x=\"21\" y=\"47\" width=\"48\" height=\"16\" rx=\"7\"/><path d=\"M27 47 Q45 18 63 47 Z\" class=\"lp-ico-tone\"/><path d=\"M18 40 Q45 2 72 40\" class=\"lp-ico-detail\"/>"
  },
];
