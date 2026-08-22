/* ============================================
   LOWPASS — channel-list EXPORT ↔ PAGE agreement pins

   The bug these exist for (2026-08-22, Charlotte Sands · Satellite USA
   Headline): the exported PDF showed a DIFFERENT list from the editor. The
   page was attachment-first; the export had its own private "first pack with a
   channel_list section" scan under a comment claiming it mirrored the page. On
   a tour with an attached document the two resolved different packs — editor
   32 in / 6 out starting KICK IN, PDF 31 in / 2 out starting KICK OUT.

   So the fixture below is exactly that shape: a tour with BOTH an attached
   channel-list document AND an older legacy rider pack that also carries a
   channel_list section, with the legacy pack FIRST in updated_at order so the
   old scan would reach it first. Every "attached wins" assertion here fails
   against the pre-fix export.

   Second pin (§CL-9): the export's columns are the section's own
   enabled_columns, not a hardcoded list.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTourChannelList } from '@/lib/rider-packs/resolveChannelList';
import { loadChannelListExportData } from '@/lib/export/channel-list-data';
import { buildChannelListBodyHtml } from '@/lib/export/channel-list-pdf';
import { channelListSheets } from '@/lib/export/xlsx';
import type { TemplateConfig } from '@/lib/export/template-config';

/* ---- a minimal in-memory PostgREST ---------------------------------------
   select() ignores its column list (fixtures are stored in the shape the code
   reads); eq/in filter; order sorts; maybeSingle/single take the head; the
   builder itself is thenable so `await q` yields { data, error }. */
type Row = Record<string, unknown>;

function fakeSupabase(db: Record<string, Row[]>): SupabaseClient {
  const from = (table: string) => {
    let rows = (db[table] ?? []).slice();
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        rows = rows.filter((r) => r[c] === v);
        return b;
      },
      in: (c: string, vs: unknown[]) => {
        rows = rows.filter((r) => vs.includes(r[c]));
        return b;
      },
      order: (c: string, opts?: { ascending?: boolean }) => {
        const dir = opts?.ascending === false ? -1 : 1;
        rows = rows.slice().sort((x, y) => (String(x[c] ?? '') < String(y[c] ?? '') ? -dir : String(x[c] ?? '') > String(y[c] ?? '') ? dir : 0));
        return b;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const TOUR = 'tour-1';

function pack(id: string, updatedAt: string): Row {
  return { id, tour_id: TOUR, workspace_id: 'ws-1', scope: 'tour', folder_id: null, kind: 'channel_list', title: id, updated_at: updatedAt };
}

function section(id: string, packId: string, metadata: Row | null): Row {
  return {
    id,
    pack_id: packId,
    section_key: 'channel_list',
    title: 'Channel list',
    sort_order: 0,
    section_type: 'channel_list',
    fields: [],
    metadata,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

function inputRow(sectionId: string, index: number, name: string, extra: Row = {}): Row {
  return {
    id: `${sectionId}-r${index}`,
    pack_id: 'x',
    section_id: sectionId,
    row_index: index,
    channel_name: name,
    sub_snake_id: null,
    sub_snake_position: null,
    stage_box_id: null,
    stage_box_position: null,
    position: '',
    gear_id: null,
    mic: '',
    mic_substitute: '',
    di: '',
    gain: '',
    stand: '',
    phantom_power: false,
    provider: null,
    notes: '',
    row_kind: 'input',
    output_item: null,
    output_destination: null,
    output_qty: null,
    output_notes: null,
    output_description: null,
    output_is_stereo: false,
    output_position: null,
    cable_length: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...extra,
  };
}

function outputRow(sectionId: string, index: number, item: string): Row {
  return { ...inputRow(sectionId, index, ''), id: `${sectionId}-o${index}`, row_kind: 'output', output_item: item, output_description: 'IEM' };
}

/* The attached document: 3 inputs starting KICK IN, 1 output, and an explicit
   enabled-columns set that deliberately EXCLUDES sub_snake and includes stand /
   provider / gain — i.e. the set the old hardcoded exporters got wrong. */
const ATTACHED_COLUMNS = ['position', 'stage_box', 'mic', 'gain', 'stand', 'phantom_power', 'provider'];

function makeDb(opts: { attach: boolean }): Record<string, Row[]> {
  return {
    rider_packs: [
      // Legacy pack is NEWER, so an updated_at-ordered scan reaches it first.
      pack('pack-legacy', '2026-08-20'),
      pack('pack-attached', '2026-08-01'),
    ],
    rider_pack_attachments: opts.attach
      ? [
          {
            id: 'att-1',
            tour_id: TOUR,
            routing_id: null,
            rider_pack_id: null,
            document_pack_id: 'pack-attached',
            rider_packs: { kind: 'channel_list', title: 'Satellite USA CL', version_label: null, version_of_pack_id: null },
          },
        ]
      : [],
    rider_sections: [
      section('sec-legacy', 'pack-legacy', null),
      section('sec-attached', 'pack-attached', { enabled_columns: ATTACHED_COLUMNS }),
    ],
    channel_list_rows: [
      inputRow('sec-legacy', 1, 'KICK OUT', { mic: 'Earthworks DK7' }),
      inputRow('sec-legacy', 2, 'SNARE TOP'),
      inputRow('sec-attached', 1, 'KICK IN', { mic: 'sE BL8', phantom_power: true, provider: 'hire', stand: 'Short boom' }),
      inputRow('sec-attached', 2, 'KICK OUT', { mic: 'Earthworks DK7' }),
      inputRow('sec-attached', 3, 'SNARE TOP', { position: 'DS', gain: '+4' }),
      outputRow('sec-attached', 1, 'IEM 1'),
    ],
    sub_snakes: [],
    stage_boxes: [],
  };
}

const TOUR_ROW = { id: TOUR, name: 'Satellite USA Headline', artist_id: null };

const CONFIG = { sections: [{ id: 'inputs', show: true }, { id: 'outputs', show: true }] } as unknown as TemplateConfig;

describe('channel-list resolution — one resolver, both entry points', () => {
  it('resolves the ATTACHED document, not the newer legacy pack', async () => {
    const r = await resolveTourChannelList(fakeSupabase(makeDb({ attach: true })), TOUR);
    expect(r.source).toBe('attachment');
    expect(r.packId).toBe('pack-attached');
    expect(r.section?.id).toBe('sec-attached');
    expect(r.attachedDoc?.document_pack_id).toBe('pack-attached');
  });

  it('THE BUG: the export loader resolves the same attached pack as the page', async () => {
    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: true })), TOUR_ROW);
    // Pre-fix this returned the legacy pack: 2 inputs, 0 outputs, row 1 "KICK OUT".
    expect(data.inputs).toHaveLength(3);
    expect(data.outputs).toHaveLength(1);
    expect(data.inputs[0].cells.name).toBe('KICK IN');
    expect(data.inputs[0].cells.mic).toBe('sE BL8');
  });

  it('falls back to the legacy scan when nothing is attached — both entry points', async () => {
    const r = await resolveTourChannelList(fakeSupabase(makeDb({ attach: false })), TOUR);
    expect(r.source).toBe('legacy');
    expect(r.packId).toBe('pack-legacy');
    expect(r.attachedDoc).toBeNull();

    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: false })), TOUR_ROW);
    expect(data.inputs).toHaveLength(2);
    expect(data.inputs[0].cells.name).toBe('KICK OUT');
  });

  it('reports no section when the tour has no channel list at all', async () => {
    const empty = { rider_packs: [], rider_pack_attachments: [], rider_sections: [], channel_list_rows: [] };
    const data = await loadChannelListExportData(fakeSupabase(empty), TOUR_ROW);
    expect(data.hasSection).toBe(false);
    expect(data.inputs).toHaveLength(0);
  });

  /* Ratchet: neither entry point may grow a private copy of the resolution. */
  it('page and export both delegate resolution — neither re-implements it', () => {
    const root = process.cwd();
    const files = [
      join(root, 'src/app/(app)/operations/[tourId]/channel-list/page.tsx'),
      join(root, 'src/lib/export/channel-list-data.ts'),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must call the shared resolver`).toContain('resolveTourChannelList');
      // A private attachment lookup or pack scan is how these drifted apart.
      expect(src.includes('resolveShowDocuments('), `${f} must not do its own attachment lookup`).toBe(false);
      expect(src.includes('resolvePack('), `${f} must not run its own pack scan`).toBe(false);
    }
  });
});

describe('§CL-9 — exported columns are the editor’s enabled columns', () => {
  it('carries the section’s enabled_columns in canonical order', async () => {
    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: true })), TOUR_ROW);
    expect(data.columns).toEqual([
      'number',
      'name',
      'position',
      'stage_box',
      'mic',
      'gain',
      'stand',
      'phantom_power',
      'provider',
    ]);
    // Not enabled → must not appear.
    expect(data.columns).not.toContain('sub_snake');
    expect(data.columns).not.toContain('cable_length');
    expect(data.columns).not.toContain('notes');
  });

  it('PDF headers follow the enabled set, with 48V replacing the old "Ph."', async () => {
    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: true })), TOUR_ROW);
    const html = buildChannelListBodyHtml(data, CONFIG);
    const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    expect(head).toContain('<th>Pos</th>');
    expect(head).toContain('<th>Stage Box</th>');
    expect(head).toContain('<th>Mic / DI</th>');
    expect(head).toContain('<th>Stand</th>');
    expect(head).toContain('<th>48V</th>');
    expect(head).toContain('<th>Prov</th>');
    // The pre-§CL-9 hardcoded headers are gone.
    expect(head).not.toContain('Sub-snake');
    expect(head).not.toContain('Insert');
    expect(head).not.toContain('Ph.');
    expect(head).not.toContain('Source');
    // Disabled columns leave no cell behind either.
    expect(head).not.toContain('Notes');
    expect(head).not.toContain('Loom');
  });

  it('PDF cells line up with the headers, one per enabled column', async () => {
    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: true })), TOUR_ROW);
    const html = buildChannelListBodyHtml(data, CONFIG);
    const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    const firstRow = body.slice(0, body.indexOf('</tr>'));
    expect((firstRow.match(/<td/g) ?? []).length).toBe(data.columns.length);
    expect(firstRow).toContain('KICK IN');
    expect(firstRow).toContain('sE BL8');
    expect(firstRow).toContain('Hire'); // provider
    expect(firstRow).toContain('On'); // 48V
    expect(firstRow).toContain('Short boom');
  });

  it('XLSX input sheet uses the same enabled set, index stays numeric', async () => {
    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: true })), TOUR_ROW);
    const [inputs, outputs] = channelListSheets(data);
    expect(inputs.columns.map((c) => c.header)).toEqual(['#', 'Name', 'Pos', 'Stage Box', 'Mic / DI', 'Gain', 'Stand', '48V', 'Prov']);
    expect(inputs.columns.map((c) => c.key)).toEqual(['index', 'name', 'position', 'stage_box', 'mic', 'gain', 'stand', 'phantom_power', 'provider']);
    expect(inputs.columns[0].numFmt).toBeTruthy();
    expect(inputs.rows[0]).toMatchObject({ index: 1, name: 'KICK IN', mic: 'sE BL8', phantom_power: 'On', provider: 'Hire' });
    expect(Object.keys(inputs.rows[0])).not.toContain('sub_snake');
    expect(outputs.name).toBe('Outputs');
  });

  it('with no enabled_columns metadata, derives the set from row data (legacy pack)', async () => {
    const data = await loadChannelListExportData(fakeSupabase(makeDb({ attach: false })), TOUR_ROW);
    // sec-legacy has no metadata; only `mic` carries data on its rows.
    expect(data.columns).toEqual(['number', 'name', 'mic']);
  });
});
