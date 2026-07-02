/* ============================================================
   LOWPASS — Stage Plot keyboards icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const keyIcons: IconDescriptor[] = [
  {
    "name": "keys-grand-piano",
    "category": "keys",
    "label": "Grand",
    "footprint": {
      "width_ft": 5,
      "depth_ft": 6
    },
    "viewBox": "0 0 500 600",
    "keywords": [
      "piano",
      "grand",
      "acoustic",
      "concert"
    ],
    "body": "<path d=\"M28 20 L300 20 Q480 24 480 300 Q480 576 260 576 L28 576 Z\"/><rect x=\"28\" y=\"40\" width=\"26\" height=\"516\" class=\"lp-ico-tone\"/><line x1=\"28\" y1=\"72\" x2=\"54\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"104\" x2=\"54\" y2=\"104\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"136\" x2=\"54\" y2=\"136\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"168\" x2=\"54\" y2=\"168\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"200\" x2=\"54\" y2=\"200\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"232\" x2=\"54\" y2=\"232\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"264\" x2=\"54\" y2=\"264\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"296\" x2=\"54\" y2=\"296\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"328\" x2=\"54\" y2=\"328\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"360\" x2=\"54\" y2=\"360\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"392\" x2=\"54\" y2=\"392\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"424\" x2=\"54\" y2=\"424\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"456\" x2=\"54\" y2=\"456\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"488\" x2=\"54\" y2=\"488\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"520\" x2=\"54\" y2=\"520\" class=\"lp-ico-detail\"/><line x1=\"28\" y1=\"552\" x2=\"54\" y2=\"552\" class=\"lp-ico-detail\"/><path d=\"M74 44 Q452 50 452 300 Q452 548 250 550\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-upright-piano",
    "category": "keys",
    "label": "Upright",
    "footprint": {
      "width_ft": 4.9,
      "depth_ft": 2
    },
    "viewBox": "0 0 490 200",
    "keywords": [
      "piano",
      "upright",
      "acoustic"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"484\" height=\"130\" rx=\"8\"/><rect x=\"3\" y=\"133\" width=\"24\" height=\"62\" rx=\"4\"/><rect x=\"463\" y=\"133\" width=\"24\" height=\"62\" rx=\"4\"/><rect x=\"27\" y=\"133\" width=\"436\" height=\"42\" class=\"lp-ico-tone\"/><line x1=\"45\" y1=\"133\" x2=\"45\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"63\" y1=\"133\" x2=\"63\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"81\" y1=\"133\" x2=\"81\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"99\" y1=\"133\" x2=\"99\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"117\" y1=\"133\" x2=\"117\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"135\" y1=\"133\" x2=\"135\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"153\" y1=\"133\" x2=\"153\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"171\" y1=\"133\" x2=\"171\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"189\" y1=\"133\" x2=\"189\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"207\" y1=\"133\" x2=\"207\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"225\" y1=\"133\" x2=\"225\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"243\" y1=\"133\" x2=\"243\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"261\" y1=\"133\" x2=\"261\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"279\" y1=\"133\" x2=\"279\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"297\" y1=\"133\" x2=\"297\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"315\" y1=\"133\" x2=\"315\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"333\" y1=\"133\" x2=\"333\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"351\" y1=\"133\" x2=\"351\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"369\" y1=\"133\" x2=\"369\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"387\" y1=\"133\" x2=\"387\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"405\" y1=\"133\" x2=\"405\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"423\" y1=\"133\" x2=\"423\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"441\" y1=\"133\" x2=\"441\" y2=\"175\" class=\"lp-ico-detail\"/><line x1=\"459\" y1=\"133\" x2=\"459\" y2=\"175\" class=\"lp-ico-detail\"/><circle cx=\"215\" cy=\"188\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"245\" cy=\"188\" r=\"6\" class=\"lp-ico-detail\"/><circle cx=\"275\" cy=\"188\" r=\"6\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-stage-88",
    "category": "keys",
    "label": "Stage piano (88)",
    "footprint": {
      "width_ft": 4.4,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 440 120",
    "keywords": [
      "stage piano",
      "88",
      "weighted",
      "nord",
      "digital"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"434\" height=\"114\" rx=\"8\"/><rect x=\"20\" y=\"58\" width=\"400\" height=\"54\" class=\"lp-ico-tone\"/><line x1=\"35.4\" y1=\"58\" x2=\"35.4\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"50.8\" y1=\"58\" x2=\"50.8\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"66.2\" y1=\"58\" x2=\"66.2\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"81.6\" y1=\"58\" x2=\"81.6\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"97\" y1=\"58\" x2=\"97\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"112.4\" y1=\"58\" x2=\"112.4\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"127.8\" y1=\"58\" x2=\"127.8\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"143.2\" y1=\"58\" x2=\"143.2\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"158.6\" y1=\"58\" x2=\"158.6\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"174\" y1=\"58\" x2=\"174\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"189.4\" y1=\"58\" x2=\"189.4\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"204.8\" y1=\"58\" x2=\"204.8\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"220.2\" y1=\"58\" x2=\"220.2\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"235.6\" y1=\"58\" x2=\"235.6\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"251\" y1=\"58\" x2=\"251\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"266.4\" y1=\"58\" x2=\"266.4\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"281.8\" y1=\"58\" x2=\"281.8\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"297.2\" y1=\"58\" x2=\"297.2\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"312.6\" y1=\"58\" x2=\"312.6\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"328\" y1=\"58\" x2=\"328\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"343.4\" y1=\"58\" x2=\"343.4\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"358.8\" y1=\"58\" x2=\"358.8\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"374.2\" y1=\"58\" x2=\"374.2\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"389.6\" y1=\"58\" x2=\"389.6\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"405\" y1=\"58\" x2=\"405\" y2=\"112\" class=\"lp-ico-detail\"/><circle cx=\"40\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"64\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"88\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"112\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"136\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"160\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><rect x=\"330\" y=\"16\" width=\"84\" height=\"26\" rx=\"5\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "keys-synth-61",
    "category": "keys",
    "label": "Synth (61)",
    "footprint": {
      "width_ft": 3.4,
      "depth_ft": 1.1
    },
    "viewBox": "0 0 340 110",
    "keywords": [
      "synth",
      "61",
      "synthesizer"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"334\" height=\"104\" rx=\"8\"/><rect x=\"18\" y=\"52\" width=\"304\" height=\"50\" class=\"lp-ico-tone\"/><line x1=\"32.9\" y1=\"52\" x2=\"32.9\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"47.8\" y1=\"52\" x2=\"47.8\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"62.7\" y1=\"52\" x2=\"62.7\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"77.6\" y1=\"52\" x2=\"77.6\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"92.5\" y1=\"52\" x2=\"92.5\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"107.4\" y1=\"52\" x2=\"107.4\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"122.3\" y1=\"52\" x2=\"122.3\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"137.2\" y1=\"52\" x2=\"137.2\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"152.1\" y1=\"52\" x2=\"152.1\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"167\" y1=\"52\" x2=\"167\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"181.9\" y1=\"52\" x2=\"181.9\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"196.8\" y1=\"52\" x2=\"196.8\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"211.7\" y1=\"52\" x2=\"211.7\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"226.6\" y1=\"52\" x2=\"226.6\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"241.5\" y1=\"52\" x2=\"241.5\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"256.4\" y1=\"52\" x2=\"256.4\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"271.3\" y1=\"52\" x2=\"271.3\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"286.2\" y1=\"52\" x2=\"286.2\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"301.1\" y1=\"52\" x2=\"301.1\" y2=\"102\" class=\"lp-ico-detail\"/><line x1=\"316\" y1=\"52\" x2=\"316\" y2=\"102\" class=\"lp-ico-detail\"/><circle cx=\"32\" cy=\"28\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"54\" cy=\"28\" r=\"9\" class=\"lp-ico-tone\"/><circle cx=\"150\" cy=\"28\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"182\" cy=\"28\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"214\" cy=\"28\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"246\" cy=\"28\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"278\" cy=\"28\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"310\" cy=\"28\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-synth-49",
    "category": "keys",
    "label": "Synth (49)",
    "footprint": {
      "width_ft": 2.8,
      "depth_ft": 1
    },
    "viewBox": "0 0 280 100",
    "keywords": [
      "synth",
      "49",
      "synthesizer"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"274\" height=\"94\" rx=\"8\"/><rect x=\"16\" y=\"48\" width=\"248\" height=\"44\" class=\"lp-ico-tone\"/><line x1=\"30.5\" y1=\"48\" x2=\"30.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"45\" y1=\"48\" x2=\"45\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"59.5\" y1=\"48\" x2=\"59.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"74\" y1=\"48\" x2=\"74\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"88.5\" y1=\"48\" x2=\"88.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"103\" y1=\"48\" x2=\"103\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"117.5\" y1=\"48\" x2=\"117.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"132\" y1=\"48\" x2=\"132\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"146.5\" y1=\"48\" x2=\"146.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"161\" y1=\"48\" x2=\"161\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"175.5\" y1=\"48\" x2=\"175.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"190\" y1=\"48\" x2=\"190\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"204.5\" y1=\"48\" x2=\"204.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"219\" y1=\"48\" x2=\"219\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"233.5\" y1=\"48\" x2=\"233.5\" y2=\"92\" class=\"lp-ico-detail\"/><line x1=\"248\" y1=\"48\" x2=\"248\" y2=\"92\" class=\"lp-ico-detail\"/><circle cx=\"120\" cy=\"26\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"152\" cy=\"26\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"184\" cy=\"26\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"216\" cy=\"26\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"248\" cy=\"26\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-synth-25",
    "category": "keys",
    "label": "Synth (25)",
    "footprint": {
      "width_ft": 1.7,
      "depth_ft": 0.9
    },
    "viewBox": "0 0 170 90",
    "keywords": [
      "synth",
      "25",
      "mini"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"164\" height=\"84\" rx=\"8\"/><rect x=\"12\" y=\"42\" width=\"146\" height=\"42\" class=\"lp-ico-tone\"/><line x1=\"26\" y1=\"42\" x2=\"26\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"42\" x2=\"40\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"54\" y1=\"42\" x2=\"54\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"68\" y1=\"42\" x2=\"68\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"82\" y1=\"42\" x2=\"82\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"96\" y1=\"42\" x2=\"96\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"110\" y1=\"42\" x2=\"110\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"124\" y1=\"42\" x2=\"124\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"138\" y1=\"42\" x2=\"138\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"152\" y1=\"42\" x2=\"152\" y2=\"84\" class=\"lp-ico-detail\"/><circle cx=\"28\" cy=\"24\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"52\" cy=\"24\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"76\" cy=\"24\" r=\"5\" class=\"lp-ico-detail\"/><rect x=\"106\" y=\"13\" width=\"20\" height=\"20\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"132\" y=\"13\" width=\"20\" height=\"20\" rx=\"4\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "keys-organ-hammond",
    "category": "keys",
    "label": "Hammond",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 2.2
    },
    "viewBox": "0 0 400 220",
    "keywords": [
      "hammond",
      "organ",
      "b3"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"394\" height=\"214\" rx=\"8\"/><rect x=\"30\" y=\"96\" width=\"340\" height=\"36\" class=\"lp-ico-tone\"/><line x1=\"44.8\" y1=\"96\" x2=\"44.8\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"59.6\" y1=\"96\" x2=\"59.6\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"74.4\" y1=\"96\" x2=\"74.4\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"89.2\" y1=\"96\" x2=\"89.2\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"104\" y1=\"96\" x2=\"104\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"118.8\" y1=\"96\" x2=\"118.8\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"133.6\" y1=\"96\" x2=\"133.6\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"148.4\" y1=\"96\" x2=\"148.4\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"163.2\" y1=\"96\" x2=\"163.2\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"178\" y1=\"96\" x2=\"178\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"192.8\" y1=\"96\" x2=\"192.8\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"207.6\" y1=\"96\" x2=\"207.6\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"222.4\" y1=\"96\" x2=\"222.4\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"237.2\" y1=\"96\" x2=\"237.2\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"252\" y1=\"96\" x2=\"252\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"266.8\" y1=\"96\" x2=\"266.8\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"281.6\" y1=\"96\" x2=\"281.6\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"296.4\" y1=\"96\" x2=\"296.4\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"311.2\" y1=\"96\" x2=\"311.2\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"326\" y1=\"96\" x2=\"326\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"340.8\" y1=\"96\" x2=\"340.8\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"355.6\" y1=\"96\" x2=\"355.6\" y2=\"132\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"140\" width=\"340\" height=\"36\" class=\"lp-ico-tone\"/><line x1=\"44.8\" y1=\"140\" x2=\"44.8\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"59.6\" y1=\"140\" x2=\"59.6\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"74.4\" y1=\"140\" x2=\"74.4\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"89.2\" y1=\"140\" x2=\"89.2\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"104\" y1=\"140\" x2=\"104\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"118.8\" y1=\"140\" x2=\"118.8\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"133.6\" y1=\"140\" x2=\"133.6\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"148.4\" y1=\"140\" x2=\"148.4\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"163.2\" y1=\"140\" x2=\"163.2\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"178\" y1=\"140\" x2=\"178\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"192.8\" y1=\"140\" x2=\"192.8\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"207.6\" y1=\"140\" x2=\"207.6\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"222.4\" y1=\"140\" x2=\"222.4\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"237.2\" y1=\"140\" x2=\"237.2\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"252\" y1=\"140\" x2=\"252\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"266.8\" y1=\"140\" x2=\"266.8\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"281.6\" y1=\"140\" x2=\"281.6\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"296.4\" y1=\"140\" x2=\"296.4\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"311.2\" y1=\"140\" x2=\"311.2\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"326\" y1=\"140\" x2=\"326\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"340.8\" y1=\"140\" x2=\"340.8\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"355.6\" y1=\"140\" x2=\"355.6\" y2=\"176\" class=\"lp-ico-detail\"/><line x1=\"252\" y1=\"34\" x2=\"252\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"262\" y1=\"34\" x2=\"262\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"272\" y1=\"34\" x2=\"272\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"282\" y1=\"34\" x2=\"282\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"292\" y1=\"34\" x2=\"292\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"302\" y1=\"34\" x2=\"302\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"312\" y1=\"34\" x2=\"312\" y2=\"66\" class=\"lp-ico-detail\"/><line x1=\"322\" y1=\"34\" x2=\"322\" y2=\"66\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-leslie",
    "category": "keys",
    "label": "Leslie",
    "footprint": {
      "width_ft": 2.4,
      "depth_ft": 1.9
    },
    "viewBox": "0 0 240 190",
    "keywords": [
      "leslie",
      "rotary",
      "speaker"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"234\" height=\"184\" rx=\"14\"/><circle cx=\"120\" cy=\"95\" r=\"62\" class=\"lp-ico-tone\"/><line x1=\"66\" y1=\"65\" x2=\"174\" y2=\"65\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"95\" x2=\"182\" y2=\"95\" class=\"lp-ico-detail\"/><line x1=\"66\" y1=\"125\" x2=\"174\" y2=\"125\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-workstation",
    "category": "keys",
    "label": "Workstation",
    "footprint": {
      "width_ft": 4,
      "depth_ft": 1.3
    },
    "viewBox": "0 0 400 130",
    "keywords": [
      "workstation",
      "kronos",
      "montage"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"394\" height=\"124\" rx=\"8\"/><rect x=\"20\" y=\"66\" width=\"360\" height=\"54\" class=\"lp-ico-tone\"/><line x1=\"35\" y1=\"66\" x2=\"35\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"50\" y1=\"66\" x2=\"50\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"65\" y1=\"66\" x2=\"65\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"80\" y1=\"66\" x2=\"80\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"95\" y1=\"66\" x2=\"95\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"110\" y1=\"66\" x2=\"110\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"125\" y1=\"66\" x2=\"125\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"140\" y1=\"66\" x2=\"140\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"155\" y1=\"66\" x2=\"155\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"170\" y1=\"66\" x2=\"170\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"185\" y1=\"66\" x2=\"185\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"200\" y1=\"66\" x2=\"200\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"215\" y1=\"66\" x2=\"215\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"230\" y1=\"66\" x2=\"230\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"245\" y1=\"66\" x2=\"245\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"260\" y1=\"66\" x2=\"260\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"275\" y1=\"66\" x2=\"275\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"290\" y1=\"66\" x2=\"290\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"305\" y1=\"66\" x2=\"305\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"320\" y1=\"66\" x2=\"320\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"335\" y1=\"66\" x2=\"335\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"350\" y1=\"66\" x2=\"350\" y2=\"120\" class=\"lp-ico-detail\"/><line x1=\"365\" y1=\"66\" x2=\"365\" y2=\"120\" class=\"lp-ico-detail\"/><rect x=\"150\" y=\"14\" width=\"100\" height=\"40\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"40\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"68\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"96\" cy=\"30\" r=\"5\" class=\"lp-ico-detail\"/><rect x=\"300\" y=\"18\" width=\"22\" height=\"22\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"330\" y=\"18\" width=\"22\" height=\"22\" rx=\"4\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "keys-digital-piano",
    "category": "keys",
    "label": "Digital piano",
    "footprint": {
      "width_ft": 4.5,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 450 140",
    "keywords": [
      "digital piano",
      "clavinova"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"444\" height=\"134\" rx=\"8\"/><rect x=\"24\" y=\"72\" width=\"402\" height=\"58\" class=\"lp-ico-tone\"/><line x1=\"39.5\" y1=\"72\" x2=\"39.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"55\" y1=\"72\" x2=\"55\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"70.5\" y1=\"72\" x2=\"70.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"86\" y1=\"72\" x2=\"86\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"101.5\" y1=\"72\" x2=\"101.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"117\" y1=\"72\" x2=\"117\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"132.5\" y1=\"72\" x2=\"132.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"148\" y1=\"72\" x2=\"148\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"163.5\" y1=\"72\" x2=\"163.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"179\" y1=\"72\" x2=\"179\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"194.5\" y1=\"72\" x2=\"194.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"210\" y1=\"72\" x2=\"210\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"225.5\" y1=\"72\" x2=\"225.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"241\" y1=\"72\" x2=\"241\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"256.5\" y1=\"72\" x2=\"256.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"272\" y1=\"72\" x2=\"272\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"287.5\" y1=\"72\" x2=\"287.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"303\" y1=\"72\" x2=\"303\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"318.5\" y1=\"72\" x2=\"318.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"334\" y1=\"72\" x2=\"334\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"349.5\" y1=\"72\" x2=\"349.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"365\" y1=\"72\" x2=\"365\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"380.5\" y1=\"72\" x2=\"380.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"396\" y1=\"72\" x2=\"396\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"411.5\" y1=\"72\" x2=\"411.5\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"120\" y1=\"18\" x2=\"330\" y2=\"18\" class=\"lp-ico-detail\"/><circle cx=\"40\" cy=\"38\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"66\" cy=\"38\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-modular",
    "category": "keys",
    "label": "Modular",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 1.5
    },
    "viewBox": "0 0 300 150",
    "keywords": [
      "modular",
      "eurorack",
      "synth"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"294\" height=\"144\" rx=\"8\"/><rect x=\"14\" y=\"14\" width=\"80\" height=\"56\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"104\" y=\"14\" width=\"60\" height=\"56\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"174\" y=\"14\" width=\"112\" height=\"56\" rx=\"4\" class=\"lp-ico-tone\"/><circle cx=\"24\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"60\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"96\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"132\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"168\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"204\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"240\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"276\" cy=\"92\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"24\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"60\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"96\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"132\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"168\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"204\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"240\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><circle cx=\"276\" cy=\"116\" r=\"3.5\" class=\"lp-ico-detail\"/><path d=\"M60 92 Q120 132 168 94\" class=\"lp-ico-detail\"/><path d=\"M132 116 Q190 140 240 96\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "keys-midi-controller",
    "category": "keys",
    "label": "MIDI controller",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 0.8
    },
    "viewBox": "0 0 200 80",
    "keywords": [
      "midi",
      "controller",
      "usb"
    ],
    "body": "<rect x=\"3\" y=\"3\" width=\"194\" height=\"74\" rx=\"7\"/><rect x=\"14\" y=\"38\" width=\"172\" height=\"34\" class=\"lp-ico-tone\"/><line x1=\"28\" y1=\"38\" x2=\"28\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"42\" y1=\"38\" x2=\"42\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"56\" y1=\"38\" x2=\"56\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"70\" y1=\"38\" x2=\"70\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"84\" y1=\"38\" x2=\"84\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"98\" y1=\"38\" x2=\"98\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"112\" y1=\"38\" x2=\"112\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"126\" y1=\"38\" x2=\"126\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"140\" y1=\"38\" x2=\"140\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"154\" y1=\"38\" x2=\"154\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"168\" y1=\"38\" x2=\"168\" y2=\"72\" class=\"lp-ico-detail\"/><line x1=\"182\" y1=\"38\" x2=\"182\" y2=\"72\" class=\"lp-ico-detail\"/><circle cx=\"24\" cy=\"19\" r=\"7\" class=\"lp-ico-tone\"/><circle cx=\"44\" cy=\"19\" r=\"7\" class=\"lp-ico-tone\"/><rect x=\"122\" y=\"10\" width=\"18\" height=\"18\" rx=\"3\" class=\"lp-ico-tone\"/><rect x=\"146\" y=\"10\" width=\"18\" height=\"18\" rx=\"3\" class=\"lp-ico-tone\"/><rect x=\"170\" y=\"10\" width=\"18\" height=\"18\" rx=\"3\" class=\"lp-ico-tone\"/>"
  },
];
