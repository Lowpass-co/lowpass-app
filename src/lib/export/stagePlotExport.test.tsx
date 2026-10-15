/* ============================================
   LOWPASS — stage-plot export, drawn like the editor (Oct 2026)

   Pins the faults the old export had, so they can't come back:
   - text notes and arrows were dropped;
   - risers printed as a crossed box (editor: faint outline + W×D×H);
   - people printed as head icons (editor: a position dot);
   - label position / hidden / size ignored; no fallback name;
   - channels never shown; rulers / DS cross never drawn;
   - the TM contact details never printed.
   And the new choices: chips coloured by stage box, the channel key, light /
   dark, grid / rulers overrides, a landscape plot page, the channel list's own
   IO box + pull pages, and old saved templates arriving unchanged.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { buildStagePlotSvg, chipText } from '@/lib/stage-plot/stageplot-svg';
import type { EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';
import { getIcon } from '@/lib/stage-plot/icons';
import { channelDataFromSection } from './channel-list-data';
import { buildStagePlotBodyHtml, channelKey, plotChannelMap } from './stageplot-pdf';
import type { StagePlotExportData } from './stageplot-data';
import {
  DEFAULT_STAGE_PLOT_OPTIONS,
  STAGE_PLOT_SECTION_IDS,
  defaultConfig,
  normalizeConfig,
  normalizeStagePlot,
  type StagePlotOptions,
  type TemplateConfig,
} from './template-config';

const plot: EditorPlot = {
  name: 'Plot', widthFt: 24, depthFt: 16, gridSizeFt: 1, showGrid: true, showRulers: false, showCenterLine: false,
  showDsCross: true, showLateralMarkers: false, showChannels: false, snap: true, brandColor: '#6B7280', units: 'ft',
  subtitle: 'Headline <set>', tmName: 'Adam', tmRole: 'TM', tmPhone: '+46 70 000', tmEmail: 'tm@x.se', versionLabel: 'v3',
};
const item = (id: string, iconName: string, o: Partial<EditorItem> = {}): EditorItem => ({ id, iconName, xFt: 10, yFt: 8, layer: 'main', ...o });
const items: EditorItem[] = [
  item('riser', 'infra-riser-8x8', { widthFt: 10, depthFt: 8, heightFt: 1.5 }),
  item('kit', 'drum-kit-rh', { label: 'Drums', channelRowIds: ['r1', 'r2', 'r3'] }),
  item('drummer', 'person-male', { label: 'Ollie' }),
  item('amp', 'amp-cab-4x12', { channelRowIds: ['r4', 'gone'] }),
  item('mic', 'mic-vocal', { channelRowIds: ['r5'], labelPosition: 'hidden' }),
  item('keys', 'keys-stage-88', { label: 'Keys', labelPosition: 'right', labelFontPx: 40 }),
  item('note', '', { kind: 'text', text: 'Riser <by> venue' }),
  item('arrow', '', { kind: 'arrow', x2Ft: 14, y2Ft: 8 }),
];

const boxes = [{ id: 'b1', label: 'SB1', colour: '#3B82F6', capacity: 4, position: 0 }, { id: 'b2', label: 'SB2', colour: '#F59E0B', capacity: 4, position: 1 }];
const row = (i: number, name: string, box: string, pos: number) => ({
  id: `r${i}`, row_index: i, row_kind: 'input', channel_name: name, mic: 'SM57', di: null, stand: 'Short Boom', cable_length: "15'",
  provider: 'band', position: null, phantom_power: false, gain: null, notes: '', stage_box_id: box, stage_box_position: pos, sub_snake_id: null, sub_snake_position: null,
});
const section = {
  metadata: { enabled_columns: ['number', 'name', 'stage_box', 'mic'] }, stageBoxes: boxes, subSnakes: [],
  rows: [row(1, 'KICK', 'b1', 1), row(2, 'SNARE', 'b1', 2), row(3, 'OH', 'b1', 3), row(4, 'GTR', 'b2', 1), row(5, 'VOX', 'b2', 2), row(6, 'SPARE', 'b2', 3),
    { id: 'o1', row_index: 1, row_kind: 'output', output_item: 'IEM 1', output_description: 'Vox', output_qty: 1, output_is_stereo: true }],
} as never;
const channel = { tour: { id: '', name: 'Plot' }, artist: null, logoUrl: null, hasSection: true, ...channelDataFromSection(section) };
const data: StagePlotExportData = { plot, items, customIcons: new Map(), plotName: 'Plot', artist: null, logoUrl: null, channel };
const channels = plotChannelMap(data);

function cfg(sections: string[], sp: Partial<StagePlotOptions> = {}): TemplateConfig {
  return normalizeConfig('stage-plot', {
    ...defaultConfig('stage-plot'),
    sections: [
      ...sections.map((id) => ({ id, show: true })),
      ...STAGE_PLOT_SECTION_IDS.filter((id) => !sections.includes(id)).map((id) => ({ id, show: false })),
    ],
    stagePlot: { ...DEFAULT_STAGE_PLOT_OPTIONS, ...sp },
  });
}
const svg = (o: Parameters<typeof buildStagePlotSvg>[3] = {}, p: EditorPlot = plot, its: EditorItem[] = items) => buildStagePlotSvg(p, its, new Map(), o);

describe('the plot is drawn like the editor', () => {
  it('text notes print (escaped) and arrows print with a head', () => {
    const s = svg();
    expect(s).toContain('Riser &lt;by&gt; venue');
    expect(s).toMatch(/<polygon points="[^"]+" fill="#6B7280"\/>/);
  });

  it('a riser is a faint outline with its W × D × H, not a crossed box', () => {
    expect(svg()).toContain('10 × 8 × 1.5 ft');
  });

  it('a person is a position dot', () => {
    expect(svg()).toContain('r="5" fill="#6B7280"');
  });

  it('labels: fallback name, "hidden" respected, size clamped, "right" placed beside', () => {
    const s = svg();
    const ampName = getIcon('amp-cab-4x12')!.label;
    expect(s).toContain(`>${ampName}<`); // no custom label → the icon's name, as in the editor
    expect(s).not.toContain('>Vocal'); // the mic's label is hidden
    expect(s).toContain('font-size="18"'); // 40 → clamped to the editor's 18 max
    const keysX = Number(s.match(/<text x="([\d.]+)" y="[\d.]+" font-size="18"/)?.[1]);
    expect(keysX).toBeGreaterThan(10 * 22); // right of the item's centre
  });

  it('labels can be switched off for a clean drawing', () => {
    expect(svg({ showLabels: false })).not.toContain('>Drums<');
  });

  it('the DS cross draws when the plot has it on; rulers follow the plot unless overridden', () => {
    expect(svg()).toContain('stroke-width="1.25"><line');
    expect(svg()).not.toContain('y="-9" text-anchor="middle">0<');
    expect(svg({ showRulers: true })).toContain('y="-9" text-anchor="middle">0<');
    expect(svg({ showGrid: false })).not.toContain('stroke="#E5E7EB" stroke-width="1.2"');
  });
});

describe('channel chips', () => {
  it('carry the channel numbers and the stage-box colour', () => {
    const s = svg({ channels, showChips: true });
    expect(s).toContain('>1–3<');
    expect(s).toMatch(/fill="#3B82F6"\/><text[^>]*>1–3</);
    expect(s).toMatch(/fill="#F59E0B"\/><text[^>]*>4</); // the dead "gone" link is skipped
  });

  it('are off without channels or when switched off', () => {
    expect(svg({ channels, showChips: false })).not.toContain('lp-sp-chip');
    expect(svg({ showChips: true })).not.toContain('lp-sp-chip');
  });

  it('compress runs, and fall back to a count when long', () => {
    expect(chipText([3, 1, 2])).toBe('1–3');
    expect(chipText([4, 7])).toBe('4,7');
    expect(chipText([1, 3, 5, 7, 9])).toBe('×5');
    expect(chipText([])).toBe('');
  });
});

describe('off-stage items', () => {
  const vb = (svgText: string) => svgText.match(/class="lp-plot-svg" viewBox="([^"]+)"/)![1].split(' ').map(Number);

  it('a plot with nothing off stage keeps the stage + margins frame', () => {
    expect(vb(svg({}, plot, [item('m', 'mic-vocal', { xFt: 12, yFt: 8, labelPosition: 'hidden' })]))).toEqual([-34, -30, 24 * 22 + 68, 16 * 22 + 82]);
  });

  it('the drawing grows to include items off stage left, right and upstage', () => {
    const its = [
      item('sl', 'monitor-side-fill', { xFt: 30, yFt: 8, label: 'Side fill SL' }), // 6 ft past SL (stage is 24 ft wide)
      item('sr', 'amp-cab-4x12', { xFt: -5, yFt: 4 }),                              // 5 ft off SR
      item('us', 'infra-power-4', { xFt: 12, yFt: -4, labelPosition: 'hidden' }),   // behind the upstage edge
    ];
    const [x0, y0, w] = vb(svg({}, plot, its));
    expect(x0).toBeLessThan(-5 * 22);          // SR item fully inside
    expect(x0 + w).toBeGreaterThan(30 * 22);   // SL item fully inside
    expect(y0).toBeLessThan(-4 * 22);          // upstage item inside
  });

  it('a label hanging off an off-stage item is inside too', () => {
    const its = [item('sl', 'amp-cab-4x12', { xFt: 26, yFt: 8, label: 'A very long label for the wing', labelPosition: 'right' })];
    const [x0, , w] = vb(svg({}, plot, its));
    expect(x0 + w).toBeGreaterThan(26 * 22 + 200);
  });
});

describe('colour', () => {
  it('a tint colours the lines only — the shape keeps its faint wash', () => {
    const s = svg({}, plot, [item('x', 'amp-cab-4x12', { colorTint: '#E11D48' })]);
    expect(s).toContain('stroke:#E11D48');
    expect(s).not.toContain('fill:#E11D48');
    expect(s).toMatch(/fill:color-mix\(in srgb, #6B7280 \d+%, transparent\);stroke:#E11D48/);
  });
});

describe('safety + theme', () => {
  it('a hostile colour from the database never reaches the SVG', () => {
    const bad = [item('x', 'amp-cab-4x12', { colorTint: 'red;}</style><script>alert(1)</script>' }), item('t', '', { kind: 'text', text: 'hi', colorTint: '"><script>' })];
    const s = svg({}, { ...plot, brandColor: 'url(javascript:x)' }, bad);
    expect(s).not.toContain('<script>');
    expect(s).not.toContain('javascript');
  });

  it('dark draws on the dark palette', () => {
    expect(svg({ theme: 'dark' })).toContain('fill="#1A1A1A" stroke="#5A5A5A"');
    expect(svg()).toContain('fill="#F9FAFB"');
  });

  it('the public show link (no options) draws the plot as saved, light, no chips', () => {
    const s = buildStagePlotSvg(plot, items);
    expect(s).toContain('fill="#F9FAFB"');
    expect(s).not.toContain('lp-sp-chip');
  });
});

describe('the plot page', () => {
  it('is a landscape named page; the letterhead joins it when the plot leads', () => {
    const html = buildStagePlotBodyHtml(data, cfg(['stage-diagram']));
    expect(html).toContain('@page lp-sp-land { size: A4 landscape; }');
    expect(html).toContain('body > .lp-letterhead');
    const later = buildStagePlotBodyHtml(data, cfg(['input-list', 'stage-diagram']));
    expect(later).not.toContain('body > .lp-letterhead');
    expect(buildStagePlotBodyHtml(data, { ...cfg(['stage-diagram']), pageSize: 'Letter' })).toContain('size: Letter landscape');
  });

  it('prints the contact strip (escaped), and not when off or empty', () => {
    const html = buildStagePlotBodyHtml(data, cfg(['stage-diagram']));
    expect(html).toContain('Headline &lt;set&gt;');
    expect(html).toContain('<b>TM Adam</b> · +46 70 000 · tm@x.se · v3');
    expect(buildStagePlotBodyHtml(data, cfg(['stage-diagram'], { contact: false }))).not.toContain('lp-sp-contact"');
    const bare = { ...data, plot: { ...plot, subtitle: undefined, tmName: undefined, tmRole: undefined, tmPhone: undefined, tmEmail: undefined, versionLabel: undefined } };
    expect(buildStagePlotBodyHtml(bare, cfg(['stage-diagram']))).not.toContain('lp-sp-contact"');
  });

  it('the key lists every linked channel in order, with its item, and counts the unplaced', () => {
    const k = channelKey(data, channels);
    expect(k.rows.map((r) => [r.number, r.name, r.items.join()])).toEqual([
      [1, 'KICK', 'Drums'], [2, 'SNARE', 'Drums'], [3, 'OH', 'Drums'], [4, 'GTR', k.rows[3].items[0]], [5, 'VOX', k.rows[4].items[0]],
    ]);
    expect(k.unplaced).toBe(1); // SPARE isn't on the plot
    const html = buildStagePlotBodyHtml(data, cfg(['stage-diagram']));
    expect(html).toContain('class="lp-sp-grid lp-sp-has-key"');
    expect(html).toContain('1 more channel isn’t placed on the plot');
    expect(buildStagePlotBodyHtml(data, cfg(['stage-diagram'], { key: false }))).not.toContain('class="lp-sp-grid lp-sp-has-key"');
  });
});

describe('list, box and pull pages', () => {
  it('reuse the channel-list export: input-list = inputs + outputs; boxes; pulls', () => {
    const html = buildStagePlotBodyHtml(data, cfg(['stage-diagram', 'input-list', 'io-boxes', 'mic-pull']));
    expect(html).toContain('>Inputs');
    expect(html).toContain('Outputs (IEM / mix)');
    expect((html.match(/class="lp-cl-box"/g) ?? []).length).toBe(2);
    expect(html).toContain('Mic &amp; DI pull');
    expect(html.indexOf('lp-sp-page')).toBeLessThan(html.indexOf('>Inputs'));
  });

  it('with no channel list paired, says so once', () => {
    const none = { ...data, channel: { ...channel, hasSection: false } };
    const html = buildStagePlotBodyHtml(none, cfg(['input-list', 'stage-diagram', 'io-boxes']));
    expect((html.match(/No channel list is paired/g) ?? []).length).toBe(1);
  });

});

describe('templates', () => {
  it('an old saved template keeps its pages; the new sections arrive off', () => {
    const old = normalizeConfig('stage-plot', { sections: [{ id: 'stage-diagram', show: true }, { id: 'input-list', show: true }] });
    expect(old.sections.filter((s) => s.show).map((s) => s.id)).toEqual(['stage-diagram', 'input-list']);
    expect(old.sections.map((s) => s.id)).toEqual([...STAGE_PLOT_SECTION_IDS]);
    expect(old.stagePlot).toEqual(DEFAULT_STAGE_PLOT_OPTIONS);
  });

  it('untrusted options are cleaned', () => {
    expect(normalizeStagePlot({ theme: 'neon', grid: 'sometimes', rulers: 'off', key: 'yes', chips: false })).toEqual({
      ...DEFAULT_STAGE_PLOT_OPTIONS, rulers: 'off', chips: false,
    });
  });
});
