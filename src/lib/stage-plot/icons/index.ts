/* ============================================
   LOWPASS — Stage Plot icon registry (§SP1a·1)

   Single lookup surface for every hand-authored icon. Category
   icon sets register into ALL_ICONS as each phase lands:

     §SP1a·2  drums (22, incl. left-handed)
     §SP1a·3  mics (18) + musicians (12)
     §SP1b    amps (17), keys (12), strings (17)
     §SP1c    monitors, signal, infrastructure, lighting,
              stands, utility/annotations

   Custom + AI icons (§SP10/§SP11) live in the DB
   (stage_plot_custom_items), not here — they are resolved
   separately by the palette.
   ============================================ */

import { CATEGORIES, CATEGORY_HEX, getCategory } from './categories';
import { drumIcons } from './drums';
import { drumAuxIcons } from './drums-aux';
import { drumComposites } from './drums-composites';
import { micIcons } from './mics';
import { musicianIcons } from './musicians';
import { ampIcons } from './amps';
import { keyIcons } from './keys';
import { stringIcons } from './strings';
import { monitorIcons } from './monitors';
import { signalIcons } from './signal';
import { infrastructureIcons } from './infrastructure';
import { lightingIcons } from './lighting';
import { standIcons } from './stands';
import { utilityIcons } from './utility';
import type { IconCategoryKey, IconDescriptor } from './types';

/** Every built-in icon. Spread category arrays here as they ship. */
export const ALL_ICONS: IconDescriptor[] = [
  ...drumIcons, // §SP1a·2a core kit
  ...drumAuxIcons, // §SP1a·2b aux percussion
  ...drumComposites, // §SP1a·2b RH/LH kit composites
  ...micIcons, // §SP1a·3 microphones
  ...musicianIcons, // §SP1a·3 musicians
  ...ampIcons, // §SP1b amplifiers & cabinets
  ...keyIcons, // §SP1b keyboards
  ...stringIcons, // §SP1b stringed instruments
  ...monitorIcons, // §SP1c monitors & IEM
  ...signalIcons, // §SP1c signal & I/O
  ...infrastructureIcons, // §SP1c stage infrastructure
  ...lightingIcons, // §SP1c lighting
  ...standIcons, // §SP1c stands & supports
  ...utilityIcons, // §SP1c utility & annotations
];

const BY_NAME = new Map<string, IconDescriptor>(ALL_ICONS.map((i) => [i.name, i]));

/** Resolve a built-in icon by its registry key (icon_name). */
export function getIcon(name: string): IconDescriptor | undefined {
  return BY_NAME.get(name);
}

/** Built-in icons in a category, in registration order. */
export function listIconsByCategory(key: IconCategoryKey): IconDescriptor[] {
  return ALL_ICONS.filter((i) => i.category === key);
}

/** Loose name/label/keyword match for the palette + ⌘K. */
export function searchIcons(query: string): IconDescriptor[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_ICONS;
  return ALL_ICONS.filter((i) => {
    const hay = [i.name, i.label, ...(i.keywords ?? [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export { CATEGORIES, CATEGORY_HEX, getCategory };
export type { IconDescriptor, IconCategoryKey } from './types';
