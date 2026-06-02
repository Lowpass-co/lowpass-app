/* ============================================
   LOWPASS — Stage Plot microphone icons (§SP1, redesign)

   Recognizable PROFILE silhouettes (traced from the actual
   mics), outline-rendered like the strings set rather than
   top-down dots. viewBox 0 0 48 48, outline:true → line-art in
   the category colour.

   Footprints are real-world floor space: stand mics ~1 ft (the
   base), handheld ~0.5 ft, worn/clipped mics ~0.3 ft (a headset
   does NOT occupy a square foot).
   ============================================ */

import type { IconDescriptor } from './types';

/** Stem + round stand base. */
const stand = (cx: number, fromY: number, baseY: number): string =>
  `<path d="M${cx} ${fromY} L${cx} ${baseY - 2}"/><path d="M${cx - 6} ${baseY} Q${cx} ${baseY - 3.5} ${cx + 6} ${baseY}"/>`;

/** SM58-style ball-grille head + tapered body, ball centred at (cx, ballY). */
const sm58 = (cx: number, ballY: number, bodyBot: number): string =>
  `<path d="M${cx} ${ballY - 6.3} C${cx - 6} ${ballY - 6.3} ${cx - 6.8} ${ballY - 3} ${cx - 6.8} ${ballY} C${cx - 6.8} ${ballY + 3.5} ${cx - 5.6} ${ballY + 5} ${cx - 5.3} ${ballY + 7} L${cx - 4.8} ${bodyBot - 2} C${cx - 4.8} ${bodyBot} ${cx - 2.6} ${bodyBot + 1} ${cx} ${bodyBot + 1} C${cx + 2.6} ${bodyBot + 1} ${cx + 4.8} ${bodyBot} ${cx + 4.8} ${bodyBot - 2} L${cx + 5.3} ${ballY + 7} C${cx + 5.6} ${ballY + 5} ${cx + 6.8} ${ballY + 3.5} ${cx + 6.8} ${ballY} C${cx + 6.8} ${ballY - 3} ${cx + 6} ${ballY - 6.3} ${cx} ${ballY - 6.3} Z"/>` +
  `<path d="M${cx - 6.4} ${ballY - 1.5} Q${cx} ${ballY + 1} ${cx + 6.4} ${ballY - 1.5}"/>` +
  `<path d="M${cx - 6} ${ballY + 2.5} Q${cx} ${ballY + 5} ${cx + 6} ${ballY + 2.5}"/>`;

export const micIcons: IconDescriptor[] = [
  {
    name: 'mic-vocal', category: 'mics', label: 'Vocal (SM58)',
    footprint: { width_ft: 1, depth_ft: 1 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['sm58', 'vocal', 'dynamic', 'ball', 'shure'],
    body: sm58(24, 12, 28) + stand(24, 29, 42),
  },
  {
    name: 'mic-vocal-wireless', category: 'mics', label: 'Wireless (SM58)',
    footprint: { width_ft: 0.5, depth_ft: 0.5 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['wireless', 'sm58', 'handheld', 'transmitter', 'shure'],
    // SM58 head + longer fat body (transmitter) + antenna stub, no stand
    body: sm58(24, 12, 36) + '<path d="M24 37 L24 43"/>',
  },
  {
    name: 'mic-condenser-pencil', category: 'mics', label: 'Pencil condenser',
    footprint: { width_ft: 1, depth_ft: 1 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['pencil', 'condenser', 'small diaphragm', 'overhead'],
    body: '<rect x="20.5" y="6" width="7" height="22" rx="3.5"/><path d="M20.5 10 L27.5 10"/>' + stand(24, 28, 42),
  },
  {
    name: 'mic-condenser-large', category: 'mics', label: 'Large-diaphragm condenser',
    footprint: { width_ft: 1, depth_ft: 1 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['condenser', 'large diaphragm', 'studio', 'u87'],
    body: '<rect x="17" y="7" width="14" height="20" rx="6"/><path d="M17 13 L31 13"/><path d="M17 18 L31 18"/><path d="M17 23 L31 23"/>' + stand(24, 28, 42),
  },
  {
    name: 'mic-overhead', category: 'mics', label: 'Overhead (AKG C414)',
    footprint: { width_ft: 1.2, depth_ft: 1.2 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['overhead', 'akg', 'c414', 'condenser', 'flat grille'],
    // C414's distinctive flat rectangular headbasket + vertical grille
    body: '<rect x="15" y="6" width="18" height="20" rx="3"/><path d="M20 9 L20 23"/><path d="M24 9 L24 23"/><path d="M28 9 L28 23"/>' + stand(24, 26, 42),
  },
  {
    name: 'mic-lavalier', category: 'mics', label: 'Lavalier',
    footprint: { width_ft: 0.3, depth_ft: 0.3 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['lavalier', 'lav', 'lapel', 'tie clip'],
    body: '<rect x="20.5" y="13" width="7" height="11" rx="3.5"/><path d="M24 24 Q28 31 22 38"/>',
  },
  {
    name: 'mic-headset', category: 'mics', label: 'Headset',
    footprint: { width_ft: 0.3, depth_ft: 0.3 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['headset', 'earset', 'worn', 'fitness'],
    body: '<path d="M13 32 Q13 11 24 10 Q35 11 35 32"/><circle cx="34" cy="32" r="2.6"/><path d="M33 33 Q29 38 24 38"/><circle cx="23" cy="38" r="2.2"/>',
  },
  {
    name: 'mic-shotgun', category: 'mics', label: 'Shotgun',
    footprint: { width_ft: 0.8, depth_ft: 1.2 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['shotgun', 'boom', 'interference tube', 'directional'],
    body: '<rect x="20.5" y="4" width="7" height="30" rx="3.5"/><path d="M21.5 9 L26.5 9"/><path d="M21.5 13 L26.5 13"/><path d="M21.5 17 L26.5 17"/><path d="M21.5 21 L26.5 21"/>' + stand(24, 34, 44),
  },
  {
    name: 'mic-kick', category: 'mics', label: 'Kick (D6)',
    footprint: { width_ft: 0.8, depth_ft: 0.8 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['kick', 'd6', 'beta52', 'bass drum'],
    body: '<circle cx="24" cy="14" r="8.5"/><path d="M16.5 17 L18.5 28 Q18.5 30 24 30 Q29.5 30 29.5 28 L31.5 17 Z"/>' + stand(24, 30, 43),
  },
  {
    name: 'mic-ribbon', category: 'mics', label: 'Ribbon',
    footprint: { width_ft: 1, depth_ft: 1 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['ribbon', 'royer', 'figure 8'],
    body: '<rect x="18" y="7" width="12" height="23" rx="6"/><text class="lp-ico-label" x="24" y="17" text-anchor="middle" dominant-baseline="central" font-size="9">R</text>' + stand(24, 30, 43),
  },
  {
    name: 'mic-tom-clip', category: 'mics', label: 'Tom clip',
    footprint: { width_ft: 0.3, depth_ft: 0.3 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['tom', 'clip', 'rim mount', 'drum mic'],
    body: '<rect x="19" y="11" width="8" height="13" rx="4"/><path d="M27 15 Q33 15 33 21 Q33 27 27 27"/>',
  },
  {
    name: 'mic-talkback', category: 'mics', label: 'Talkback',
    footprint: { width_ft: 0.6, depth_ft: 0.6 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['talkback', 'com', 'desk', 'intercom'],
    body: sm58(24, 11, 25) + '<text class="lp-ico-label" x="24" y="19" text-anchor="middle" dominant-baseline="central" font-size="6.5">TB</text><path d="M24 26 L24 31"/><rect x="16" y="31" width="16" height="5" rx="2"/>',
  },
  {
    name: 'mic-choir', category: 'mics', label: 'Hanging choir',
    footprint: { width_ft: 0.3, depth_ft: 0.3 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['choir', 'hanging', 'overhead', 'condenser'],
    body: '<path d="M24 5 L24 15"/><rect x="21" y="15" width="6" height="16" rx="3"/><path d="M21 27 L27 27"/>',
  },
  {
    name: 'mic-pad-trigger', category: 'mics', label: 'Drum trigger',
    footprint: { width_ft: 0.3, depth_ft: 0.3 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['trigger', 'drum', 'puck', 'ddrum'],
    body: '<ellipse cx="24" cy="22" rx="10" ry="6.5"/><path d="M14 22 Q11.5 22 11.5 18.5"/><path d="M24 28.5 L24 34"/>',
  },
  {
    name: 'mic-area', category: 'mics', label: 'Area / ambient',
    footprint: { width_ft: 1.2, depth_ft: 1 }, viewBox: '0 0 48 48', outline: true,
    keywords: ['area', 'ambient', 'spaced pair', 'room'],
    body: '<circle cx="17" cy="12" r="4.5"/><circle cx="31" cy="12" r="4.5"/><path d="M17 16.5 L17 26"/><path d="M31 16.5 L31 26"/><path d="M14 26 L34 26"/>' + stand(24, 26, 42),
  },
];
