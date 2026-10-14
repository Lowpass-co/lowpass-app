/* ============================================
   LOWPASS — Stage Plot PDF body (#8 Document Export; rebuilt Oct 2026)

   buildStagePlotBodyHtml(data, config) → the per-surface BODY the shared shell
   wraps. Sections (order + visibility from config.sections):

     stage-diagram  the plot page — LANDSCAPE (a CSS named page; the route
                    prints with preferCSSPageSize), drawn like the editor
                    (stageplot-svg), with the channel key beside it
     input-list     inputs + outputs   ┐ the channel-list export's own tables,
     io-boxes       a page per box     │ same code (channelListBlocks), so the
     *-pull         mic/stand/cable/   │ two documents can never disagree
                    loom pulls         ┘ — portrait pages

   config.stagePlot: theme (light/dark, PDF only), contact strip, channel key,
   chips, grid / rulers (as plot / on / off), labels.

   The contact strip (subtitle · TM · phone · email · version) prints under the
   letterhead on page 1, whichever section comes first. Pure; presentation only.
   ============================================ */

import { buildStagePlotSvg, linkedChannels, type PlotChannelRef } from '@/lib/stage-plot/stageplot-svg';
import { getIcon } from '@/lib/stage-plot/icons';
import { channelListBlocks, safeColour } from '@/lib/export/channel-list-pdf';
import { escapeHtml as esc } from '@/lib/export/shell';
import type { StagePlotExportData } from '@/lib/export/stageplot-data';
import {
  DEFAULT_CHANNEL_LIST_OPTIONS,
  DEFAULT_STAGE_PLOT_OPTIONS,
  type PlotToggle,
  type StagePlotOptions,
  type TemplateConfig,
} from '@/lib/export/template-config';

/** Channel ids each list section expands to (input-list = both tables). */
const LIST_SECTIONS: Record<string, string[]> = {
  'input-list': ['inputs', 'outputs'],
  'io-boxes': ['io-boxes'],
  'mic-pull': ['mic-pull'],
  'stand-pull': ['stand-pull'],
  'cable-pull': ['cable-pull'],
  'loom-pull': ['loom-pull'],
};

/** Does this export need the paired channel list loaded at all? */
export function stagePlotNeedsChannels(config: TemplateConfig): boolean {
  const o = config.stagePlot ?? DEFAULT_STAGE_PLOT_OPTIONS;
  const shown = config.sections.filter((s) => s.show).map((s) => s.id);
  return shown.some((id) => id in LIST_SECTIONS) || (shown.includes('stage-diagram') && (o.chips || o.key));
}

const toggle = (t: PlotToggle): boolean | undefined => (t === 'on' ? true : t === 'off' ? false : undefined);

/** channel_list_rows.id → what a chip / key row prints. */
export function plotChannelMap(data: StagePlotExportData): Map<string, PlotChannelRef> {
  const m = new Map<string, PlotChannelRef>();
  for (const r of data.channel?.inputs ?? []) {
    m.set(r.rowId, { number: r.index, name: r.cells.name, colour: safeColour(r.boxColour) });
  }
  return m;
}

const SP_CSS = (pageSize: string) => `
@page lp-sp-land { size: ${pageSize} landscape; }
.lp-sp-page { page: lp-sp-land; }
.lp-sp-contact {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap;
  margin: -8px 0 10px; padding: 5px 9px; border-radius: 4px;
  background: var(--lp-bg-subtle); border: 1px solid var(--lp-border);
  font-size: 9.5px; color: var(--lp-text-secondary);
}
.lp-sp-contact b { color: var(--lp-text); font-weight: 700; }
.lp-sp-contact .lp-sp-sub { font-weight: 600; color: var(--lp-text); }
.lp-sp-grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start; }
.lp-sp-grid.lp-sp-has-key { grid-template-columns: 1fr 58mm; }
.lp-sp-grid.lp-sp-has-key.lp-sp-key-wide { grid-template-columns: 1fr 96mm; }
.lp-sp-plot svg.lp-plot-svg { display: block; width: 100%; height: auto; margin: 0 auto; max-height: 134mm; }
.lp-sp-page.lp-sp-solo .lp-plot-svg { max-height: 158mm; }
.lp-sp-key { font-size: 8px; color: var(--lp-text); break-inside: avoid; }
.lp-sp-key-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10px; }
.lp-sp-key h4 {
  margin: 0 0 4px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--lp-text-tertiary);
}
.lp-sp-key table { width: 100%; border-collapse: collapse; }
.lp-sp-key td { padding: 1.6px 4px; border-bottom: 1px solid var(--lp-border); vertical-align: top; }
.lp-sp-key td.n { width: 22px; white-space: nowrap; font-weight: 700; font-variant-numeric: tabular-nums; }
.lp-sp-key td.i { color: var(--lp-text-secondary); }
.lp-sp-tick { display: inline-block; width: 3px; height: 9px; border-radius: 1.5px; vertical-align: -1px; margin-right: 4px; background: var(--lp-text-tertiary); }
.lp-sp-key-note { margin-top: 5px; font-size: 7.5px; color: var(--lp-text-tertiary); }
`;

function contactStrip(data: StagePlotExportData): string {
  const p = data.plot;
  const who = [p.tmRole, p.tmName].filter(Boolean).join(' ');
  const right = [who ? `<b>${esc(who)}</b>` : '', p.tmPhone ? esc(p.tmPhone) : '', p.tmEmail ? esc(p.tmEmail) : '', p.versionLabel ? esc(p.versionLabel) : '']
    .filter(Boolean)
    .join(' · ');
  if (!p.subtitle && !right) return '';
  return `<div class="lp-sp-contact"><span class="lp-sp-sub">${esc(p.subtitle ?? '')}</span><span>${right}</span></div>`;
}

/** Key rows: every channel linked from an item, in channel order, with the
 *  item(s) it sits on. Plus how many channels aren't on the plot at all. */
export function channelKey(data: StagePlotExportData, channels: Map<string, PlotChannelRef>): { rows: Array<PlotChannelRef & { items: string[] }>; unplaced: number } {
  const byNumber = new Map<number, PlotChannelRef & { items: string[] }>();
  for (const it of data.items) {
    if (it.kind === 'text' || it.kind === 'arrow') continue;
    const name = it.label || (data.customIcons.get(it.iconName) ?? getIcon(it.iconName))?.label || '';
    for (const c of linkedChannels(it, channels)) {
      const row = byNumber.get(c.number) ?? { ...c, items: [] };
      if (name && !row.items.includes(name)) row.items.push(name);
      byNumber.set(c.number, row);
    }
  }
  const rows = [...byNumber.values()].sort((a, b) => a.number - b.number);
  return { rows, unplaced: Math.max(0, channels.size - rows.length) };
}

/** Past this many rows the key splits into two columns (a wider key column). */
const KEY_SPLIT = 34;

function renderKey(key: ReturnType<typeof channelKey>): string {
  if (key.rows.length === 0) return '';
  const tr = (rows: typeof key.rows) =>
    `<table>${rows
      .map((r) => {
        const tick = r.colour ? `<span class="lp-sp-tick" style="background:${r.colour}"></span>` : '<span class="lp-sp-tick"></span>';
        return `<tr><td class="n">${tick}${r.number}</td><td>${esc(r.name)}</td><td class="i">${esc(r.items.join(', '))}</td></tr>`;
      })
      .join('')}</table>`;
  const half = Math.ceil(key.rows.length / 2);
  const body = key.rows.length > KEY_SPLIT ? `<div class="lp-sp-key-cols">${tr(key.rows.slice(0, half))}${tr(key.rows.slice(half))}</div>` : tr(key.rows);
  const note = key.unplaced > 0 ? `<div class="lp-sp-key-note">${key.unplaced} more channel${key.unplaced === 1 ? ' isn’t' : 's aren’t'} placed on the plot — see the input list.</div>` : '';
  return `<div class="lp-sp-key"><h4>Channels</h4>${body}${note}</div>`;
}

function renderPlotPage(data: StagePlotExportData, o: StagePlotOptions, channels: Map<string, PlotChannelRef>, first: boolean, lead: string): string {
  const svg = buildStagePlotSvg(data.plot, data.items, data.customIcons, {
    theme: o.theme,
    channels,
    showChips: o.chips,
    showGrid: toggle(o.grid),
    showRulers: toggle(o.rulers),
    showLabels: o.labels,
  });
  const key = o.key ? channelKey(data, channels) : null;
  const keyHtml = key ? renderKey(key) : '';
  const cls = ['lp-sp-grid', keyHtml ? 'lp-sp-has-key' : '', key && key.rows.length > KEY_SPLIT ? 'lp-sp-key-wide' : ''].filter(Boolean).join(' ');
  return `<section class="lp-sp-page${first ? '' : ' lp-sp-solo'}">${lead}<div class="${cls}"><div class="lp-sp-plot">${svg}</div>${keyHtml}</div></section>`;
}

/** Template builder. */
export function buildStagePlotBodyHtml(data: StagePlotExportData, config: TemplateConfig): string {
  const o = config.stagePlot ?? DEFAULT_STAGE_PLOT_OPTIONS;
  const clOpts = config.channelList ?? DEFAULT_CHANNEL_LIST_OPTIONS;
  const channels = plotChannelMap(data);
  const shown = config.sections.filter((s) => s.show).map((s) => s.id);
  const contact = o.contact ? contactStrip(data) : '';

  const blocks: string[] = [];
  let run: string[] = [];
  let noListSaid = false;
  const flush = () => {
    if (run.length === 0) return;
    if (data.channel?.hasSection) {
      blocks.push(`<div class="lp-sp-lists">${channelListBlocks(data.channel, run, clOpts)}</div>`);
    } else if (!noListSaid) {
      blocks.push(`<div class="lp-sp-lists"><p class="lp-native">No channel list is paired with this stage plot.</p></div>`);
      noListSaid = true;
    }
    run = [];
  };
  for (const id of shown) {
    if (id === 'stage-diagram') {
      flush();
      const first = blocks.length === 0;
      blocks.push(renderPlotPage(data, o, channels, first, first ? contact : ''));
    } else if (LIST_SECTIONS[id]) {
      run.push(...LIST_SECTIONS[id]);
    }
  }
  flush();
  if (blocks.length === 0) return contact;

  const plotFirst = shown[0] === 'stage-diagram';
  // The letterhead (and its optional notes block) must sit on the same page as
  // the first section — so when that's the landscape plot, they join its page.
  const letterheadPage = plotFirst ? `body > .lp-letterhead, body > .lp-letterhead + div:not(.lp-sp-root) { page: lp-sp-land; }` : '';
  const leadContact = plotFirst ? '' : contact;
  return `<div class="lp-sp-root"><style>${SP_CSS(config.pageSize ?? 'A4')}${letterheadPage}</style>${leadContact}${blocks.join('')}</div>`;
}
