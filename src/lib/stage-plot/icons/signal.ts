/* ============================================================
   LOWPASS — Stage Plot signal & I/O icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const signalIcons: IconDescriptor[] = [
  {
    "name": "signal-pedalboard",
    "category": "signal",
    "label": "Pedalboard",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 200 130",
    "keywords": [
      "pedalboard",
      "pedals",
      "fx"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"194\" height=\"124\" rx=\"9\"/><rect x=\"16\" y=\"20\" width=\"44\" height=\"58\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"28\" cy=\"32\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"48\" cy=\"32\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"38\" cy=\"62\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"78\" y=\"20\" width=\"44\" height=\"58\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"90\" cy=\"32\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"110\" cy=\"32\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"62\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"140\" y=\"20\" width=\"44\" height=\"58\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"152\" cy=\"32\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"172\" cy=\"32\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"162\" cy=\"62\" r=\"7\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-snake-analog",
    "category": "signal",
    "label": "Analog snake",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 200 120",
    "keywords": [
      "snake",
      "multicore",
      "loom",
      "analog"
    ],
    "body": "<rect x=\"56\" y=\"28\" width=\"130\" height=\"68\" rx=\"10\"/><path d=\"M56 62 Q22 62 14 96\" class=\"lp-ico-detail\"/><line x1=\"186\" y1=\"40\" x2=\"197\" y2=\"33\" class=\"lp-ico-detail\"/><line x1=\"186\" y1=\"54\" x2=\"198\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"186\" y1=\"70\" x2=\"198\" y2=\"74\" class=\"lp-ico-detail\"/><line x1=\"186\" y1=\"84\" x2=\"197\" y2=\"91\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-snake-digital",
    "category": "signal",
    "label": "Digital snake",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 1
    },
    "viewBox": "0 0 140 100",
    "keywords": [
      "digital snake",
      "dante",
      "aes50",
      "cat5"
    ],
    "body": "<rect x=\"30\" y=\"22\" width=\"96\" height=\"56\" rx=\"10\"/><circle cx=\"56\" cy=\"50\" r=\"11\" class=\"lp-ico-tone\"/><rect x=\"51\" y=\"45\" width=\"10\" height=\"10\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"50\" r=\"11\" class=\"lp-ico-tone\"/><rect x=\"85\" y=\"45\" width=\"10\" height=\"10\" class=\"lp-ico-detail\"/><path d=\"M30 50 Q12 50 8 76\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-switch",
    "category": "signal",
    "label": "Network switch",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.8
    },
    "viewBox": "0 0 100 80",
    "keywords": [
      "switch",
      "network",
      "ethernet",
      "dante"
    ],
    "body": "<rect x=\"6\" y=\"18\" width=\"88\" height=\"44\" rx=\"6\"/><rect x=\"14\" y=\"40\" width=\"11\" height=\"11\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"29\" y=\"40\" width=\"11\" height=\"11\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"44\" y=\"40\" width=\"11\" height=\"11\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"59\" y=\"40\" width=\"11\" height=\"11\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"74\" y=\"40\" width=\"11\" height=\"11\" rx=\"2\" class=\"lp-ico-tone\"/><circle cx=\"16\" cy=\"29\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"26\" cy=\"29\" r=\"2.6\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-stagebox-4",
    "category": "signal",
    "label": "Stage box 4",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1
    },
    "viewBox": "0 0 150 100",
    "keywords": [
      "stage box",
      "4",
      "sub snake"
    ],
    "body": "<text x=\"8\" y=\"19\" font-size=\"22\" text-anchor=\"start\" class=\"lp-ico-label\">4ch</text><rect x=\"4\" y=\"26\" width=\"142\" height=\"64\" rx=\"8\"/><circle cx=\"30\" cy=\"58\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"58\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"58\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"58\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"58\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"58\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"58\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"58\" r=\"2.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-stagebox-8",
    "category": "signal",
    "label": "Stage box 8",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 150 130",
    "keywords": [
      "stage box",
      "8",
      "sub snake"
    ],
    "body": "<text x=\"8\" y=\"19\" font-size=\"22\" text-anchor=\"start\" class=\"lp-ico-label\">8ch</text><rect x=\"4\" y=\"26\" width=\"142\" height=\"94\" rx=\"8\"/><circle cx=\"30\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-stagebox-12",
    "category": "signal",
    "label": "Stage box 12",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.6
    },
    "viewBox": "0 0 150 160",
    "keywords": [
      "stage box",
      "12",
      "sub snake"
    ],
    "body": "<text x=\"8\" y=\"19\" font-size=\"22\" text-anchor=\"start\" class=\"lp-ico-label\">12ch</text><rect x=\"4\" y=\"26\" width=\"142\" height=\"126\" rx=\"8\"/><circle cx=\"30\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"52\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"52\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"86\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"86\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"120\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"120\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"120\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"120\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"120\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"120\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"120\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"120\" r=\"2.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-stagebox-14",
    "category": "signal",
    "label": "Stage box 14 (NC14)",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.9
    },
    "viewBox": "0 0 150 190",
    "keywords": [
      "stage box",
      "14",
      "nc14"
    ],
    "body": "<text x=\"8\" y=\"19\" font-size=\"22\" text-anchor=\"start\" class=\"lp-ico-label\">14ch</text><rect x=\"4\" y=\"26\" width=\"142\" height=\"156\" rx=\"8\"/><circle cx=\"30\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"146\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"146\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"146\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"146\" r=\"2.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-stagebox-16",
    "category": "signal",
    "label": "Stage box 16",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.9
    },
    "viewBox": "0 0 150 190",
    "keywords": [
      "stage box",
      "16",
      "sub snake"
    ],
    "body": "<text x=\"8\" y=\"19\" font-size=\"22\" text-anchor=\"start\" class=\"lp-ico-label\">16ch</text><rect x=\"4\" y=\"26\" width=\"142\" height=\"156\" rx=\"8\"/><circle cx=\"30\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"50\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"50\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"82\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"82\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"114\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"114\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"146\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"30\" cy=\"146\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"146\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"62\" cy=\"146\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"94\" cy=\"146\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"146\" r=\"2.5\" class=\"lp-ico-detail\"/><circle cx=\"126\" cy=\"146\" r=\"13\" class=\"lp-ico-tone\"/><circle cx=\"126\" cy=\"146\" r=\"2.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "di-mono",
    "category": "signal",
    "label": "DI (mono)",
    "footprint": {
      "width_ft": 0.7,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 70 90",
    "keywords": [
      "di",
      "direct box",
      "mono"
    ],
    "body": "<rect x=\"5\" y=\"6\" width=\"60\" height=\"52\" rx=\"8\"/><text x=\"35\" y=\"41\" font-size=\"24\" text-anchor=\"middle\" class=\"lp-ico-label\">DI</text><line x1=\"35\" y1=\"58\" x2=\"35\" y2=\"65\" class=\"lp-ico-detail\"/><circle cx=\"35\" cy=\"75\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"35\" cy=\"75\" r=\"2\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "di-stereo",
    "category": "signal",
    "label": "DI (stereo)",
    "footprint": {
      "width_ft": 0.7,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 70 90",
    "keywords": [
      "di",
      "direct box",
      "stereo"
    ],
    "body": "<rect x=\"5\" y=\"6\" width=\"60\" height=\"52\" rx=\"8\"/><text x=\"35\" y=\"41\" font-size=\"24\" text-anchor=\"middle\" class=\"lp-ico-label\">DI</text><line x1=\"22\" y1=\"58\" x2=\"22\" y2=\"65\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"58\" x2=\"48\" y2=\"65\" class=\"lp-ico-detail\"/><circle cx=\"22\" cy=\"75\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"48\" cy=\"75\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"22\" cy=\"75\" r=\"2\" class=\"lp-ico-detail\"/><circle cx=\"48\" cy=\"75\" r=\"2\" class=\"lp-ico-detail\"/>"
  },
];
