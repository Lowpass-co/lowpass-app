/* ============================================
   LOWPASS — Stage Plot PDF body (#8 Document Export, 6th surface)

   buildStagePlotBodyHtml(data, config) → the per-surface BODY the shared shell
   wraps. Two coarse sections: `stage-diagram` (the reconstructed SVG via the
   extracted server-safe buildStagePlotSvg) + `input-list` (the paired channel/input
   list beneath — the classic combined doc; OFF by default → diagram-only).

   The shell letterhead supersedes the plot's own title bar (signed-off map); we draw
   the diagram only. Pure (no I/O). Presentation only.
   ============================================ */

import { buildStagePlotSvg } from '@/lib/stage-plot/stageplot-svg';
import { renderChannelListInputsOutputs } from '@/lib/export/channel-list-pdf';
import type { StagePlotExportData } from '@/lib/export/stageplot-data';
import type { TemplateConfig } from '@/lib/export/template-config';

function renderDiagram(data: StagePlotExportData): string {
  const svg = buildStagePlotSvg(data.plot, data.items, data.customIcons);
  return `
    <style>.lp-stageplot svg.lp-plot-svg{width:100%;height:auto;max-height:175mm;display:block;margin:0 auto;}</style>
    <div class="lp-stageplot">${svg}</div>`;
}

function renderInputListSection(data: StagePlotExportData): string {
  if (!data.channel || !data.channel.hasSection) {
    return `<div class="lp-page-break"></div><div class="lp-sec-head">Input list</div><p class="lp-native">No channel list is paired with this stage plot.</p>`;
  }
  return `<div class="lp-page-break"></div>${renderChannelListInputsOutputs(data.channel)}`;
}

/** Template builder. `config.sections` (order + visibility): `stage-diagram`
 *  (default on) + `input-list` (default off → diagram-only). The "include input
 *  list" toggle IS the input-list section's visibility. */
export function buildStagePlotBodyHtml(data: StagePlotExportData, config: TemplateConfig): string {
  const sections: Record<string, () => string> = {
    'stage-diagram': () => renderDiagram(data),
    'input-list': () => renderInputListSection(data),
  };
  return config.sections
    .filter((s) => s.show)
    .map((s) => sections[s.id]?.() ?? '')
    .join('');
}
