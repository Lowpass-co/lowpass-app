/* The rider's copy of a channel list: the editor's columns, channel number
   first, outputs as their own table — and it survives the snapshot gate as is
   (a copy the gate trimmed would freeze a different list from the one shown). */
import { describe, expect, it } from 'vitest';
import { channelExportColumnLabel } from '@/lib/export/channel-list-data';
import { parseEmbeds } from '@/lib/riders/embeds';
import { inputListCopy } from './embeds';

const row = (i: number, o: Record<string, unknown>) => ({
  id: `r${i}`, row_index: i, row_kind: 'input', channel_name: `CH${i}`, mic: null, di: null, stand: null, cable_length: null,
  provider: 'band', position: null, phantom_power: false, gain: null, notes: '', stage_box_id: null, stage_box_position: null,
  sub_snake_id: null, sub_snake_position: null, ...o,
});
const section = {
  metadata: { enabled_columns: ['number', 'name', 'mic', 'phantom_power'] },
  stageBoxes: [],
  subSnakes: [],
  rows: [
    row(2, { channel_name: 'SNARE', mic: 'SM57' }),
    row(1, { channel_name: 'KICK', mic: 'Beta 91', phantom_power: true }),
    { id: 'o1', row_index: 1, row_kind: 'output', output_item: 'IEM 1', output_description: 'Vox', output_qty: 1, output_is_stereo: true, output_position: 'SL', output_notes: '' },
  ],
} as never;

describe('inputListCopy', () => {
  it('channel number first, then the editor’s enabled columns; outputs apart', () => {
    const copy = inputListCopy(section, { id: 'pack-1', title: ' Club list ', version_label: 'v2' })!;
    expect(copy.inputs.columns).toEqual([channelExportColumnLabel('number'), channelExportColumnLabel('name'), channelExportColumnLabel('mic'), '48V']);
    expect(copy.inputs.rows.map((r) => r.slice(0, 3))).toEqual([['1', 'KICK', 'Beta 91'], ['2', 'SNARE', 'SM57']]);
    expect(copy.outputs).toEqual({ columns: ['#', 'Item', 'Destination', 'Qty', 'Format', 'Notes'], rows: [['1', 'IEM 1', 'Vox', '1', 'Stereo (SL)', '']] });
    expect([copy.docId, copy.title, copy.version]).toEqual(['pack-1', 'Club list', 'v2']);
    expect(inputListCopy(null, { id: 'x', title: null })).toBeNull();
  });

  it('passes the snapshot gate unchanged', () => {
    const copy = inputListCopy(section, { id: 'pack-1', title: 'Club list', version_label: null })!;
    const stored = parseEmbeds({ inputLists: { [copy.docId]: copy }, stagePlots: {}, tour: { inputList: copy.docId, stagePlot: null }, shows: {} });
    expect(stored.inputLists['pack-1']).toEqual(copy);
  });
});
