/* ============================================
   LOWPASS — Riders: starter templates + template blocks — pure

   A template is a list of blocks without ids or places; applying one gives
   every block a fresh id and an even spread of position keys. Built-in
   starters live HERE (one list, like tourTemplates.ts); a workspace's own
   templates are rows in rider_templates, saved from a real rider.
   Starters are short on purpose: the shape of a good rider (prose where the
   wording matters, request lines for everything that can be counted, the
   summary built from them), with wording a TM edits rather than replaces.
   ============================================ */

import { parseContent, parseDates, isBlockKind } from './blocks';
import { docFromText } from './prose';
import { keysBetween } from './position';
import type { BlockContentMap, BlockKind, Provider, RequestContent, RiderKind } from './types';

export type TemplateBlock = {
  [K in BlockKind]: { kind: K; content: BlockContentMap[K]; from?: string | null; until?: string | null };
}[BlockKind];

export interface Starter {
  id: string;
  name: string;
  kind: RiderKind;
  blurb: string;
  blocks: TemplateBlock[];
}

/* ---------- tiny builders ---------- */

const h = (text: string, level: 1 | 2 = 1): TemplateBlock => ({ kind: 'heading', content: { text, level } });
const p = (text: string): TemplateBlock => ({ kind: 'text', content: { doc: docFromText(text) } });
const req = (
  item: string,
  o: { qty?: number | null; who?: Provider | null; or?: string; note?: string; optional?: boolean; perPerson?: boolean; summary?: boolean } = {},
): TemplateBlock => {
  const c: RequestContent = {
    qty: o.qty ?? null,
    item,
    provider: o.who === undefined ? 'venue' : o.who,
    alternatives: o.or ?? '',
    note: o.note ?? '',
    optional: o.optional ?? false,
    perPerson: o.perPerson ?? false,
    summary: o.summary ?? false,
    link: '',
    photo: null,
  };
  return { kind: 'request', content: c };
};
const contacts = (): TemplateBlock => ({ kind: 'contacts', content: { people: [] } });
const summary = (): TemplateBlock => ({ kind: 'summary', content: { title: 'Advance summary' } });
const inputList = (): TemplateBlock => ({ kind: 'input_list', content: { outputs: true } });
const stagePlot = (): TemplateBlock => ({ kind: 'stage_plot', content: {} });

const DISCLAIMER =
  'This rider is part of the performance agreement. Every venue is different: if anything here doesn’t suit your room, talk to the tour manager before the show, not on the day. Anything struck from this rider must be agreed in writing by the tour manager.';

export const STARTERS: Starter[] = [
  {
    id: 'headline-tech',
    name: 'Headline show — Tech',
    kind: 'tech',
    blurb: 'Schedule, transport, local crew, security, stage, lighting, audio, input list and stage plot.',
    blocks: [
      p(DISCLAIMER),
      h('Key contacts'),
      contacts(),
      summary(),
      h('Schedule'),
      p('We need 3 hours for load in, set up and soundcheck. The changeover into our set needs at least 30 minutes.\nPlease tell us about any curfew, noise limit or early load out as soon as you know.'),
      h('Transport & parking'),
      req('Parking for our vehicles from arrival until after load out', { summary: true }),
      req('Shore power for the bus', { optional: true }),
      req('A clear, level route from the vehicles to the stage', { summary: true }),
      p('Please send parking instructions, the load-in route and any restrictions, so we can pass them to our driver.'),
      h('Local crew'),
      req('Stagehand for load in and load out', { qty: 1, summary: true, note: 'Please tell us the minimum call.' }),
      req('FOH technician for load in, show and load out', { qty: 1, summary: true }),
      req('Lighting technician for load in, show and load out', { qty: 1, summary: true }),
      p('All local crew to be competent, sober and briefed on the building.'),
      h('Security'),
      p('Professional, sober security from load in until the building is clear: stage front, backstage, dressing rooms and our vehicles. Backstage is for the touring party and people the tour manager names.'),
      req('Security walk-through with the tour manager before doors', { summary: true }),
      h('Stage & set'),
      req('Drum riser 8x8x1, rolling, skirted', { qty: 1, or: 'Two 4x8x1 decks', summary: true }),
      h('Power'),
      p('All power must be clean, earthed and dedicated to us — not shared with catering or lighting dimmers.'),
      req('Stage power for backline and audio, as marked on the stage plot', { summary: true }),
      req('Separate supply at FOH for our console and playback', { qty: 1 }),
      req('A qualified electrician on call from load in to load out', { qty: 1, optional: true }),
      h('Lighting'),
      p('We carry a small floor package. We need your house rig, haze and an LD to run it.'),
      req('Hazer with fan and fluid'),
      h('Audio'),
      p('We carry our FOH console and stage boxes and run monitors from FOH.\nThe PA must give 110 dB(A) at FOH with front fills where needed; processing visible to our engineer. Please send PA details and any dB limit in advance.'),
      req('6 ft table at FOH, level and sturdy', { qty: 1, summary: true }),
      req('Quad power drop at FOH', { qty: 1 }),
      req('Drive lines direct into the house system, no sub-desk'),
      req('Full line package, stands and stage power', { summary: true }),
      h('Input list & stage plot'),
      inputList(),
      stagePlot(),
      h('Merch'),
      p('We carry merch and a seller. Please advance the merch split, space and float.'),
      req('Merch space with a table, light and power', { qty: 1 }),
    ],
  },
  {
    id: 'support-tech',
    name: 'Support slot — Tech',
    kind: 'tech',
    blurb: 'Line check, transport, the few things a support act asks for.',
    blocks: [
      p(DISCLAIMER),
      h('Key contacts'),
      contacts(),
      summary(),
      h('Schedule'),
      p('We need a 20-minute line check and a 15-minute changeover. Please send the day’s schedule when you have it.'),
      h('Transport & parking'),
      req('Parking for one van from arrival until after load out', { qty: 1, summary: true }),
      h('Audio'),
      p('We share the headliner’s system. We carry our own mics and in-ears.'),
      req('Lines and stands per our input list', { summary: true }),
      req('Stage power at each position on our plot'),
      h('Input list & stage plot'),
      inputList(),
      stagePlot(),
    ],
  },
  {
    id: 'headline-hospitality',
    name: 'Headline show — Hospitality',
    kind: 'hospitality',
    blurb: 'Each room and what goes in it, showers and towels, catering.',
    blocks: [
      p(DISCLAIMER),
      h('Key contacts'),
      contacts(),
      p('Every room must be lockable, clean, heated or cooled, with plenty of sockets, a mirror and bins. Keys to the tour manager at load in.'),
      h('ARTIST ROOM — Dressing Room One'),
      req('Lockable private room with a sofa and seating for 4', { qty: 1, summary: true }),
      req('Full-length mirror and a lit make-up mirror', { qty: 1 }),
      req('Clothes rail with hangers and a steamer', { qty: 1 }),
      req('Still water (cans or cartons)', { qty: 12 }),
      req('Fresh fruit platter', { qty: 1 }),
      req('Coffee and tea with hot water, honey, lemon and fresh ginger', { qty: 1 }),
      h('BAND ROOM — Dressing Room Two'),
      req('Lockable room with seating for the band and crew', { qty: 1, summary: true }),
      req('Still water (cans or cartons)', { qty: 24 }),
      req('Sparkling water', { qty: 12 }),
      req('Hummus, crackers and crudités', { qty: 1 }),
      req('Local beers', { qty: 12 }),
      req('Bottle of red wine', { qty: 1, optional: true }),
      h('PROD OFFICE — PO One'),
      req('Production office with Wi-Fi, a table and chairs, near the stage', { qty: 1, summary: true }),
      req('Access to a printer', { qty: 1, optional: true }),
      h('Showers & towels'),
      req('Black hand towels for the stage', { qty: 10, summary: true }),
      req('Shower towels', { qty: 1, perPerson: true, summary: true }),
      p('Hot showers from load in to load out.'),
      h('If budget is tight'),
      p('Please cut in this order: wine, beer, snacks. Never water or towels.'),
      h('Catering'),
      p('Where you can, please avoid plastic. If you’re providing a meal, please send the menu in advance for approval. Otherwise, a meal buyout per person as agreed in the deal.'),
      req('Meal buyouts', { qty: 1, perPerson: true, summary: true, who: 'promoter' }),
    ],
  },
  {
    id: 'support-hospitality',
    name: 'Support slot — Hospitality',
    kind: 'hospitality',
    blurb: 'A room, towels, water and buyouts.',
    blocks: [
      p(DISCLAIMER),
      h('Key contacts'),
      contacts(),
      h('Dressing room'),
      req('Lockable dressing room or a lockable space', { qty: 1, summary: true }),
      h('Towels & water'),
      req('Hand towels for the stage', { qty: 5 }),
      req('Still water', { qty: 1, perPerson: true }),
      h('Catering'),
      req('Meal buyouts', { qty: 1, perPerson: true, summary: true, who: 'promoter' }),
    ],
  },
  {
    id: 'festival-tech',
    name: 'Festival — Tech',
    kind: 'tech',
    blurb: 'Changeover and line check, the festival’s patch, our desk at FOH, input list and stage plot.',
    blocks: [
      p(DISCLAIMER),
      h('Key contacts'),
      contacts(),
      summary(),
      h('Schedule'),
      p('We need a 30-minute changeover and a 15-minute line check. Please send the stage running order and our slot as soon as they’re fixed.'),
      h('Transport & parking'),
      req('Parking for our vehicles in the artist compound', { summary: true }),
      req('Transport from the compound to the stage for the band and backline', { summary: true }),
      h('Audio'),
      p('We bring our own console and patch into the festival’s system. Please send the patch, the PA and monitor spec and any dB limit in advance.'),
      req('FOH position for our console, with power', { qty: 1, summary: true }),
      req('Rolling risers for drums and keys', { qty: 2, optional: true }),
      h('Input list & stage plot'),
      inputList(),
      stagePlot(),
    ],
  },
  {
    id: 'festival-hospitality',
    name: 'Festival — Hospitality',
    kind: 'hospitality',
    blurb: 'A room in the artist compound, towels, water, catering or buyouts, wristbands.',
    blocks: [
      p(DISCLAIMER),
      h('Key contacts'),
      contacts(),
      h('Artist compound'),
      req('Lockable dressing room or cabin with seating for the touring party', { qty: 1, summary: true }),
      req('Still water (cans or cartons)', { qty: 24 }),
      req('Black hand towels for the stage', { qty: 10, summary: true }),
      h('Catering'),
      req('Catering tokens or meal buyouts', { qty: 1, perPerson: true, summary: true, who: 'promoter' }),
      h('Wristbands'),
      req('Artist wristbands for the touring party', { qty: 1, perPerson: true, summary: true, who: 'promoter' }),
    ],
  },
];

export function starterById(id: string): Starter | null {
  return STARTERS.find((s) => s.id === id) ?? null;
}

/** Template blocks from stored JSON (rider_templates.blocks) — every block
 *  through the content gate; unknown kinds dropped. */
export function parseTemplateBlocks(raw: unknown): TemplateBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateBlock[] = [];
  for (const b of raw.slice(0, 2000)) {
    const x = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    if (!isBlockKind(x.kind)) continue;
    const d = parseDates(x.from, x.until);
    out.push({ kind: x.kind, content: parseContent(x.kind, x.content), from: d.from, until: d.until } as TemplateBlock);
  }
  return out;
}

export interface NewBlockRow {
  id: string;
  kind: BlockKind;
  content: unknown;
  position: string;
  from: string | null;
  until: string | null;
}

/** Template blocks → rows to insert after `after` (and before `before`). */
export function placeBlocks(blocks: readonly TemplateBlock[], newId: () => string, after: string | null = null, before: string | null = null): NewBlockRow[] {
  const keys = keysBetween(after, before, blocks.length);
  return blocks.map((b, i) => ({ id: newId(), kind: b.kind, content: b.content, position: keys[i], from: b.from ?? null, until: b.until ?? null }));
}
