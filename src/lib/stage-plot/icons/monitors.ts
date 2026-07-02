/* ============================================================
   LOWPASS — Stage Plot monitors & IEM icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const monitorIcons: IconDescriptor[] = [
  {
    "name": "monitor-wedge",
    "category": "monitors",
    "label": "Wedge",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 150 140",
    "keywords": [
      "wedge",
      "monitor",
      "foldback"
    ],
    "body": "<path d=\"M22 6 L128 6 L148 134 L2 134 Z\"/><rect x=\"56\" y=\"36\" width=\"38\" height=\"16\" rx=\"5\" class=\"lp-ico-tone\"/><circle cx=\"75\" cy=\"92\" r=\"26\" class=\"lp-ico-tone\"/><circle cx=\"75\" cy=\"92\" r=\"4.7\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-wedge-dual",
    "category": "monitors",
    "label": "Dual wedge",
    "footprint": {
      "width_ft": 2.9,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 290 140",
    "keywords": [
      "dual wedge",
      "monitors"
    ],
    "body": "<path d=\"M22 6 L120 6 L140 134 L2 134 Z\"/><rect x=\"52\" y=\"36\" width=\"38\" height=\"16\" rx=\"5\" class=\"lp-ico-tone\"/><circle cx=\"71\" cy=\"92\" r=\"26\" class=\"lp-ico-tone\"/><circle cx=\"71\" cy=\"92\" r=\"4.7\" class=\"lp-ico-detail\"/><path d=\"M170 6 L268 6 L288 134 L150 134 Z\"/><rect x=\"200\" y=\"36\" width=\"38\" height=\"16\" rx=\"5\" class=\"lp-ico-tone\"/><circle cx=\"219\" cy=\"92\" r=\"26\" class=\"lp-ico-tone\"/><circle cx=\"219\" cy=\"92\" r=\"4.7\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-side-fill",
    "category": "monitors",
    "label": "Side fill",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1.6
    },
    "viewBox": "0 0 200 160",
    "keywords": [
      "side fill",
      "sidefill"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"194\" height=\"154\" rx=\"10\"/><rect x=\"60\" y=\"28\" width=\"80\" height=\"22\" rx=\"5\" class=\"lp-ico-tone\"/><circle cx=\"100\" cy=\"104\" r=\"36\" class=\"lp-ico-tone\"/><circle cx=\"100\" cy=\"104\" r=\"6.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-drum-sub",
    "category": "monitors",
    "label": "Drum sub",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 1.7
    },
    "viewBox": "0 0 170 170",
    "keywords": [
      "drum sub",
      "subwoofer",
      "butt kicker"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"164\" height=\"164\" rx=\"12\"/><circle cx=\"85\" cy=\"82\" r=\"56\" class=\"lp-ico-tone\"/><circle cx=\"85\" cy=\"82\" r=\"10.1\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"150\" x2=\"58\" y2=\"150\" class=\"lp-ico-detail\"/><line x1=\"112\" y1=\"150\" x2=\"142\" y2=\"150\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-iem-pack",
    "category": "monitors",
    "label": "IEM pack",
    "footprint": {
      "width_ft": 0.45,
      "depth_ft": 0.65
    },
    "viewBox": "0 0 45 65",
    "keywords": [
      "iem",
      "beltpack",
      "in-ear",
      "psm"
    ],
    "body": "<line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"3\" class=\"lp-ico-detail\"/><rect x=\"4\" y=\"16\" width=\"37\" height=\"45\" rx=\"6\"/><rect x=\"11\" y=\"24\" width=\"23\" height=\"12\" rx=\"2\" class=\"lp-ico-tone\"/><circle cx=\"22\" cy=\"48\" r=\"3.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-iem-rack",
    "category": "monitors",
    "label": "IEM rack",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 1.9
    },
    "viewBox": "0 0 170 190",
    "keywords": [
      "iem rack",
      "wireless rack",
      "transmitters"
    ],
    "body": "<line x1=\"30\" y1=\"12\" x2=\"30\" y2=\"2\" class=\"lp-ico-detail\"/><line x1=\"140\" y1=\"12\" x2=\"140\" y2=\"2\" class=\"lp-ico-detail\"/><rect x=\"3\" y=\"12\" width=\"164\" height=\"175\" rx=\"8\"/><rect x=\"18\" y=\"26\" width=\"134\" height=\"32\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"18\" y=\"66\" width=\"134\" height=\"32\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"18\" y=\"106\" width=\"134\" height=\"32\" rx=\"4\" class=\"lp-ico-tone\"/><circle cx=\"34\" cy=\"42\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"34\" cy=\"82\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"34\" cy=\"122\" r=\"3\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "monitor-console",
    "category": "monitors",
    "label": "Monitor console",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 2.4
    },
    "viewBox": "0 0 300 240",
    "keywords": [
      "monitor desk",
      "console",
      "mixer"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"294\" height=\"234\" rx=\"10\"/><rect x=\"206\" y=\"18\" width=\"76\" height=\"46\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"28\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"52\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"76\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"124\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"148\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"172\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"196\" cy=\"34\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"28\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"52\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"76\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"124\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"148\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"172\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"196\" cy=\"64\" r=\"3.5\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"122\" x2=\"28\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"21\" y=\"148\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"55\" y1=\"122\" x2=\"55\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"48\" y=\"164\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"82\" y1=\"122\" x2=\"82\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"75\" y=\"180\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"109\" y1=\"122\" x2=\"109\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"102\" y=\"148\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"136\" y1=\"122\" x2=\"136\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"129\" y=\"164\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"163\" y1=\"122\" x2=\"163\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"156\" y=\"180\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"190\" y1=\"122\" x2=\"190\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"183\" y=\"148\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"217\" y1=\"122\" x2=\"217\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"210\" y=\"164\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"244\" y1=\"122\" x2=\"244\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"237\" y=\"180\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"271\" y1=\"122\" x2=\"271\" y2=\"214\" class=\"lp-ico-detail\"/><rect x=\"264\" y=\"148\" width=\"14\" height=\"10\" rx=\"2\" class=\"lp-ico-tone\"/>"
  },
];
