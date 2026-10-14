/* ============================================
   LOWPASS — Channel-list PDF body (#8 Document Export, 5th surface)

   buildChannelListBodyHtml(data, config) → the per-surface BODY the shared shell
   wraps. Pure (no I/O); presentation only.

   Oct 2026 — reads like the EDITOR, not a generic table:
     · section bands as on screen (orange left edge + count pill);
     · every input row carries its stage box's colour — a stripe at the left
       edge plus a faint tint across the row — exactly the editor's coding
       (ChannelListEditor ChannelBlock colours rows by stage box), with a legend;
     · monospace channel numbers and box positions, as on screen;
     · optional sections: one page per IO box (socket by socket, spares
       listed), and mic/DI, stand, cable and loom pulls with spares.
   Light or dark (config.channelList.theme) — the dark tokens are the app's
   own dark palette, applied by the shell (renderDocument theme).

   §CL-9: the input columns default to the section's own enabled set
   (data.columns) — the table on screen. config.channelList.inputColumns can
   override that for the printout only; it never changes the editor.
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import {
  channelExportColumnLabel,
  type BoxSocket,
  type ChannelListExportData,
  type ChannelExportCellKey,
  type ExportBoxSheet,
  type PullRow,
} from '@/lib/export/channel-list-data';
import { CHANNEL_LIST_COLUMNS, type ChannelListColumnKey } from '@/lib/channel-list/columns';
import {
  BOX_COLUMN_LABELS,
  DEFAULT_CHANNEL_LIST_OPTIONS,
  type BoxColumnKey,
  type ChannelListOptions,
  type TemplateConfig,
} from '@/lib/export/template-config';

/** A box colour from the database, safe to drop into CSS — or null. The
 *  editor's picker only writes hex; anything else is ignored rather than
 *  trusted into a style attribute. */
export function safeColour(c: string | null | undefined): string | null {
  const v = (c ?? '').trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : null;
}

/* The editor shows box colours at saturate(0.55); on paper the same calm
   comes from mixing toward grey. The tint is deliberately faint so text stays
   readable in both themes and on a mono printer. */
const stripeCss = (c: string) => `color-mix(in srgb, ${c} 72%, #8a8a8a)`;
const tintCss = (c: string) => `color-mix(in srgb, ${c} var(--lp-cl-tint), transparent)`;

const CL_CSS = `
.lp-cl { --lp-cl-tint: 10%; }
.lp-theme-dark .lp-cl { --lp-cl-tint: 14%; }
.lp-cl-band {
  display: flex; align-items: center; gap: 8px;
  margin: 14px 0 6px; padding: 5px 9px;
  border-left: 3px solid var(--lp-orange);
  background: color-mix(in srgb, var(--lp-orange) 6%, var(--lp-panel));
  font-size: 11.5px; font-weight: 800; color: var(--lp-text);
  break-after: avoid;
}
.lp-cl-count {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 8.5px; font-weight: 600; color: var(--lp-text-secondary);
  border: 1px solid var(--lp-border-strong); border-radius: 999px; padding: 0 6px;
}
.lp-cl-mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.lp-cl-tbl { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
.lp-cl-tbl th {
  text-align: left; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--lp-text-tertiary); border-bottom: 1px solid var(--lp-border-strong); padding: 4px 6px;
}
.lp-cl-tbl td { padding: 3.5px 6px; border-bottom: 1px solid var(--lp-border); vertical-align: top; color: var(--lp-text); }
.lp-cl-tbl tr { break-inside: avoid; }
.lp-cl-tbl .num { text-align: right; white-space: nowrap; }
.lp-cl-tbl td.lp-cl-stripe, .lp-cl-tbl th.lp-cl-stripe { width: 4px; padding: 0; border-bottom-color: transparent; }
.lp-cl-tbl tr.lp-cl-zebra td { background: var(--lp-bg-subtle); }
.lp-cl-muted { color: var(--lp-text-tertiary) !important; }
.lp-cl-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: -2px 0 6px; font-size: 8.5px; color: var(--lp-text-secondary); }
.lp-cl-swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
.lp-cl-box { break-before: page; }
/* …except when a box sheet is the very first thing in the document, so page 1
   isn't left holding only the letterhead. */
.lp-cl > .lp-cl-box:first-child { break-before: auto; }
.lp-cl-box-head {
  display: flex; align-items: baseline; gap: 12px;
  border-left: 6px solid var(--lp-text-tertiary); padding: 6px 10px; margin: 0 0 8px;
  background: var(--lp-bg-subtle);
}
.lp-cl-box-name { font-size: 20px; font-weight: 800; color: var(--lp-text); }
.lp-cl-box-meta { font-size: 9.5px; color: var(--lp-text-secondary); }
.lp-cl-box .lp-cl-tbl td { padding: 5px 6px; font-size: 10.5px; }
.lp-cl-socket { font-size: 12px !important; font-weight: 800; width: 34px; }
.lp-cl-pulls { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.lp-cl-pulls > div { break-inside: avoid; }
`;

function band(title: string, count?: string): string {
  return `<div class="lp-cl-band">${esc(title)}${count ? ` <span class="lp-cl-count">${esc(count)}</span>` : ''}</div>`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function optionsOf(config: TemplateConfig | null | undefined): ChannelListOptions {
  return config?.channelList ?? DEFAULT_CHANNEL_LIST_OPTIONS;
}

/** The input-list columns to print: the override if one is set, else the
 *  editor's own. Always in the editor's canonical order. */
export function inputColumnsFor(data: ChannelListExportData, opts: ChannelListOptions): ChannelListColumnKey[] {
  const wanted = new Set<string>(opts.inputColumns ?? data.columns);
  return CHANNEL_LIST_COLUMNS.map((c) => c.key).filter((k) => wanted.has(k));
}

function legend(data: ChannelListExportData): string {
  const used = new Set(data.inputs.map((r) => r.boxId).filter(Boolean));
  const boxes = data.boxes.filter((b) => used.has(b.id) && safeColour(b.colour));
  if (boxes.length === 0) return '';
  return `<div class="lp-cl-legend">${boxes
    .map((b) => `<span><span class="lp-cl-swatch" style="background:${stripeCss(safeColour(b.colour) as string)}"></span>${esc(b.label)}</span>`)
    .join('')}</div>`;
}

function renderInputs(data: ChannelListExportData, opts: ChannelListOptions): string {
  if (data.inputs.length === 0) return `${band('Inputs')}<p class="lp-native">No input channels.</p>`;
  const cols = inputColumnsFor(data, opts);
  const cellKeys = cols.filter((k): k is ChannelExportCellKey => k !== 'number');
  const hasNumber = cols.includes('number');
  const head = [
    '<th class="lp-cl-stripe"></th>',
    ...(hasNumber ? [`<th class="num">${esc(channelExportColumnLabel('number'))}</th>`] : []),
    ...cellKeys.map((k) => `<th>${esc(channelExportColumnLabel(k))}</th>`),
  ].join('');
  const rows = data.inputs
    .map((r, idx) => {
      const c = safeColour(r.boxColour);
      const trAttr = c ? ` style="background:${tintCss(c)}"` : idx % 2 === 1 ? ' class="lp-cl-zebra"' : '';
      return `<tr${trAttr}>
        <td class="lp-cl-stripe"${c ? ` style="background:${stripeCss(c)}"` : ''}></td>
        ${[
          ...(hasNumber ? [`<td class="num lp-cl-mono">${r.index}</td>`] : []),
          ...cellKeys.map((k) => {
            const cls = k === 'notes' ? ' class="lp-native"' : k === 'stage_box' || k === 'sub_snake' ? ' class="lp-cl-mono"' : '';
            return `<td${cls}>${esc(r.cells[k])}</td>`;
          }),
        ].join('')}
      </tr>`;
    })
    .join('');
  return `
    ${band('Inputs', plural(data.inputs.length, 'channel'))}
    ${legend(data)}
    <table class="lp-cl-tbl">
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderOutputs(data: ChannelListExportData): string {
  if (data.outputs.length === 0) return '';
  const rows = data.outputs
    .map(
      (r, idx) => `<tr${idx % 2 === 1 ? ' class="lp-cl-zebra"' : ''}>
        <td class="num lp-cl-mono">${r.index}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.destination)}</td>
        <td class="num">${r.qty ?? '—'}</td>
        <td>${r.stereo ? 'Stereo' : 'Mono'}${r.position ? ` <span class="lp-native">${esc(r.position)}</span>` : ''}</td>
        <td class="lp-native">${esc(r.notes)}</td>
      </tr>`,
    )
    .join('');
  return `
    ${band('Outputs (IEM / mix)', plural(data.outputs.length, 'output'))}
    <table class="lp-cl-tbl">
      <thead><tr><th class="num">#</th><th>Item</th><th>Destination</th><th class="num">Qty</th><th>Format</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** The boxes to print: every box, or the picked ones (in sheet order). */
export function boxesFor(data: ChannelListExportData, opts: ChannelListOptions): ExportBoxSheet[] {
  if (opts.boxIds === null) return data.boxes;
  const want = new Set(opts.boxIds);
  return data.boxes.filter((b) => want.has(b.id));
}

function socketCell(s: BoxSocket, key: BoxColumnKey): string {
  if (!s.cells) return '';
  switch (key) {
    case 'channel':
      return `<span class="lp-cl-mono">${s.channel ?? ''}</span>`;
    case 'name':
      return esc(s.cells.name);
    case 'mic':
      return esc(s.cells.mic);
    case 'sub_snake':
      return `<span class="lp-cl-mono">${esc(s.cells.sub_snake)}</span>`;
    case 'phantom_power':
      return s.cells.phantom_power === 'On' ? '48V' : '';
    case 'stand':
      return esc(s.cells.stand);
    case 'position':
      return esc(s.cells.position);
    case 'notes':
      return `<span class="lp-native">${esc(s.cells.notes)}</span>`;
  }
}

function renderBox(b: ExportBoxSheet, opts: ChannelListOptions): string {
  const c = safeColour(b.colour);
  const used = b.sockets.filter((s) => s.channel !== null).length;
  const cols = opts.boxColumns;
  const head = ['<th class="num">In</th>', ...cols.map((k) => `<th${k === 'channel' ? ' class="num"' : ''}>${esc(BOX_COLUMN_LABELS[k])}</th>`)].join('');
  const rows = b.sockets
    .map((s) => {
      if (s.channel === null) {
        return `<tr><td class="num lp-cl-mono lp-cl-socket lp-cl-muted">${s.socket}</td><td class="lp-cl-muted" colspan="${Math.max(1, cols.length)}">SPARE</td></tr>`;
      }
      return `<tr${c ? ` style="background:${tintCss(c)}"` : ''}><td class="num lp-cl-mono lp-cl-socket">${s.socket}</td>${cols
        .map((k) => `<td${k === 'channel' ? ' class="num"' : ''}>${socketCell(s, k)}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  const unplaced = b.unplaced.length
    ? `<p class="lp-native">Assigned to ${esc(b.label)} with no socket yet: ${b.unplaced.map((u) => `ch ${u.channel} ${esc(u.name)}`).join(', ')}</p>`
    : '';
  return `<div class="lp-cl-box">
    <div class="lp-cl-box-head"${c ? ` style="border-left-color:${stripeCss(c)};background:${tintCss(c)}"` : ''}>
      <span class="lp-cl-box-name">${esc(b.label)}</span>
      <span class="lp-cl-box-meta">${b.capacity ? `${b.capacity}-way · ` : ''}${used} patched · ${b.sockets.length - used} spare</span>
    </div>
    <table class="lp-cl-tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    ${unplaced}
  </div>`;
}

function renderBoxes(data: ChannelListExportData, opts: ChannelListOptions): string {
  const boxes = boxesFor(data, opts);
  if (boxes.length === 0) return `${band('IO boxes')}<p class="lp-native">No IO boxes on this channel list.</p>`;
  /* Every box starts on its own page (CSS .lp-cl-box) so each sheet can be
     printed and taped to its box. */
  return boxes.map((b) => renderBox(b, opts)).join('');
}

/** Spares for one pull line: a fixed count, or a % rounded up. */
export function sparesFor(qty: number, n: number, mode: 'count' | 'percent'): number {
  if (n <= 0 || qty <= 0) return 0;
  return mode === 'percent' ? Math.ceil((qty * n) / 100) : n;
}

function pullTable(title: string, rows: PullRow[], spare: number, mode: 'count' | 'percent', withProvider: boolean, itemLabel: string): string {
  if (rows.length === 0) return `<div>${band(title)}<p class="lp-native">Nothing on the channel list yet.</p></div>`;
  const showSpare = spare > 0;
  let tq = 0;
  let ts = 0;
  const body = rows
    .map((r, idx) => {
      const sp = sparesFor(r.qty, spare, mode);
      tq += r.qty;
      ts += sp;
      return `<tr${idx % 2 === 1 ? ' class="lp-cl-zebra"' : ''}>
        <td>${esc(r.item)}</td>
        ${withProvider ? `<td class="lp-native">${esc(r.provider || '—')}</td>` : ''}
        <td class="num lp-cl-mono">${r.qty}</td>
        ${showSpare ? `<td class="num lp-cl-mono lp-cl-muted">+${sp}</td><td class="num lp-cl-mono"><strong>${r.qty + sp}</strong></td>` : ''}
      </tr>`;
    })
    .join('');
  const totalCells = showSpare
    ? `<td class="num lp-cl-mono">${tq}</td><td class="num lp-cl-mono lp-cl-muted">+${ts}</td><td class="num lp-cl-mono"><strong>${tq + ts}</strong></td>`
    : `<td class="num lp-cl-mono"><strong>${tq}</strong></td>`;
  return `<div>
    ${band(title, `${tq + ts}`)}
    <table class="lp-cl-tbl">
      <thead><tr><th>${esc(itemLabel)}</th>${withProvider ? '<th>From</th>' : ''}<th class="num">Qty</th>${showSpare ? '<th class="num">Spare</th><th class="num">Total</th>' : ''}</tr></thead>
      <tbody>${body}<tr><td${withProvider ? ' colspan="2"' : ''}><strong>Total</strong></td>${totalCells}</tr></tbody>
    </table>
  </div>`;
}

function renderLooms(data: ChannelListExportData): string {
  const looms = data.pulls.looms;
  if (looms.length === 0) return `<div>${band('Looms / sub-snakes')}<p class="lp-native">No looms on this channel list.</p></div>`;
  const rows = looms
    .map((l) => {
      const c = safeColour(l.colour);
      return `<tr><td>${c ? `<span class="lp-cl-swatch" style="background:${stripeCss(c)}"></span>` : ''}${esc(l.label)}</td><td class="num lp-cl-mono">${l.capacity || '—'}</td><td class="num lp-cl-mono">${l.used}</td></tr>`;
    })
    .join('');
  return `<div>
    ${band('Looms / sub-snakes', `${looms.length}`)}
    <table class="lp-cl-tbl"><thead><tr><th>Loom</th><th class="num">Ways</th><th class="num">Used</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

const PULL_IDS = new Set(['mic-pull', 'stand-pull', 'cable-pull', 'loom-pull']);

/** The channel-list blocks for `ids`, in order, inside the shared CSS wrapper.
 *  Ids: inputs · outputs · io-boxes · mic-pull · stand-pull · cable-pull ·
 *  loom-pull (unknown ids are skipped). Consecutive pulls sit two to a row.
 *  Shared by the channel-list export and the stage-plot export, so both print
 *  the same tables from the same code. Presentation only. */
export function channelListBlocks(data: ChannelListExportData, ids: string[], opts: ChannelListOptions): string {
  const sp = opts.spares;
  const sections: Record<string, () => string> = {
    inputs: () => renderInputs(data, opts),
    outputs: () => renderOutputs(data),
    'io-boxes': () => renderBoxes(data, opts),
    'mic-pull': () => pullTable('Mic & DI pull', data.pulls.mics, sp.mics, sp.mode, true, 'Mic / DI'),
    'stand-pull': () => pullTable('Stand pull', data.pulls.stands, sp.stands, sp.mode, true, 'Stand'),
    'cable-pull': () => pullTable('Cable pull', data.pulls.cables, sp.cables, sp.mode, false, 'Length'),
    'loom-pull': () => renderLooms(data),
  };
  const out: string[] = [];
  let pullRun: string[] = [];
  const flush = () => {
    if (pullRun.length) out.push(`<div class="lp-cl-pulls">${pullRun.join('')}</div>`);
    pullRun = [];
  };
  for (const id of ids) {
    if (!sections[id]) continue;
    if (PULL_IDS.has(id)) {
      pullRun.push(sections[id]());
    } else {
      flush();
      out.push(sections[id]());
    }
  }
  flush();
  return `<style>${CL_CSS}</style><div class="lp-cl">${out.join('')}</div>`;
}

/** Template builder. `config.sections` (order + visibility) drives WHICH blocks
 *  render. Presentation only. */
export function buildChannelListBodyHtml(data: ChannelListExportData, config: TemplateConfig): string {
  if (!data.hasSection) return `<p class="lp-native">No channel list found on this tour's rider packs.</p>`;
  return channelListBlocks(data, config.sections.filter((s) => s.show).map((s) => s.id), optionsOf(config));
}
