/* ============================================
   LOWPASS — Stage Plot musician icons (§SP1a·3, revised)

   Per review: a single generic person per gender, NOT one icon
   per role. The musician's name + instrument is a CUSTOMISABLE
   per-item label (the stage_plot_items.label field, shown small
   inside/under the figure — surfaced in the properties panel at
   §SP3), so any role is "Person + 'Jonny — Guitar'".

   Top-down silhouette: head circle + shoulders. Female is
   narrower-shouldered with a hair curve; male is broader.
   Category colour = musicians (slate).
   ============================================ */

import type { IconDescriptor } from './types';

export const musicianIcons: IconDescriptor[] = [
  {
    name: 'person-male',
    category: 'musicians',
    label: 'Person (male)',
    footprint: { width_ft: 2, depth_ft: 2 },
    keywords: ['musician', 'performer', 'man', 'player', 'people'],
    body:
      '<path d="M22 80 C22 54 78 54 78 80 Z"/>' +
      '<circle cx="50" cy="34" r="14"/>',
  },
  {
    name: 'person-female',
    category: 'musicians',
    label: 'Person (female)',
    footprint: { width_ft: 2, depth_ft: 2 },
    keywords: ['musician', 'performer', 'woman', 'player', 'people'],
    body:
      '<path d="M28 80 C28 56 72 56 72 80 Z"/>' +
      '<circle cx="50" cy="34" r="14"/>' +
      '<path d="M35 30 Q50 14 65 30" class="lp-ico-detail"/>',
  },
];
