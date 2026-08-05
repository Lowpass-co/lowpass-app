/* ============================================
   LOWPASS — Gear manifest + ATA carnet general list body builders (S1 D-1)

   Two documents, one data loader (gear-data.ts), one completeness predicate
   (carnet-completeness.ts). The carnet body MUST NOT re-derive what is missing
   — it calls carnetCell for every required cell so the marks in the paper and
   the count in the UI pre-flight come from the same function.

   WHAT THE CARNET DOCUMENT IS. It is the GENERAL LIST (schedule of goods) that
   an ATA carnet APPLICATION requires. It is NOT a carnet. Carnets are issued by
   a chamber of commerce, and a tour manager who arrives at a border holding
   this thinking otherwise has a very bad day. The disclaimer is printed ON the
   document, not only in the UI, because the PDF is what travels.
   ============================================ */

import type { GearExportData, GearExportItem } from './gear-data';
import { analyseCarnetCompleteness, carnetCell, resolveCarnetValue } from './carnet-completeness';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const kg = (n: number): string => `${n.toFixed(2)} kg`;

/** Make/model/serial as one trade description — carnet column 2. */
function tradeDescription(i: GearExportItem): string {
  const head = [i.manufacturer, i.model].filter(Boolean).join(' ').trim();
  const name = (i.name ?? '').trim();
  const label = head && head.toLowerCase() !== name.toLowerCase() ? `${name} — ${head}` : name || head;
  const serial = (i.serial_number ?? '').trim();
  return serial ? `${label} (s/n ${serial})` : label || 'Untitled item';
}

/* ── Gear manifest — the internal packing document ─────────────────────────── */

export function buildGearManifestBodyHtml(data: GearExportData): string {
  if (data.items.length === 0) {
    return `<p class="lp-empty">No gear in scope.</p>`;
  }
  const groups = data.groups
    .map((g) => {
      const containers = g.containers
        .map((c) => {
          const rows = c.items
            .map(
              (i) => `<tr>
                <td>${esc(i.name ?? 'Untitled item')}</td>
                <td>${esc([i.manufacturer, i.model].filter(Boolean).join(' '))}</td>
                <td class="lp-mono">${esc(i.serial_number ?? '')}</td>
                <td class="num">1</td>
                <td class="num">${i.weight_kg != null ? kg(Number(i.weight_kg)) : ''}</td>
                <td class="num">${i.value_amount != null ? `${esc(i.value_currency ?? '')} ${Number(i.value_amount).toFixed(2)}` : ''}</td>
              </tr>`,
            )
            .join('');
          return `<tr class="sub"><td colspan="4">${esc(c.containerName)} · ${c.items.length} item${c.items.length === 1 ? '' : 's'}</td>
                  <td class="num">${kg(c.weightKg)}</td><td></td></tr>${rows}`;
        })
        .join('');
      return `<tr class="grp"><td colspan="4">${esc(g.spaceName)}</td>
              <td class="num">${kg(g.weightKg)}</td><td></td></tr>${containers}`;
    })
    .join('');

  return `<table class="lp-table">
    <thead><tr>
      <th>Item</th><th>Make / model</th><th>Serial</th>
      <th class="num">Qty</th><th class="num">Weight</th><th class="num">Value</th>
    </tr></thead>
    <tbody>${groups}</tbody>
    <tfoot><tr class="tot">
      <td colspan="3">Total — ${data.items.length} item${data.items.length === 1 ? '' : 's'}</td>
      <td class="num">${data.items.length}</td>
      <td class="num">${kg(data.totalWeightKg)}</td><td></td>
    </tr></tfoot>
  </table>`;
}

/* ── ATA carnet GENERAL LIST ───────────────────────────────────────────────── */

export const CARNET_DISCLAIMER =
  'This is the GENERAL LIST (schedule of goods) required to APPLY for an ATA ' +
  'carnet. It is not a carnet and has no standing at a border on its own. ' +
  'Carnets are issued by a chamber of commerce.';

export function buildCarnetBodyHtml(data: GearExportData): string {
  const completeness = analyseCarnetCompleteness(data.items);

  const disclaimer = `<p class="lp-note" style="border:1px solid #999;padding:6px 8px;margin:0 0 10px">
      <strong>${esc(CARNET_DISCLAIMER)}</strong></p>`;

  if (data.items.length === 0) {
    return `${disclaimer}<p class="lp-empty">No gear in scope.</p>`;
  }

  /* Gaps are stated up front and again in the cells. A reader who skims the
     header and a reader who scans the table both have to see it. */
  const warning =
    completeness.incomplete.length > 0
      ? `<p class="lp-note" style="margin:0 0 10px"><strong>${esc(completeness.summary)}.</strong>
         Rows marked below are missing fields a carnet application requires; a list
         with gaps is refused at the counter. Cells reading
         &ldquo;— MISSING —&rdquo; must be completed before submission.</p>`
      : `<p class="lp-note" style="margin:0 0 10px">${esc(completeness.summary)}.</p>`;

  let pieces = 0;
  let weight = 0;
  let value = 0;
  const rows = data.items
    .map((i, idx) => {
      const origin = carnetCell(i.country_of_origin);
      const hs = carnetCell(i.customs_hs_code);
      /* D1-L1 — declared value wins; purchase cost is the labelled fallback. */
      const resolved = resolveCarnetValue(i);
      const val = carnetCell(resolved.amount);
      pieces += 1;
      weight += Number(i.weight_kg) || 0;
      value += resolved.amount ?? 0;
      const mark = (c: { text: string; missing: boolean }) =>
        c.missing ? `<td class="gap" style="font-weight:600">${esc(c.text)}</td>` : `<td>${esc(c.text)}</td>`;
      return `<tr>
        <td class="num">${idx + 1}</td>
        <td>${esc(tradeDescription(i))}</td>
        <td class="num">1</td>
        <td class="num">${i.weight_kg != null ? Number(i.weight_kg).toFixed(2) : ''}</td>
        ${val.missing
          ? mark(val)
          : `<td class="num">${esc(i.value_currency ?? '')} ${resolved.amount!.toFixed(2)}${
              resolved.source === 'purchase_cost' ? ' <sup>†</sup>' : ''
            }</td>`}
        ${mark(origin)}
        ${mark(hs)}
      </tr>`;
    })
    .join('');

  /* The dagger is explained only when it appears. A legend for a mark that is
     not on the page is noise; a mark with no legend is the silent equivalence
     this fallback exists to avoid. */
  const usedFallback = data.items.some((i) => resolveCarnetValue(i).source === 'purchase_cost');
  const valueNote = usedFallback
    ? `<p class="lp-note" style="margin:0 0 10px"><sup>†</sup> Value taken from
       purchase cost, not a declared customs value. Customs value is
       replacement or market value; confirm before submission.</p>`
    : '';

  return `${disclaimer}${warning}${valueNote}
    <table class="lp-table">
      <thead><tr>
        <th class="num">No.</th><th>Trade description</th><th class="num">Pieces</th>
        <th class="num">Weight (kg)</th><th>Value</th>
        <th>Country of origin</th><th>HS code</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot">
        <td></td><td>Totals</td>
        <td class="num">${pieces}</td>
        <td class="num">${weight.toFixed(2)}</td>
        <td class="num">${value.toFixed(2)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>`;
}
