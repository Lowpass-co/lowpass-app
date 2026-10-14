/* ============================================================
   LOWPASS — Stage Plot stringed instruments icons (v2 suite)

   v2 grammar: top-down ft-true (viewBox = footprint x 100, art
   edge-to-edge, footprint = FULL extent); elevation for tall/thin;
   symbolic sizing for stage boxes / power / DI / talkback. No colour
   attrs. Classes: unclassed = footprint fill, .lp-ico-tone = accent
   fill (NEW - see README), .lp-ico-detail = stroke only,
   .lp-ico-label = solid category-colour fill (text + bolt glyph).
   ============================================================ */

import type { IconDescriptor } from './types';

export const stringIcons: IconDescriptor[] = [
  {
    "name": "string-electric-guitar",
    "category": "strings",
    "label": "Electric guitar",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 2.0
    },
    "viewBox": "0 0 120 200",
    "keywords": [
      "electric",
      "strat",
      "tele",
      "guitar"
    ],
    "body": "<path d=\"M67,120 C72,112 82,102 90,102 C98,102 98,112 96,120 C94,128 100,134 108,144 C118,158 116,184 98,192 C84,199 36,199 22,192 C4,184 2,158 12,146 C20,136 22,128 20,118 C18,104 22,92 30,92 C38,92 48,108 53,120 Z\" transform=\"translate(0 0)\"/><rect x=\"53\" y=\"22\" width=\"14\" height=\"102\" rx=\"2\"/><path d=\"M67,26 L68,8 C68,3 64,1 59,2 L47,5 C42,7 42,13 46,15 L53,18 L53,26 Z\"/><circle cx=\"49\" cy=\"8\" r=\"2\" class=\"lp-ico-tone\"/><circle cx=\"53\" cy=\"6\" r=\"2\" class=\"lp-ico-tone\"/><circle cx=\"57\" cy=\"4\" r=\"2\" class=\"lp-ico-tone\"/><circle cx=\"61\" cy=\"4\" r=\"2\" class=\"lp-ico-tone\"/><circle cx=\"64\" cy=\"6\" r=\"2\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"10\" r=\"2\" class=\"lp-ico-tone\"/><path d=\"M30,150 C30,136 44,128 60,128 L76,128 C88,128 96,140 96,156 C96,172 84,182 70,182 L46,182 C36,182 30,172 30,150 Z\" class=\"lp-ico-detail\"/><rect x=\"51\" y=\"134\" width=\"18\" height=\"5\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"51\" y=\"148\" width=\"18\" height=\"5\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"51\" y=\"162\" width=\"18\" height=\"5\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"48\" y=\"174\" width=\"24\" height=\"6\" rx=\"1.5\" class=\"lp-ico-tone\"/><circle cx=\"86\" cy=\"168\" r=\"4\" class=\"lp-ico-tone\"/><circle cx=\"90\" cy=\"180\" r=\"4\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "string-acoustic-guitar",
    "category": "strings",
    "label": "Acoustic guitar",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 2.0
    },
    "viewBox": "0 0 130 200",
    "keywords": [
      "acoustic",
      "dreadnought",
      "guitar"
    ],
    "body": "<path d=\"M65,92 C82,92 102,94 104,110 C106,124 96,130 98,140 C100,150 124,156 124,176 C124,194 104,198 65,198 C26,198 6,194 6,176 C6,156 30,150 32,140 C34,130 24,124 26,110 C28,94 48,92 65,92 Z\"/><rect x=\"58\" y=\"22\" width=\"14\" height=\"74\" rx=\"2\"/><path d=\"M57,25 L55,5 C55,2 58,1 65,1 C72,1 75,2 75,5 L73,25 Z\"/><circle cx=\"52\" cy=\"8\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"52\" cy=\"15\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"52\" cy=\"22\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"78\" cy=\"8\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"78\" cy=\"15\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"78\" cy=\"22\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"128\" r=\"14\" class=\"lp-ico-detail\"/><rect x=\"50\" y=\"168\" width=\"30\" height=\"7\" rx=\"2\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "string-bass-guitar",
    "category": "strings",
    "label": "Bass guitar",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 2.24
    },
    "viewBox": "0 0 120 224",
    "keywords": [
      "bass",
      "p-bass",
      "jazz bass",
      "4-string"
    ],
    "body": "<path d=\"M67,120 C72,112 82,102 90,102 C98,102 98,112 96,120 C94,128 100,134 108,144 C118,158 116,184 98,192 C84,199 36,199 22,192 C4,184 2,158 12,146 C20,136 22,128 20,118 C18,104 22,92 30,92 C38,92 48,108 53,120 Z\" transform=\"translate(0 24)\"/><rect x=\"54\" y=\"20\" width=\"12\" height=\"128\" rx=\"2\"/><path d=\"M54,24 L52,6 C52,2 56,0 60,1 L74,6 C78,8 78,14 74,16 L66,20 L66,24 Z\"/><circle cx=\"70\" cy=\"6\" r=\"2.6\" class=\"lp-ico-tone\"/><circle cx=\"72\" cy=\"10\" r=\"2.6\" class=\"lp-ico-tone\"/><circle cx=\"73\" cy=\"14\" r=\"2.6\" class=\"lp-ico-tone\"/><circle cx=\"74\" cy=\"18\" r=\"2.6\" class=\"lp-ico-tone\"/><rect x=\"46\" y=\"160\" width=\"12\" height=\"6\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"62\" y=\"170\" width=\"12\" height=\"6\" rx=\"2\" class=\"lp-ico-tone\"/><rect x=\"48\" y=\"196\" width=\"24\" height=\"7\" rx=\"1.5\" class=\"lp-ico-tone\"/><circle cx=\"90\" cy=\"198\" r=\"4\" class=\"lp-ico-tone\"/><circle cx=\"94\" cy=\"208\" r=\"4\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "string-classical-guitar",
    "category": "strings",
    "label": "Classical guitar",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 2.0
    },
    "viewBox": "0 0 130 200",
    "keywords": [
      "classical",
      "nylon",
      "spanish",
      "guitar"
    ],
    "body": "<path d=\"M65,92 C82,92 102,94 104,110 C106,124 96,130 98,140 C100,150 124,156 124,176 C124,194 104,198 65,198 C26,198 6,194 6,176 C6,156 30,150 32,140 C34,130 24,124 26,110 C28,94 48,92 65,92 Z\"/><rect x=\"58\" y=\"22\" width=\"14\" height=\"74\" rx=\"2\"/><path d=\"M57,25 L56,3 L74,3 L73,25 Z\"/><line x1=\"62\" y1=\"7\" x2=\"62\" y2=\"21\" class=\"lp-ico-detail\"/><line x1=\"68\" y1=\"7\" x2=\"68\" y2=\"21\" class=\"lp-ico-detail\"/><circle cx=\"65\" cy=\"128\" r=\"13\" class=\"lp-ico-detail\"/><circle cx=\"65\" cy=\"128\" r=\"18\" class=\"lp-ico-detail\"/><rect x=\"50\" y=\"168\" width=\"30\" height=\"7\" rx=\"2\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "string-12-string",
    "category": "strings",
    "label": "12-string",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 2.0
    },
    "viewBox": "0 0 130 200",
    "keywords": [
      "12 string",
      "twelve",
      "guitar"
    ],
    "body": "<path d=\"M65,92 C82,92 102,94 104,110 C106,124 96,130 98,140 C100,150 124,156 124,176 C124,194 104,198 65,198 C26,198 6,194 6,176 C6,156 30,150 32,140 C34,130 24,124 26,110 C28,94 48,92 65,92 Z\"/><rect x=\"58\" y=\"22\" width=\"14\" height=\"74\" rx=\"2\"/><path d=\"M55,25 L52,4 C52,1 57,0 65,0 C73,0 78,1 78,4 L75,25 Z\"/><circle cx=\"48\" cy=\"4\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"48\" cy=\"8\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"48\" cy=\"12\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"48\" cy=\"16\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"48\" cy=\"20\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"48\" cy=\"24\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"4\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"8\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"12\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"16\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"20\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"82\" cy=\"24\" r=\"1.9\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"128\" r=\"14\" class=\"lp-ico-detail\"/><rect x=\"50\" y=\"168\" width=\"30\" height=\"7\" rx=\"2\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "string-resonator",
    "category": "strings",
    "label": "Resonator",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 2.0
    },
    "viewBox": "0 0 130 200",
    "keywords": [
      "resonator",
      "dobro",
      "steel"
    ],
    "body": "<path d=\"M65,92 C82,92 102,94 104,110 C106,124 96,130 98,140 C100,150 124,156 124,176 C124,194 104,198 65,198 C26,198 6,194 6,176 C6,156 30,150 32,140 C34,130 24,124 26,110 C28,94 48,92 65,92 Z\"/><rect x=\"58\" y=\"22\" width=\"14\" height=\"74\" rx=\"2\"/><path d=\"M57,25 L55,5 C55,2 58,1 65,1 C72,1 75,2 75,5 L73,25 Z\"/><circle cx=\"52\" cy=\"8\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"52\" cy=\"15\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"52\" cy=\"22\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"78\" cy=\"8\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"78\" cy=\"15\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"78\" cy=\"22\" r=\"2.4\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"158\" r=\"28\" class=\"lp-ico-detail\"/><circle cx=\"65\" cy=\"158\" r=\"20\" class=\"lp-ico-detail\"/><circle cx=\"65\" cy=\"158\" r=\"5\" class=\"lp-ico-tone\"/><circle cx=\"42\" cy=\"114\" r=\"4\" class=\"lp-ico-detail\"/><circle cx=\"88\" cy=\"114\" r=\"4\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-ukulele",
    "category": "strings",
    "label": "Ukulele",
    "footprint": {
      "width_ft": 0.75,
      "depth_ft": 1.8
    },
    "viewBox": "0 0 75 180",
    "keywords": [
      "ukulele",
      "uke",
      "soprano"
    ],
    "body": "<rect x=\"27\" y=\"3\" width=\"21\" height=\"26\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"33\" y=\"29\" width=\"9\" height=\"58\"/><line x1=\"33\" y1=\"42\" x2=\"42\" y2=\"42\" class=\"lp-ico-detail\"/><line x1=\"33\" y1=\"56\" x2=\"42\" y2=\"56\" class=\"lp-ico-detail\"/><line x1=\"33\" y1=\"70\" x2=\"42\" y2=\"70\" class=\"lp-ico-detail\"/><path d=\"M37.5 85 C27 85 19 91 17 100 C15 108 19 114 16 121 C10 134 11 154 24 165 C31 171 44 171 51 165 C64 154 65 134 59 121 C56 114 60 108 58 100 C56 91 48 85 37.5 85 Z\"/><circle cx=\"37.5\" cy=\"126\" r=\"12\" class=\"lp-ico-tone\"/><rect x=\"28\" y=\"150\" width=\"19\" height=\"6\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"37.5\" y1=\"29\" x2=\"37.5\" y2=\"150\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-mandolin",
    "category": "strings",
    "label": "Mandolin",
    "footprint": {
      "width_ft": 0.95,
      "depth_ft": 2.3
    },
    "viewBox": "0 0 95 230",
    "keywords": [
      "mandolin",
      "a-style"
    ],
    "body": "<rect x=\"37\" y=\"3\" width=\"21\" height=\"28\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"41\" y=\"31\" width=\"13\" height=\"64\"/><line x1=\"41\" y1=\"46\" x2=\"54\" y2=\"46\" class=\"lp-ico-detail\"/><line x1=\"41\" y1=\"62\" x2=\"54\" y2=\"62\" class=\"lp-ico-detail\"/><line x1=\"41\" y1=\"78\" x2=\"54\" y2=\"78\" class=\"lp-ico-detail\"/><path d=\"M47.5 92 C30 96 14 112 12 138 C10 168 26 190 47.5 190 C69 190 85 168 83 138 C81 112 65 96 47.5 92 Z\"/><ellipse cx=\"47.5\" cy=\"140\" rx=\"16\" ry=\"10\" class=\"lp-ico-tone\"/><rect x=\"36\" y=\"160\" width=\"23\" height=\"6\" rx=\"2\" class=\"lp-ico-tone\"/><line x1=\"47.5\" y1=\"31\" x2=\"47.5\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"186\" x2=\"55\" y2=\"186\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-banjo",
    "category": "strings",
    "label": "Banjo",
    "footprint": {
      "width_ft": 1.15,
      "depth_ft": 3.2
    },
    "viewBox": "0 0 115 320",
    "keywords": [
      "banjo",
      "5-string",
      "bluegrass"
    ],
    "body": "<rect x=\"47\" y=\"4\" width=\"21\" height=\"38\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"51\" y=\"42\" width=\"13\" height=\"158\"/><line x1=\"51\" y1=\"70\" x2=\"64\" y2=\"70\" class=\"lp-ico-detail\"/><line x1=\"51\" y1=\"100\" x2=\"64\" y2=\"100\" class=\"lp-ico-detail\"/><line x1=\"51\" y1=\"130\" x2=\"64\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"51\" y1=\"160\" x2=\"64\" y2=\"160\" class=\"lp-ico-detail\"/><line x1=\"51\" y1=\"118\" x2=\"42\" y2=\"118\" class=\"lp-ico-detail\"/><circle cx=\"40\" cy=\"118\" r=\"3\" class=\"lp-ico-detail\"/><circle cx=\"57.5\" cy=\"252\" r=\"55\"/><circle cx=\"57.5\" cy=\"252\" r=\"43\" class=\"lp-ico-tone\"/><line x1=\"57.5\" y1=\"207\" x2=\"57.5\" y2=\"199\" class=\"lp-ico-detail\"/><line x1=\"80\" y1=\"213\" x2=\"84\" y2=\"206.1\" class=\"lp-ico-detail\"/><line x1=\"96.5\" y1=\"229.5\" x2=\"103.4\" y2=\"225.5\" class=\"lp-ico-detail\"/><line x1=\"102.5\" y1=\"252\" x2=\"110.5\" y2=\"252\" class=\"lp-ico-detail\"/><line x1=\"96.5\" y1=\"274.5\" x2=\"103.4\" y2=\"278.5\" class=\"lp-ico-detail\"/><line x1=\"80\" y1=\"291\" x2=\"84\" y2=\"297.9\" class=\"lp-ico-detail\"/><line x1=\"57.5\" y1=\"297\" x2=\"57.5\" y2=\"305\" class=\"lp-ico-detail\"/><line x1=\"35\" y1=\"291\" x2=\"31\" y2=\"297.9\" class=\"lp-ico-detail\"/><line x1=\"18.5\" y1=\"274.5\" x2=\"11.6\" y2=\"278.5\" class=\"lp-ico-detail\"/><line x1=\"12.5\" y1=\"252\" x2=\"4.5\" y2=\"252\" class=\"lp-ico-detail\"/><line x1=\"18.5\" y1=\"229.5\" x2=\"11.6\" y2=\"225.5\" class=\"lp-ico-detail\"/><line x1=\"35\" y1=\"213\" x2=\"31\" y2=\"206.1\" class=\"lp-ico-detail\"/><line x1=\"57.5\" y1=\"42\" x2=\"57.5\" y2=\"280\" class=\"lp-ico-detail\"/><rect x=\"48\" y=\"272\" width=\"19\" height=\"6\" rx=\"2\" class=\"lp-ico-tone\"/>"
  },
  {
    "name": "string-violin",
    "category": "strings",
    "label": "Violin",
    "footprint": {
      "width_ft": 0.7,
      "depth_ft": 2
    },
    "viewBox": "0 0 70 200",
    "keywords": [
      "violin",
      "fiddle"
    ],
    "body": "<circle cx=\"35\" cy=\"22\" r=\"9\" class=\"lp-ico-tone\"/><line x1=\"22\" y1=\"16\" x2=\"30\" y2=\"16\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"24\" x2=\"48\" y2=\"24\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"30\" width=\"10\" height=\"64\"/><path d=\"M35 92 C22 92 14 99 14 109 C14 118 21 122 21 129 C21 136 13 140 13 152 C13 170 22 182 35 182 C48 182 57 170 57 152 C57 140 49 136 49 129 C49 122 56 118 56 109 C56 99 48 92 35 92 Z\"/><path d=\"M27 120 Q23 132 27 144\" class=\"lp-ico-detail\"/><path d=\"M43 120 Q47 132 43 144\" class=\"lp-ico-detail\"/><path d=\"M31 156 L39 156 L37 176 L33 176 Z\" class=\"lp-ico-tone\"/><line x1=\"35\" y1=\"30\" x2=\"35\" y2=\"156\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-viola",
    "category": "strings",
    "label": "Viola",
    "footprint": {
      "width_ft": 0.75,
      "depth_ft": 2.15
    },
    "viewBox": "0 0 75 215",
    "keywords": [
      "viola"
    ],
    "body": "<g transform=\"scale(1.071)\"><circle cx=\"35\" cy=\"22\" r=\"9\" class=\"lp-ico-tone\"/><line x1=\"22\" y1=\"16\" x2=\"30\" y2=\"16\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"24\" x2=\"48\" y2=\"24\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"30\" width=\"10\" height=\"64\"/><path d=\"M35 92 C22 92 14 99 14 109 C14 118 21 122 21 129 C21 136 13 140 13 152 C13 170 22 182 35 182 C48 182 57 170 57 152 C57 140 49 136 49 129 C49 122 56 118 56 109 C56 99 48 92 35 92 Z\"/><path d=\"M27 120 Q23 132 27 144\" class=\"lp-ico-detail\"/><path d=\"M43 120 Q47 132 43 144\" class=\"lp-ico-detail\"/><path d=\"M31 156 L39 156 L37 176 L33 176 Z\" class=\"lp-ico-tone\"/><line x1=\"35\" y1=\"30\" x2=\"35\" y2=\"156\" class=\"lp-ico-detail\"/></g>"
  },
  {
    "name": "string-cello",
    "category": "strings",
    "label": "Cello",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 4
    },
    "viewBox": "0 0 140 400",
    "keywords": [
      "cello",
      "violoncello"
    ],
    "body": "<g transform=\"scale(2)\"><circle cx=\"35\" cy=\"22\" r=\"9\" class=\"lp-ico-tone\"/><line x1=\"22\" y1=\"16\" x2=\"30\" y2=\"16\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"24\" x2=\"48\" y2=\"24\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"30\" width=\"10\" height=\"64\"/><path d=\"M35 92 C22 92 14 99 14 109 C14 118 21 122 21 129 C21 136 13 140 13 152 C13 170 22 182 35 182 C48 182 57 170 57 152 C57 140 49 136 49 129 C49 122 56 118 56 109 C56 99 48 92 35 92 Z\"/><path d=\"M27 120 Q23 132 27 144\" class=\"lp-ico-detail\"/><path d=\"M43 120 Q47 132 43 144\" class=\"lp-ico-detail\"/><path d=\"M31 156 L39 156 L37 176 L33 176 Z\" class=\"lp-ico-tone\"/><line x1=\"35\" y1=\"30\" x2=\"35\" y2=\"156\" class=\"lp-ico-detail\"/></g><line x1=\"70\" y1=\"366\" x2=\"70\" y2=\"396\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-double-bass",
    "category": "strings",
    "label": "Double bass",
    "footprint": {
      "width_ft": 2.1,
      "depth_ft": 6
    },
    "viewBox": "0 0 210 600",
    "keywords": [
      "double bass",
      "upright",
      "contrabass"
    ],
    "body": "<g transform=\"scale(3)\"><circle cx=\"35\" cy=\"22\" r=\"9\" class=\"lp-ico-tone\"/><line x1=\"22\" y1=\"16\" x2=\"30\" y2=\"16\" class=\"lp-ico-detail\"/><line x1=\"40\" y1=\"24\" x2=\"48\" y2=\"24\" class=\"lp-ico-detail\"/><rect x=\"30\" y=\"30\" width=\"10\" height=\"64\"/><path d=\"M35 92 C22 92 14 99 14 109 C14 118 21 122 21 129 C21 136 13 140 13 152 C13 170 22 182 35 182 C48 182 57 170 57 152 C57 140 49 136 49 129 C49 122 56 118 56 109 C56 99 48 92 35 92 Z\"/><path d=\"M27 120 Q23 132 27 144\" class=\"lp-ico-detail\"/><path d=\"M43 120 Q47 132 43 144\" class=\"lp-ico-detail\"/><path d=\"M31 156 L39 156 L37 176 L33 176 Z\" class=\"lp-ico-tone\"/><line x1=\"35\" y1=\"30\" x2=\"35\" y2=\"156\" class=\"lp-ico-detail\"/></g><line x1=\"105\" y1=\"550\" x2=\"105\" y2=\"594\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-lap-steel",
    "category": "strings",
    "label": "Lap steel",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 2.8
    },
    "viewBox": "0 0 90 280",
    "keywords": [
      "lap steel",
      "pedal steel",
      "slide"
    ],
    "body": "<path d=\"M32 4 L58 4 L58 168 L78 178 L78 274 L12 274 L12 178 L32 168 Z\"/><line x1=\"34\" y1=\"40\" x2=\"56\" y2=\"40\" class=\"lp-ico-detail\"/><line x1=\"34\" y1=\"68\" x2=\"56\" y2=\"68\" class=\"lp-ico-detail\"/><line x1=\"34\" y1=\"96\" x2=\"56\" y2=\"96\" class=\"lp-ico-detail\"/><line x1=\"34\" y1=\"124\" x2=\"56\" y2=\"124\" class=\"lp-ico-detail\"/><line x1=\"34\" y1=\"152\" x2=\"56\" y2=\"152\" class=\"lp-ico-detail\"/><rect x=\"22\" y=\"206\" width=\"46\" height=\"12\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"20\" y=\"234\" width=\"50\" height=\"9\" rx=\"3\" class=\"lp-ico-tone\"/><line x1=\"45\" y1=\"8\" x2=\"45\" y2=\"234\" class=\"lp-ico-detail\"/><circle cx=\"24\" cy=\"258\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"66\" cy=\"258\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-harp",
    "category": "strings",
    "label": "Harp",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 5
    },
    "viewBox": "0 0 300 500",
    "keywords": [
      "harp",
      "concert",
      "pedal harp"
    ],
    "body": "<rect x=\"20\" y=\"42\" width=\"24\" height=\"418\" rx=\"12\"/><rect x=\"10\" y=\"458\" width=\"210\" height=\"36\" rx=\"12\"/><path d=\"M44 456 L266 62 L288 82 L68 470 Z\"/><path d=\"M28 44 Q150 -6 272 66 L262 86 Q154 24 38 64 Z\"/><line x1=\"64\" y1=\"52\" x2=\"64\" y2=\"444\" class=\"lp-ico-detail\"/><line x1=\"103.2\" y1=\"57.2\" x2=\"103.2\" y2=\"369.6\" class=\"lp-ico-detail\"/><line x1=\"142.4\" y1=\"62.4\" x2=\"142.4\" y2=\"295.2\" class=\"lp-ico-detail\"/><line x1=\"181.6\" y1=\"67.6\" x2=\"181.6\" y2=\"220.8\" class=\"lp-ico-detail\"/><line x1=\"220.8\" y1=\"72.8\" x2=\"220.8\" y2=\"146.4\" class=\"lp-ico-detail\"/><line x1=\"260\" y1=\"78\" x2=\"260\" y2=\"72\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-stand-single",
    "category": "strings",
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
    "name": "string-stand-multi",
    "category": "strings",
    "label": "Guitar rack",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 1.5
    },
    "viewBox": "0 0 300 150",
    "keywords": [
      "guitar rack",
      "multi stand",
      "5-way"
    ],
    "body": "<rect x=\"3\" y=\"42\" width=\"294\" height=\"105\" rx=\"10\"/><line x1=\"50\" y1=\"42\" x2=\"50\" y2=\"147\" class=\"lp-ico-detail\"/><circle cx=\"50\" cy=\"22\" r=\"13\" class=\"lp-ico-tone\"/><line x1=\"100\" y1=\"42\" x2=\"100\" y2=\"147\" class=\"lp-ico-detail\"/><circle cx=\"100\" cy=\"22\" r=\"13\" class=\"lp-ico-tone\"/><line x1=\"150\" y1=\"42\" x2=\"150\" y2=\"147\" class=\"lp-ico-detail\"/><circle cx=\"150\" cy=\"22\" r=\"13\" class=\"lp-ico-tone\"/><line x1=\"200\" y1=\"42\" x2=\"200\" y2=\"147\" class=\"lp-ico-detail\"/><circle cx=\"200\" cy=\"22\" r=\"13\" class=\"lp-ico-tone\"/><line x1=\"250\" y1=\"42\" x2=\"250\" y2=\"147\" class=\"lp-ico-detail\"/><circle cx=\"250\" cy=\"22\" r=\"13\" class=\"lp-ico-tone\"/>"
  },
];
