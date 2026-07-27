/* ============================================
   LOWPASS — OCR category → a real budget section (RQ-7)

   Cowork's walk: the scan returned `category: "catering"`, the proposal came
   back `sectionId: null, sectionName: "catering"`, and the line was created in
   **Uncategorised**. The signal was there and thrown away at the last step.

   Why the old code missed it: it matched the category against existing section
   names by EXACT normalised equality. "catering" hits a section literally named
   "Catering", and nothing else — not "Catering & Hospitality", not "Food & Bev",
   not "Fuel" for a category of "fuel". One spelling, one hit.

   Three passes, most-certain first:
     1. EXACT on the normalised name. Unambiguous, so it wins.
     2. ALIAS → the vocabulary an extractor uses ("gas", "petrol", "lodging")
        against the vocabulary a tour manager types ("Fuel", "Hotels"). This is
        domain knowledge, not string distance, and no similarity score would ever
        connect "gas" to "Transport".
     3. FUZZY via nameSimilarity — the SAME Dice-bigram matcher the receipt
        de-duper uses (src/lib/import/dedupe.ts). One fuzzy matcher in this
        codebase, not two.

   And when all three miss, we PROPOSE CREATING the section rather than dropping
   the line in Uncategorised. Uncategorised is where information goes to die: it
   is indistinguishable from "we didn't know", so nobody ever revisits it. A
   proposed new section is visible, named, and one click to change.

   Pure — no Supabase, no React. Every rule here is testable directly.
   ============================================ */

import { nameSimilarity } from '@/lib/import/dedupe';

/** How close a fuzzy name match must be to count. Below this we'd be guessing,
 *  and a wrong section is worse than an honest "new section?" proposal. */
const FUZZY_THRESHOLD = 0.62;

export interface SectionOption {
  id: string | null;
  name: string;
}

export interface SectionResolution {
  sectionId: string | null;
  sectionName: string;
  /** True when no existing section fits and we're proposing a new one. */
  createSection: boolean;
  /** How we got here — shown on the proposal card so the choice is auditable. */
  reason: string;
}

/* The alias table. Left side is extractor vocabulary; right side is the section
   name a tour manager would recognise. Kept SMALL and specific on purpose — a
   sprawling table becomes its own source of wrong answers, and the fuzzy pass
   already covers near-spellings. */
const ALIASES: Array<{ terms: string[]; section: string }> = [
  { terms: ['catering', 'food', 'meals', 'hospitality', 'rider food', 'buyout'], section: 'Catering' },
  { terms: ['fuel', 'gas', 'petrol', 'diesel'], section: 'Fuel' },
  { terms: ['parking', 'tolls', 'toll', 'taxi', 'cab', 'rideshare', 'uber', 'transport', 'transportation', 'ground'], section: 'Transport' },
  { terms: ['hotel', 'lodging', 'accommodation', 'accomodation', 'room', 'rooms'], section: 'Hotels' },
  { terms: ['per diem', 'perdiem', 'per diems'], section: 'Per Diems' },
  { terms: ['flight', 'flights', 'airfare', 'baggage', 'excess baggage'], section: 'Travel' },
  { terms: ['production', 'backline', 'gear', 'equipment', 'rental', 'hire'], section: 'Production' },
  { terms: ['freight', 'shipping', 'cartage', 'courier'], section: 'Freight' },
  { terms: ['crew', 'labour', 'labor', 'runner', 'local crew'], section: 'Crew' },
  { terms: ['visa', 'visas', 'carnet', 'immigration'], section: 'Visas & Carnet' },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** True when every word of `needle` appears as a whole word in `haystack`. */
function wordsContain(haystack: string, needle: string): boolean {
  const words = new Set(norm(haystack).split(' ').filter(Boolean));
  const parts = norm(needle).split(' ').filter(Boolean);
  return parts.length > 0 && parts.every((w) => words.has(w));
}

/** The section name an alias points at, or null. */
export function aliasFor(category: string): string | null {
  const c = norm(category);
  if (!c) return null;
  for (const { terms, section } of ALIASES) {
    if (terms.some((t) => norm(t) === c)) return section;
  }
  // Also match when the category CONTAINS an alias term as a whole word
  // ("airport parking" → parking). Guarded to word boundaries so "gasket"
  // never reads as "gas".
  const words = new Set(c.split(' '));
  for (const { terms, section } of ALIASES) {
    if (terms.some((t) => norm(t).split(' ').every((w) => words.has(w)))) return section;
  }
  return null;
}

/**
 * Decide which section a receipt's category belongs in.
 *
 * `sections` is what the tour actually has. A resolution NEVER invents a
 * sectionId — an id is only ever returned when it came from an existing
 * section, so a proposal can't point at something that doesn't exist.
 */
export function resolveSection(
  category: string | null | undefined,
  sections: SectionOption[],
  fallbackName = 'Uncategorised',
): SectionResolution {
  const cat = (category ?? '').trim();
  if (!cat) {
    return {
      sectionId: null,
      sectionName: fallbackName,
      createSection: false,
      reason: 'No category was read from the receipt',
    };
  }

  const named = sections.filter((s) => s.name?.trim());

  // 1. exact, on the normalised name
  const exact = named.find((s) => norm(s.name) === norm(cat));
  if (exact) {
    return {
      sectionId: exact.id,
      sectionName: exact.name,
      createSection: false,
      reason: `“${cat}” matches your ${exact.name} section`,
    };
  }

  /* 1b. CONTAINMENT. "Catering & Hospitality" IS the catering section, but Dice
     similarity scores it 0.50 against "Catering" — a longer name dilutes the
     overlap, so length alone can push a certain match below any threshold. That
     is what let the original bug through even where the section existed. Whole
     words only, so "Catering" never matches "Cater-Waiter Deposit" by accident. */
  const contained = named.find((s) => wordsContain(s.name, cat));
  if (contained) {
    return {
      sectionId: contained.id,
      sectionName: contained.name,
      createSection: false,
      reason: `“${cat}” matches your ${contained.name} section`,
    };
  }

  // 2. alias — extractor vocabulary → tour-manager vocabulary
  const alias = aliasFor(cat);
  if (alias) {
    const hit =
      named.find((s) => norm(s.name) === norm(alias)) ??
      named.find((s) => wordsContain(s.name, alias)) ??
      named.find((s) => nameSimilarity(s.name, alias) >= FUZZY_THRESHOLD);
    if (hit) {
      return {
        sectionId: hit.id,
        sectionName: hit.name,
        createSection: false,
        reason: `“${cat}” is ${alias} — filed under ${hit.name}`,
      };
    }
  }

  // 3. fuzzy, against the section names the tour really has
  let best: { s: SectionOption; score: number } | null = null;
  for (const s of named) {
    const score = nameSimilarity(s.name, cat);
    if (!best || score > best.score) best = { s, score };
  }
  if (best && best.score >= FUZZY_THRESHOLD) {
    return {
      sectionId: best.s.id,
      sectionName: best.s.name,
      createSection: false,
      reason: `“${cat}” looks like your ${best.s.name} section`,
    };
  }

  /* 4. nothing fits → propose CREATING it, named from the alias when we have one
        (so "gas" proposes "Fuel", not "gas") and otherwise from the category,
        title-cased. Never silently Uncategorised. */
  const proposed = alias ?? titleCase(cat);
  return {
    sectionId: null,
    sectionName: proposed,
    createSection: true,
    reason: `No section matches “${cat}” — proposing a new ${proposed} section`,
  };
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
