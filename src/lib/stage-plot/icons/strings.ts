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
      "width_ft": 1.1,
      "depth_ft": 3.3
    },
    "viewBox": "0 0 110 330",
    "keywords": [
      "electric",
      "strat",
      "tele",
      "guitar"
    ],
    "body": "<path d=\"M42 8 L64 4 L72 54 L46 58 Z\" class=\"lp-ico-tone\"/><rect x=\"48\" y=\"56\" width=\"14\" height=\"132\"/><path d=\"M42 185 C36 172 28 164 22 168 C16 173 22 188 32 198 C10 214 4 246 12 272 C22 306 40 324 55 324 C74 324 90 306 96 278 C102 252 96 224 78 208 C86 196 90 182 84 177 C79 173 70 180 66 188 C58 184 50 184 42 185 Z\"/><line x1=\"48\" y1=\"82\" x2=\"62\" y2=\"82\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"106\" x2=\"62\" y2=\"106\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"130\" x2=\"62\" y2=\"130\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"154\" x2=\"62\" y2=\"154\" class=\"lp-ico-detail\"/><rect x=\"40\" y=\"220\" width=\"30\" height=\"9\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"40\" y=\"238\" width=\"30\" height=\"9\" rx=\"4\" class=\"lp-ico-tone\"/><rect x=\"38\" y=\"262\" width=\"34\" height=\"10\" rx=\"3\" class=\"lp-ico-tone\"/><line x1=\"55\" y1=\"56\" x2=\"55\" y2=\"262\" class=\"lp-ico-detail\"/><circle cx=\"80\" cy=\"296\" r=\"5.5\" class=\"lp-ico-detail\"/><circle cx=\"90\" cy=\"282\" r=\"5.5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-acoustic-guitar",
    "category": "strings",
    "label": "Acoustic guitar",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 3.4
    },
    "viewBox": "0 0 130 340",
    "keywords": [
      "acoustic",
      "dreadnought",
      "guitar"
    ],
    "body": "<rect x=\"48\" y=\"4\" width=\"34\" height=\"54\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"56\" cy=\"16\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"56\" cy=\"28\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"56\" cy=\"40\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"16\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"28\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"74\" cy=\"40\" r=\"2.6\" class=\"lp-ico-detail\"/><rect x=\"58\" y=\"58\" width=\"14\" height=\"120\"/><line x1=\"58\" y1=\"86\" x2=\"72\" y2=\"86\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"112\" x2=\"72\" y2=\"112\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"138\" x2=\"72\" y2=\"138\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"162\" x2=\"72\" y2=\"162\" class=\"lp-ico-detail\"/><path d=\"M65 176 C48 176 36 186 33 202 C30 216 37 228 30 242 C12 268 14 306 42 326 C57 337 73 337 88 326 C116 306 118 268 100 242 C93 228 100 216 97 202 C94 186 82 176 65 176 Z\"/><circle cx=\"65\" cy=\"238\" r=\"26\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"238\" r=\"31\" class=\"lp-ico-detail\"/><rect x=\"43\" y=\"284\" width=\"44\" height=\"11\" rx=\"4\" class=\"lp-ico-tone\"/><line x1=\"65\" y1=\"58\" x2=\"65\" y2=\"284\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-bass-guitar",
    "category": "strings",
    "label": "Bass guitar",
    "footprint": {
      "width_ft": 1.1,
      "depth_ft": 3.8
    },
    "viewBox": "0 0 110 380",
    "keywords": [
      "bass",
      "p-bass",
      "jazz bass",
      "4-string"
    ],
    "body": "<path d=\"M42 8 L62 4 L68 50 L46 54 Z\" class=\"lp-ico-tone\"/><circle cx=\"50\" cy=\"14\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"52\" cy=\"26\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"54\" cy=\"38\" r=\"2.6\" class=\"lp-ico-detail\"/><circle cx=\"56\" cy=\"48\" r=\"2.6\" class=\"lp-ico-detail\"/><rect x=\"48\" y=\"52\" width=\"13\" height=\"212\"/><line x1=\"48\" y1=\"86\" x2=\"61\" y2=\"86\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"122\" x2=\"61\" y2=\"122\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"158\" x2=\"61\" y2=\"158\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"194\" x2=\"61\" y2=\"194\" class=\"lp-ico-detail\"/><line x1=\"48\" y1=\"230\" x2=\"61\" y2=\"230\" class=\"lp-ico-detail\"/><path d=\"M41 258 C35 244 26 236 20 240 C14 246 20 262 31 272 C12 288 8 318 16 340 C26 366 42 376 56 376 C74 376 88 364 93 340 C98 318 92 292 76 278 C84 266 88 252 82 247 C77 243 68 250 64 258 C56 254 48 254 41 258 Z\"/><rect x=\"38\" y=\"298\" width=\"16\" height=\"9\" rx=\"3\" class=\"lp-ico-tone\"/><rect x=\"56\" y=\"290\" width=\"16\" height=\"9\" rx=\"3\" class=\"lp-ico-tone\"/><rect x=\"40\" y=\"330\" width=\"32\" height=\"10\" rx=\"3\" class=\"lp-ico-tone\"/><line x1=\"54.5\" y1=\"52\" x2=\"54.5\" y2=\"330\" class=\"lp-ico-detail\"/><circle cx=\"78\" cy=\"352\" r=\"5\" class=\"lp-ico-detail\"/><circle cx=\"88\" cy=\"338\" r=\"5\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-classical-guitar",
    "category": "strings",
    "label": "Classical guitar",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 3.3
    },
    "viewBox": "0 0 130 330",
    "keywords": [
      "classical",
      "nylon",
      "spanish",
      "guitar"
    ],
    "body": "<rect x=\"48\" y=\"4\" width=\"34\" height=\"52\" rx=\"5\" class=\"lp-ico-tone\"/><rect x=\"54\" y=\"11\" width=\"8\" height=\"36\" rx=\"4\" class=\"lp-ico-detail\"/><rect x=\"68\" y=\"11\" width=\"8\" height=\"36\" rx=\"4\" class=\"lp-ico-detail\"/><rect x=\"57\" y=\"56\" width=\"16\" height=\"120\"/><line x1=\"57\" y1=\"84\" x2=\"73\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"57\" y1=\"108\" x2=\"73\" y2=\"108\" class=\"lp-ico-detail\"/><line x1=\"57\" y1=\"132\" x2=\"73\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"57\" y1=\"156\" x2=\"73\" y2=\"156\" class=\"lp-ico-detail\"/><path d=\"M65 174 C48 174 36 184 33 200 C30 214 36 226 30 238 C14 262 16 298 40 320 C54 332 76 332 90 320 C114 298 116 262 100 238 C94 226 100 214 97 200 C94 184 82 174 65 174 Z\"/><circle cx=\"65\" cy=\"230\" r=\"27\" class=\"lp-ico-tone\"/><rect x=\"44\" y=\"282\" width=\"42\" height=\"9\" class=\"lp-ico-tone\"/><line x1=\"65\" y1=\"56\" x2=\"65\" y2=\"282\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-12-string",
    "category": "strings",
    "label": "12-string",
    "footprint": {
      "width_ft": 1.35,
      "depth_ft": 3.5
    },
    "viewBox": "0 0 135 350",
    "keywords": [
      "12 string",
      "twelve",
      "guitar"
    ],
    "body": "<rect x=\"45\" y=\"4\" width=\"45\" height=\"58\" rx=\"6\" class=\"lp-ico-tone\"/><circle cx=\"54\" cy=\"14\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"54\" cy=\"25\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"54\" cy=\"36\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"54\" cy=\"47\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"81\" cy=\"14\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"81\" cy=\"25\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"81\" cy=\"36\" r=\"2.4\" class=\"lp-ico-detail\"/><circle cx=\"81\" cy=\"47\" r=\"2.4\" class=\"lp-ico-detail\"/><rect x=\"60\" y=\"62\" width=\"15\" height=\"120\"/><line x1=\"60\" y1=\"90\" x2=\"75\" y2=\"90\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"116\" x2=\"75\" y2=\"116\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"142\" x2=\"75\" y2=\"142\" class=\"lp-ico-detail\"/><line x1=\"60\" y1=\"166\" x2=\"75\" y2=\"166\" class=\"lp-ico-detail\"/><path d=\"M67 180 C50 180 38 190 35 206 C32 220 39 232 32 246 C14 272 16 310 44 330 C59 341 75 341 90 330 C118 310 120 272 102 246 C95 232 102 220 99 206 C96 190 84 180 67 180 Z\"/><circle cx=\"67\" cy=\"242\" r=\"26\" class=\"lp-ico-tone\"/><rect x=\"45\" y=\"288\" width=\"44\" height=\"11\" rx=\"4\" class=\"lp-ico-tone\"/><line x1=\"64\" y1=\"62\" x2=\"64\" y2=\"288\" class=\"lp-ico-detail\"/><line x1=\"70\" y1=\"62\" x2=\"70\" y2=\"288\" class=\"lp-ico-detail\"/>"
  },
  {
    "name": "string-resonator",
    "category": "strings",
    "label": "Resonator",
    "footprint": {
      "width_ft": 1.3,
      "depth_ft": 3.3
    },
    "viewBox": "0 0 130 330",
    "keywords": [
      "resonator",
      "dobro",
      "steel"
    ],
    "body": "<rect x=\"48\" y=\"4\" width=\"34\" height=\"52\" rx=\"5\" class=\"lp-ico-tone\"/><rect x=\"58\" y=\"56\" width=\"14\" height=\"118\"/><line x1=\"58\" y1=\"84\" x2=\"72\" y2=\"84\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"108\" x2=\"72\" y2=\"108\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"132\" x2=\"72\" y2=\"132\" class=\"lp-ico-detail\"/><line x1=\"58\" y1=\"156\" x2=\"72\" y2=\"156\" class=\"lp-ico-detail\"/><path d=\"M65 172 C46 172 33 184 31 202 C29 216 34 226 30 238 C16 262 18 298 42 318 C55 330 75 330 88 318 C112 298 114 262 100 238 C96 226 101 216 99 202 C97 184 84 172 65 172 Z\"/><circle cx=\"65\" cy=\"248\" r=\"34\" class=\"lp-ico-tone\"/><circle cx=\"65\" cy=\"248\" r=\"15\" class=\"lp-ico-detail\"/><circle cx=\"44\" cy=\"198\" r=\"8\" class=\"lp-ico-detail\"/><circle cx=\"86\" cy=\"198\" r=\"8\" class=\"lp-ico-detail\"/><line x1=\"65\" y1=\"56\" x2=\"65\" y2=\"220\" class=\"lp-ico-detail\"/>"
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
