/* ============================================
   LOWPASS — Riders: where "per person" makes sense (Nov 2026, Adam)

   "Per person" multiplies a line by the touring party ("2 towels per person"
   → 24). That only means something for things each PERSON gets — food, drink,
   towels, buyouts, passes, beds. A DI box or a sofa per person is nonsense,
   so the option is offered only on those lines (in either document): the
   item names one, or the section it sits under is about one ("Catering",
   "Drinks", "Buyouts"). A line already ticked keeps showing its box, so it
   can be unticked.

   "If possible" is different — any line can be a nice-to-have, Tech too.
   ============================================ */

const PERSONAL_ITEM = new RegExp(
  '\\b(?:' +
    [
      'towels?', 'bath towels?', 'meals?', 'hot meals?', 'breakfasts?', 'lunch(?:es)?', 'dinners?', 'suppers?',
      'buy-?outs?', 'per ?diems?', 'snacks?', 'sandwich(?:es)?', 'fruit', 'salads?',
      'waters?', 'bottles?', 'beers?', 'ciders?', 'wines?', 'spirits?', 'drinks?', 'juices?', 'sodas?',
      'coffees?', 'teas?', 'smoothies?', 'kombucha', 'energy drinks?',
      'laundry', 'wristbands?', 'laminates?', 'passes', 'tickets?', 'guest ?list', 'lanyards?',
      'beds?', 'bunks?', 'hotel', 'earplugs?',
    ].join('|') +
    ')\\b',
  'i',
);

const PERSONAL_SECTION = new RegExp(
  '\\b(?:catering|meals?|breakfast|lunch|dinner|food|drinks?|beverages?|buy-?outs?|per ?diems?|towels?|laundry|accommodation|hotels?|guest ?list|passes|tickets?)\\b',
  'i',
);

/** Does "per person" make sense for this line? `section` = the heading it
 *  sits under ('' if none). */
export function perPersonFits(item: string, section: string): boolean {
  return PERSONAL_ITEM.test(item) || PERSONAL_SECTION.test(section);
}

/** The text of the nearest heading above block `index` in a document's
 *  ordered blocks ('' if none). */
export function sectionAbove(blocks: ReadonlyArray<{ kind: string; content: unknown }>, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === 'heading') {
      const t = (b.content as { text?: unknown } | null)?.text;
      return typeof t === 'string' ? t : '';
    }
  }
  return '';
}
