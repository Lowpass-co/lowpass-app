/* ============================================
   LOWPASS — channel-list export: the editor's look + IO boxes + pulls (Oct 2026)

   Pins:
   - rows carry their stage box's colour (stripe + tint), as in the editor;
   - a colour from the database can't inject CSS;
   - light / dark: dark prints on the dark palette edge to edge (@page);
   - IO box sheets: one per picked box, every socket, SPARE for empties,
     channels patched past capacity still listed, unplaced ones called out;
   - pulls: mic AND DI both counted, "None" is not a stand, spares by count or %;
   - customisation: input-column override, box columns, sections order;
   - Excel: the same sections as sheets, row colours, unique sheet names;
   - old saved templates print exactly what they did (new sections default off).
   ============================================ */

import { describe, it, expect } from 'vitest';
import { channelDataFromSection, type ChannelListExportData } from './channel-list-data';
import { buildChannelListBodyHtml, safeColour, sparesFor, inputColumnsFor } from './channel-list-pdf';
import { renderDocument } from './shell';
import { channelListSheets } from './xlsx';
import { CHANNEL_LIST_SECTION_IDS, defaultConfig, normalizeConfig, normalizeChannelList, DEFAULT_CHANNEL_LIST_OPTIONS, type TemplateConfig } from './template-config';

const boxes = [
  { id: 'b1', label: 'SB1', colour: '#3B82F6', capacity: 4, position: 0 },
  { id: 'b2', label: 'SB2', colour: '#10B981', capacity: 2, position: 1 },
];
const looms = [{ id: 'l1', label: 'DRUMS', colour: '#8B5CF6', capacity: 8, position: 0 }];
const row = (i: number, o: Record<string, unknown>) => ({
  id: `r${i}`, row_index: i, row_kind: 'input', channel_name: `CH${i}`, mic: null, di: null, stand: null, cable_length: null,
  provider: 'band', position: null, phantom_power: false, gain: null, notes: '', stage_box_id: null, stage_box_position: null,
  sub_snake_id: null, sub_snake_position: null, ...o,
});
const rows = [
  row(1, { channel_name: 'KICK', mic: 'Beta 91', stand: 'None', cable_length: "25'", stage_box_id: 'b1', stage_box_position: 1, sub_snake_id: 'l1' }),
  row(2, { channel_name: 'SNARE', mic: 'SM57', stand: 'LP CLAW', cable_length: "15'", stage_box_id: 'b1', stage_box_position: 3, provider: 'venue' }),
  row(3, { channel_name: 'BASS', mic: 'MD421', di: 'J48', stand: 'Short Boom', cable_length: "15'", stage_box_id: 'b2', stage_box_position: 3 }),
  row(4, { channel_name: 'SPARE CH', stage_box_id: 'b2', stage_box_position: null }),
  row(5, { channel_name: 'TALKBACK', mic: 'SM58', stand: 'Talk Stand', cable_length: "50'" }),
];
const section = {
  metadata: { enabled_columns: ['number', 'name', 'stage_box', 'mic'] },
  stageBoxes: boxes,
  subSnakes: looms,
  rows: [...rows, { id: 'o1', row_index: 1, row_kind: 'output', output_item: 'IEM 1', output_description: 'Vox', output_qty: 1, output_is_stereo: true }],
} as never;

const data: ChannelListExportData = {
  tour: { id: 't', name: 'Tour' }, artist: { name: 'Artist' }, logoUrl: null, hasSection: true,
  ...channelDataFromSection(section),
};

function cfg(sections: string[], cl: Partial<typeof DEFAULT_CHANNEL_LIST_OPTIONS> = {}): TemplateConfig {
  return normalizeConfig('channel-list', {
    ...defaultConfig('channel-list'),
    // Exactly these sections, in this order; every other one explicitly off
    // (normalizeConfig would otherwise append the defaults, inputs/outputs on).
    sections: [
      ...sections.map((id) => ({ id, show: true })),
      ...CHANNEL_LIST_SECTION_IDS.filter((id) => !sections.includes(id)).map((id) => ({ id, show: false })),
    ],
    channelList: { ...DEFAULT_CHANNEL_LIST_OPTIONS, ...cl },
  });
}

describe('colour coding by stage box', () => {
  it('each patched row carries its box colour; an unpatched row has none', () => {
    expect(data.inputs.map((r) => r.boxColour)).toEqual(['#3B82F6', '#3B82F6', '#10B981', '#10B981', null]);
  });

  it('the input table paints a stripe and a tint for coloured rows, and a legend', () => {
    const html = buildChannelListBodyHtml(data, cfg(['inputs']));
    expect(html).toContain('class="lp-cl-stripe" style="background:color-mix(in srgb, #3B82F6');
    expect(html).toContain('<tr style="background:color-mix(in srgb, #10B981 var(--lp-cl-tint)');
    expect(html).toContain('class="lp-cl-legend"');
  });

  it('a hostile colour never reaches the CSS', () => {
    expect(safeColour('#3B82F6')).toBe('#3B82F6');
    expect(safeColour('red;background:url(x)')).toBeNull();
    expect(safeColour('#12')).toBeNull();
    const bad = { ...data, inputs: data.inputs.map((r) => ({ ...r, boxColour: '#fff;}</style><script>' })) };
    expect(buildChannelListBodyHtml(bad, cfg(['inputs']))).not.toContain('<script>');
  });
});

describe('light / dark', () => {
  const doc = (theme?: 'light' | 'dark') =>
    renderDocument({ letterhead: { artistName: 'A', tourName: 'T', tourDates: null, logoDataUri: null, showLogo: false, generatedOn: 'x' }, title: 'Channel list', bodyHtml: '<p>x</p>', theme });

  it('light (and absent) is the old document, unchanged', () => {
    expect(doc('light')).toBe(doc(undefined));
    expect(doc('light')).not.toContain('lp-theme-dark');
  });

  it('dark sets the dark palette and paints the whole page, margins included', () => {
    const html = doc('dark');
    expect(html).toContain('<body class="lp-theme-dark">');
    expect(html).toContain('@page { background: #0F0F0F; }');
    expect(html).toContain('--lp-text: #F5F5F5;');
  });
});

describe('stage box sheets', () => {
  it('an empty pick says so — it never claims the list has no boxes', () => {
    const html = buildChannelListBodyHtml(data, cfg(['io-boxes'], { boxIds: [] }));
    expect(html).toContain('No stage boxes picked');
    expect(html).not.toContain('No stage boxes on this channel list');
    const none = { ...data, boxes: [] };
    expect(buildChannelListBodyHtml(none, cfg(['io-boxes']))).toContain('No stage boxes on this channel list');
  });

  it('one sheet per box, every socket, SPARE for empties', () => {
    const html = buildChannelListBodyHtml(data, cfg(['io-boxes']));
    expect((html.match(/class="lp-cl-box"/g) ?? []).length).toBe(2);
    expect(data.boxes[0].sockets.map((s) => s.channel)).toEqual([1, null, 2, null]);
    expect(html).toContain('SPARE');
    expect(html).toContain('2 patched · 2 spare');
  });

  it('a channel patched past the box size still gets its socket', () => {
    // SB2 is 2-way but BASS sits in socket 3.
    expect(data.boxes[1].sockets.map((s) => s.socket)).toEqual([1, 2, 3]);
    expect(data.boxes[1].sockets[2].channel).toBe(3);
  });

  it('a channel on a box with no socket is called out, not lost', () => {
    expect(data.boxes[1].unplaced).toEqual([{ channel: 4, name: 'SPARE CH' }]);
    expect(buildChannelListBodyHtml(data, cfg(['io-boxes']))).toContain('with no socket yet: ch 4 SPARE CH');
  });

  it('only the picked boxes print', () => {
    const html = buildChannelListBodyHtml(data, cfg(['io-boxes'], { boxIds: ['b2'] }));
    expect((html.match(/class="lp-cl-box"/g) ?? []).length).toBe(1);
    expect(html).toContain('SB2');
    expect(html).not.toContain('>SB1<');
  });

  it('the box columns are the chosen ones', () => {
    const html = buildChannelListBodyHtml(data, cfg(['io-boxes'], { boxColumns: ['name'] }));
    expect(html).toContain('<th>Name</th>');
    expect(html).not.toContain('<th>Mic / DI</th>');
  });
});

describe('pulls', () => {
  it('a channel with a mic AND a DI counts both', () => {
    const items = data.pulls.mics.map((m) => m.item);
    expect(items).toContain('MD421');
    expect(items).toContain('J48');
  });

  it('"None" is not a stand', () => {
    expect(data.pulls.stands.map((s) => s.item)).not.toContain('None');
  });

  it('mics are split by who supplies them', () => {
    expect(data.pulls.mics.find((m) => m.item === 'SM57')?.provider).toBe('Venue');
  });

  it('cables count by length', () => {
    expect(data.pulls.cables.find((c) => c.item === "15'")?.qty).toBe(2);
  });

  it('spares: a fixed count, or a % rounded up', () => {
    expect(sparesFor(7, 2, 'count')).toBe(2);
    expect(sparesFor(7, 10, 'percent')).toBe(1); // 0.7 → 1
    expect(sparesFor(20, 10, 'percent')).toBe(2);
    expect(sparesFor(5, 0, 'count')).toBe(0);
  });

  it('the pull table shows Spare and Total columns only when spares are set', () => {
    expect(buildChannelListBodyHtml(data, cfg(['cable-pull']))).not.toContain('>Spare<');
    const html = buildChannelListBodyHtml(data, cfg(['cable-pull'], { spares: { mode: 'count', mics: 0, stands: 0, cables: 2 } }));
    expect(html).toContain('>Spare<');
    expect(html).toContain('+2');
  });

  it('looms list their size and how many channels use them', () => {
    expect(data.pulls.looms).toEqual([{ label: 'DRUMS', colour: '#8B5CF6', capacity: 8, used: 1 }]);
  });
});

describe('customising', () => {
  it('input columns default to the editor, and can be overridden for the printout', () => {
    expect(inputColumnsFor(data, DEFAULT_CHANNEL_LIST_OPTIONS)).toEqual(['number', 'name', 'stage_box', 'mic']);
    expect(inputColumnsFor(data, { ...DEFAULT_CHANNEL_LIST_OPTIONS, inputColumns: ['stand', 'name', 'number'] })).toEqual(['number', 'name', 'stand']);
  });

  it('sections print in the chosen order', () => {
    const html = buildChannelListBodyHtml(data, cfg(['mic-pull', 'inputs']));
    expect(html.indexOf('Mic &amp; DI pull')).toBeLessThan(html.indexOf('>Inputs'));
  });

  it('old saved templates print what they did: the new sections arrive switched off', () => {
    const old = normalizeConfig('channel-list', { sections: [{ id: 'inputs', show: true }, { id: 'outputs', show: true }] });
    expect(old.sections.filter((s) => s.show).map((s) => s.id)).toEqual(['inputs', 'outputs']);
    expect(old.channelList?.theme).toBe('light');
  });

  it('untrusted options are cleaned: unknown columns dropped, Name always kept, spares clamped', () => {
    const o = normalizeChannelList({ theme: 'neon', inputColumns: ['mic', 'evil'], boxColumns: ['name', 'x'], spares: { mode: 'percent', mics: 500, stands: -3, cables: 'x' } });
    expect(o.theme).toBe('light');
    expect(o.inputColumns).toEqual(['name', 'mic']);
    expect(o.boxColumns).toEqual(['name']);
    expect(o.spares).toEqual({ mode: 'percent', mics: 100, stands: 0, cables: 0 });
  });
});

describe('Excel', () => {
  it('the same sections become sheets, in order, with box colours on the rows', () => {
    const specs = channelListSheets(data, cfg(['inputs', 'io-boxes', 'mic-pull']));
    expect(specs.map((s) => s.name)).toEqual(['Input list', 'Box SB1', 'Box SB2', 'Mic & DI pull']);
    expect(specs[0].rowColours).toEqual(['#3B82F6', '#3B82F6', '#10B981', '#10B981', null]);
    expect(specs[1].rows[1]).toMatchObject({ socket: 2, name: 'SPARE' });
  });

  it('two boxes with the same name still make a valid workbook', () => {
    const twin = { ...data, boxes: [data.boxes[0], { ...data.boxes[1], label: 'SB1' }] };
    const names = channelListSheets(twin, cfg(['io-boxes'])).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('without a config (older callers) it is still inputs + outputs', () => {
    expect(channelListSheets(data).map((s) => s.name)).toEqual(['Input list', 'Outputs']);
  });
});
