/* ============================================
   LOWPASS — Stage Plot signal & I/O icons (§SP1c)

   Generated against the locked icon contract (top-down, no
   colour attrs, footprint outline unclassed, details in
   .lp-ico-detail, letters in .lp-ico-label). Footprints are
   real-world feet. Hand-tunable — edit freely.
   ============================================ */

import type { IconDescriptor } from './types';

export const signalIcons: IconDescriptor[] = [
  {
    "name": "signal-di-single",
    "category": "signal",
    "label": "DI box",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 0.6
    },
    "body": "<rect x=\"22\" y=\"24\" width=\"56\" height=\"52\" rx=\"4\"/><circle cx=\"34\" cy=\"34\" r=\"3\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"54\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"22\">DI</text>",
    "keywords": [
      "di",
      "direct",
      "box",
      "injection",
      "passive"
    ]
  },
  {
    "name": "signal-di-active",
    "category": "signal",
    "label": "Active DI",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 0.6
    },
    "body": "<rect x=\"20\" y=\"24\" width=\"60\" height=\"52\" rx=\"4\"/><circle cx=\"32\" cy=\"34\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"44\" cy=\"34\" r=\"1.8\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"54\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"16\">A·DI</text>",
    "keywords": [
      "di",
      "active",
      "direct",
      "box",
      "powered",
      "led"
    ]
  },
  {
    "name": "signal-di-stereo",
    "category": "signal",
    "label": "Stereo DI",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.6
    },
    "body": "<rect x=\"14\" y=\"26\" width=\"72\" height=\"48\" rx=\"4\"/><circle cx=\"28\" cy=\"36\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"40\" cy=\"36\" r=\"3\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"54\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"15\">ST·DI</text>",
    "keywords": [
      "di",
      "stereo",
      "dual",
      "direct",
      "box",
      "two"
    ]
  },
  {
    "name": "signal-pedalboard",
    "category": "signal",
    "label": "Pedalboard",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 1.1
    },
    "body": "<rect x=\"6\" y=\"30\" width=\"88\" height=\"40\" rx=\"4\"/><rect x=\"12\" y=\"33\" width=\"50\" height=\"12\" rx=\"2\" class=\"lp-ico-detail\"/><circle cx=\"18\" cy=\"60\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"32\" cy=\"60\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"46\" cy=\"60\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"60\" cy=\"60\" r=\"5\" class=\"lp-ico-detail\"/><rect x=\"70\" y=\"36\" width=\"20\" height=\"28\" rx=\"2\" class=\"lp-ico-detail\"/><line x1=\"70\" y1=\"42\" x2=\"90\" y2=\"38\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "pedalboard",
      "helix",
      "line6",
      "floorboard",
      "footswitch",
      "expression",
      "guitar"
    ]
  },
  {
    "name": "signal-snake-analog",
    "category": "signal",
    "label": "Analog snake",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.7
    },
    "keywords": [
      "snake",
      "analog",
      "multicore",
      "fan",
      "loom"
    ],
    "body": "<rect x=\"24\" y=\"40\" width=\"30\" height=\"24\" rx=\"3\"/><line x1=\"54\" y1=\"46\" x2=\"80\" y2=\"34\" class=\"lp-ico-detail\"/><line x1=\"54\" y1=\"50\" x2=\"82\" y2=\"46\" class=\"lp-ico-detail\"/><line x1=\"54\" y1=\"54\" x2=\"82\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"54\" y1=\"58\" x2=\"80\" y2=\"70\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-snake-digital",
    "category": "signal",
    "label": "Digital snake",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.6
    },
    "keywords": [
      "snake",
      "digital",
      "network",
      "cat5",
      "dante"
    ],
    "body": "<rect x=\"22\" y=\"38\" width=\"34\" height=\"28\" rx=\"3\"/><line x1=\"56\" y1=\"52\" x2=\"82\" y2=\"52\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"39\" y=\"52\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"11\">NET</text>"
  },
  {
    "name": "signal-patch-panel",
    "category": "signal",
    "label": "Patch panel",
    "footprint": {
      "width_ft": 1.6,
      "depth_ft": 0.4
    },
    "body": "<rect x=\"6\" y=\"36\" width=\"88\" height=\"28\" rx=\"2\"/><circle cx=\"18\" cy=\"50\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"30\" cy=\"50\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"42\" cy=\"50\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"54\" cy=\"50\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"66\" cy=\"50\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"78\" cy=\"50\" r=\"4\" class=\"lp-ico-detail\"/><line x1=\"2\" y1=\"42\" x2=\"6\" y2=\"42\" class=\"lp-ico-detail\"/><line x1=\"2\" y1=\"58\" x2=\"6\" y2=\"58\" class=\"lp-ico-detail\"/><line x1=\"94\" y1=\"42\" x2=\"98\" y2=\"42\" class=\"lp-ico-detail\"/><line x1=\"94\" y1=\"58\" x2=\"98\" y2=\"58\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "patch",
      "panel",
      "1u",
      "rack",
      "jack",
      "tt",
      "bay"
    ]
  },
  {
    "name": "signal-rack-6u",
    "category": "signal",
    "label": "6U rack",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 1.5
    },
    "body": "<rect x=\"16\" y=\"14\" width=\"68\" height=\"72\" rx=\"3\"/><line x1=\"16\" y1=\"26\" x2=\"84\" y2=\"26\" class=\"lp-ico-detail\"/><line x1=\"16\" y1=\"38\" x2=\"84\" y2=\"38\" class=\"lp-ico-detail\"/><line x1=\"16\" y1=\"50\" x2=\"84\" y2=\"50\" class=\"lp-ico-detail\"/><line x1=\"16\" y1=\"62\" x2=\"84\" y2=\"62\" class=\"lp-ico-detail\"/><line x1=\"16\" y1=\"74\" x2=\"84\" y2=\"74\" class=\"lp-ico-detail\"/><line x1=\"10\" y1=\"20\" x2=\"16\" y2=\"20\" class=\"lp-ico-detail\"/><line x1=\"84\" y1=\"20\" x2=\"90\" y2=\"20\" class=\"lp-ico-detail\"/><line x1=\"10\" y1=\"80\" x2=\"16\" y2=\"80\" class=\"lp-ico-detail\"/><line x1=\"84\" y1=\"80\" x2=\"90\" y2=\"80\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "rack",
      "6u",
      "equipment",
      "case",
      "amp",
      "rackmount"
    ]
  },
  {
    "name": "signal-stagebox-4",
    "category": "signal",
    "label": "Stage box 4",
    "footprint": {
      "width_ft": 0.6,
      "depth_ft": 0.5
    },
    "body": "<rect x=\"18\" y=\"24\" width=\"64\" height=\"52\" rx=\"3\"/><circle cx=\"40\" cy=\"38\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"60\" cy=\"38\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"40\" cy=\"54\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"60\" cy=\"54\" r=\"5\" class=\"lp-ico-detail\"/><rect x=\"22\" y=\"66\" width=\"56\" height=\"6\" rx=\"1\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "stagebox",
      "stage",
      "box",
      "4",
      "input",
      "snake",
      "xlr"
    ]
  },
  {
    "name": "signal-stagebox-8",
    "category": "signal",
    "label": "Stage box 8",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.5
    },
    "body": "<rect x=\"12\" y=\"24\" width=\"76\" height=\"52\" rx=\"3\"/><circle cx=\"26\" cy=\"40\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"42\" cy=\"40\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"58\" cy=\"40\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"40\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"26\" cy=\"58\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"42\" cy=\"58\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"58\" cy=\"58\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"58\" r=\"5\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "stagebox",
      "stage",
      "box",
      "8",
      "input",
      "snake",
      "xlr"
    ]
  },
  {
    "name": "signal-stagebox-12",
    "category": "signal",
    "label": "Stage box 12",
    "footprint": {
      "width_ft": 1.1,
      "depth_ft": 0.6
    },
    "body": "<rect x=\"8\" y=\"24\" width=\"84\" height=\"52\" rx=\"3\"/><circle cx=\"21\" cy=\"40\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"35\" cy=\"40\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"49\" cy=\"40\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"63\" cy=\"40\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"77\" cy=\"40\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"79\" cy=\"40\" r=\"0\"/><circle cx=\"21\" cy=\"58\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"35\" cy=\"58\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"49\" cy=\"58\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"63\" cy=\"58\" r=\"4.5\" class=\"lp-ico-detail\"/><circle cx=\"77\" cy=\"58\" r=\"4.5\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "stagebox",
      "stage",
      "box",
      "12",
      "input",
      "snake",
      "xlr"
    ]
  },
  {
    "name": "signal-stagebox-16",
    "category": "signal",
    "label": "Stage box 16",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 0.6
    },
    "body": "<rect x=\"6\" y=\"24\" width=\"88\" height=\"52\" rx=\"3\"/><circle cx=\"17\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"28\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"39\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"61\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"72\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"83\" cy=\"40\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"17\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"28\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"39\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"61\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"72\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"83\" cy=\"58\" r=\"4\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "stagebox",
      "stage",
      "box",
      "16",
      "input",
      "snake",
      "xlr"
    ]
  },
  {
    "name": "signal-switch",
    "category": "signal",
    "label": "Network switch",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.5
    },
    "body": "<rect x=\"8\" y=\"38\" width=\"84\" height=\"24\" rx=\"3\"/><rect x=\"15\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"25\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"35\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"45\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"55\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"65\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"75\" y=\"45\" width=\"7\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"85\" y=\"45\" width=\"3\" height=\"10\" rx=\"1\" class=\"lp-ico-detail\"/>",
    "keywords": [
      "switch",
      "network",
      "ethernet",
      "netgear",
      "port",
      "lan",
      "rj45"
    ]
  }
];
