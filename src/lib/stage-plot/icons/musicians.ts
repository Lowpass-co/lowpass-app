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
      '<path d="M24 80 C24 55 76 55 76 80 Z"/>' +
      '<circle cx="50" cy="34" r="13"/>' +
      // understated hair cue (short hairline over the crown) — same
      // build as the male figure, just a small differentiator
      '<path d="M38 29 Q50 21 62 29" class="lp-ico-detail"/>',
  },
];
