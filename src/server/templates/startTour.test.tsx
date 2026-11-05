import { describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { startTourFromTemplates, StartFromInputError } from './startTour';
import { dayHasAdvance, loadTemplateSet, templateForDay } from '@/server/advance/templates';

const WS = 'ws-1';
const TOUR = 'tour-1';

function world() {
  const db = new FakeDb();
  db.seed('tours', [{ id: TOUR, workspace_id: WS }]);
  db.seed('budget_templates', [{ id: 'tpl-club', workspace_id: null, name: 'Club', is_system: true }]);
  db.seed('budget_template_sections', [
    { id: 'ts-sal', template_id: 'tpl-club', name: 'Salaries', sort_order: 0 },
    { id: 'ts-tr', template_id: 'tpl-club', name: 'Transport', sort_order: 1 },
  ]);
  db.seed('budget_template_lines', [
    { id: 'tl-1', template_id: 'tpl-club', template_section_id: 'ts-tr', label: 'Fuel', default_phase_tag: null, sort_order: 0 },
    { id: 'tl-2', template_id: 'tpl-club', template_section_id: 'ts-tr', label: 'Parking', default_phase_tag: null, sort_order: 1 },
  ]);
  const field = [{ id: 'q', label: 'Question', type: 'text' }];
  db.seed('advance_templates', [
    'Key Contacts', 'Schedule', 'Venue Info', 'Production', 'Personal Vehicle Parking', 'Dressing Rooms', 'Hospitality', 'Merch',
    'Comps and Ticketing', 'Local Info', 'Event Basics', 'Transport', 'Security', 'Airport and Local Distances',
  ].map((name) => ({ id: `cat-${name}`, workspace_id: null, template_type: 'section', name, fields: field, tm_only: false })));
  return db;
}

const input = {
  budgetTemplateId: 'tpl-club',
  money: { management: '15', agency: '10', insurance: '3' },
  advanceShow: 'support' as const,
  advanceDaysOff: true,
};

describe('startTourFromTemplates', () => {
  it('applies the budget template, the percentages and the commission rows', async () => {
    const db = world();
    const out = await startTourFromTemplates(db.client(), { tourId: TOUR, workspaceId: WS, input });
    expect(out.budget).toEqual({ sections: 2, lines_added: 2 });
    expect(db.t('budget_sections').map((s) => s.name)).toEqual(['Salaries', 'Transport']);
    expect(db.t('budget_line_items').map((l) => l.label)).toEqual(['Fuel', 'Parking']);
    const settings = db.t('budget_settings');
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({ tour_id: TOUR, insurance_pct: 0.03, contingency_pct: 0, accountancy_pct: 0, merch_cogs_pct: 0 });
    expect(db.t('budget_commissions').map((c) => [c.label, c.percentage])).toEqual([
      ['Management', 0.15], ['Agency', 0.1], ['Legal', 0], ['Merch', 0],
    ]);
  });

  it('is safe to run twice: no second set of lines, commissions or advance templates', async () => {
    const db = world();
    await startTourFromTemplates(db.client(), { tourId: TOUR, workspaceId: WS, input });
    const again = await startTourFromTemplates(db.client(), { tourId: TOUR, workspaceId: WS, input });
    expect(again.budget).toEqual({ sections: 2, lines_added: 0 });
    expect(again.commissionsAdded).toBe(0);
    expect(db.t('budget_line_items')).toHaveLength(2);
    expect(db.t('budget_commissions')).toHaveLength(4);
    expect(db.t('budget_settings')).toHaveLength(1);
    expect(db.t('advance_layout_templates').map((t) => t.name).sort()).toEqual(['Day off', 'Festival day', 'Support show day']);
    expect(db.t('tour_advance_day_templates')).toHaveLength(3);
  });

  it('installs the advance starters and gives the tour its own choice, which wins over the workspace', async () => {
    const db = world();
    // The workspace says show days use some other template.
    db.seed('advance_layout_templates', [{ id: 'ws-show', workspace_id: WS, name: 'Show day', sections: [] }]);
    db.seed('advance_day_type_templates', [{ workspace_id: WS, day_type: 'show', layout_template_id: 'ws-show' }]);
    const out = await startTourFromTemplates(db.client(), { tourId: TOUR, workspaceId: WS, input });
    expect(Object.keys(out.advance).sort()).toEqual(['festival', 'off', 'show']);
    // Support show day was built from the catalog, in its order.
    const support = db.t('advance_layout_templates').find((t) => t.name === 'Support show day')!;
    expect((support.sections as { label: string }[]).map((s) => s.label)).toEqual([
      'Key Contacts', 'Schedule', 'Venue Info', 'Production', 'Personal Vehicle Parking', 'Dressing Rooms', 'Hospitality', 'Merch',
      'Comps and Ticketing', 'Local Info',
    ]);
    // Sections the starters want that this catalog lacks are reported, not invented.
    expect([...out.missingSections].sort()).toEqual(['Bus and Trailer', 'Documents and Maps', 'Outdoor Venue and Final Confirmation']);

    const set = await loadTemplateSet(db.client(), WS, TOUR);
    expect(templateForDay(set, 'show')?.name).toBe('Support show day');
    expect(templateForDay(set, 'festival')?.name).toBe('Festival day');
    expect(templateForDay(set, 'off')?.name).toBe('Day off');
    expect(dayHasAdvance(set, 'off', false)).toBe(true);
    // Another tour (no choice of its own) still follows the workspace.
    const other = await loadTemplateSet(db.client(), WS, 'tour-2');
    expect(templateForDay(other, 'show')?.id).toBe('ws-show');
    expect(dayHasAdvance(other, 'off', false)).toBe(false);
  });

  it('Custom writes no budget lines, and blank percentages are 0%', async () => {
    const db = world();
    const out = await startTourFromTemplates(db.client(), {
      tourId: TOUR,
      workspaceId: WS,
      input: { budgetTemplateId: null, money: {}, advanceShow: null, advanceDaysOff: false },
    });
    expect(out.budget).toBeNull();
    expect(db.t('budget_line_items')).toHaveLength(0);
    expect(db.t('budget_settings')[0]).toMatchObject({ insurance_pct: 0, contingency_pct: 0 });
    expect(db.t('advance_layout_templates')).toHaveLength(0);
  });

  it('refuses bad percentages before writing anything', async () => {
    const db = world();
    await expect(
      startTourFromTemplates(db.client(), { tourId: TOUR, workspaceId: WS, input: { ...input, money: { agency: 'lots' } } }),
    ).rejects.toBeInstanceOf(StartFromInputError);
    expect(db.t('budget_sections')).toHaveLength(0);
    expect(db.t('budget_settings')).toHaveLength(0);
  });
});
