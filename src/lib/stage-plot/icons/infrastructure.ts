/* ============================================================
   LOWPASS — Stage Plot infrastructure icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const infrastructureIcons: IconDescriptor[] = [
  {
    "name": "infra-riser-4x4",
    "category": "infrastructure",
    "label": "Riser 4×4",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 4
    },
    "viewBox": "0 0 400 400",
    "keywords": [
      "riser",
      "4x4",
      "drum riser"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"394\" height=\"394\"/><line x1=\"3\" y1=\"3\" x2=\"397\" y2=\"397\" class=\"lp-ico-detail\"/><line x1=\"397\" y1=\"3\" x2=\"3\" y2=\"397\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-riser-4x8",
    "category": "infrastructure",
    "label": "Riser 4×8",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 8
    },
    "viewBox": "0 0 400 800",
    "keywords": [
      "riser",
      "4x8"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"394\" height=\"794\"/><line x1=\"3\" y1=\"3\" x2=\"397\" y2=\"797\" class=\"lp-ico-detail\"/><line x1=\"397\" y1=\"3\" x2=\"3\" y2=\"797\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-riser-8x8",
    "category": "infrastructure",
    "label": "Riser 8×8",
    "footprint": {
      "width_ft": 8,
      "depth_ft": 8
    },
    "viewBox": "0 0 800 800",
    "keywords": [
      "riser",
      "8x8"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"794\" height=\"794\"/><line x1=\"3\" y1=\"3\" x2=\"797\" y2=\"797\" class=\"lp-ico-detail\"/><line x1=\"797\" y1=\"3\" x2=\"3\" y2=\"797\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-riser-8x4",
    "category": "infrastructure",
    "label": "Riser 8×4",
    "footprint": {
      "width_ft": 8,
      "depth_ft": 4
    },
    "viewBox": "0 0 800 400",
    "keywords": [
      "riser",
      "8x4",
      "drum riser"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"794\" height=\"394\"/><line x1=\"3\" y1=\"3\" x2=\"797\" y2=\"397\" class=\"lp-ico-detail\"/><line x1=\"797\" y1=\"3\" x2=\"3\" y2=\"397\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-riser-custom",
    "category": "infrastructure",
    "label": "Custom riser",
    "footprint": {
      "width_ft": 6,
      "depth_ft": 4
    },
    "viewBox": "0 0 600 400",
    "keywords": [
      "riser",
      "custom"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"594\" height=\"394\" stroke-dasharray=\"18 12\"/><line x1=\"3\" y1=\"3\" x2=\"597\" y2=\"397\" class=\"lp-ico-detail\"/><line x1=\"597\" y1=\"3\" x2=\"3\" y2=\"397\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-generator",
    "category": "infrastructure",
    "label": "Generator",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 2
    },
    "viewBox": "0 0 300 200",
    "keywords": [
      "generator",
      "genny",
      "power"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"294\" height=\"194\" rx=\"10\"/><rect x=\"250\" y=\"16\" width=\"30\" height=\"28\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"150\" y1=\"24\" x2=\"150\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"172\" y1=\"24\" x2=\"172\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"194\" y1=\"24\" x2=\"194\" y2=\"70\" class=\"lp-ico-detail\"/><rect x=\"20\" y=\"126\" width=\"76\" height=\"56\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"40\" cy=\"154\" r=\"12\" class=\"lp-ico-tone\"/><line x1=\"36.2\" y1=\"149.7\" x2=\"36.2\" y2=\"157.6\" class=\"lp-ico-detail\"/><line x1=\"43.8\" y1=\"149.7\" x2=\"43.8\" y2=\"157.6\" class=\"lp-ico-detail\"/><circle cx=\"72\" cy=\"154\" r=\"12\" class=\"lp-ico-tone\"/><line x1=\"68.2\" y1=\"149.7\" x2=\"68.2\" y2=\"157.6\" class=\"lp-ico-detail\"/><line x1=\"75.8\" y1=\"149.7\" x2=\"75.8\" y2=\"157.6\" class=\"lp-ico-detail\"/><path d=\"M154.3 110 L130 141.7 L142.1 141.7 L135.6 166 L161.7 130.5 L148.7 130.5 Z\" class=\"lp-ico-label\"/>"
  },
  {
    "name": "infra-cable-ramp",
    "category": "infrastructure",
    "label": "Cable ramp",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 300 120",
    "keywords": [
      "cable ramp",
      "yellow jacket",
      "protector"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"294\" height=\"114\" rx=\"6\"/><line x1=\"14\" y1=\"42\" x2=\"286\" y2=\"42\" class=\"lp-ico-detail\"/><line x1=\"14\" y1=\"60\" x2=\"286\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"14\" y1=\"78\" x2=\"286\" y2=\"78\" class=\"lp-ico-detail\"/><line x1=\"16\" y1=\"14\" x2=\"30\" y2=\"30\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"14\" x2=\"42\" y2=\"30\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"14\" x2=\"54\" y2=\"30\" class=\"lp-ico-detail\"/><line x1=\"232\" y1=\"14\" x2=\"246\" y2=\"30\" class=\"lp-ico-detail\"/><line x1=\"244\" y1=\"14\" x2=\"258\" y2=\"30\" class=\"lp-ico-detail\"/><line x1=\"256\" y1=\"14\" x2=\"270\" y2=\"30\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-barricade",
    "category": "infrastructure",
    "label": "Barricade",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 400 130",
    "keywords": [
      "barricade",
      "barrier",
      "mojo"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"394\" height=\"36\" rx=\"6\"/><line x1=\"40\" y1=\"39\" x2=\"40\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"20\" y1=\"112\" x2=\"60\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"104\" y1=\"39\" x2=\"104\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"84\" y1=\"112\" x2=\"124\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"39\" x2=\"168\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"148\" y1=\"112\" x2=\"188\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"232\" y1=\"39\" x2=\"232\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"212\" y1=\"112\" x2=\"252\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"296\" y1=\"39\" x2=\"296\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"276\" y1=\"112\" x2=\"316\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"360\" y1=\"39\" x2=\"360\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"340\" y1=\"112\" x2=\"380\" y2=\"112\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-truss",
    "category": "infrastructure",
    "label": "Truss",
    "footprint": {
      "width_ft": 8,
      "depth_ft": 1
    },
    "viewBox": "0 0 800 100",
    "keywords": [
      "truss",
      "stick",
      "section"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"794\" height=\"94\" rx=\"4\"/><path d=\"M20 20 L49.2 80 L78.5 20 L107.7 80 L136.9 20 L166.2 80 L195.4 20 L224.6 80 L253.8 20 L283.1 80 L312.3 20 L341.5 80 L370.8 20 L400 80 L429.2 20 L458.5 80 L487.7 20 L516.9 80 L546.2 20 L575.4 80 L604.6 20 L633.8 80 L663.1 20 L692.3 80 L721.5 20 L750.8 80 L780 20\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-truss-1x1",
    "category": "infrastructure",
    "label": "Truss 1×1",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 1
    },
    "viewBox": "0 0 100 100",
    "keywords": [
      "truss",
      "tower section",
      "12in"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"94\" height=\"94\" rx=\"4\"/><line x1=\"3\" y1=\"3\" x2=\"97\" y2=\"97\" class=\"lp-ico-detail\"/><line x1=\"97\" y1=\"3\" x2=\"3\" y2=\"97\" class=\"lp-ico-detail\"/><circle cx=\"20\" cy=\"20\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"80\" cy=\"20\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"20\" cy=\"80\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"80\" cy=\"80\" r=\"9\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "infra-lighting-tower",
    "category": "infrastructure",
    "label": "Light tower",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 2
    },
    "viewBox": "0 0 200 200",
    "keywords": [
      "tower",
      "lighting",
      "goalpost"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"194\" height=\"194\" rx=\"6\"/><line x1=\"3\" y1=\"3\" x2=\"197\" y2=\"197\" class=\"lp-ico-detail\"/><line x1=\"197\" y1=\"3\" x2=\"3\" y2=\"197\" class=\"lp-ico-detail\"/><rect x=\"10\" y=\"10\" width=\"26\" height=\"26\" class=\"lp-ico-tone\"/><rect x=\"164\" y=\"10\" width=\"26\" height=\"26\" class=\"lp-ico-tone\"/><rect x=\"10\" y=\"164\" width=\"26\" height=\"26\" class=\"lp-ico-tone\"/><rect x=\"164\" y=\"164\" width=\"26\" height=\"26\" class=\"lp-ico-tone\"/><circle cx=\"100\" cy=\"100\" r=\"30\" class=\"lp-ico-tone\"/><line x1=\"100\" y1=\"70\" x2=\"100\" y2=\"54\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-tech-table",
    "category": "infrastructure",
    "label": "FOH table",
    "footprint": {
      "width_ft": 6,
      "depth_ft": 2.5
    },
    "viewBox": "0 0 600 250",
    "keywords": [
      "foh",
      "tech table",
      "control",
      "desk"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"594\" height=\"244\" rx=\"8\"/><rect x=\"56\" y=\"66\" width=\"112\" height=\"72\" rx=\"6\" class=\"lp-ico-tone\"/><line x1=\"56\" y1=\"90\" x2=\"168\" y2=\"90\" class=\"lp-ico-detail\"/><rect x=\"240\" y=\"66\" width=\"112\" height=\"72\" rx=\"6\" class=\"lp-ico-tone\"/><line x1=\"240\" y1=\"90\" x2=\"352\" y2=\"90\" class=\"lp-ico-detail\"/><rect x=\"424\" y=\"46\" width=\"130\" height=\"152\" rx=\"8\" class=\"lp-ico-tone\"/><line x1=\"446\" y1=\"120\" x2=\"446\" y2=\"180\" class=\"lp-ico-detail\"/><line x1=\"476\" y1=\"120\" x2=\"476\" y2=\"180\" class=\"lp-ico-detail\"/><line x1=\"506\" y1=\"120\" x2=\"506\" y2=\"180\" class=\"lp-ico-detail\"/><line x1=\"536\" y1=\"120\" x2=\"536\" y2=\"180\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-road-case",
    "category": "infrastructure",
    "label": "Road case",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 200 140",
    "keywords": [
      "road case",
      "flight case",
      "trunk"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"194\" height=\"134\" rx=\"10\"/><line x1=\"3\" y1=\"70\" x2=\"197\" y2=\"70\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"58\" width=\"22\" height=\"24\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"148\" y=\"58\" width=\"22\" height=\"24\" rx=\"4\" class=\"lp-ico-tone\"/><circle cx=\"18\" cy=\"18\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"182\" cy=\"18\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"18\" cy=\"122\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"182\" cy=\"122\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-power-1",
    "category": "infrastructure",
    "label": "Power drop ×1",
    "footprint": {
      "width_ft": 1.65,
      "depth_ft": 1.65
    },
    "viewBox": "0 0 165 165",
    "keywords": [
      "power",
      "outlet",
      "socket",
      "13a",
      "edison"
    ],
    "body": "<g transform=\"scale(1.5)\"><path d=\"M25.9 2 L6 28.1 L16 28.1 L10.6 48 L32.1 18.9 L21.3 18.9 Z\" class=\"lp-ico-label\"/><circle cx=\"60\" cy=\"64\" r=\"42\"/><rect x=\"48\" y=\"46\" width=\"7\" height=\"21\" rx=\"3.5\" class=\"lp-ico-tone\"/><rect x=\"65\" y=\"46\" width=\"7\" height=\"21\" rx=\"3.5\" class=\"lp-ico-tone\"/><circle cx=\"60\" cy=\"82\" r=\"5\" class=\"lp-ico-tone\"/></g>"
  },
  {
    "name": "infra-power-2",
    "category": "infrastructure",
    "label": "Power drop ×2",
    "footprint": {
      "width_ft": 2.4,
      "depth_ft": 1.5
    },
    "viewBox": "0 0 240 150",
    "keywords": [
      "power",
      "duplex",
      "drop"
    ],
    "body": "<g transform=\"scale(1.5)\"><path d=\"M25.1 0 L6 24.9 L15.5 24.9 L10.4 44 L30.9 16.1 L20.7 16.1 Z\" class=\"lp-ico-label\"/><rect x=\"4\" y=\"34\" width=\"152\" height=\"62\" rx=\"10\"/><circle cx=\"52\" cy=\"65\" r=\"22\" class=\"lp-ico-tone\"/><line x1=\"45\" y1=\"57.1\" x2=\"45\" y2=\"71.6\" class=\"lp-ico-detail\"/><line x1=\"59\" y1=\"57.1\" x2=\"59\" y2=\"71.6\" class=\"lp-ico-detail\"/><circle cx=\"112\" cy=\"65\" r=\"22\" class=\"lp-ico-tone\"/><line x1=\"105\" y1=\"57.1\" x2=\"105\" y2=\"71.6\" class=\"lp-ico-detail\"/><line x1=\"119\" y1=\"57.1\" x2=\"119\" y2=\"71.6\" class=\"lp-ico-detail\"/></g>"
  },
  {
    "name": "infra-power-4",
    "category": "infrastructure",
    "label": "Power drop ×4",
    "footprint": {
      "width_ft": 2.1,
      "depth_ft": 2.1
    },
    "viewBox": "0 0 210 210",
    "keywords": [
      "power",
      "quad",
      "drop"
    ],
    "body": "<g transform=\"scale(1.5)\"><path d=\"M23.1 0 L4 24.9 L13.5 24.9 L8.4 44 L28.9 16.1 L18.7 16.1 Z\" class=\"lp-ico-label\"/><rect x=\"4\" y=\"36\" width=\"132\" height=\"100\" rx=\"10\"/><circle cx=\"40\" cy=\"66\" r=\"20\" class=\"lp-ico-tone\"/><line x1=\"33.6\" y1=\"58.8\" x2=\"33.6\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"46.4\" y1=\"58.8\" x2=\"46.4\" y2=\"72\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"66\" r=\"20\" class=\"lp-ico-tone\"/><line x1=\"93.6\" y1=\"58.8\" x2=\"93.6\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"106.4\" y1=\"58.8\" x2=\"106.4\" y2=\"72\" class=\"lp-ico-detail\"/><circle cx=\"40\" cy=\"108\" r=\"20\" class=\"lp-ico-tone\"/><line x1=\"33.6\" y1=\"100.8\" x2=\"33.6\" y2=\"114\" class=\"lp-ico-detail\"/><line x1=\"46.4\" y1=\"100.8\" x2=\"46.4\" y2=\"114\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"108\" r=\"20\" class=\"lp-ico-tone\"/><line x1=\"93.6\" y1=\"100.8\" x2=\"93.6\" y2=\"114\" class=\"lp-ico-detail\"/><line x1=\"106.4\" y1=\"100.8\" x2=\"106.4\" y2=\"114\" class=\"lp-ico-detail\"/></g>"
  },
  {
    "name": "infra-power-8",
    "category": "infrastructure",
    "label": "Power drop ×8",
    "footprint": {
      "width_ft": 2.85,
      "depth_ft": 1.8
    },
    "viewBox": "0 0 285 180",
    "keywords": [
      "power",
      "8-way",
      "drop"
    ],
    "body": "<g transform=\"scale(1.5)\"><path d=\"M23.1 0 L4 24.9 L13.5 24.9 L8.4 44 L28.9 16.1 L18.7 16.1 Z\" class=\"lp-ico-label\"/><rect x=\"4\" y=\"36\" width=\"182\" height=\"80\" rx=\"10\"/><circle cx=\"28\" cy=\"62\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"23.5\" y1=\"57\" x2=\"23.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><line x1=\"32.5\" y1=\"57\" x2=\"32.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><circle cx=\"28\" cy=\"94\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"23.5\" y1=\"89\" x2=\"23.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><line x1=\"32.5\" y1=\"89\" x2=\"32.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><circle cx=\"72\" cy=\"62\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"67.5\" y1=\"57\" x2=\"67.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><line x1=\"76.5\" y1=\"57\" x2=\"76.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><circle cx=\"72\" cy=\"94\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"67.5\" y1=\"89\" x2=\"67.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><line x1=\"76.5\" y1=\"89\" x2=\"76.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><circle cx=\"116\" cy=\"62\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"111.5\" y1=\"57\" x2=\"111.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><line x1=\"120.5\" y1=\"57\" x2=\"120.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><circle cx=\"116\" cy=\"94\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"111.5\" y1=\"89\" x2=\"111.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><line x1=\"120.5\" y1=\"89\" x2=\"120.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><circle cx=\"160\" cy=\"62\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"155.5\" y1=\"57\" x2=\"155.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><line x1=\"164.5\" y1=\"57\" x2=\"164.5\" y2=\"66.2\" class=\"lp-ico-detail\"/><circle cx=\"160\" cy=\"94\" r=\"14\" class=\"lp-ico-tone\"/><line x1=\"155.5\" y1=\"89\" x2=\"155.5\" y2=\"98.2\" class=\"lp-ico-detail\"/><line x1=\"164.5\" y1=\"89\" x2=\"164.5\" y2=\"98.2\" class=\"lp-ico-detail\"/></g>"
  },
  {
    "name": "infra-distro",
    "category": "infrastructure",
    "label": "Power distro",
    "footprint": {
      "width_ft": 2.4,
      "depth_ft": 2.1
    },
    "viewBox": "0 0 240 210",
    "keywords": [
      "distro",
      "distribution",
      "16a",
      "ceeform",
      "edison"
    ],
    "body": "<g transform=\"scale(1.5)\"><path d=\"M23.1 0 L4 24.9 L13.5 24.9 L8.4 44 L28.9 16.1 L18.7 16.1 Z\" class=\"lp-ico-label\"/><rect x=\"4\" y=\"36\" width=\"152\" height=\"104\" rx=\"10\"/><circle cx=\"48\" cy=\"70\" r=\"23\" class=\"lp-ico-tone\"/><circle cx=\"40\" cy=\"65\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"56\" cy=\"65\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"48\" cy=\"79\" r=\"3\" class=\"lp-ico-detail\"/><line x1=\"44\" y1=\"47\" x2=\"52\" y2=\"47\" class=\"lp-ico-detail\"/><circle cx=\"112\" cy=\"70\" r=\"23\" class=\"lp-ico-tone\"/><circle cx=\"104\" cy=\"65\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"120\" cy=\"65\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"112\" cy=\"79\" r=\"3\" class=\"lp-ico-detail\"/><line x1=\"108\" y1=\"47\" x2=\"116\" y2=\"47\" class=\"lp-ico-detail\"/><circle cx=\"32\" cy=\"118\" r=\"12\" class=\"lp-ico-tone\"/><line x1=\"28.2\" y1=\"113.7\" x2=\"28.2\" y2=\"121.6\" class=\"lp-ico-detail\"/><line x1=\"35.8\" y1=\"113.7\" x2=\"35.8\" y2=\"121.6\" class=\"lp-ico-detail\"/><circle cx=\"64\" cy=\"118\" r=\"12\" class=\"lp-ico-tone\"/><line x1=\"60.2\" y1=\"113.7\" x2=\"60.2\" y2=\"121.6\" class=\"lp-ico-detail\"/><line x1=\"67.8\" y1=\"113.7\" x2=\"67.8\" y2=\"121.6\" class=\"lp-ico-detail\"/><circle cx=\"96\" cy=\"118\" r=\"12\" class=\"lp-ico-tone\"/><line x1=\"92.2\" y1=\"113.7\" x2=\"92.2\" y2=\"121.6\" class=\"lp-ico-detail\"/><line x1=\"99.8\" y1=\"113.7\" x2=\"99.8\" y2=\"121.6\" class=\"lp-ico-detail\"/><circle cx=\"128\" cy=\"118\" r=\"12\" class=\"lp-ico-tone\"/><line x1=\"124.2\" y1=\"113.7\" x2=\"124.2\" y2=\"121.6\" class=\"lp-ico-detail\"/><line x1=\"131.8\" y1=\"113.7\" x2=\"131.8\" y2=\"121.6\" class=\"lp-ico-detail\"/></g>"
  },
  {
    "name": "infra-rack-2u",
    "category": "infrastructure",
    "label": "Rack 2U",
    "footprint": {
      "width_ft": 1.9,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 190 90",
    "keywords": [
      "rack",
      "2u"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"184\" height=\"84\" rx=\"8\"/><line x1=\"22\" y1=\"8\" x2=\"22\" y2=\"80\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"8\" x2=\"168\" y2=\"80\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"12.5\" width=\"134\" height=\"30\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"27.5\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"27.5\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"47.5\" width=\"134\" height=\"30\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"62.5\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"62.5\" r=\"2.2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-rack-4u",
    "category": "infrastructure",
    "label": "Rack 4U",
    "footprint": {
      "width_ft": 1.9,
      "depth_ft": 1.5
    },
    "viewBox": "0 0 190 150",
    "keywords": [
      "rack",
      "4u"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"184\" height=\"144\" rx=\"8\"/><line x1=\"22\" y1=\"8\" x2=\"22\" y2=\"140\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"8\" x2=\"168\" y2=\"140\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"12.5\" width=\"134\" height=\"27.5\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"26.3\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"26.3\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"45\" width=\"134\" height=\"27.5\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"58.8\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"58.8\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"77.5\" width=\"134\" height=\"27.5\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"91.3\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"91.3\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"110\" width=\"134\" height=\"27.5\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"123.8\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"123.8\" r=\"2.2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-rack-6u",
    "category": "infrastructure",
    "label": "Rack 6U",
    "footprint": {
      "width_ft": 1.9,
      "depth_ft": 2
    },
    "viewBox": "0 0 190 200",
    "keywords": [
      "rack",
      "6u"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"184\" height=\"194\" rx=\"8\"/><line x1=\"22\" y1=\"8\" x2=\"22\" y2=\"190\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"8\" x2=\"168\" y2=\"190\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"12.5\" width=\"134\" height=\"25\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"25\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"25\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"42.5\" width=\"134\" height=\"25\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"55\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"55\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"72.5\" width=\"134\" height=\"25\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"85\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"85\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"102.5\" width=\"134\" height=\"25\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"115\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"115\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"132.5\" width=\"134\" height=\"25\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"145\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"145\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"162.5\" width=\"134\" height=\"25\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"175\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"175\" r=\"2.2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "infra-rack-12u",
    "category": "infrastructure",
    "label": "Rack 12U",
    "footprint": {
      "width_ft": 1.9,
      "depth_ft": 3.2
    },
    "viewBox": "0 0 190 320",
    "keywords": [
      "rack",
      "12u",
      "tour rack"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"184\" height=\"314\" rx=\"8\"/><line x1=\"22\" y1=\"8\" x2=\"22\" y2=\"284\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"8\" x2=\"168\" y2=\"284\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"12.5\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"21.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"21.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"35.3\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"44.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"44.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"58.2\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"67.1\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"67.1\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"81\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"89.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"89.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"103.8\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"112.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"112.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"126.7\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"135.6\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"135.6\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"149.5\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"158.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"158.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"172.3\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"181.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"181.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"195.2\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"204.1\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"204.1\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"218\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"226.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"226.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"240.8\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"249.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"249.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"263.7\" width=\"134\" height=\"17.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"272.6\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"272.6\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"53.2\" cy=\"302\" r=\"12\" class=\"lp-ico-tone\"/><circle cx=\"136.8\" cy=\"302\" r=\"12\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "infra-rack-24u",
    "category": "infrastructure",
    "label": "Rack 24U",
    "footprint": {
      "width_ft": 1.9,
      "depth_ft": 5.2
    },
    "viewBox": "0 0 190 520",
    "keywords": [
      "rack",
      "24u",
      "amp rack"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"184\" height=\"514\" rx=\"8\"/><line x1=\"22\" y1=\"8\" x2=\"22\" y2=\"484\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"8\" x2=\"168\" y2=\"484\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"12.5\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"19.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"19.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"32.3\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"39.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"39.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"52\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"59.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"59.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"71.8\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"79.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"79.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"91.5\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"98.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"98.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"111.3\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"118.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"118.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"131\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"138.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"138.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"150.8\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"158.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"158.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"170.5\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"177.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"177.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"190.3\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"197.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"197.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"210\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"217.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"217.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"229.8\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"237.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"237.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"249.5\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"256.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"256.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"269.3\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"276.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"276.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"289\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"296.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"296.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"308.8\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"316.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"316.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"328.5\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"335.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"335.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"348.3\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"355.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"355.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"368\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"375.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"375.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"387.8\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"395.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"395.2\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"407.5\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"414.9\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"414.9\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"427.3\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"434.7\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"434.7\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"447\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"454.4\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"454.4\" r=\"2.2\" class=\"lp-ico-detail\"/><rect x=\"28\" y=\"466.8\" width=\"134\" height=\"14.8\" rx=\"3\" class=\"lp-ico-tone\"/><circle cx=\"37\" cy=\"474.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"153\" cy=\"474.2\" r=\"2.2\" class=\"lp-ico-detail\"/><circle cx=\"53.2\" cy=\"502\" r=\"12\" class=\"lp-ico-tone\"/><circle cx=\"136.8\" cy=\"502\" r=\"12\" class=\"lp-ico-tone\"/>"
  },
];
