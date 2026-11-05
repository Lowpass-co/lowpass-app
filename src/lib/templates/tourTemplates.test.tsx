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

  it('migration 280 seeds exactly these lists (generated from this file)', () => {
    const sql = readFileSync(join(process.cwd(), 'database/migrations/280_tour_templates.sql'), 'utf8');
    const esc = (s: string) => s.replace(/'/g, "''");
    for (const t of BUDGET_TEMPLATES) {
      expect(sql).toContain(`('${esc(t.name)}', '${t.tier}', '${esc(t.description)}'`);
      t.sections.forEach((s, si) => {
        expect(sql).toContain(`('${esc(t.name)}', '${esc(s.name)}', ${si})`);
        s.lines.forEach((l, li) => expect(sql).toContain(`('${esc(t.name)}', '${esc(s.name)}', '${esc(l)}', ${li})`));
      });
    }
    for (const old of RETIRED_SYSTEM_TEMPLATES) expect(sql).toContain(`'${esc(old)}'`);
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
    const starter = starterByKey('day_off')!;
    const out = composeStarter(starter, [cat('Local Info'), cat('Local Info', 'ws'), cat('Bus and Trailer', null, { tm_only: true })]);
    expect(out.sections.map((s) => [s.label, s.template_id, s.order, s.tm_only ?? false])).toEqual([
      ['Local Info', 'ws-Local Info', 0, false],
      ['Bus and Trailer', 'p-Bus and Trailer', 1, true],
    ]);
    expect(out.missing).toEqual(['Airport and Local Distances', 'Personal Vehicle Parking']);
  });

  it('a tour maps show days to its pick, festival dates to the festival set, and off days only when asked', () => {
    expect(tourDayStarters({ advanceShow: 'support', advanceDaysOff: false })).toEqual({ show: 'support', festival: 'festival' });
    expect(tourDayStarters({ advanceShow: null, advanceDaysOff: true })).toEqual({ off: 'day_off' });
    expect(tourDayStarters({ advanceShow: null, advanceDaysOff: false })).toEqual({});
  });
});
