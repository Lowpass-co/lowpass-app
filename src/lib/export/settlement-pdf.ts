/* ============================================
   LOWPASS — Settlement PDF body (M1-B · SET-05)

   Renders ONE show's settlement Walk (guarantee → deductions → adjusted gross →
   expenses → show net → +overage +merch → artist total → −deposit → balance due →
   −payments → outstanding), plus the itemized deductions / expenses / payments and
   the Full & Final state. Pure HTML string — the shared export shell (renderDocument)
   wraps it with the letterhead. Money is the harness-proven computeWalk (loadWalk).
   ============================================ */

import type { SettlementWalkData } from '@/lib/settlement/loadWalk';
import type { TemplateConfig } from '@/lib/export/template-config';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function money(n: number, currency: string): string {
  const abs = new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 }).format(Math.abs(n));
  return n < 0 ? `−${abs}` : abs;
}

const KIND_LABEL: Record<string, string> = {
  withholding: 'Withholding', tax: 'Tax', venue_cost: 'Venue cost', commission: 'Commission', other: 'Other',
};
const METHOD_LABEL: Record<string, string> = { wire: 'Wire', check: 'Check', cash: 'Cash', ach: 'ACH' };

export interface SettlementExportMeta {
  showLabel: string;
  date: string | null;
}

export function buildSettlementBodyHtml(
  data: SettlementWalkData,
  meta: SettlementExportMeta,
  config: TemplateConfig,
): string {
  const c = data.currency;
  const w = data.walk;
  const shown = (id: string) => config.sections.find((s) => s.id === id)?.show !== false;

  const walkRow = (label: string, value: number, opts: { strong?: boolean; total?: boolean } = {}) => {
    const cls = opts.total ? 'lp-set-total' : opts.strong ? 'lp-set-sub' : 'lp-set-row';
    const neg = value < 0 ? ' lp-neg' : '';
    return `<tr class="${cls}"><td>${esc(label)}</td><td class="lp-num${neg}">${money(value, c)}</td></tr>`;
  };
  const lineRow = (left: string, amount: number) =>
    `<tr class="lp-set-line"><td>${esc(left)}</td><td class="lp-num lp-neg">−${money(amount, c)}</td></tr>`;

  const deductionRows =
    data.deductions.length > 0
      ? data.deductions.map((d) => lineRow(KIND_LABEL[d.kind] ?? d.kind + (d.label ? ` · ${d.label}` : ''), d.amount)).join('')
      : data.deductionsAreLegacy
        ? lineRow('Migrated deductions', w.deductionsTotal)
        : '';
  const expenseRows = data.expenses.map((e) => lineRow(e.label || 'Expense', e.amount)).join('');
  const paymentRows = data.payments
    .map((p) => `<tr class="lp-set-line"><td>${esc(METHOD_LABEL[p.method] ?? p.method)}${p.paid_on ? ` · ${esc(p.paid_on)}` : ''}</td><td class="lp-num lp-neg">−${money(p.amount, c)}</td></tr>`)
    .join('');

  const style = `<style>
    .lp-set-h { display:flex; justify-content:space-between; align-items:baseline; margin:0 0 8px; }
    .lp-set-h .t { font-size:15px; font-weight:700; }
    .lp-set-h .d { font-size:11px; color:#666; font-variant-numeric:tabular-nums; }
    .lp-ff { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:999px; }
    .lp-ff.on { background:#e6f4ea; color:#1a7f37; }
    .lp-ff.off { background:#fdf1e5; color:#a15c00; }
    table.lp-set { width:100%; border-collapse:collapse; font-size:12px; }
    table.lp-set td { padding:4px 6px; }
    table.lp-set .lp-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    table.lp-set .lp-neg { color:#b42318; }
    table.lp-set .lp-set-sub td { border-top:1px solid #ddd; font-weight:600; }
    table.lp-set .lp-set-total td { border-top:2px solid #333; font-weight:800; font-size:14px; }
    table.lp-set .lp-set-line td:first-child { padding-left:18px; color:#555; }
    .lp-set-sec { margin-top:2px; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#888; padding:8px 6px 0; }
  </style>`;

  return `${style}
    <div class="lp-set-h">
      <span class="t">${esc(meta.showLabel)}</span>
      <span class="d">${esc(meta.date ?? '')} &nbsp; <span class="lp-ff ${data.fullAndFinal ? 'on' : 'off'}">${data.fullAndFinal ? 'Full &amp; Final' : 'Open'}</span></span>
    </div>
    <table class="lp-set">
      ${walkRow('Guarantee', w.guarantee)}
      ${shown('deductions') ? `<tr><td colspan="2" class="lp-set-sec">Deductions</td></tr>${deductionRows}` : ''}
      ${walkRow('Adjusted gross', w.adjustedGross, { strong: true })}
      ${shown('expenses') ? `<tr><td colspan="2" class="lp-set-sec">Show expenses</td></tr>${expenseRows}` : ''}
      ${walkRow('Show net', w.showNet, { strong: true })}
      ${walkRow('+ Overage / bonus', w.overage)}
      ${walkRow('+ Merch', w.merch)}
      ${walkRow('Artist total', w.artistTotal, { total: true })}
      ${walkRow('− Deposit received', -w.depositReceived)}
      ${walkRow('Balance due', w.balanceDue, { total: true })}
      ${shown('payments') ? `<tr><td colspan="2" class="lp-set-sec">Payments</td></tr>${paymentRows}` : ''}
      ${walkRow('Outstanding', w.outstanding, { total: true })}
    </table>`;
}
