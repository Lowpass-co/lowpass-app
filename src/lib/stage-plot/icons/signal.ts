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
      "width_ft": 0.5,
      "depth_ft": 0.5
    },
    "keywords": [
      "di",
      "direct",
      "box",
      "jack",
      "passive"
    ],
    "body": "<rect x=\"36\" y=\"30\" width=\"28\" height=\"40\" rx=\"3\"/><circle cx=\"50\" cy=\"42\" r=\"4\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"60\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"13\">DI</text>"
  },
  {
    "name": "signal-di-active",
    "category": "signal",
    "label": "Active DI",
    "footprint": {
      "width_ft": 0.5,
      "depth_ft": 0.5
    },
    "keywords": [
      "di",
      "active",
      "direct",
      "box",
      "powered"
    ],
    "body": "<rect x=\"36\" y=\"30\" width=\"28\" height=\"40\" rx=\"3\"/><circle cx=\"45\" cy=\"42\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"58\" cy=\"40\" r=\"2\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"60\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"13\">DI</text>"
  },
  {
    "name": "signal-di-stereo",
    "category": "signal",
    "label": "Stereo DI",
    "footprint": {
      "width_ft": 0.7,
      "depth_ft": 0.5
    },
    "keywords": [
      "di",
      "stereo",
      "dual",
      "direct",
      "box"
    ],
    "body": "<rect x=\"28\" y=\"32\" width=\"44\" height=\"36\" rx=\"3\"/><circle cx=\"40\" cy=\"44\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"60\" cy=\"44\" r=\"4\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"50\" y=\"59\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"12\">DI</text>"
  },
  {
    "name": "signal-pedalboard",
    "category": "signal",
    "label": "Pedalboard",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 1
    },
    "keywords": [
      "pedal",
      "pedalboard",
      "effects",
      "stomp",
      "guitar"
    ],
    "body": "<rect x=\"16\" y=\"40\" width=\"68\" height=\"24\" rx=\"3\"/><rect x=\"22\" y=\"46\" width=\"12\" height=\"12\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"38\" y=\"46\" width=\"12\" height=\"12\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"54\" y=\"46\" width=\"12\" height=\"12\" rx=\"1\" class=\"lp-ico-detail\"/><rect x=\"70\" y=\"46\" width=\"8\" height=\"12\" rx=\"1\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-wireless-rack",
    "category": "signal",
    "label": "Wireless rack",
    "footprint": {
      "width_ft": 1.6,
      "depth_ft": 1.2
    },
    "keywords": [
      "wireless",
      "rack",
      "rf",
      "antenna",
      "iem",
      "mic"
    ],
    "body": "<rect x=\"24\" y=\"44\" width=\"52\" height=\"30\" rx=\"3\"/><line x1=\"34\" y1=\"44\" x2=\"30\" y2=\"26\" class=\"lp-ico-detail\"/><line x1=\"44\" y1=\"44\" x2=\"44\" y2=\"24\" class=\"lp-ico-detail\"/><line x1=\"56\" y1=\"44\" x2=\"56\" y2=\"24\" class=\"lp-ico-detail\"/><line x1=\"66\" y1=\"44\" x2=\"70\" y2=\"26\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-snake-analog",
    "category": "signal",
    "label": "Analog snake",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 0.6
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
      "width_ft": 1,
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
    "name": "signal-stagebox-analog",
    "category": "signal",
    "label": "Stage box",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 0.8
    },
    "keywords": [
      "stagebox",
      "analog",
      "stage",
      "box",
      "jacks",
      "multicore"
    ],
    "body": "<rect x=\"24\" y=\"34\" width=\"52\" height=\"32\" rx=\"3\"/><circle cx=\"36\" cy=\"44\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"44\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"64\" cy=\"44\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"36\" cy=\"56\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"56\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"64\" cy=\"56\" r=\"3\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "signal-stagebox-digital",
    "category": "signal",
    "label": "Stage box",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 0.8
    },
    "keywords": [
      "stagebox",
      "digital",
      "stage",
      "box",
      "ethercon",
      "dante",
      "network"
    ],
    "body": "<rect x=\"24\" y=\"34\" width=\"52\" height=\"32\" rx=\"3\"/><circle cx=\"34\" cy=\"45\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"34\" cy=\"55\" r=\"3\" class=\"lp-ico-detail\"/><rect x=\"44\" y=\"42\" width=\"10\" height=\"8\" rx=\"1\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"63\" y=\"50\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"14\">D</text>"
  },
  {
    "name": "signal-network-switch",
    "category": "signal",
    "label": "Switch",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 0.6
    },
    "keywords": [
      "network",
      "switch",
      "ethernet",
      "ports",
      "net",
      "lan"
    ],
    "body": "<rect x=\"20\" y=\"40\" width=\"60\" height=\"22\" rx=\"3\"/><rect x=\"26\" y=\"45\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"36\" y=\"45\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><rect x=\"46\" y=\"45\" width=\"6\" height=\"6\" class=\"lp-ico-detail\"/><text class=\"lp-ico-label\" x=\"66\" y=\"51\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"10\">NET</text>"
  },
  {
    "name": "signal-patch-panel",
    "category": "signal",
    "label": "Patch panel",
    "footprint": {
      "width_ft": 1.6,
      "depth_ft": 0.5
    },
    "keywords": [
      "patch",
      "panel",
      "rack",
      "strip",
      "jacks",
      "tie-line"
    ],
    "body": "<rect x=\"16\" y=\"44\" width=\"68\" height=\"16\" rx=\"2\"/><circle cx=\"26\" cy=\"52\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"38\" cy=\"52\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"52\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"62\" cy=\"52\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"52\" r=\"3\" class=\"lp-ico-detail\"/>"
  }
];
