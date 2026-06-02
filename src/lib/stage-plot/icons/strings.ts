/* ============================================
   LOWPASS — Stage Plot stringed instrument icons (§SP1, redesign)

   Adam's redesigned outline set: realistic instrument
   silhouettes authored in a 0 0 48 48 viewBox, rendered as pure
   outline (outline:true) in the category colour rather than
   filled. Electric re-authored to a strat-style double-cutaway
   per the reference image.
   ============================================ */

import type { IconDescriptor } from './types';

export const stringIcons: IconDescriptor[] = [
  {
    "name": "string-electric-guitar",
    "category": "strings",
    "label": "Electric guitar",
    "footprint": {
      "width_ft": 3.4,
      "depth_ft": 1.4
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M25 24 C25 21 25.5 18.5 24.5 16.5 C26 14 23.5 12 20.5 12.8 C18.5 13.4 18 15.5 18 17.5 C15 13.5 9.5 14 7 17.5 C4 21 4 22 6 24 C4 26 4 27 7 30.5 C9.5 34 15 34.5 18 30.5 C18 32.5 18.5 34.6 20.5 35.2 C23.5 36 26 34 24.5 31.5 C25.5 29.5 25 27 25 24 Z\"/><path d=\"M25 22.2 L41 22.7\"/><path d=\"M25 25.8 L41 25.3\"/><path d=\"M41 22.6 L41 25.4\"/><path d=\"M29 22.3 L29 25.7\"/><path d=\"M33 22.4 L33 25.6\"/><path d=\"M37 22.5 L37 25.5\"/><path d=\"M41 22.4 L46.8 20.8 L47.6 25.6 L41.2 25.7\"/><circle cx=\"42.5\" cy=\"24.3\" r=\"0.6\"/><circle cx=\"44\" cy=\"24.5\" r=\"0.6\"/><circle cx=\"45.5\" cy=\"24.7\" r=\"0.6\"/><circle cx=\"42.7\" cy=\"22.7\" r=\"0.6\"/><circle cx=\"44.2\" cy=\"22.9\" r=\"0.6\"/><circle cx=\"45.7\" cy=\"23.1\" r=\"0.6\"/><rect x=\"13\" y=\"19\" width=\"2\" height=\"10\" rx=\"0.6\"/><rect x=\"17\" y=\"19\" width=\"2\" height=\"10\" rx=\"0.6\"/><circle cx=\"21\" cy=\"30\" r=\"1\"/><circle cx=\"19\" cy=\"31.5\" r=\"1\"/>",
    "keywords": [
      "electric",
      "guitar",
      "strat",
      "solid body"
    ]
  },
  {
    "name": "string-acoustic-guitar",
    "category": "strings",
    "label": "Acoustic guitar",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 3.4
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 23.5 Q33.3 23.5 33.3 29.09 Q33.3 31.67 30.6 34.25 Q34 36.83 34 39.41 Q34 45 24 45 Q14 45 14 39.41 Q14 36.83 17.4 34.25 Q14.7 31.67 14.7 29.09 Q14.7 23.5 24 23.5 Z\"/><circle cx=\"24\" cy=\"33.5\" r=\"3.2\"/><path d=\"M20.6 38.2 L27.4 38.2\"/><circle cx=\"21.5\" cy=\"39.3\" r=\"0.7\"/><circle cx=\"26.5\" cy=\"39.3\" r=\"0.7\"/><path d=\"M22.65 10 L22.65 23.5\"/><path d=\"M25.35 10 L25.35 23.5\"/><path d=\"M22.25 23.5 L25.75 23.5\"/><path d=\"M22.65 14 L25.35 14\"/><path d=\"M22.65 16 L25.35 16\"/><path d=\"M22.65 18 L25.35 18\"/><path d=\"M22.65 20 L25.35 20\"/><path d=\"M22.6 10 L21.6 5.2 Q21.6 4.4 22.4 4.4 L25.6 4.4 Q26.4 4.4 26.4 5.2 L25.4 10\"/><circle cx=\"20.6\" cy=\"6\" r=\"0.7\"/><circle cx=\"20.6\" cy=\"7.6\" r=\"0.7\"/><circle cx=\"20.6\" cy=\"9.2\" r=\"0.7\"/><circle cx=\"27.4\" cy=\"6\" r=\"0.7\"/><circle cx=\"27.4\" cy=\"7.6\" r=\"0.7\"/><circle cx=\"27.4\" cy=\"9.2\" r=\"0.7\"/>",
    "keywords": [
      "acoustic",
      "guitar",
      "dreadnought"
    ]
  },
  {
    "name": "string-bass-guitar",
    "category": "strings",
    "label": "Bass guitar",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 3.9
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 27 Q31.6 27 31.6 31.55 Q31.6 33.65 29.6 35.75 Q33 37.85 33 39.95 Q33 44.5 24 44.5 Q15 44.5 15 39.95 Q15 37.85 18.4 35.75 Q16.4 33.65 16.4 31.55 Q16.4 27 24 27 Z\"/><rect x=\"19.6\" y=\"33\" width=\"5\" height=\"2\" rx=\"0.6\"/><rect x=\"23.4\" y=\"35.4\" width=\"5\" height=\"2\" rx=\"0.6\"/><circle cx=\"29\" cy=\"40.5\" r=\"1\"/><path d=\"M22.75 7 L22.75 27\"/><path d=\"M25.25 7 L25.25 27\"/><path d=\"M22.35 27 L25.65 27\"/><path d=\"M22.75 13 L25.25 13\"/><path d=\"M22.75 16 L25.25 16\"/><path d=\"M22.75 19 L25.25 19\"/><path d=\"M22.75 22 L25.25 22\"/><path d=\"M22.8 7 L21.4 3.6 Q21.4 3 22 3 L26 3 Q26.6 3 26.6 3.6 L25.2 7\"/><circle cx=\"20.4\" cy=\"4.3\" r=\"1.3\"/><circle cx=\"20.4\" cy=\"6.2\" r=\"1.3\"/><circle cx=\"27.6\" cy=\"4.3\" r=\"1.3\"/><circle cx=\"27.6\" cy=\"6.2\" r=\"1.3\"/>",
    "keywords": [
      "bass",
      "guitar",
      "four string"
    ]
  },
  {
    "name": "string-classical-guitar",
    "category": "strings",
    "label": "Classical guitar",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 3.2
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 24 Q33 24 33 29.46 Q33 31.98 30.4 34.5 Q33.6 37.019999999999996 33.6 39.54 Q33.6 45 24 45 Q14.4 45 14.4 39.54 Q14.4 37.019999999999996 17.6 34.5 Q15 31.98 15 29.46 Q15 24 24 24 Z\"/><circle cx=\"24\" cy=\"34\" r=\"3.1\"/><path d=\"M20.8 38.6 L27.2 38.6\"/><path d=\"M22.5 11 L22.5 24\"/><path d=\"M25.5 11 L25.5 24\"/><path d=\"M22.1 24 L25.9 24\"/><path d=\"M22.5 14.9 L25.5 14.9\"/><path d=\"M22.5 16.8 L25.5 16.8\"/><path d=\"M22.5 18.7 L25.5 18.7\"/><path d=\"M22.5 20.6 L25.5 20.6\"/><path d=\"M22 11 L21.4 4.4 Q21.4 3.8 22 3.8 L26 3.8 Q26.6 3.8 26.6 4.4 L26 11\"/><rect x=\"22.4\" y=\"5.2\" width=\"1.3\" height=\"4.4\" rx=\"0.6\"/><rect x=\"24.3\" y=\"5.2\" width=\"1.3\" height=\"4.4\" rx=\"0.6\"/><circle cx=\"21\" cy=\"6\" r=\"0.7\"/><circle cx=\"21\" cy=\"8.4\" r=\"0.7\"/><circle cx=\"27\" cy=\"6\" r=\"0.7\"/><circle cx=\"27\" cy=\"8.4\" r=\"0.7\"/>",
    "keywords": [
      "classical",
      "nylon",
      "spanish"
    ]
  },
  {
    "name": "string-12-string",
    "category": "strings",
    "label": "12-string",
    "footprint": {
      "width_ft": 1.5,
      "depth_ft": 3.4
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 24.5 Q33.3 24.5 33.3 29.83 Q33.3 32.29 30.6 34.75 Q34 37.21 34 39.67 Q34 45 24 45 Q14 45 14 39.67 Q14 37.21 17.4 34.75 Q14.7 32.29 14.7 29.83 Q14.7 24.5 24 24.5 Z\"/><circle cx=\"24\" cy=\"34\" r=\"3.1\"/><path d=\"M20.6 38.6 L27.4 38.6\"/><path d=\"M22.6 11 L22.6 24.5\"/><path d=\"M25.4 11 L25.4 24.5\"/><path d=\"M22.200000000000003 24.5 L25.799999999999997 24.5\"/><path d=\"M22.5 11 L21.6 3 Q21.6 2.2 22.4 2.2 L25.6 2.2 Q26.4 2.2 26.4 3 L25.5 11\"/><circle cx=\"20.6\" cy=\"3.6\" r=\"0.65\"/><circle cx=\"20.6\" cy=\"5\" r=\"0.65\"/><circle cx=\"20.6\" cy=\"6.4\" r=\"0.65\"/><circle cx=\"20.6\" cy=\"7.8\" r=\"0.65\"/><circle cx=\"20.6\" cy=\"9.2\" r=\"0.65\"/><circle cx=\"20.6\" cy=\"10.4\" r=\"0.65\"/><circle cx=\"27.4\" cy=\"3.6\" r=\"0.65\"/><circle cx=\"27.4\" cy=\"5\" r=\"0.65\"/><circle cx=\"27.4\" cy=\"6.4\" r=\"0.65\"/><circle cx=\"27.4\" cy=\"7.8\" r=\"0.65\"/><circle cx=\"27.4\" cy=\"9.2\" r=\"0.65\"/><circle cx=\"27.4\" cy=\"10.4\" r=\"0.65\"/>",
    "keywords": [
      "12 string",
      "twelve string",
      "acoustic"
    ]
  },
  {
    "name": "string-resonator",
    "category": "strings",
    "label": "Resonator",
    "footprint": {
      "width_ft": 1.4,
      "depth_ft": 3.2
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 24 Q33 24 33 29.46 Q33 31.98 30.6 34.5 Q33.8 37.019999999999996 33.8 39.54 Q33.8 45 24 45 Q14.2 45 14.2 39.54 Q14.2 37.019999999999996 17.4 34.5 Q15 31.98 15 29.46 Q15 24 24 24 Z\"/><circle cx=\"24\" cy=\"36\" r=\"5.6\"/><circle cx=\"24\" cy=\"36\" r=\"1.6\"/><path d=\"M18.4 36 L29.6 36\"/><path d=\"M24 30.4 L24 41.6\"/><path d=\"M20.1 32.1 L27.9 39.9\"/><path d=\"M27.9 32.1 L20.1 39.9\"/><circle cx=\"20.5\" cy=\"28.5\" r=\"1.4\"/><circle cx=\"27.5\" cy=\"28.5\" r=\"1.4\"/><path d=\"M22.65 11 L22.65 24\"/><path d=\"M25.35 11 L25.35 24\"/><path d=\"M22.25 24 L25.75 24\"/><path d=\"M22.65 14.9 L25.35 14.9\"/><path d=\"M22.65 16.8 L25.35 16.8\"/><path d=\"M22.65 18.7 L25.35 18.7\"/><path d=\"M22.65 20.6 L25.35 20.6\"/><path d=\"M22.6 11 L21.6 5.6 Q21.6 4.8 22.4 4.8 L25.6 4.8 Q26.4 4.8 26.4 5.6 L25.4 11\"/><circle cx=\"20.7\" cy=\"6.4\" r=\"0.7\"/><circle cx=\"20.7\" cy=\"8\" r=\"0.7\"/><circle cx=\"20.7\" cy=\"9.6\" r=\"0.7\"/><circle cx=\"27.3\" cy=\"6.4\" r=\"0.7\"/><circle cx=\"27.3\" cy=\"8\" r=\"0.7\"/><circle cx=\"27.3\" cy=\"9.6\" r=\"0.7\"/>",
    "keywords": [
      "resonator",
      "dobro"
    ]
  },
  {
    "name": "string-ukulele",
    "category": "strings",
    "label": "Ukulele",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 1.6
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 30 Q30.2 30 30.2 33.77 Q30.2 35.510000000000005 28.4 37.25 Q30.6 38.99 30.6 40.730000000000004 Q30.6 44.5 24 44.5 Q17.4 44.5 17.4 40.730000000000004 Q17.4 38.99 19.6 37.25 Q17.8 35.510000000000005 17.8 33.77 Q17.8 30 24 30 Z\"/><circle cx=\"24\" cy=\"37.5\" r=\"2.3\"/><path d=\"M21 41 L27 41\"/><path d=\"M22.9 20 L22.9 30\"/><path d=\"M25.1 20 L25.1 30\"/><path d=\"M22.5 30 L25.5 30\"/><path d=\"M22.9 23.75 L25.1 23.75\"/><path d=\"M22.9 25.5 L25.1 25.5\"/><path d=\"M22.9 27.25 L25.1 27.25\"/><path d=\"M23 20 L22.4 16.6 Q22.4 16 23 16 L25 16 Q25.6 16 25.6 16.6 L25 20\"/><circle cx=\"21.4\" cy=\"17\" r=\"0.75\"/><circle cx=\"21.4\" cy=\"18.8\" r=\"0.75\"/><circle cx=\"26.6\" cy=\"17\" r=\"0.75\"/><circle cx=\"26.6\" cy=\"18.8\" r=\"0.75\"/>",
    "keywords": [
      "ukulele",
      "uke"
    ]
  },
  {
    "name": "string-mandolin",
    "category": "strings",
    "label": "Mandolin",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 1.9
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 27.5 C29.5 28.5 33 32.5 33 37.4 C33 42 29.2 44.5 24 44.5 C18.8 44.5 15 42 15 37.4 C15 32.5 18.5 28.5 24 27.5 Z\"/><ellipse cx=\"24\" cy=\"36.5\" rx=\"1.9\" ry=\"2.9\"/><path d=\"M20.4 40.4 L27.6 40.4\"/><path d=\"M22.8 17 L22.8 27.5\"/><path d=\"M25.2 17 L25.2 27.5\"/><path d=\"M22.400000000000002 27.5 L25.599999999999998 27.5\"/><path d=\"M22.8 20.875 L25.2 20.875\"/><path d=\"M22.8 22.75 L25.2 22.75\"/><path d=\"M22.8 24.625 L25.2 24.625\"/><path d=\"M23 17 L22.4 13.4 Q22.4 12.8 23 12.8 L25 12.8 Q25.6 12.8 25.6 13.4 L25 17\"/><circle cx=\"21.4\" cy=\"13.6\" r=\"0.7\"/><circle cx=\"21.4\" cy=\"15.2\" r=\"0.7\"/><circle cx=\"26.6\" cy=\"13.6\" r=\"0.7\"/><circle cx=\"26.6\" cy=\"15.2\" r=\"0.7\"/>",
    "keywords": [
      "mandolin"
    ]
  },
  {
    "name": "string-banjo",
    "category": "strings",
    "label": "Banjo",
    "footprint": {
      "width_ft": 1,
      "depth_ft": 2.5
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<circle cx=\"24\" cy=\"35\" r=\"8.4\"/><circle cx=\"24\" cy=\"35\" r=\"6.6\"/><path d=\"M32.6 35 L33.6 35\"/><path d=\"M31.447818472546174 39.3 L32.31384387633061 39.8\"/><path d=\"M28.3 42.447818472546174 L28.8 43.31384387633061\"/><path d=\"M24 43.6 L24 44.6\"/><path d=\"M19.700000000000003 42.447818472546174 L19.200000000000003 43.31384387633061\"/><path d=\"M16.552181527453826 39.3 L15.686156123669388 39.8\"/><path d=\"M15.4 35 L14.4 35\"/><path d=\"M16.55218152745383 30.7 L15.68615612366939 30.2\"/><path d=\"M19.699999999999996 27.55218152745383 L19.199999999999996 26.68615612366939\"/><path d=\"M24 26.4 L24 25.4\"/><path d=\"M28.3 27.55218152745383 L28.8 26.68615612366939\"/><path d=\"M31.44781847254617 30.699999999999996 L32.31384387633061 30.199999999999996\"/><path d=\"M21 36.4 L27 36.4\"/><path d=\"M22.7 16 L22.7 26.5\"/><path d=\"M25.3 16 L25.3 26.5\"/><path d=\"M22.3 26.5 L25.7 26.5\"/><path d=\"M22.7 19.75 L25.3 19.75\"/><path d=\"M22.7 21.5 L25.3 21.5\"/><path d=\"M22.7 23.25 L25.3 23.25\"/><circle cx=\"28.6\" cy=\"21\" r=\"0.9\"/><path d=\"M22.7 16 L22.1 12.6 Q22.1 12 22.7 12 L25.3 12 Q25.9 12 25.9 12.6 L25.3 16\"/><circle cx=\"21.1\" cy=\"12.8\" r=\"0.7\"/><circle cx=\"21.1\" cy=\"14.4\" r=\"0.7\"/><circle cx=\"26.9\" cy=\"12.8\" r=\"0.7\"/><circle cx=\"26.9\" cy=\"14.4\" r=\"0.7\"/>",
    "keywords": [
      "banjo"
    ]
  },
  {
    "name": "string-violin",
    "category": "strings",
    "label": "Violin",
    "footprint": {
      "width_ft": 0.8,
      "depth_ft": 2
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 26 Q30.4 26 30.4 30.16 Q30.4 32.08 27.9 34 Q30.9 35.92 30.9 37.84 Q30.9 42 24 42 Q17.1 42 17.1 37.84 Q17.1 35.92 20.1 34 Q17.6 32.08 17.6 30.16 Q17.6 26 24 26 Z\"/><path d=\"M21.6 32 q-1.2 1 0 2 q1.2 1 0 2\"/><path d=\"M26.4 32 q1.2 1 0 2 q-1.2 1 0 2\"/><path d=\"M21.3 36 L26.7 36\"/><path d=\"M24 36.4 L22.5 41.2 L25.5 41.2 Z\"/><circle cx=\"24\" cy=\"41.2\" r=\"0.6\"/><path d=\"M22.85 14 L22.85 26\"/><path d=\"M25.15 14 L25.15 26\"/><path d=\"M22.450000000000003 26 L25.549999999999997 26\"/><circle cx=\"24\" cy=\"7\" r=\"1.8\"/><path d=\"M24 7 q1.4 0 1.4 1.4\"/><path d=\"M22.6 8.6 L22.6 13.5\"/><path d=\"M25.4 8.6 L25.4 13.5\"/><circle cx=\"21.6\" cy=\"10\" r=\"0.85\"/><circle cx=\"21.6\" cy=\"12\" r=\"0.85\"/><circle cx=\"26.4\" cy=\"10\" r=\"0.85\"/><circle cx=\"26.4\" cy=\"12\" r=\"0.85\"/>",
    "keywords": [
      "violin",
      "fiddle"
    ]
  },
  {
    "name": "string-viola",
    "category": "strings",
    "label": "Viola",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 2.2
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<g transform=\"translate(24 26) scale(1.12) translate(-24 -26)\"><path d=\"M24 26 Q30.4 26 30.4 30.16 Q30.4 32.08 27.9 34 Q30.9 35.92 30.9 37.84 Q30.9 42 24 42 Q17.1 42 17.1 37.84 Q17.1 35.92 20.1 34 Q17.6 32.08 17.6 30.16 Q17.6 26 24 26 Z\"/><path d=\"M21.6 32 q-1.2 1 0 2 q1.2 1 0 2\"/><path d=\"M26.4 32 q1.2 1 0 2 q-1.2 1 0 2\"/><path d=\"M21.3 36 L26.7 36\"/><path d=\"M24 36.4 L22.5 41.2 L25.5 41.2 Z\"/><circle cx=\"24\" cy=\"41.2\" r=\"0.6\"/><path d=\"M22.85 14 L22.85 26\"/><path d=\"M25.15 14 L25.15 26\"/><path d=\"M22.450000000000003 26 L25.549999999999997 26\"/><circle cx=\"24\" cy=\"7\" r=\"1.8\"/><path d=\"M24 7 q1.4 0 1.4 1.4\"/><path d=\"M22.6 8.6 L22.6 13.5\"/><path d=\"M25.4 8.6 L25.4 13.5\"/><circle cx=\"21.6\" cy=\"10\" r=\"0.85\"/><circle cx=\"21.6\" cy=\"12\" r=\"0.85\"/><circle cx=\"26.4\" cy=\"10\" r=\"0.85\"/><circle cx=\"26.4\" cy=\"12\" r=\"0.85\"/></g>",
    "keywords": [
      "viola"
    ]
  },
  {
    "name": "string-cello",
    "category": "strings",
    "label": "Cello",
    "footprint": {
      "width_ft": 1.6,
      "depth_ft": 4
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 21 Q31.4 21 31.4 26.2 Q31.4 28.6 28.8 31 Q32.4 33.4 32.4 35.8 Q32.4 41 24 41 Q15.6 41 15.6 35.8 Q15.6 33.4 19.2 31 Q16.6 28.6 16.6 26.2 Q16.6 21 24 21 Z\"/><path d=\"M21.6 29 q-1.2 1 0 2 q1.2 1 0 2\"/><path d=\"M26.4 29 q1.2 1 0 2 q-1.2 1 0 2\"/><path d=\"M21.3 33 L26.7 33\"/><path d=\"M24 33.4 L22.5 40.2 L25.5 40.2 Z\"/><path d=\"M24 41 L24 46.5\"/><path d=\"M22.4 46.5 L25.6 46.5\"/><path d=\"M22.75 11 L22.75 21\"/><path d=\"M25.25 11 L25.25 21\"/><path d=\"M22.35 21 L25.65 21\"/><circle cx=\"24\" cy=\"4.5\" r=\"1.8\"/><path d=\"M24 4.5 q1.4 0 1.4 1.4\"/><path d=\"M22.6 6.1 L22.6 11\"/><path d=\"M25.4 6.1 L25.4 11\"/><circle cx=\"21.6\" cy=\"7.5\" r=\"0.85\"/><circle cx=\"21.6\" cy=\"9.5\" r=\"0.85\"/><circle cx=\"26.4\" cy=\"7.5\" r=\"0.85\"/><circle cx=\"26.4\" cy=\"9.5\" r=\"0.85\"/>",
    "keywords": [
      "cello"
    ]
  },
  {
    "name": "string-double-bass",
    "category": "strings",
    "label": "Double bass",
    "footprint": {
      "width_ft": 2,
      "depth_ft": 6
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 18.5 Q30.8 18.5 30.8 24.35 Q30.8 27.05 29.2 29.75 Q33.2 32.45 33.2 35.15 Q33.2 41 24 41 Q14.8 41 14.8 35.15 Q14.8 32.45 18.8 29.75 Q17.2 27.05 17.2 24.35 Q17.2 18.5 24 18.5 Z\"/><path d=\"M21.6 27.75 q-1.2 1 0 2 q1.2 1 0 2\"/><path d=\"M26.4 27.75 q1.2 1 0 2 q-1.2 1 0 2\"/><path d=\"M21.3 31.75 L26.7 31.75\"/><path d=\"M24 32.15 L22.5 40.2 L25.5 40.2 Z\"/><path d=\"M24 41 L24 47\"/><path d=\"M22.2 47 L25.8 47\"/><path d=\"M22.7 8.5 L22.7 18.5\"/><path d=\"M25.3 8.5 L25.3 18.5\"/><path d=\"M22.3 18.5 L25.7 18.5\"/><path d=\"M22.6 8.5 L21 5\"/><path d=\"M25.4 8.5 L27 5\"/><circle cx=\"20\" cy=\"6\" r=\"1.2\"/><circle cx=\"20\" cy=\"8.2\" r=\"1.2\"/><circle cx=\"28\" cy=\"6\" r=\"1.2\"/><circle cx=\"28\" cy=\"8.2\" r=\"1.2\"/><path d=\"M21.2 6 L18.6 6\"/><path d=\"M21.2 8.2 L18.6 8.2\"/><path d=\"M26.8 6 L29.4 6\"/><path d=\"M26.8 8.2 L29.4 8.2\"/>",
    "keywords": [
      "double bass",
      "upright bass",
      "contrabass"
    ]
  },
  {
    "name": "string-lap-steel",
    "category": "strings",
    "label": "Lap steel",
    "footprint": {
      "width_ft": 0.9,
      "depth_ft": 2.8
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<rect x=\"18.5\" y=\"27\" width=\"11\" height=\"17\" rx=\"3.4\"/><rect x=\"20.5\" y=\"31.5\" width=\"7\" height=\"1.8\" rx=\"0.6\"/><path d=\"M20.5 37 L27.5 37\"/><circle cx=\"22.5\" cy=\"40\" r=\"0.7\"/><circle cx=\"25.5\" cy=\"40\" r=\"0.7\"/><path d=\"M22.5 9 L22.5 27\"/><path d=\"M25.5 9 L25.5 27\"/><path d=\"M22.1 27 L25.9 27\"/><path d=\"M22.5 9 L21.6 4.4 Q21.6 3.8 22.2 3.8 L25.8 3.8 Q26.4 3.8 26.4 4.4 L25.5 9\"/><circle cx=\"20.2\" cy=\"5\" r=\"0.75\"/><circle cx=\"20.2\" cy=\"6.6\" r=\"0.75\"/><circle cx=\"20.2\" cy=\"8.2\" r=\"0.75\"/><circle cx=\"27.8\" cy=\"5\" r=\"0.75\"/><circle cx=\"27.8\" cy=\"6.6\" r=\"0.75\"/><circle cx=\"27.8\" cy=\"8.2\" r=\"0.75\"/>",
    "keywords": [
      "lap steel",
      "steel guitar"
    ]
  },
  {
    "name": "string-harp",
    "category": "strings",
    "label": "Harp",
    "footprint": {
      "width_ft": 2.2,
      "depth_ft": 3.8
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M16 43 L18 8\"/><path d=\"M18 8 Q26 3 33.5 11\"/><path d=\"M33.5 11 L30 43\"/><path d=\"M14.5 43 L31.5 43\"/><path d=\"M19.4 9.184038001041813 L19.8 42\"/><path d=\"M21.48 7.917947028896843 L21.36 42\"/><path d=\"M23.560000000000002 7.158825257292228 L22.92 42\"/><path d=\"M25.64 7.031541194742089 L24.48 42\"/><path d=\"M27.72 7.557031891984225 L26.04 42\"/><path d=\"M29.8 8.648858990830107 L27.6 42\"/>",
    "keywords": [
      "harp"
    ]
  },
  {
    "name": "string-stand-single",
    "category": "strings",
    "label": "Guitar stand",
    "footprint": {
      "width_ft": 1.2,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M24 16 L15 42\"/><path d=\"M24 16 L33 42\"/><path d=\"M13.5 42 L19 42\"/><path d=\"M29 42 L34.5 42\"/><path d=\"M17 30 L31 30\"/><path d=\"M24 16 L20.5 10\"/><path d=\"M24 16 L27.5 10\"/><path d=\"M20.5 10 L19.6 11.4\"/><path d=\"M27.5 10 L28.4 11.4\"/>",
    "keywords": [
      "stand",
      "guitar stand",
      "a-frame"
    ]
  },
  {
    "name": "string-stand-multi",
    "category": "strings",
    "label": "Guitar rack",
    "footprint": {
      "width_ft": 3,
      "depth_ft": 1.2
    },
    "viewBox": "0 0 48 48",
    "outline": true,
    "body": "<path d=\"M7 30 L41 30\"/><path d=\"M9 30 L9 19\"/><path d=\"M39 30 L39 19\"/><path d=\"M9 19 L13 19 Q15 19 15 21 L15 23 Q15 25 17 25 L19 25 Q21 25 21 23 L21 21 Q21 19 23 19\"/><path d=\"M23 19 L25 19 Q27 19 27 21 L27 23 Q27 25 29 25 L31 25 Q33 25 33 23 L33 21 Q33 19 35 19 L39 19\"/><path d=\"M18 25 L18 16\"/><path d=\"M30 25 L30 16\"/><path d=\"M12 19 L12 16\"/><path d=\"M11 36 L17 36\"/><path d=\"M23 36 L29 36\"/><path d=\"M35 36 L41 36\"/>",
    "keywords": [
      "rack",
      "multi guitar",
      "guitar rack"
    ]
  }
];
