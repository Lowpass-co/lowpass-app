/* ============================================================
   LOWPASS — Stage Plot aux percussion icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const drumAuxIcons: IconDescriptor[] = [
  {
    "name": "drum-timbales",
    "category": "drums",
    "label": "Timbales",
    "footprint": {
      "width_ft": 2.3,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 230 120",
    "keywords": [
      "timbales",
      "latin"
    ],
    "body": "<circle cx=\"60\" cy=\"60\" r=\"54\"/><circle cx=\"60\" cy=\"60\" r=\"40\" class=\"lp-ico-tone\"/><line x1=\"60\" y1=\"16.8\" x2=\"60\" y2=\"7.6\" class=\"lp-ico-detail\"/><line x1=\"97.4\" y1=\"38.4\" x2=\"105.4\" y2=\"33.8\" class=\"lp-ico-detail\"/><line x1=\"97.4\" y1=\"81.6\" x2=\"105.4\" y2=\"86.2\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"103.2\" x2=\"60\" y2=\"112.4\" class=\"lp-ico-detail\"/><line x1=\"22.6\" y1=\"81.6\" x2=\"14.6\" y2=\"86.2\" class=\"lp-ico-detail\"/><line x1=\"22.6\" y1=\"38.4\" x2=\"14.6\" y2=\"33.8\" class=\"lp-ico-detail\"/><circle cx=\"172\" cy=\"60\" r=\"48\"/><circle cx=\"172\" cy=\"60\" r=\"35.5\" class=\"lp-ico-tone\"/><line x1=\"172\" y1=\"21.6\" x2=\"172\" y2=\"13.4\" class=\"lp-ico-detail\"/><line x1=\"205.3\" y1=\"40.8\" x2=\"212.3\" y2=\"36.7\" class=\"lp-ico-detail\"/><line x1=\"205.3\" y1=\"79.2\" x2=\"212.3\" y2=\"83.3\" class=\"lp-ico-detail\"/><line x1=\"172\" y1=\"98.4\" x2=\"172\" y2=\"106.6\" class=\"lp-ico-detail\"/><line x1=\"138.7\" y1=\"79.2\" x2=\"131.7\" y2=\"83.3\" class=\"lp-ico-detail\"/><line x1=\"138.7\" y1=\"40.8\" x2=\"131.7\" y2=\"36.7\" class=\"lp-ico-detail\"/><line x1=\"114\" y1=\"60\" x2=\"124\" y2=\"60\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-congas",
    "category": "drums",
    "label": "Congas",
    "footprint": {
      "width_ft": 2.6,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 260 140",
    "keywords": [
      "congas",
      "latin",
      "tumba"
    ],
    "body": "<circle cx=\"66\" cy=\"70\" r=\"62\"/><circle cx=\"66\" cy=\"70\" r=\"45.9\" class=\"lp-ico-tone\"/><line x1=\"66\" y1=\"20.4\" x2=\"66\" y2=\"9.9\" class=\"lp-ico-detail\"/><line x1=\"104.8\" y1=\"39.1\" x2=\"113\" y2=\"32.5\" class=\"lp-ico-detail\"/><line x1=\"114.4\" y1=\"81\" x2=\"124.6\" y2=\"83.4\" class=\"lp-ico-detail\"/><line x1=\"87.5\" y1=\"114.7\" x2=\"92.1\" y2=\"124.2\" class=\"lp-ico-detail\"/><line x1=\"44.5\" y1=\"114.7\" x2=\"39.9\" y2=\"124.2\" class=\"lp-ico-detail\"/><line x1=\"17.6\" y1=\"81\" x2=\"7.4\" y2=\"83.4\" class=\"lp-ico-detail\"/><line x1=\"27.2\" y1=\"39.1\" x2=\"19\" y2=\"32.5\" class=\"lp-ico-detail\"/><circle cx=\"196\" cy=\"70\" r=\"62\"/><circle cx=\"196\" cy=\"70\" r=\"45.9\" class=\"lp-ico-tone\"/><line x1=\"196\" y1=\"20.4\" x2=\"196\" y2=\"9.9\" class=\"lp-ico-detail\"/><line x1=\"234.8\" y1=\"39.1\" x2=\"243\" y2=\"32.5\" class=\"lp-ico-detail\"/><line x1=\"244.4\" y1=\"81\" x2=\"254.6\" y2=\"83.4\" class=\"lp-ico-detail\"/><line x1=\"217.5\" y1=\"114.7\" x2=\"222.1\" y2=\"124.2\" class=\"lp-ico-detail\"/><line x1=\"174.5\" y1=\"114.7\" x2=\"169.9\" y2=\"124.2\" class=\"lp-ico-detail\"/><line x1=\"147.6\" y1=\"81\" x2=\"137.4\" y2=\"83.4\" class=\"lp-ico-detail\"/><line x1=\"157.2\" y1=\"39.1\" x2=\"149\" y2=\"32.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-bongos",
    "category": "drums",
    "label": "Bongos",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 0.8
    },
    "viewBox": "0 0 150 80",
    "keywords": [
      "bongos",
      "latin"
    ],
    "body": "<circle cx=\"40\" cy=\"40\" r=\"35\"/><circle cx=\"40\" cy=\"40\" r=\"25.9\" class=\"lp-ico-tone\"/><line x1=\"40\" y1=\"12\" x2=\"40\" y2=\"6.1\" class=\"lp-ico-detail\"/><line x1=\"66.6\" y1=\"31.3\" x2=\"72.3\" y2=\"29.5\" class=\"lp-ico-detail\"/><line x1=\"56.5\" y1=\"62.7\" x2=\"60\" y2=\"67.5\" class=\"lp-ico-detail\"/><line x1=\"23.5\" y1=\"62.7\" x2=\"20\" y2=\"67.5\" class=\"lp-ico-detail\"/><line x1=\"13.4\" y1=\"31.3\" x2=\"7.7\" y2=\"29.5\" class=\"lp-ico-detail\"/><circle cx=\"114\" cy=\"40\" r=\"29\"/><circle cx=\"114\" cy=\"40\" r=\"21.5\" class=\"lp-ico-tone\"/><line x1=\"114\" y1=\"16.8\" x2=\"114\" y2=\"11.9\" class=\"lp-ico-detail\"/><line x1=\"136.1\" y1=\"32.8\" x2=\"140.8\" y2=\"31.3\" class=\"lp-ico-detail\"/><line x1=\"127.6\" y1=\"58.8\" x2=\"130.5\" y2=\"62.8\" class=\"lp-ico-detail\"/><line x1=\"100.4\" y1=\"58.8\" x2=\"97.5\" y2=\"62.8\" class=\"lp-ico-detail\"/><line x1=\"91.9\" y1=\"32.8\" x2=\"87.2\" y2=\"31.3\" class=\"lp-ico-detail\"/><line x1=\"75\" y1=\"40\" x2=\"85\" y2=\"40\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-octobans",
    "category": "drums",
    "label": "Octobans",
    "footprint": {
      "width_ft": 2.1,
      "depth_ft": 1.1
    },
    "viewBox": "0 0 210 110",
    "keywords": [
      "octobans",
      "tubes"
    ],
    "body": "<circle cx=\"30\" cy=\"55\" r=\"24\"/><circle cx=\"30\" cy=\"55\" r=\"17.8\" class=\"lp-ico-tone\"/><circle cx=\"80\" cy=\"55\" r=\"24\"/><circle cx=\"80\" cy=\"55\" r=\"17.8\" class=\"lp-ico-tone\"/><circle cx=\"130\" cy=\"55\" r=\"24\"/><circle cx=\"130\" cy=\"55\" r=\"17.8\" class=\"lp-ico-tone\"/><circle cx=\"180\" cy=\"55\" r=\"24\"/><circle cx=\"180\" cy=\"55\" r=\"17.8\" class=\"lp-ico-tone\"/><line x1=\"14\" y1=\"90\" x2=\"196\" y2=\"90\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-spd",
    "category": "drums",
    "label": "Electronic pad (SPD)",
    "footprint": {
      "width_ft": 1.6,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 160 130",
    "keywords": [
      "spd",
      "sample pad",
      "electronic",
      "roland"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"154\" height=\"124\" rx=\"12\"/><rect x=\"12\" y=\"22\" width=\"42\" height=\"38\" rx=\"8\" class=\"lp-ico-tone\"/><rect x=\"59\" y=\"22\" width=\"42\" height=\"38\" rx=\"8\" class=\"lp-ico-tone\"/><rect x=\"106\" y=\"22\" width=\"42\" height=\"38\" rx=\"8\" class=\"lp-ico-tone\"/><rect x=\"12\" y=\"66\" width=\"42\" height=\"38\" rx=\"8\" class=\"lp-ico-tone\"/><rect x=\"59\" y=\"66\" width=\"42\" height=\"38\" rx=\"8\" class=\"lp-ico-tone\"/><rect x=\"106\" y=\"66\" width=\"42\" height=\"38\" rx=\"8\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "drum-tambourine",
    "category": "drums",
    "label": "Tambourine",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 90 90",
    "keywords": [
      "tambourine",
      "percussion"
    ],
    "body": "<circle cx=\"45\" cy=\"45\" r=\"40\"/><circle cx=\"45\" cy=\"45\" r=\"29\" class=\"lp-ico-tone\"/><circle cx=\"78.8\" cy=\"54.1\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"54.1\" cy=\"78.8\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"20.3\" cy=\"69.7\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"11.2\" cy=\"35.9\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"35.9\" cy=\"11.2\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"69.7\" cy=\"20.3\" r=\"3\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-roto",
    "category": "drums",
    "label": "Roto toms",
    "footprint": {
      "width_ft": 2.6,
      "depth_ft": 1.1
    },
    "viewBox": "0 0 260 110",
    "keywords": [
      "roto",
      "toms"
    ],
    "body": "<line x1=\"8\" y1=\"55\" x2=\"252\" y2=\"55\" class=\"lp-ico-detail\"/><circle cx=\"45\" cy=\"55\" r=\"30\"/><circle cx=\"45\" cy=\"55\" r=\"22.2\" class=\"lp-ico-tone\"/><circle cx=\"125\" cy=\"55\" r=\"38\"/><circle cx=\"125\" cy=\"55\" r=\"28.1\" class=\"lp-ico-tone\"/><circle cx=\"212\" cy=\"55\" r=\"46\"/><circle cx=\"212\" cy=\"55\" r=\"34\" class=\"lp-ico-tone\"/>"
  },
];
