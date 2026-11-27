import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADVANCE_STARTERS,
  BUDGET_TEMPLATES,
  RETIRED_SYSTEM_TEMPLATES,
  composeStarter,
  moneyToWrites,
  orderTemplates,
  starterByKey,
  tourDayStarters,
  type CatalogSection,
} from './tourTemplates';
import { catalogSectionByName } from './advanceCatalog';
import { budgetTemplatesSql } from './budgetTemplatesSql';

describe('budget templates', () => {
  it('are the six scales Adam asked for, in order', () => {
    expect(BUDGET_TEMPLATES.map((t) => t.name)).toEqual(['Support tour', 'Club', 'Theatre', 'Arena', 'Stadium', 'Press tour']);
  });

  it('give Salaries, Per Diems and Hotels a home but never seed their lines (they are automatic)', () => {
    for (const t of BUDGET_TEMPLATES) {
      for (const auto of ['Salaries', 'Per Diems', 'Hotels']) {
        const s = t.sections.find((x) => x.name === auto);
        expect(s, `${t.name} ${auto}`).toBeDefined();
        expect(s?.lines).toEqual([]);
      }
      // Flights come from Travel — a manual Flights line would count them twice.
      expect(t.sections.flatMap((s) => s.lines)).not.toContain('Flights');
    }
  });

  it('name the production section so automatic gear-hire lines land in it', () => {
    for (const t of BUDGET_TEMPLATES.filter((x) => x.name !== 'Press tour')) {
      expect(t.sections.map((s) => s.name)).toContain('Production');
    }
  });

  it('migration 280 seeded the six templates and retired the old presets', () => {
    const sql = readFileSync(join(process.cwd(), 'database/migrations/280_tour_templates.sql'), 'utf8');
    const esc = (s: string) => s.replace(/'/g, "''");
    for (const t of BUDGET_TEMPLATES) expect(sql).toContain(`('${esc(t.name)}', '${t.tier}', '${esc(t.description)}'`);
    for (const old of RETIRED_SYSTEM_TEMPLATES) expect(sql).toContain(`'${esc(old)}'`);
  });

  it('migration 304 carries exactly these sections and lines (npx tsx scripts/templates/gen304.ts)', () => {
    const sql = readFileSync(join(process.cwd(), 'database/migrations/304_budget_templates_admin.sql'), 'utf8');
    expect(sql).toBe(budgetTemplatesSql());
  });

  it('every template but Press tour has Admin; Support and Club rehearse', () => {
    for (const t of BUDGET_TEMPLATES) expect(t.sections.some((s) => s.name === 'Admin'), t.name).toBe(t.name !== 'Press tour');
    for (const n of ['Support tour', 'Club']) expect(BUDGET_TEMPLATES.find((t) => t.name === n)!.sections.find((s) => s.name === 'Production')!.lines).toContain('Rehearsals');
  });
});

describe('orderTemplates', () => {
  it('hides retired presets and orders system templates by size, then your own', () => {
    const rows = [
      { id: 'w', name: 'My run', is_system: false },
      { id: 'old', name: 'Headline tour', is_system: true, retired_at: '2026-11-05T00:00:00Z' },
      { id: 'a', name: 'Arena', is_system: true, sort_order: 3 },
      { id: 's', name: 'Support tour', is_system: true, sort_order: 0 },
    ];
    expect(orderTemplates(rows).map((r) => r.id)).toEqual(['s', 'a', 'w']);
  });
});

describe('moneyToWrites', () => {
  it('treats blank as 0% and stores fractions', () => {
    const r = moneyToWrites({ management: '15', agency: 10, insurance: '', contingency: '2', merch_cogs: '35%' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.writes.settings).toEqual({ insurance_pct: 0, contingency_pct: 0.02, accountancy_pct: 0, merch_cogs_pct: 0.35 });
    expect(r.writes.commissions.map((c) => [c.label, c.percentage])).toEqual([
      ['Management', 0.15], ['Agency', 0.1], ['Legal', 0], ['Merch', 0],
    ]);
  });

  it('puts management and agency on show income before tax (WIATR basis)', () => {
    const r = moneyToWrites({});
    if (!r.ok) throw new Error('unexpected');
    const mgmt = r.writes.commissions[0];
    expect(mgmt.basis_components).toEqual(['show']);
    expect(mgmt.basis_pre_tax).toBe(true);
  });

  it('refuses nonsense instead of turning it into 0', () => {
    expect(moneyToWrites({ agency: 'ten' })).toEqual({ ok: false, error: 'Agency must be a percentage from 0 to 100' });
    expect(moneyToWrites({ insurance: 150 }).ok).toBe(false);
    expect(moneyToWrites({ contingency: -1 }).ok).toBe(false);
  });
});

describe('advance starters', () => {
  const cat = (name: string, workspace_id: string | null = null, extra: Partial<CatalogSection> = {}): CatalogSection => ({
    id: `${workspace_id ?? 'p'}-${name}`, name, workspace_id, fields: [{ id: 'q', label: 'Q', type: 'text' }], ...extra,
  });

  it('are Headline, Support, Festival and Day off', () => {
    expect(ADVANCE_STARTERS.map((s) => s.name)).toEqual(['Headline show day', 'Support show day', 'Festival day', 'Day off']);
  });

  it('build from the catalog, preferring your own copy of a section, and report what is missing', () => {
    const starter = starterByKey('support')!;
    const out = composeStarter(starter, [
      cat('Key Contacts'),
      cat('Schedule'),
      cat('Schedule', 'ws'),
      cat('Documents Received', null, { tm_only: true }),
    ]);
    expect(out.sections.map((s) => [s.label, s.template_id, s.order, s.tm_only ?? false])).toEqual([
      ['Key Contacts', 'p-Key Contacts', 0, false],
      ['Schedule', 'ws-Schedule', 1, false],
      ['Documents Received', 'p-Documents Received', 2, true],
    ]);
    expect(out.missing).toEqual(['Arrival & Parking', 'Production', 'Dressing Rooms', 'Catering & Hospitality', 'Merch', 'Guests & Credentials']);
  });

  it('carry a section’s show-when condition — except where the starter always asks it (festival weather)', () => {
    const when = { field: 'indoor_outdoor', in: ['Outdoor', 'Covered'] };
    const rows = [cat('Weather & Outdoor', null, { show_when: when })];
    const headline = composeStarter(starterByKey('headline')!, rows).sections.find((s) => s.label === 'Weather & Outdoor');
    const festival = composeStarter(starterByKey('festival')!, rows).sections.find((s) => s.label === 'Weather & Outdoor');
    expect(headline?.show_when).toEqual(when);
    expect(festival?.show_when).toBeUndefined();
  });

  it('only use sections the catalogue has (advanceCatalog.ts)', () => {
    for (const st of ADVANCE_STARTERS) for (const n of st.sections) expect(catalogSectionByName(n), `${st.name}: ${n}`).toBeTruthy();
  });

  it('a tour maps show days to its pick, festival dates to the festival set, and off days only when asked', () => {
    expect(tourDayStarters({ advanceShow: 'support', advanceDaysOff: false })).toEqual({ show: 'support', festival: 'festival' });
    expect(tourDayStarters({ advanceShow: null, advanceDaysOff: true })).toEqual({ off: 'day_off' });
    expect(tourDayStarters({ advanceShow: null, advanceDaysOff: false })).toEqual({});
  });
});
