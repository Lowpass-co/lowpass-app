/* ============================================================
   LOWPASS — Branded Rental Job PDF Export
   ----------------------------------------------------------------
   Generates a downloadable, client-ready PDF (Quote / Pull Sheet /
   Invoice / Receipt) using jsPDF directly. No print dialog, no
   browser headers/footers, no page chrome — just a clean document.
   ============================================================ */

import { jsPDF } from 'jspdf';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { calcDays, fmtUSD, fmtDate, type RentalJob, type RentalInventoryItem, type RentalJobItem } from './types';

// Brand
const ORANGE: [number, number, number] = [255, 69, 0];
const INK:    [number, number, number] = [17, 17, 17];
const MUTED:  [number, number, number] = [107, 114, 128];
const HAIR:   [number, number, number] = [229, 231, 235];
const FAINT:  [number, number, number] = [156, 163, 175];

// Page geometry (A4, in mm)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 14;
const MARGIN_TOP = 14;
const MARGIN_BOTTOM = 14;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

interface ExportOptions {
  job: RentalJob;
  jobItems: RentalJobItem[];
  inventory: RentalInventoryItem[];
  artistLabel: string | null;
  tourLabel: string | null;
  discPct: number;
  discFixed: number;
}

/** Load the Lowpass wordmark as a data URL so jsPDF can embed it. */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/lowpass-logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('logo read failed'));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportJobPdf(opts: ExportOptions): Promise<void> {
  const { job, jobItems, inventory, artistLabel, tourLabel, discPct, discFixed } = opts;

  const days     = calcDays(job.start_date, job.end_date);
  const subtotal = jobItems.reduce((sum, it) => {
    const inv  = inventory.find(i => i.id === it.inventory_id);
    const rate = it.day_rate_override ?? (inv ? effectiveInventoryDayRate(inv) ?? 0 : 0);
    return sum + (it.quantity || 1) * days * rate;
  }, 0);
  const discAmt = subtotal * (discPct / 100) + discFixed;
  const total   = Math.max(0, subtotal - discAmt);

  const documentNumber = `LP-${job.id.slice(0, 8).toUpperCase()}`;
  const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const docTitle =
    job.status === 'invoiced'  ? 'RENTAL INVOICE'
      : job.status === 'completed' ? 'RENTAL RECEIPT'
        : job.status === 'confirmed' ? 'PULL SHEET / QUOTE'
          : 'RENTAL QUOTE';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoDataUrl = await loadLogoDataUrl();

  // ── HEADER ──────────────────────────────────────────────────────
  // Logo + title sit at the very top, full width, separated by an
  // orange rule. No page meta, no URL, no app chrome.
  let y = MARGIN_TOP;

  if (logoDataUrl) {
    // Logo aspect 1000×770 → ~1.30 ratio. Render at 22mm tall.
    const logoH = 16;
    const logoW = logoH * (1000 / 770);
    doc.addImage(logoDataUrl, 'PNG', MARGIN_X, y, logoW, logoH);
  }

  // Title — right-aligned to page edge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(docTitle, PAGE_W - MARGIN_X, y + 8, { align: 'right' });

  // Doc no. + issue date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`No. ${documentNumber}`, PAGE_W - MARGIN_X, y + 13.5, { align: 'right' });
  doc.text(`Issued ${issueDate}`,    PAGE_W - MARGIN_X, y + 17.5, { align: 'right' });

  y += 22;

  // Orange separator rule
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.9);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 7;

  // ── META BLOCK (Bill To / Job / Period) ─────────────────────────
  const colW = CONTENT_W / 3;
  const metaTop = y;
  const c1 = MARGIN_X;
  const c2 = MARGIN_X + colW;
  const c3 = MARGIN_X + colW * 2;

  // Build "Bill To" lines: client name + (optional) billing address/email/phone/tax
  const billingLines: string[] = [];
  const billingAddrLines = (job.billing_address || '').split('\n').map(s => s.trim()).filter(Boolean);
  billingLines.push(...billingAddrLines);
  if (job.billing_email)  billingLines.push(job.billing_email);
  if (job.billing_phone)  billingLines.push(job.billing_phone);
  if (job.billing_tax_id) billingLines.push(`Tax ID: ${job.billing_tax_id}`);

  drawColLabel(doc, 'BILL TO', c1, y);
  drawColLabel(doc, 'JOB',     c2, y);
  drawColLabel(doc, 'RENTAL PERIOD', c3, y);

  // Bill To value: client name in bold, then optional billing detail lines (muted)
  let yBill = y + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const clientName = job.client_name || '-';
  const wrappedClient = doc.splitTextToSize(clientName, colW - 4) as string[];
  doc.text(wrappedClient, c1, yBill);
  yBill += wrappedClient.length * 4.2;

  if (billingLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    for (const line of billingLines) {
      const wrapped = doc.splitTextToSize(line, colW - 4) as string[];
      doc.text(wrapped, c1, yBill);
      yBill += wrapped.length * 3.6;
    }
  }

  // Job column
  let yJob = y + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const wrappedName = doc.splitTextToSize(job.name, colW - 4) as string[];
  doc.text(wrappedName, c2, yJob);
  yJob += wrappedName.length * 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const statusLabel = `Status: ${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`;
  doc.text(statusLabel, c2, yJob);
  yJob += 4;
  if (artistLabel) { doc.text(artistLabel, c2, yJob); yJob += 4; }
  if (tourLabel)   { doc.text(tourLabel,   c2, yJob); yJob += 4; }

  // Period column
  let yPer = y + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  // ASCII separator only — jsPDF's default Helvetica is WinAnsi-encoded
  // and renders Unicode arrows/minus-signs as garbage glyphs.
  const periodStr = `${fmtDate(job.start_date)}  to  ${fmtDate(job.end_date)}`;
  doc.text(periodStr, c3, yPer);
  yPer += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`${days} billable day${days !== 1 ? 's' : ''}`, c3, yPer);
  yPer += 3.8;
  doc.setTextColor(...FAINT);
  doc.text('(3-day-week rule)', c3, yPer);
  yPer += 4;

  y = Math.max(yBill, yJob, yPer, metaTop) + 6;

  // ── LINE ITEMS TABLE ────────────────────────────────────────────
  // Column layout (mm): item | qty | days | rate | subtotal
  const colItem = MARGIN_X;
  const colQty  = MARGIN_X + CONTENT_W * 0.56;
  const colDays = MARGIN_X + CONTENT_W * 0.66;
  const colRate = MARGIN_X + CONTENT_W * 0.80;
  const colSub  = MARGIN_X + CONTENT_W;

  // Header (black bar)
  doc.setFillColor(...INK);
  doc.rect(MARGIN_X, y, CONTENT_W, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('ITEM',     colItem + 2, y + 5);
  doc.text('QTY',      colQty,      y + 5, { align: 'center' });
  doc.text('DAYS',     colDays,     y + 5, { align: 'center' });
  doc.text('DAY RATE', colRate,     y + 5, { align: 'right' });
  doc.text('SUBTOTAL', colSub - 2,  y + 5, { align: 'right' });
  y += 7.5;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);

  const drawItemRow = (it: RentalJobItem) => {
    const inv  = inventory.find(i => i.id === it.inventory_id);
    const rate = it.day_rate_override ?? (inv ? effectiveInventoryDayRate(inv) ?? 0 : 0);
    const lineAmt = (it.quantity || 1) * days * rate;
    const itemName = inv?.name ?? 'Unknown';
    const itemNameLines = doc.splitTextToSize(itemName, (colQty - colItem) - 4) as string[];
    const hasCategory = !!inv?.category;
    const hasOverride = it.day_rate_override != null;
    // Row height accounts for wrapped name + optional category/override
    const baseLineH = 4.2;
    const extraLines = (hasCategory ? 1 : 0) + (hasOverride ? 1 : 0);
    const rowH = Math.max(7, itemNameLines.length * baseLineH + extraLines * 3.6 + 3);

    // Pagination check
    if (y + rowH > PAGE_H - MARGIN_BOTTOM - 60) {
      // Save room for totals/terms; spill onto next page if needed
      doc.addPage();
      y = MARGIN_TOP;
      // Re-draw table header on new page
      doc.setFillColor(...INK);
      doc.rect(MARGIN_X, y, CONTENT_W, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('ITEM',     colItem + 2, y + 5);
      doc.text('QTY',      colQty,      y + 5, { align: 'center' });
      doc.text('DAYS',     colDays,     y + 5, { align: 'center' });
      doc.text('DAY RATE', colRate,     y + 5, { align: 'right' });
      doc.text('SUBTOTAL', colSub - 2,  y + 5, { align: 'right' });
      y += 7.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
    }

    let yRow = y + 5;
    // Item name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(itemNameLines, colItem + 2, yRow);
    yRow += itemNameLines.length * baseLineH;
    // Category
    if (hasCategory) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(inv!.category!, colItem + 2, yRow);
      yRow += 3.6;
    }
    // Override pill
    if (hasOverride) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...ORANGE);
      doc.text('Custom rate', colItem + 2, yRow);
    }

    // Numeric columns
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const midY = y + 5;
    doc.text(String(it.quantity ?? 1), colQty, midY, { align: 'center' });
    doc.text(String(days),             colDays, midY, { align: 'center' });
    doc.text(fmtUSD(rate),             colRate, midY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(fmtUSD(lineAmt),          colSub - 2, midY, { align: 'right' });

    // Hairline separator
    y += rowH;
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  };

  if (jobItems.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('No items on this job.', PAGE_W / 2, y + 8, { align: 'center' });
    y += 14;
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  } else {
    for (const it of jobItems) drawItemRow(it);
  }

  y += 6;

  // ── TOTALS BLOCK (right-aligned) ───────────────────────────────
  const totalsW = CONTENT_W * 0.42;
  const totalsX = PAGE_W - MARGIN_X - totalsW;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text('Subtotal', totalsX + 2, y + 5);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtUSD(subtotal), totalsX + totalsW - 2, y + 5, { align: 'right' });
  y += 7;

  if (discAmt > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const discLabel =
      discPct > 0 && discFixed > 0 ? `Discount (${discPct}% + fixed)`
        : discPct > 0 ? `Discount (${discPct}%)`
          : 'Discount';
    doc.text(discLabel, totalsX + 2, y + 5);
    doc.setTextColor(...ORANGE);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${fmtUSD(discAmt)}`, totalsX + totalsW - 2, y + 5, { align: 'right' });
    y += 7;
  }

  // Total Due — heavy black rule + orange amount
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(totalsX, y, totalsX + totalsW, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text('TOTAL DUE', totalsX + 2, y + 4);
  doc.setFontSize(15);
  doc.setTextColor(...ORANGE);
  doc.text(fmtUSD(total), totalsX + totalsW - 2, y + 4, { align: 'right' });
  y += 12;

  // ── NOTES ──────────────────────────────────────────────────────
  if (job.notes && job.notes.trim()) {
    if (y > PAGE_H - MARGIN_BOTTOM - 50) { doc.addPage(); y = MARGIN_TOP; }
    drawColLabel(doc, 'NOTES', MARGIN_X, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const notesLines = doc.splitTextToSize(job.notes.trim(), CONTENT_W - 8) as string[];
    const notesH = notesLines.length * 4.2 + 6;
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.2);
    doc.roundedRect(MARGIN_X, y, CONTENT_W, notesH, 1.2, 1.2, 'FD');
    doc.text(notesLines, MARGIN_X + 4, y + 5);
    y += notesH + 6;
  }

  // ── TERMS ──────────────────────────────────────────────────────
  const terms = [
    'All equipment remains the property of the lessor and must be returned in the condition supplied.',
    'Billable days follow the 3-day-week rule (each 7 calendar days = 3 billable days).',
    'Lessee assumes responsibility for loss, theft, and damage during the rental period.',
    'Quote is valid for 30 days from issue date. Final invoice may vary based on additions or losses.',
  ];

  if (y > PAGE_H - MARGIN_BOTTOM - 40) { doc.addPage(); y = MARGIN_TOP; }
  drawColLabel(doc, 'TERMS', MARGIN_X, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  for (let i = 0; i < terms.length; i++) {
    const numbered = `${i + 1}.  ${terms[i]}`;
    const lines = doc.splitTextToSize(numbered, CONTENT_W - 4) as string[];
    doc.text(lines, MARGIN_X, y + 3.2);
    y += lines.length * 3.6 + 1.2;
  }

  // Save & download
  const safeName = (job.name || 'rental-job').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  doc.save(`lowpass-${docTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${safeName}-${documentNumber}.pdf`);
}

/** Small orange uppercase column label used across the document. */
function drawColLabel(doc: jsPDF, label: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ORANGE);
  doc.text(label, x, y);
}
