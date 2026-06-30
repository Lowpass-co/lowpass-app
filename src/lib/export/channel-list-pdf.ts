/* ============================================
   LOWPASS — Channel-list PDF body (#8 Document Export, 5th surface)

   buildChannelListBodyHtml(data, config) → the per-surface BODY the shared shell
   wraps. A clean branded input list (matching the on-screen channel-list grid) +
   the outputs (IEM / mix) rows. Two coarse, config-toggleable/reorderable sections
   (inputs / outputs). Pure (no I/O); reuses the shell's table primitives.
   Presentation only.
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import type { ChannelListExportData } from '@/lib/export/channel-list-data';
import type { TemplateConfig } from '@/lib/export/template-config';

function renderInputs(data: ChannelListExportData): string {
  if (data.inputs.length === 0) return `<div class="lp-sec-head">Input list</div><p class="lp-native">No input channels.</p>`;
  const rows = data.inputs
    .map(
      (r, idx) => `<tr${idx % 2 === 1 ? ' style="background:#faf8f5;"' : ''}>
        <td class="num">${r.index}</td>
        <td>${esc(r.source)}</td>
        <td>${esc(r.micDi)}</td>
        <td>${esc(r.subSnake)}</td>
        <td>${esc(r.stageIO)}</td>
        <td>${esc(r.insert)}</td>
        <td>${esc(r.phantom)}</td>
        <td class="lp-native">${esc(r.notes)}</td>
      </tr>`,
    )
    .join('');
  return `
    <div class="lp-sec-head">Input list</div>
    <div class="lp-native" style="margin:-2px 0 4px;">${data.inputs.length} channel${data.inputs.length === 1 ? '' : 's'}</div>
    <table class="lp-tbl">
      <thead><tr><th class="num">#</th><th>Source</th><th>Mic / DI</th><th>Sub-snake</th><th>Stage I/O</th><th>Insert</th><th>Ph.</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderOutputs(data: ChannelListExportData): string {
  if (data.outputs.length === 0) return '';
  const rows = data.outputs
    .map(
      (r, idx) => `<tr${idx % 2 === 1 ? ' style="background:#faf8f5;"' : ''}>
        <td class="num">${r.index}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.destination)}</td>
        <td class="num">${r.qty ?? '—'}</td>
        <td>${r.stereo ? 'Stereo' : 'Mono'}${r.position ? ` <span class="lp-native">${esc(r.position)}</span>` : ''}</td>
        <td class="lp-native">${esc(r.notes)}</td>
      </tr>`,
    )
    .join('');
  return `
    <div class="lp-sec-head">Outputs (IEM / mix)</div>
    <div class="lp-native" style="margin:-2px 0 4px;">${data.outputs.length} output${data.outputs.length === 1 ? '' : 's'}</div>
    <table class="lp-tbl">
      <thead><tr><th class="num">#</th><th>Item</th><th>Destination</th><th class="num">Qty</th><th>Format</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Inputs + outputs tables, unconditionally — for the stage-plot "include input
 *  list" combine (which renders the diagram, then this beneath). */
export function renderChannelListInputsOutputs(data: ChannelListExportData): string {
  return renderInputs(data) + renderOutputs(data);
}

/** Template builder. `config.sections` (order + visibility) drives WHICH blocks
 *  render. DEFAULT: input list then outputs. Presentation only. */
export function buildChannelListBodyHtml(data: ChannelListExportData, config: TemplateConfig): string {
  if (!data.hasSection) return `<p class="lp-native">No channel list found on this tour's rider packs.</p>`;
  const sections: Record<string, () => string> = {
    inputs: () => renderInputs(data),
    outputs: () => renderOutputs(data),
  };
  return config.sections
    .filter((s) => s.show)
    .map((s) => sections[s.id]?.() ?? '')
    .join('');
}
