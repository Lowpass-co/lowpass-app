/* ============================================
   LOWPASS — Stage Plot icon categories (§SP1a·1)

   The 12 v1 categories. `badge` is the colour-blind-safe
   primary signal (2–3 chars); `colorVar` is the reinforcing
   hue defined in globals.css (--lp-plot-cat-*, light + dark).
   Order is palette display order.
   ============================================ */

import type { IconCategory, IconCategoryKey } from './types';

export const CATEGORIES: IconCategory[] = [
  { key: 'musicians',      label: 'Musicians',      badge: 'MUS', colorVar: 'var(--lp-plot-cat-musicians)' },
  { key: 'drums',          label: 'Drums',          badge: 'DRM', colorVar: 'var(--lp-plot-cat-drums)' },
  { key: 'strings',        label: 'Strings',        badge: 'STR', colorVar: 'var(--lp-plot-cat-strings)' },
  { key: 'keys',           label: 'Keys',           badge: 'KEY', colorVar: 'var(--lp-plot-cat-keys)' },
  { key: 'amps',           label: 'Amps & cabs',    badge: 'AMP', colorVar: 'var(--lp-plot-cat-amps)' },
  { key: 'mics',           label: 'Microphones',    badge: 'MIC', colorVar: 'var(--lp-plot-cat-mics)' },
  { key: 'monitors',       label: 'Monitors & IEM', badge: 'MON', colorVar: 'var(--lp-plot-cat-monitors)' },
  { key: 'signal',         label: 'Signal & I/O',   badge: 'I/O', colorVar: 'var(--lp-plot-cat-signal)' },
  { key: 'infrastructure', label: 'Infrastructure', badge: 'INF', colorVar: 'var(--lp-plot-cat-infrastructure)' },
  { key: 'lighting',       label: 'Lighting',       badge: 'LX',  colorVar: 'var(--lp-plot-cat-lighting)' },
  { key: 'stands',         label: 'Stands',         badge: 'STD', colorVar: 'var(--lp-plot-cat-stands)' },
  { key: 'utility',        label: 'Utility',        badge: 'UTL', colorVar: 'var(--lp-plot-cat-utility)' },
];

const BY_KEY: Record<IconCategoryKey, IconCategory> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<IconCategoryKey, IconCategory>,
);

export function getCategory(key: IconCategoryKey): IconCategory {
  return BY_KEY[key];
}

/** Literal light-mode category hexes (mirror of the --lp-plot-cat-*
 *  tokens in globals.css). For server-side PDF rendering (§SP7),
 *  where the app's CSS custom properties aren't available. */
export const CATEGORY_HEX: Record<IconCategoryKey, string> = {
  musicians: '#475569',
  mics: '#2563EB',
  drums: '#525252',
  strings: '#15803D',
  keys: '#7C3AED',
  amps: '#B45309',
  monitors: '#0F766E',
  signal: '#0369A1',
  infrastructure: '#78716C',
  lighting: '#A16207',
  stands: '#64748B',
  utility: '#BE123C',
};
