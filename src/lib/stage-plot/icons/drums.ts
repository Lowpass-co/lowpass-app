/* ============================================================
   LOWPASS — Stage Plot drums (core kit + RH/LH composites) icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const drumIcons: IconDescriptor[] = [
  {
    "name": "drum-kit-rh",
    "category": "drums",
    "label": "Drum kit · 3 toms (RH)",
    "footprint": {
      "width_ft": 5.25,
      "depth_ft": 4.6
    },
    "viewBox": "0 0 525 460",
    "keywords": [
      "drum kit",
      "drum set",
      "5-piece",
      "right handed"
    ],
    "composite": true,
    "body": "<rect x=\"202\" y=\"12\" width=\"116\" height=\"116\" rx=\"30\"/><rect x=\"224\" y=\"34\" width=\"72\" height=\"72\" rx=\"20\" class=\"lp-ico-tone\"/><g transform=\"translate(155 215)\"><rect x=\"79\" y=\"12\" width=\"32\" height=\"34\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"95\" y1=\"46\" x2=\"95\" y2=\"60\" class=\"lp-ico-detail\"/><circle cx=\"95\" cy=\"70\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"8\" y=\"60\" width=\"174\" height=\"150\" rx=\"16\"/><rect x=\"8\" y=\"112\" width=\"174\" height=\"46\" class=\"lp-ico-tone\"/><line x1=\"26\" y1=\"64\" x2=\"26\" y2=\"206\" class=\"lp-ico-detail\"/><line x1=\"164\" y1=\"64\" x2=\"164\" y2=\"206\" class=\"lp-ico-detail\"/></g><circle cx=\"85\" cy=\"230\" r=\"67\"/><circle cx=\"85\" cy=\"230\" r=\"49.6\" class=\"lp-ico-tone\"/><line x1=\"85\" y1=\"176.4\" x2=\"85\" y2=\"165\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"192.1\" x2=\"131\" y2=\"184\" class=\"lp-ico-detail\"/><line x1=\"138.6\" y1=\"230\" x2=\"150\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"267.9\" x2=\"131\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"283.6\" x2=\"85\" y2=\"295\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"267.9\" x2=\"39\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"31.4\" y1=\"230\" x2=\"20\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"192.1\" x2=\"39\" y2=\"184\" class=\"lp-ico-detail\"/><circle cx=\"195\" cy=\"240\" r=\"52\"/><circle cx=\"195\" cy=\"240\" r=\"38.5\" class=\"lp-ico-tone\"/><line x1=\"195\" y1=\"198.4\" x2=\"195\" y2=\"189.6\" class=\"lp-ico-detail\"/><line x1=\"231\" y1=\"219.2\" x2=\"238.7\" y2=\"214.8\" class=\"lp-ico-detail\"/><line x1=\"231\" y1=\"260.8\" x2=\"238.7\" y2=\"265.2\" class=\"lp-ico-detail\"/><line x1=\"195\" y1=\"281.6\" x2=\"195\" y2=\"290.4\" class=\"lp-ico-detail\"/><line x1=\"159\" y1=\"260.8\" x2=\"151.3\" y2=\"265.2\" class=\"lp-ico-detail\"/><line x1=\"159\" y1=\"219.2\" x2=\"151.3\" y2=\"214.8\" class=\"lp-ico-detail\"/><circle cx=\"315\" cy=\"235\" r=\"45\"/><circle cx=\"315\" cy=\"235\" r=\"33.3\" class=\"lp-ico-tone\"/><line x1=\"315\" y1=\"199\" x2=\"315\" y2=\"191.4\" class=\"lp-ico-detail\"/><line x1=\"349.2\" y1=\"223.9\" x2=\"356.5\" y2=\"221.5\" class=\"lp-ico-detail\"/><line x1=\"336.2\" y1=\"264.1\" x2=\"340.7\" y2=\"270.3\" class=\"lp-ico-detail\"/><line x1=\"293.8\" y1=\"264.1\" x2=\"289.3\" y2=\"270.3\" class=\"lp-ico-detail\"/><line x1=\"280.8\" y1=\"223.9\" x2=\"273.5\" y2=\"221.5\" class=\"lp-ico-detail\"/><circle cx=\"360\" cy=\"160\" r=\"60\"/><circle cx=\"360\" cy=\"160\" r=\"44.4\" class=\"lp-ico-tone\"/><line x1=\"360\" y1=\"112\" x2=\"360\" y2=\"101.8\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"126.1\" x2=\"401.2\" y2=\"118.8\" class=\"lp-ico-detail\"/><line x1=\"408\" y1=\"160\" x2=\"418.2\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"193.9\" x2=\"401.2\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"360\" y1=\"208\" x2=\"360\" y2=\"218.2\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"193.9\" x2=\"318.8\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"312\" y1=\"160\" x2=\"301.8\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"126.1\" x2=\"318.8\" y2=\"118.8\" class=\"lp-ico-detail\"/><ellipse cx=\"460\" cy=\"138\" rx=\"58\" ry=\"47\" transform=\"rotate(-14 460 138)\"/><ellipse cx=\"460\" cy=\"130\" rx=\"45\" ry=\"36\" transform=\"rotate(-14 460 130)\" class=\"lp-ico-tone\"/><circle cx=\"460\" cy=\"130\" r=\"5\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"79\" ry=\"64.8\" transform=\"rotate(-18 90 340)\"/><ellipse cx=\"90\" cy=\"340\" rx=\"52\" ry=\"42.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"30\" ry=\"24.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"340\" r=\"16\" class=\"lp-ico-tone\"/><ellipse cx=\"405\" cy=\"285\" rx=\"70\" ry=\"57.4\" transform=\"rotate(-18 405 285)\"/><ellipse cx=\"405\" cy=\"285\" rx=\"44\" ry=\"36.1\" transform=\"rotate(-18 405 285)\" class=\"lp-ico-detail\"/><circle cx=\"405\" cy=\"285\" r=\"14\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "drum-kit-lh",
    "category": "drums",
    "label": "Drum kit · 3 toms (LH)",
    "footprint": {
      "width_ft": 5.25,
      "depth_ft": 4.6
    },
    "viewBox": "0 0 525 460",
    "keywords": [
      "drum kit",
      "drum set",
      "5-piece",
      "left handed"
    ],
    "composite": true,
    "leftHanded": true,
    "body": "<g transform=\"translate(525 0) scale(-1 1)\"><rect x=\"202\" y=\"12\" width=\"116\" height=\"116\" rx=\"30\"/><rect x=\"224\" y=\"34\" width=\"72\" height=\"72\" rx=\"20\" class=\"lp-ico-tone\"/><g transform=\"translate(155 215)\"><rect x=\"79\" y=\"12\" width=\"32\" height=\"34\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"95\" y1=\"46\" x2=\"95\" y2=\"60\" class=\"lp-ico-detail\"/><circle cx=\"95\" cy=\"70\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"8\" y=\"60\" width=\"174\" height=\"150\" rx=\"16\"/><rect x=\"8\" y=\"112\" width=\"174\" height=\"46\" class=\"lp-ico-tone\"/><line x1=\"26\" y1=\"64\" x2=\"26\" y2=\"206\" class=\"lp-ico-detail\"/><line x1=\"164\" y1=\"64\" x2=\"164\" y2=\"206\" class=\"lp-ico-detail\"/></g><circle cx=\"85\" cy=\"230\" r=\"67\"/><circle cx=\"85\" cy=\"230\" r=\"49.6\" class=\"lp-ico-tone\"/><line x1=\"85\" y1=\"176.4\" x2=\"85\" y2=\"165\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"192.1\" x2=\"131\" y2=\"184\" class=\"lp-ico-detail\"/><line x1=\"138.6\" y1=\"230\" x2=\"150\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"267.9\" x2=\"131\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"283.6\" x2=\"85\" y2=\"295\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"267.9\" x2=\"39\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"31.4\" y1=\"230\" x2=\"20\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"192.1\" x2=\"39\" y2=\"184\" class=\"lp-ico-detail\"/><circle cx=\"195\" cy=\"240\" r=\"52\"/><circle cx=\"195\" cy=\"240\" r=\"38.5\" class=\"lp-ico-tone\"/><line x1=\"195\" y1=\"198.4\" x2=\"195\" y2=\"189.6\" class=\"lp-ico-detail\"/><line x1=\"231\" y1=\"219.2\" x2=\"238.7\" y2=\"214.8\" class=\"lp-ico-detail\"/><line x1=\"231\" y1=\"260.8\" x2=\"238.7\" y2=\"265.2\" class=\"lp-ico-detail\"/><line x1=\"195\" y1=\"281.6\" x2=\"195\" y2=\"290.4\" class=\"lp-ico-detail\"/><line x1=\"159\" y1=\"260.8\" x2=\"151.3\" y2=\"265.2\" class=\"lp-ico-detail\"/><line x1=\"159\" y1=\"219.2\" x2=\"151.3\" y2=\"214.8\" class=\"lp-ico-detail\"/><circle cx=\"315\" cy=\"235\" r=\"45\"/><circle cx=\"315\" cy=\"235\" r=\"33.3\" class=\"lp-ico-tone\"/><line x1=\"315\" y1=\"199\" x2=\"315\" y2=\"191.4\" class=\"lp-ico-detail\"/><line x1=\"349.2\" y1=\"223.9\" x2=\"356.5\" y2=\"221.5\" class=\"lp-ico-detail\"/><line x1=\"336.2\" y1=\"264.1\" x2=\"340.7\" y2=\"270.3\" class=\"lp-ico-detail\"/><line x1=\"293.8\" y1=\"264.1\" x2=\"289.3\" y2=\"270.3\" class=\"lp-ico-detail\"/><line x1=\"280.8\" y1=\"223.9\" x2=\"273.5\" y2=\"221.5\" class=\"lp-ico-detail\"/><circle cx=\"360\" cy=\"160\" r=\"60\"/><circle cx=\"360\" cy=\"160\" r=\"44.4\" class=\"lp-ico-tone\"/><line x1=\"360\" y1=\"112\" x2=\"360\" y2=\"101.8\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"126.1\" x2=\"401.2\" y2=\"118.8\" class=\"lp-ico-detail\"/><line x1=\"408\" y1=\"160\" x2=\"418.2\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"193.9\" x2=\"401.2\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"360\" y1=\"208\" x2=\"360\" y2=\"218.2\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"193.9\" x2=\"318.8\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"312\" y1=\"160\" x2=\"301.8\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"126.1\" x2=\"318.8\" y2=\"118.8\" class=\"lp-ico-detail\"/><ellipse cx=\"460\" cy=\"138\" rx=\"58\" ry=\"47\" transform=\"rotate(-14 460 138)\"/><ellipse cx=\"460\" cy=\"130\" rx=\"45\" ry=\"36\" transform=\"rotate(-14 460 130)\" class=\"lp-ico-tone\"/><circle cx=\"460\" cy=\"130\" r=\"5\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"79\" ry=\"64.8\" transform=\"rotate(-18 90 340)\"/><ellipse cx=\"90\" cy=\"340\" rx=\"52\" ry=\"42.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"30\" ry=\"24.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"340\" r=\"16\" class=\"lp-ico-tone\"/><ellipse cx=\"405\" cy=\"285\" rx=\"70\" ry=\"57.4\" transform=\"rotate(-18 405 285)\"/><ellipse cx=\"405\" cy=\"285\" rx=\"44\" ry=\"36.1\" transform=\"rotate(-18 405 285)\" class=\"lp-ico-detail\"/><circle cx=\"405\" cy=\"285\" r=\"14\" class=\"lp-ico-tone\"/></g>"
  },
  {
    "name": "drum-kit-2tom-rh",
    "category": "drums",
    "label": "Drum kit · 2 toms (RH)",
    "footprint": {
      "width_ft": 5.25,
      "depth_ft": 4.6
    },
    "viewBox": "0 0 525 460",
    "keywords": [
      "drum kit",
      "drum set",
      "4-piece",
      "right handed"
    ],
    "composite": true,
    "body": "<rect x=\"202\" y=\"12\" width=\"116\" height=\"116\" rx=\"30\"/><rect x=\"224\" y=\"34\" width=\"72\" height=\"72\" rx=\"20\" class=\"lp-ico-tone\"/><g transform=\"translate(155 215)\"><rect x=\"79\" y=\"12\" width=\"32\" height=\"34\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"95\" y1=\"46\" x2=\"95\" y2=\"60\" class=\"lp-ico-detail\"/><circle cx=\"95\" cy=\"70\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"8\" y=\"60\" width=\"174\" height=\"150\" rx=\"16\"/><rect x=\"8\" y=\"112\" width=\"174\" height=\"46\" class=\"lp-ico-tone\"/><line x1=\"26\" y1=\"64\" x2=\"26\" y2=\"206\" class=\"lp-ico-detail\"/><line x1=\"164\" y1=\"64\" x2=\"164\" y2=\"206\" class=\"lp-ico-detail\"/></g><circle cx=\"85\" cy=\"230\" r=\"67\"/><circle cx=\"85\" cy=\"230\" r=\"49.6\" class=\"lp-ico-tone\"/><line x1=\"85\" y1=\"176.4\" x2=\"85\" y2=\"165\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"192.1\" x2=\"131\" y2=\"184\" class=\"lp-ico-detail\"/><line x1=\"138.6\" y1=\"230\" x2=\"150\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"267.9\" x2=\"131\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"283.6\" x2=\"85\" y2=\"295\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"267.9\" x2=\"39\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"31.4\" y1=\"230\" x2=\"20\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"192.1\" x2=\"39\" y2=\"184\" class=\"lp-ico-detail\"/><circle cx=\"250\" cy=\"232\" r=\"49\"/><circle cx=\"250\" cy=\"232\" r=\"36.3\" class=\"lp-ico-tone\"/><line x1=\"250\" y1=\"192.8\" x2=\"250\" y2=\"184.5\" class=\"lp-ico-detail\"/><line x1=\"283.9\" y1=\"212.4\" x2=\"291.2\" y2=\"208.2\" class=\"lp-ico-detail\"/><line x1=\"283.9\" y1=\"251.6\" x2=\"291.2\" y2=\"255.8\" class=\"lp-ico-detail\"/><line x1=\"250\" y1=\"271.2\" x2=\"250\" y2=\"279.5\" class=\"lp-ico-detail\"/><line x1=\"216.1\" y1=\"251.6\" x2=\"208.8\" y2=\"255.8\" class=\"lp-ico-detail\"/><line x1=\"216.1\" y1=\"212.4\" x2=\"208.8\" y2=\"208.2\" class=\"lp-ico-detail\"/><circle cx=\"360\" cy=\"160\" r=\"60\"/><circle cx=\"360\" cy=\"160\" r=\"44.4\" class=\"lp-ico-tone\"/><line x1=\"360\" y1=\"112\" x2=\"360\" y2=\"101.8\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"126.1\" x2=\"401.2\" y2=\"118.8\" class=\"lp-ico-detail\"/><line x1=\"408\" y1=\"160\" x2=\"418.2\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"193.9\" x2=\"401.2\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"360\" y1=\"208\" x2=\"360\" y2=\"218.2\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"193.9\" x2=\"318.8\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"312\" y1=\"160\" x2=\"301.8\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"126.1\" x2=\"318.8\" y2=\"118.8\" class=\"lp-ico-detail\"/><ellipse cx=\"460\" cy=\"138\" rx=\"58\" ry=\"47\" transform=\"rotate(-14 460 138)\"/><ellipse cx=\"460\" cy=\"130\" rx=\"45\" ry=\"36\" transform=\"rotate(-14 460 130)\" class=\"lp-ico-tone\"/><circle cx=\"460\" cy=\"130\" r=\"5\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"79\" ry=\"64.8\" transform=\"rotate(-18 90 340)\"/><ellipse cx=\"90\" cy=\"340\" rx=\"52\" ry=\"42.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"30\" ry=\"24.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"340\" r=\"16\" class=\"lp-ico-tone\"/><ellipse cx=\"405\" cy=\"285\" rx=\"70\" ry=\"57.4\" transform=\"rotate(-18 405 285)\"/><ellipse cx=\"405\" cy=\"285\" rx=\"44\" ry=\"36.1\" transform=\"rotate(-18 405 285)\" class=\"lp-ico-detail\"/><circle cx=\"405\" cy=\"285\" r=\"14\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "drum-kit-2tom-lh",
    "category": "drums",
    "label": "Drum kit · 2 toms (LH)",
    "footprint": {
      "width_ft": 5.25,
      "depth_ft": 4.6
    },
    "viewBox": "0 0 525 460",
    "keywords": [
      "drum kit",
      "drum set",
      "4-piece",
      "left handed"
    ],
    "composite": true,
    "leftHanded": true,
    "body": "<g transform=\"translate(525 0) scale(-1 1)\"><rect x=\"202\" y=\"12\" width=\"116\" height=\"116\" rx=\"30\"/><rect x=\"224\" y=\"34\" width=\"72\" height=\"72\" rx=\"20\" class=\"lp-ico-tone\"/><g transform=\"translate(155 215)\"><rect x=\"79\" y=\"12\" width=\"32\" height=\"34\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"95\" y1=\"46\" x2=\"95\" y2=\"60\" class=\"lp-ico-detail\"/><circle cx=\"95\" cy=\"70\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"8\" y=\"60\" width=\"174\" height=\"150\" rx=\"16\"/><rect x=\"8\" y=\"112\" width=\"174\" height=\"46\" class=\"lp-ico-tone\"/><line x1=\"26\" y1=\"64\" x2=\"26\" y2=\"206\" class=\"lp-ico-detail\"/><line x1=\"164\" y1=\"64\" x2=\"164\" y2=\"206\" class=\"lp-ico-detail\"/></g><circle cx=\"85\" cy=\"230\" r=\"67\"/><circle cx=\"85\" cy=\"230\" r=\"49.6\" class=\"lp-ico-tone\"/><line x1=\"85\" y1=\"176.4\" x2=\"85\" y2=\"165\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"192.1\" x2=\"131\" y2=\"184\" class=\"lp-ico-detail\"/><line x1=\"138.6\" y1=\"230\" x2=\"150\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"122.9\" y1=\"267.9\" x2=\"131\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"85\" y1=\"283.6\" x2=\"85\" y2=\"295\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"267.9\" x2=\"39\" y2=\"276\" class=\"lp-ico-detail\"/><line x1=\"31.4\" y1=\"230\" x2=\"20\" y2=\"230\" class=\"lp-ico-detail\"/><line x1=\"47.1\" y1=\"192.1\" x2=\"39\" y2=\"184\" class=\"lp-ico-detail\"/><circle cx=\"250\" cy=\"232\" r=\"49\"/><circle cx=\"250\" cy=\"232\" r=\"36.3\" class=\"lp-ico-tone\"/><line x1=\"250\" y1=\"192.8\" x2=\"250\" y2=\"184.5\" class=\"lp-ico-detail\"/><line x1=\"283.9\" y1=\"212.4\" x2=\"291.2\" y2=\"208.2\" class=\"lp-ico-detail\"/><line x1=\"283.9\" y1=\"251.6\" x2=\"291.2\" y2=\"255.8\" class=\"lp-ico-detail\"/><line x1=\"250\" y1=\"271.2\" x2=\"250\" y2=\"279.5\" class=\"lp-ico-detail\"/><line x1=\"216.1\" y1=\"251.6\" x2=\"208.8\" y2=\"255.8\" class=\"lp-ico-detail\"/><line x1=\"216.1\" y1=\"212.4\" x2=\"208.8\" y2=\"208.2\" class=\"lp-ico-detail\"/><circle cx=\"360\" cy=\"160\" r=\"60\"/><circle cx=\"360\" cy=\"160\" r=\"44.4\" class=\"lp-ico-tone\"/><line x1=\"360\" y1=\"112\" x2=\"360\" y2=\"101.8\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"126.1\" x2=\"401.2\" y2=\"118.8\" class=\"lp-ico-detail\"/><line x1=\"408\" y1=\"160\" x2=\"418.2\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"393.9\" y1=\"193.9\" x2=\"401.2\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"360\" y1=\"208\" x2=\"360\" y2=\"218.2\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"193.9\" x2=\"318.8\" y2=\"201.2\" class=\"lp-ico-detail\"/><line x1=\"312\" y1=\"160\" x2=\"301.8\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"326.1\" y1=\"126.1\" x2=\"318.8\" y2=\"118.8\" class=\"lp-ico-detail\"/><ellipse cx=\"460\" cy=\"138\" rx=\"58\" ry=\"47\" transform=\"rotate(-14 460 138)\"/><ellipse cx=\"460\" cy=\"130\" rx=\"45\" ry=\"36\" transform=\"rotate(-14 460 130)\" class=\"lp-ico-tone\"/><circle cx=\"460\" cy=\"130\" r=\"5\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"79\" ry=\"64.8\" transform=\"rotate(-18 90 340)\"/><ellipse cx=\"90\" cy=\"340\" rx=\"52\" ry=\"42.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><ellipse cx=\"90\" cy=\"340\" rx=\"30\" ry=\"24.6\" transform=\"rotate(-18 90 340)\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"340\" r=\"16\" class=\"lp-ico-tone\"/><ellipse cx=\"405\" cy=\"285\" rx=\"70\" ry=\"57.4\" transform=\"rotate(-18 405 285)\"/><ellipse cx=\"405\" cy=\"285\" rx=\"44\" ry=\"36.1\" transform=\"rotate(-18 405 285)\" class=\"lp-ico-detail\"/><circle cx=\"405\" cy=\"285\" r=\"14\" class=\"lp-ico-tone\"/></g>"
  },
  {
    "name": "drum-kick",
    "category": "drums",
    "label": "Kick",
    "footprint": {
      "width_ft": 1.9,
      "depth_ft": 2.4
    },
    "viewBox": "0 0 190 240",
    "keywords": [
      "bass drum",
      "kick",
      "bd",
      "22"
    ],
    "body": "<rect x=\"79\" y=\"12\" width=\"32\" height=\"34\" rx=\"5\" class=\"lp-ico-tone\"/><line x1=\"95\" y1=\"46\" x2=\"95\" y2=\"60\" class=\"lp-ico-detail\"/><circle cx=\"95\" cy=\"70\" r=\"7\" class=\"lp-ico-detail\"/><rect x=\"8\" y=\"60\" width=\"174\" height=\"150\" rx=\"16\"/><rect x=\"8\" y=\"112\" width=\"174\" height=\"46\" class=\"lp-ico-tone\"/><line x1=\"26\" y1=\"64\" x2=\"26\" y2=\"206\" class=\"lp-ico-detail\"/><line x1=\"164\" y1=\"64\" x2=\"164\" y2=\"206\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-snare",
    "category": "drums",
    "label": "Snare",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 120 120",
    "keywords": [
      "snare",
      "14"
    ],
    "body": "<circle cx=\"60\" cy=\"60\" r=\"54\"/><circle cx=\"60\" cy=\"60\" r=\"40\" class=\"lp-ico-tone\"/><line x1=\"60\" y1=\"16.8\" x2=\"60\" y2=\"7.6\" class=\"lp-ico-detail\"/><line x1=\"90.5\" y1=\"29.5\" x2=\"97\" y2=\"23\" class=\"lp-ico-detail\"/><line x1=\"103.2\" y1=\"60\" x2=\"112.4\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"90.5\" y1=\"90.5\" x2=\"97\" y2=\"97\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"103.2\" x2=\"60\" y2=\"112.4\" class=\"lp-ico-detail\"/><line x1=\"29.5\" y1=\"90.5\" x2=\"23\" y2=\"97\" class=\"lp-ico-detail\"/><line x1=\"16.8\" y1=\"60\" x2=\"7.6\" y2=\"60\" class=\"lp-ico-detail\"/><line x1=\"29.5\" y1=\"29.5\" x2=\"23\" y2=\"23\" class=\"lp-ico-detail\"/><line x1=\"4\" y1=\"60\" x2=\"14\" y2=\"60\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-crash",
    "category": "drums",
    "label": "Crash cymbal",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 140 140",
    "keywords": [
      "crash",
      "cymbal",
      "16"
    ],
    "body": "<ellipse cx=\"70\" cy=\"70\" rx=\"64\" ry=\"52.5\" transform=\"rotate(-18 70 70)\"/><ellipse cx=\"70\" cy=\"70\" rx=\"40\" ry=\"32.8\" transform=\"rotate(-18 70 70)\" class=\"lp-ico-detail\"/><circle cx=\"70\" cy=\"70\" r=\"13\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "drum-tom-hi",
    "category": "drums",
    "label": "Rack tom (high)",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 90 90",
    "keywords": [
      "tom",
      "rack",
      "10"
    ],
    "body": "<circle cx=\"45\" cy=\"45\" r=\"40\"/><circle cx=\"45\" cy=\"45\" r=\"29.6\" class=\"lp-ico-tone\"/><line x1=\"45\" y1=\"13\" x2=\"45\" y2=\"6.2\" class=\"lp-ico-detail\"/><line x1=\"75.4\" y1=\"35.1\" x2=\"81.9\" y2=\"33\" class=\"lp-ico-detail\"/><line x1=\"63.8\" y1=\"70.9\" x2=\"67.8\" y2=\"76.4\" class=\"lp-ico-detail\"/><line x1=\"26.2\" y1=\"70.9\" x2=\"22.2\" y2=\"76.4\" class=\"lp-ico-detail\"/><line x1=\"14.6\" y1=\"35.1\" x2=\"8.1\" y2=\"33\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-tom-mid",
    "category": "drums",
    "label": "Rack tom (mid)",
    "footprint": {
      "width_ft": 1.05,
      "depth_ft": 1.05
    },
    "viewBox": "0 0 105 105",
    "keywords": [
      "tom",
      "rack",
      "12"
    ],
    "body": "<circle cx=\"52.5\" cy=\"52.5\" r=\"47\"/><circle cx=\"52.5\" cy=\"52.5\" r=\"34.8\" class=\"lp-ico-tone\"/><line x1=\"52.5\" y1=\"14.9\" x2=\"52.5\" y2=\"6.9\" class=\"lp-ico-detail\"/><line x1=\"85.1\" y1=\"33.7\" x2=\"92\" y2=\"29.7\" class=\"lp-ico-detail\"/><line x1=\"85.1\" y1=\"71.3\" x2=\"92\" y2=\"75.3\" class=\"lp-ico-detail\"/><line x1=\"52.5\" y1=\"90.1\" x2=\"52.5\" y2=\"98.1\" class=\"lp-ico-detail\"/><line x1=\"19.9\" y1=\"71.3\" x2=\"13\" y2=\"75.3\" class=\"lp-ico-detail\"/><line x1=\"19.9\" y1=\"33.7\" x2=\"13\" y2=\"29.7\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-tom-floor",
    "category": "drums",
    "label": "Floor tom",
    "footprint": {
      "width_ft": 1.35,
      "depth_ft": 1.35
    },
    "viewBox": "0 0 135 135",
    "keywords": [
      "tom",
      "floor",
      "16"
    ],
    "body": "<circle cx=\"67.5\" cy=\"67.5\" r=\"60\"/><circle cx=\"67.5\" cy=\"67.5\" r=\"44.4\" class=\"lp-ico-tone\"/><line x1=\"67.5\" y1=\"19.5\" x2=\"67.5\" y2=\"9.3\" class=\"lp-ico-detail\"/><line x1=\"101.4\" y1=\"33.6\" x2=\"108.7\" y2=\"26.3\" class=\"lp-ico-detail\"/><line x1=\"115.5\" y1=\"67.5\" x2=\"125.7\" y2=\"67.5\" class=\"lp-ico-detail\"/><line x1=\"101.4\" y1=\"101.4\" x2=\"108.7\" y2=\"108.7\" class=\"lp-ico-detail\"/><line x1=\"67.5\" y1=\"115.5\" x2=\"67.5\" y2=\"125.7\" class=\"lp-ico-detail\"/><line x1=\"33.6\" y1=\"101.4\" x2=\"26.3\" y2=\"108.7\" class=\"lp-ico-detail\"/><line x1=\"19.5\" y1=\"67.5\" x2=\"9.3\" y2=\"67.5\" class=\"lp-ico-detail\"/><line x1=\"33.6\" y1=\"33.6\" x2=\"26.3\" y2=\"26.3\" class=\"lp-ico-detail\"/><line x1=\"67.5\" y1=\"6.5\" x2=\"67.5\" y2=\"1\" class=\"lp-ico-detail\"/><line x1=\"120.3\" y1=\"98\" x2=\"125.1\" y2=\"100.8\" class=\"lp-ico-detail\"/><line x1=\"14.7\" y1=\"98\" x2=\"9.9\" y2=\"100.8\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-hihat",
    "category": "drums",
    "label": "Hi-hat",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 130 130",
    "keywords": [
      "hihat",
      "hats",
      "14"
    ],
    "body": "<ellipse cx=\"65\" cy=\"69\" rx=\"58\" ry=\"47\" transform=\"rotate(-14 65 69)\"/><ellipse cx=\"65\" cy=\"60\" rx=\"45\" ry=\"36\" transform=\"rotate(-14 65 60)\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"60\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-ride",
    "category": "drums",
    "label": "Ride cymbal",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 1.7
    },
    "viewBox": "0 0 170 170",
    "keywords": [
      "ride",
      "cymbal",
      "20"
    ],
    "body": "<ellipse cx=\"85\" cy=\"85\" rx=\"79\" ry=\"64.8\" transform=\"rotate(-18 85 85)\"/><ellipse cx=\"85\" cy=\"85\" rx=\"52\" ry=\"42.6\" transform=\"rotate(-18 85 85)\" class=\"lp-ico-detail\"/><ellipse cx=\"85\" cy=\"85\" rx=\"30\" ry=\"24.6\" transform=\"rotate(-18 85 85)\" class=\"lp-ico-detail\"/><circle cx=\"85\" cy=\"85\" r=\"16\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "drum-china",
    "category": "drums",
    "label": "China cymbal",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 1.5
    },
    "viewBox": "0 0 150 150",
    "keywords": [
      "china",
      "cymbal",
      "18"
    ],
    "body": "<ellipse cx=\"75\" cy=\"75\" rx=\"69\" ry=\"56.6\" transform=\"rotate(-18 75 75)\"/><ellipse cx=\"75\" cy=\"75\" rx=\"46\" ry=\"37.7\" transform=\"rotate(-18 75 75)\" class=\"lp-ico-detail\"/><circle cx=\"75\" cy=\"75\" r=\"14\" class=\"lp-ico-tone\"/><ellipse cx=\"75\" cy=\"75\" rx=\"58\" ry=\"47.6\" transform=\"rotate(-18 75 75)\" stroke-dasharray=\"8 8\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-splash",
    "category": "drums",
    "label": "Splash cymbal",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 90 90",
    "keywords": [
      "splash",
      "cymbal",
      "10"
    ],
    "body": "<ellipse cx=\"45\" cy=\"45\" rx=\"40\" ry=\"32.8\" transform=\"rotate(-18 45 45)\"/><circle cx=\"45\" cy=\"45\" r=\"10\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "drum-cowbell",
    "category": "drums",
    "label": "Cowbell",
    "footprint": {
      "width_ft": 0.7,
      "depth_ft": 0.5
    },
    "viewBox": "0 0 70 50",
    "keywords": [
      "cowbell",
      "percussion"
    ],
    "body": "<path d=\"M16 4 L54 4 L66 46 L4 46 Z\"/><line x1=\"35\" y1=\"4\" x2=\"35\" y2=\"13\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "drum-throne",
    "category": "drums",
    "label": "Drum throne (stool)",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 130 130",
    "keywords": [
      "throne",
      "seat",
      "stool"
    ],
    "body": "<rect x=\"7\" y=\"7\" width=\"116\" height=\"116\" rx=\"30\"/><rect x=\"29\" y=\"29\" width=\"72\" height=\"72\" rx=\"20\" class=\"lp-ico-tone\"/>"
  },
];
