/* ============================================
   LOWPASS — category → section (RQ-7 · RCP-16)

   The bug: OCR read `category: "catering"` and the line still landed in
   Uncategorised. So the tests are organised around the two ways that happened —
   the section exists but is spelled differently, and no section exists at all —
   plus the rule that keeps this honest: never invent a sectionId, and never fall
   back to Uncategorised silently.

   Named .test.tsx because vitest is scoped to that extension here; the module is
   pure TypeScript with no DOM.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { resolveSection, aliasFor } from './receiptSection';

const TOUR_SECTIONS = [
  { id: 's1', name: 'Catering & Hospitality' },
  { id: 's2', name: 'Transport' },
  { id: 's3', name: 'Hotels' },
  { id: 's4', name: 'Production' },
];

describe('RCP-16 — the walk that failed', () => {
  it('“catering” finds Catering & Hospitality instead of Uncategorised', () => {
    const r = resolveSection('catering', TOUR_SECTIONS);
    expect(r.sectionId).toBe('s1');
    expect(r.sectionName).toBe('Catering & Hospitality');
    expect(r.createSection).toBe(false);
  });

  it('a fuel receipt proposes transport/fuel, never Uncategorised', () => {
    const r = resolveSection('fuel', TOUR_SECTIONS);
    // This tour has no Fuel section, so it proposes creating one — the point is
    // that it does NOT quietly become Uncategorised.
    expect(r.sectionName).not.toBe('Uncategorised');
    expect(r.createSection).toBe(true);
    expect(r.sectionName).toBe('Fuel');
  });

  it('“parking” routes to Transport via the alias table', () => {
    const r = resolveSection('parking', TOUR_SECTIONS);
    expect(r.sectionId).toBe('s2');
    expect(r.reason).toMatch(/Transport/);
  });
});

describe('pass 1 — exact wins', () => {
  it('matches ignoring case and punctuation', () => {
    expect(resolveSection('PRODUCTION', TOUR_SECTIONS).sectionId).toBe('s4');
    expect(resolveSection('hotels', TOUR_SECTIONS).sectionId).toBe('s3');
  });

  it('an exact hit beats an alias that points elsewhere', () => {
    const sections = [{ id: 'x', name: 'Gas' }, { id: 'y', name: 'Fuel' }];
    // "gas" aliases to Fuel, but a section literally called Gas exists.
    expect(resolveSection('gas', sections).sectionId).toBe('x');
  });
});

describe('pass 2 — the alias table speaks extractor, not English', () => {
  it('maps vocabulary no similarity score could connect', () => {
    expect(aliasFor('gas')).toBe('Fuel');
    expect(aliasFor('lodging')).toBe('Hotels');
    expect(aliasFor('buyout')).toBe('Catering');
    expect(aliasFor('cartage')).toBe('Freight');
  });

  it('matches an alias term inside a longer category', () => {
    expect(aliasFor('airport parking')).toBe('Transport');
  });

  it('is word-boundary safe — “gasket” is not “gas”', () => {
    expect(aliasFor('gasket')).toBeNull();
  });

  it('unknown vocabulary aliases to nothing rather than guessing', () => {
    expect(aliasFor('pyrotechnics')).toBeNull();
  });
});

describe('pass 3 — fuzzy, using the ONE matcher', () => {
  it('catches a near-spelling of a real section', () => {
    const r = resolveSection('accomodation', TOUR_SECTIONS); // sic
    expect(r.sectionId).toBe('s3'); // via the alias, which tolerates the typo
  });

  it('a weak resemblance is NOT a match — it proposes instead', () => {
    const r = resolveSection('pyrotechnics', TOUR_SECTIONS);
    expect(r.createSection).toBe(true);
    expect(r.sectionId).toBeNull();
  });
});

describe('the rules that keep it honest', () => {
  it('NEVER invents a sectionId — a proposed section has none', () => {
    const r = resolveSection('pyrotechnics', TOUR_SECTIONS);
    expect(r.sectionId).toBeNull();
    expect(r.createSection).toBe(true);
  });

  it('a proposed section is named properly, not left lowercase', () => {
    /* Deliberately a category NO alias covers — "stage rental fees" would map to
       Production via "rental", which is the right answer for a tour and so would
       not exercise the naming path at all. */
    expect(resolveSection('pyrotechnics supplies', []).sectionName).toBe('Pyrotechnics Supplies');
  });

  it('a proposed section prefers the alias name over the raw category', () => {
    // "gas" should propose "Fuel", which is what a TM would call it.
    expect(resolveSection('gas', []).sectionName).toBe('Fuel');
  });

  it('no category at all is the ONLY route to the fallback', () => {
    for (const empty of [null, undefined, '', '   ']) {
      const r = resolveSection(empty, TOUR_SECTIONS);
      expect(r.sectionName).toBe('Uncategorised');
      expect(r.createSection).toBe(false);
      expect(r.reason).toMatch(/No category/);
    }
  });

  it('every resolution explains itself — the card shows the reason', () => {
    for (const cat of ['catering', 'parking', 'pyrotechnics', '']) {
      expect(resolveSection(cat, TOUR_SECTIONS).reason.length).toBeGreaterThan(0);
    }
  });

  it('a tour with no sections yet still proposes rather than dumping', () => {
    const r = resolveSection('catering', []);
    expect(r.createSection).toBe(true);
    expect(r.sectionName).toBe('Catering');
  });
});
