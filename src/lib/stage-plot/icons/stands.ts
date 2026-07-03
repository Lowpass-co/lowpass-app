/* ============================================================
   LOWPASS — Stage Plot stands & supports icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const standIcons: IconDescriptor[] = [
  {
    "name": "stand-mic-boom",
    "category": "stands",
    "label": "Mic boom stand",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 2.4
    },
    "viewBox": "0 0 400 240",
    "keywords": [
      "mic stand",
      "boom",
      "tripod"
    ],
    "outline": true,
    "body": "<line x1=\"90\" y1=\"190\" x2=\"20\" y2=\"236\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"190\" x2=\"160\" y2=\"236\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"190\" x2=\"90\" y2=\"238\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"190\" x2=\"90\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"60\" x2=\"370\" y2=\"20\" class=\"lp-ico-detail\"/><line x1=\"90\" y1=\"60\" x2=\"58\" y2=\"72\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"60\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"380\" cy=\"18\" r=\"14\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "stand-mic-straight",
    "category": "stands",
    "label": "Mic straight stand",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 3
    },
    "viewBox": "0 0 170 300",
    "keywords": [
      "mic stand",
      "straight",
      "round base"
    ],
    "outline": true,
    "body": "<line x1=\"85\" y1=\"258\" x2=\"25\" y2=\"296\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"258\" x2=\"145\" y2=\"296\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"258\" x2=\"85\" y2=\"298\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"258\" x2=\"85\" y2=\"34\" class=\"lp-ico-detail\"/><circle cx=\"85\" cy=\"150\" r=\"6\" class=\"lp-ico-tone\"/><ellipse cx=\"85\" cy=\"20\" rx=\"13\" ry=\"16\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "stand-mic-short",
    "category": "stands",
    "label": "Mic short stand",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 150 140",
    "keywords": [
      "short stand",
      "kick mic stand",
      "amp mic"
    ],
    "outline": true,
    "body": "<line x1=\"75\" y1=\"108\" x2=\"25\" y2=\"136\" class=\"lp-ico-detail\"/><line x1=\"75\" y1=\"108\" x2=\"125\" y2=\"136\" class=\"lp-ico-detail\"/><line x1=\"75\" y1=\"108\" x2=\"75\" y2=\"138\" class=\"lp-ico-detail\"/><line x1=\"75\" y1=\"108\" x2=\"75\" y2=\"34\" class=\"lp-ico-detail\"/><ellipse cx=\"75\" cy=\"22\" rx=\"12\" ry=\"14\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "stand-music",
    "category": "stands",
    "label": "Music stand",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 2.4
    },
    "viewBox": "0 0 170 240",
    "keywords": [
      "music stand",
      "sheet music"
    ],
    "outline": true,
    "body": "<path d=\"M42 18 L142 18 L124 92 L24 92 Z\"/><line x1=\"33\" y1=\"80\" x2=\"133\" y2=\"80\" class=\"lp-ico-detail\"/><line x1=\"83\" y1=\"92\" x2=\"83\" y2=\"190\" class=\"lp-ico-detail\"/><line x1=\"83\" y1=\"190\" x2=\"33\" y2=\"232\" class=\"lp-ico-detail\"/><line x1=\"83\" y1=\"190\" x2=\"133\" y2=\"232\" class=\"lp-ico-detail\"/><line x1=\"83\" y1=\"190\" x2=\"83\" y2=\"236\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-guitar",
    "category": "stands",
    "label": "Guitar stand",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 2.2
    },
    "viewBox": "0 0 150 220",
    "keywords": [
      "guitar stand",
      "a-frame"
    ],
    "outline": true,
    "body": "<line x1=\"75\" y1=\"18\" x2=\"34\" y2=\"205\" class=\"lp-ico-detail\"/><line x1=\"75\" y1=\"18\" x2=\"116\" y2=\"205\" class=\"lp-ico-detail\"/><line x1=\"75\" y1=\"18\" x2=\"75\" y2=\"196\" class=\"lp-ico-detail\"/><line x1=\"52\" y1=\"120\" x2=\"98\" y2=\"120\" class=\"lp-ico-detail\"/><circle cx=\"75\" cy=\"38\" r=\"7\" class=\"lp-ico-tone\"/><path d=\"M44 166 Q40 178 50 180\" class=\"lp-ico-detail\"/><path d=\"M106 166 Q110 178 100 180\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-keyboard-x",
    "category": "stands",
    "label": "Keyboard stand (X)",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 1.7
    },
    "viewBox": "0 0 220 170",
    "keywords": [
      "keyboard stand",
      "x stand"
    ],
    "outline": true,
    "body": "<rect x=\"18\" y=\"18\" width=\"46\" height=\"12\" rx=\"6\" class=\"lp-ico-tone\"/><rect x=\"156\" y=\"18\" width=\"46\" height=\"12\" rx=\"6\" class=\"lp-ico-tone\"/><line x1=\"40\" y1=\"30\" x2=\"180\" y2=\"152\" class=\"lp-ico-detail\"/><line x1=\"180\" y1=\"30\" x2=\"40\" y2=\"152\" class=\"lp-ico-detail\"/><circle cx=\"110\" cy=\"91\" r=\"8\" class=\"lp-ico-detail\"/><line x1=\"24\" y1=\"160\" x2=\"56\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"164\" y1=\"160\" x2=\"196\" y2=\"160\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-keyboard-z",
    "category": "stands",
    "label": "Keyboard stand (Z)",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 1.7
    },
    "viewBox": "0 0 220 170",
    "keywords": [
      "keyboard stand",
      "z stand"
    ],
    "outline": true,
    "body": "<rect x=\"26\" y=\"18\" width=\"168\" height=\"12\" rx=\"6\" class=\"lp-ico-tone\"/><line x1=\"44\" y1=\"30\" x2=\"44\" y2=\"152\" class=\"lp-ico-detail\"/><line x1=\"176\" y1=\"30\" x2=\"176\" y2=\"152\" class=\"lp-ico-detail\"/><line x1=\"44\" y1=\"58\" x2=\"176\" y2=\"128\" class=\"lp-ico-detail\"/><line x1=\"24\" y1=\"160\" x2=\"64\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"156\" y1=\"160\" x2=\"196\" y2=\"160\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-speaker",
    "category": "stands",
    "label": "Speaker stand",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 4
    },
    "viewBox": "0 0 200 400",
    "keywords": [
      "speaker stand",
      "tripod",
      "pole"
    ],
    "outline": true,
    "body": "<rect x=\"70\" y=\"46\" width=\"60\" height=\"22\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"100\" y1=\"68\" x2=\"100\" y2=\"330\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"210\" r=\"7\" class=\"lp-ico-tone\"/><line x1=\"100\" y1=\"330\" x2=\"24\" y2=\"392\" class=\"lp-ico-detail\"/><line x1=\"100\" y1=\"330\" x2=\"176\" y2=\"392\" class=\"lp-ico-detail\"/><line x1=\"100\" y1=\"330\" x2=\"100\" y2=\"396\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-laptop",
    "category": "stands",
    "label": "Laptop stand",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 2.4
    },
    "viewBox": "0 0 170 240",
    "keywords": [
      "laptop",
      "dj stand",
      "computer"
    ],
    "body": "<path d=\"M40 26 L130 26 L136 96 L34 96 Z\"/><rect x=\"46\" y=\"36\" width=\"78\" height=\"50\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"28\" y=\"96\" width=\"114\" height=\"12\" rx=\"6\" class=\"lp-ico-tone\"/><line x1=\"85\" y1=\"108\" x2=\"85\" y2=\"188\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"188\" x2=\"35\" y2=\"232\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"188\" x2=\"135\" y2=\"232\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"188\" x2=\"85\" y2=\"236\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-tablet",
    "category": "stands",
    "label": "Tablet stand",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 2.6
    },
    "viewBox": "0 0 120 260",
    "keywords": [
      "tablet",
      "ipad",
      "stand"
    ],
    "outline": true,
    "body": "<rect x=\"30\" y=\"16\" width=\"60\" height=\"44\" rx=\"7\"/><rect x=\"38\" y=\"24\" width=\"44\" height=\"28\" rx=\"3\" class=\"lp-ico-tone\"/><line x1=\"60\" y1=\"60\" x2=\"60\" y2=\"222\" class=\"lp-ico-detail\"/><ellipse cx=\"60\" cy=\"236\" rx=\"46\" ry=\"15\"/>"
  },
  {
    "name": "stand-podium",
    "category": "stands",
    "label": "Podium",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 3
    },
    "viewBox": "0 0 220 300",
    "keywords": [
      "podium",
      "lectern",
      "speech"
    ],
    "body": "<path d=\"M38 30 L182 30 L194 62 L26 62 Z\" class=\"lp-ico-tone\"/><path d=\"M44 62 L176 62 L192 282 L28 282 Z\"/><line x1=\"60\" y1=\"110\" x2=\"160\" y2=\"110\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "stand-monitor-stand",
    "category": "stands",
    "label": "Monitor stand",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 3.4
    },
    "viewBox": "0 0 170 340",
    "keywords": [
      "monitor stand",
      "speaker pole"
    ],
    "outline": true,
    "body": "<rect x=\"50\" y=\"26\" width=\"70\" height=\"58\" rx=\"6\"/><circle cx=\"85\" cy=\"62\" r=\"14\" class=\"lp-ico-tone\"/><circle cx=\"85\" cy=\"62\" r=\"2.5\" class=\"lp-ico-detail\"/><rect x=\"62\" y=\"34\" width=\"46\" height=\"12\" rx=\"4\" class=\"lp-ico-tone\"/><line x1=\"85\" y1=\"84\" x2=\"85\" y2=\"272\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"272\" x2=\"27\" y2=\"332\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"272\" x2=\"143\" y2=\"332\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"272\" x2=\"85\" y2=\"336\" class=\"lp-ico-detail\"/>"
  },
];
