/* ============================================================
   LOWPASS — Branded Rental Job PDF Export
   ----------------------------------------------------------------
   Generates a downloadable, client-ready PDF (Quote / Pull Sheet /
   Invoice / Receipt) using jsPDF directly. No print dialog, no
   browser headers/footers, no page chrome — just a clean document.
   ============================================================ */

import { jsPDF } from 'jspdf';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { calcDays, fmtMoney, jobCurrency, fmtDate, type RentalJob, type RentalInventoryItem, type RentalJobItem } from './types';

/* ── Theme tokens ─────────────────────────────────────────────────
   Mirrors the app's `--lp-*` CSS variables in `globals.css`. We can't
   read CSS vars from inside jsPDF, so we duplicate the canonical
   light/dark palettes here as numeric tuples and choose one set per
   export. Updating the app tokens? Update these. The orange brand
   accent is a constant — it does not flip between modes.
   ──────────────────────────────────────────────────────────────── */
type RGB = [number, number, number];
export type PdfMode = 'light' | 'dark';

interface PdfTokens {
  pageBg: RGB;        // page background fill
  ink: RGB;           // primary text / strong rules
  muted: RGB;         // secondary text
  faint: RGB;         // tertiary text
  hair: RGB;          // hairline row dividers
  surface: RGB;       // soft fill (table header, notes panel)
  surfaceBorder: RGB; // border around panels
  tableHeaderText: RGB;
  white: RGB;         // for icons/text that always need to be reversed against ink
}

const ORANGE: RGB = [255, 69, 0]; // brand accent — same in both modes

/** Light tokens map to the values in `:root` of `src/app/globals.css`. */
const LIGHT_TOKENS: PdfTokens = {
  pageBg:          [255, 255, 255], // --lp-bg
  ink:             [17, 24, 39],     // --lp-text  (#111827)
  muted:           [107, 114, 128],  // --lp-text-secondary (#6B7280)
  faint:           [156, 163, 175],  // --lp-text-tertiary  (#9CA3AF)
  hair:            [229, 231, 235],  // --lp-border (#E5E7EB)
  surface:         [249, 250, 251],  // --lp-bg-secondary (#F9FAFB)
  surfaceBorder:   [229, 231, 235],  // --lp-border
  tableHeaderText: [71, 19, 0],      // --lp-table-header-text (#471300, brand brown)
  white:           [255, 255, 255],
};

/** Dark tokens map to `.dark` overrides in globals.css. */
const DARK_TOKENS: PdfTokens = {
  pageBg:          [15, 15, 15],     // --lp-bg (#0F0F0F)
  ink:             [245, 245, 245],  // --lp-text (#F5F5F5)
  muted:           [163, 163, 163],  // --lp-text-secondary (#A3A3A3)
  faint:           [115, 115, 115],  // --lp-text-tertiary  (#737373)
  hair:            [46, 46, 46],     // --lp-border (#2E2E2E)
  surface:         [26, 26, 26],     // --lp-bg-secondary (#1A1A1A)
  surfaceBorder:   [46, 46, 46],     // --lp-border
  tableHeaderText: [115, 115, 115],  // --lp-table-header-text dark = #737373
  white:           [255, 255, 255],
};

function getPdfTokens(mode: PdfMode): PdfTokens {
  return mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}

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
  /** Defaults to light. Pass 'dark' for an inverted document that feels native to the app's dark mode. */
  mode?: PdfMode;
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

/* ────────────────────────────────────────────────────────────────
   Brand fonts — Inter (body) + Montserrat Bold (display).
   Loaded once and cached at module scope so repeat exports skip
   the network round-trip. Each font is fetched as a TTF, base64-
   encoded, registered with jsPDF's virtual file system, and then
   bound to a logical family name we can call via setFont().
   These fonts ship as static TTFs under /public/fonts/ — both
   are OFL-licensed and safe to redistribute inside generated PDFs.
   ──────────────────────────────────────────────────────────────── */

const FONT_FILES: Array<{ family: string; style: 'normal' | 'bold'; path: string; vfs: string }> = [
  { family: 'Inter',      style: 'normal', path: '/fonts/Inter-Regular.ttf',    vfs: 'Inter-Regular.ttf' },
  { family: 'Inter',      style: 'bold',   path: '/fonts/Inter-Bold.ttf',       vfs: 'Inter-Bold.ttf' },
  { family: 'Montserrat', style: 'bold',   path: '/fonts/Montserrat-Bold.ttf',  vfs: 'Montserrat-Bold.ttf' },
];

let fontBase64Cache: Record<string, string> | null = null;
let fontLoadInflight: Promise<Record<string, string> | null> | null = null;

/** ArrayBuffer → base64 (browser-safe, chunked to avoid call-stack overflow). */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

/** Fetch + cache the TTFs once. Returns null on any failure (callers fall back to helvetica). */
async function getFontBase64Cache(): Promise<Record<string, string> | null> {
  if (fontBase64Cache) return fontBase64Cache;
  if (fontLoadInflight) return fontLoadInflight;
  fontLoadInflight = (async () => {
    try {
      const entries = await Promise.all(FONT_FILES.map(async (f) => {
        const res = await fetch(f.path);
        if (!res.ok) throw new Error(`font ${f.path} ${res.status}`);
        const buf = await res.arrayBuffer();
        return [f.vfs, bufferToBase64(buf)] as const;
      }));
      fontBase64Cache = Object.fromEntries(entries);
      return fontBase64Cache;
    } catch (err) {
      console.warn('[exportJobPdf] custom font load failed, falling back to Helvetica', err);
      return null;
    } finally {
      fontLoadInflight = null;
    }
  })();
  return fontLoadInflight;
}

/** Register the cached TTFs with this jsPDF instance. Returns the resolved family names. */
async function registerFonts(doc: jsPDF): Promise<{ body: string; display: string }> {
  const cache = await getFontBase64Cache();
  if (!cache) {
    return { body: 'helvetica', display: 'helvetica' };
  }
  for (const f of FONT_FILES) {
    const b64 = cache[f.vfs];
    if (!b64) continue;
    doc.addFileToVFS(f.vfs, b64);
    doc.addFont(f.vfs, f.family, f.style);
  }
  return { body: 'Inter', display: 'Montserrat' };
}

export async function exportJobPdf(opts: ExportOptions): Promise<void> {
  const { job, jobItems, inventory, artistLabel, tourLabel, discPct, discFixed } = opts;
  const mode: PdfMode = opts.mode ?? 'light';
  const T = getPdfTokens(mode);
  /* The quote is denominated once, on the job. Every money figure below goes
     through fmtMoney(_, cur) — there is no second currency on this page. */
  const cur = jobCurrency(job);
  /* THE EXPORTED QUOTE IS THE DOCUMENT THE CLIENT KEEPS, so it must never carry
     a converted symbol over an unconverted number. The PDF uses the job's
     FROZEN rate only — it does not fetch. A draft exported before the rate
     froze prints its source figures, which is honest; the alternative is a PDF
     whose numbers change every time you re-export it. */
  const fxRate = job.fx_rate != null ? Number(job.fx_rate) : null;
  const conv = (usd: number) => (fxRate == null ? usd : usd * fxRate);

  /** Paint the current page with the mode's background colour. jsPDF
   *  pages default to a transparent fill — without this, dark mode
   *  exports would still print white, defeating the point. Called on
   *  every page (including ones added during pagination). */
  const paintPageBg = () => {
    doc.setFillColor(...T.pageBg);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  };

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
  const [{ body: BODY, display: DISPLAY }, logoDataUrl] = await Promise.all([
    registerFonts(doc),
    loadLogoDataUrl(),
  ]);

  // First page: paint the mode background underneath everything.
  paintPageBg();

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

  // Title — right-aligned to page edge (display face)
  doc.setFont(DISPLAY, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...T.ink);
  doc.text(docTitle, PAGE_W - MARGIN_X, y + 8, { align: 'right' });

  // Doc no. + issue date
  doc.setFont(BODY, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...T.muted);
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

  drawColLabel(doc, 'BILL TO', c1, y, BODY);
  drawColLabel(doc, 'JOB',     c2, y, BODY);
  drawColLabel(doc, 'RENTAL PERIOD', c3, y, BODY);

  // Bill To value: client name in bold, then optional billing detail lines (muted)
  let yBill = y + 4.5;
  doc.setFont(BODY, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...T.ink);
  const clientName = job.client_name || '-';
  const wrappedClient = doc.splitTextToSize(clientName, colW - 4) as string[];
  doc.text(wrappedClient, c1, yBill);
  yBill += wrappedClient.length * 4.2;

  if (billingLines.length > 0) {
    doc.setFont(BODY, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...T.muted);
    for (const line of billingLines) {
      const wrapped = doc.splitTextToSize(line, colW - 4) as string[];
      doc.text(wrapped, c1, yBill);
      yBill += wrapped.length * 3.6;
    }
  }

  // Job column
  let yJob = y + 4.5;
  doc.setFont(BODY, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...T.ink);
  const wrappedName = doc.splitTextToSize(job.name, colW - 4) as string[];
  doc.text(wrappedName, c2, yJob);
  yJob += wrappedName.length * 4.2;
  doc.setFont(BODY, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...T.muted);
  const statusLabel = `Status: ${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`;
  doc.text(statusLabel, c2, yJob);
  yJob += 4;
  if (artistLabel) { doc.text(artistLabel, c2, yJob); yJob += 4; }
  if (tourLabel)   { doc.text(tourLabel,   c2, yJob); yJob += 4; }

  // Period column
  let yPer = y + 4.5;
  doc.setFont(BODY, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...T.ink);
  // ASCII separator only — jsPDF's default Helvetica is WinAnsi-encoded
  // and renders Unicode arrows/minus-signs as garbage glyphs.
  const periodStr = `${fmtDate(job.start_date)}  to  ${fmtDate(job.end_date)}`;
  doc.text(periodStr, c3, yPer);
  yPer += 4.5;
  doc.setFont(BODY, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...T.muted);
  doc.text(`${days} billable day${days !== 1 ? 's' : ''}`, c3, yPer);
  yPer += 3.8;
  doc.setTextColor(...T.faint);
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

  // Table header — soft surface bar, brand-brown caps in light / muted in dark.
  // Mirrors the app's `.lp-table thead` pattern.
  const drawTableHeader = () => {
    doc.setFillColor(...T.surface);
    doc.setDrawColor(...T.surfaceBorder);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN_X, y, CONTENT_W, 7.5, 'FD');
    doc.setFont(BODY, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...T.tableHeaderText);
    doc.text('ITEM',     colItem + 2, y + 5);
    doc.text('QTY',      colQty,      y + 5, { align: 'center' });
    doc.text('DAYS',     colDays,     y + 5, { align: 'center' });
    doc.text('DAY RATE', colRate,     y + 5, { align: 'right' });
    doc.text('SUBTOTAL', colSub - 2,  y + 5, { align: 'right' });
    y += 7.5;
  };
  drawTableHeader();

  // Rows
  doc.setFont(BODY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...T.ink);

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
      paintPageBg();
      y = MARGIN_TOP;
      drawTableHeader();
      doc.setFont(BODY, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...T.ink);
    }

    let yRow = y + 5;
    // Item name
    doc.setFont(BODY, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...T.ink);
    doc.text(itemNameLines, colItem + 2, yRow);
    yRow += itemNameLines.length * baseLineH;
    // Category
    if (hasCategory) {
      doc.setFont(BODY, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...T.muted);
      doc.text(inv!.category!, colItem + 2, yRow);
      yRow += 3.6;
    }
    // Override pill
    if (hasOverride) {
      doc.setFont(BODY, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...ORANGE);
      doc.text('Custom rate', colItem + 2, yRow);
    }

    // Numeric columns
    doc.setFont(BODY, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...T.ink);
    const midY = y + 5;
    doc.text(String(it.quantity ?? 1), colQty, midY, { align: 'center' });
    doc.text(String(days),             colDays, midY, { align: 'center' });
    doc.text(fmtMoney(conv(rate), cur),             colRate, midY, { align: 'right' });
    doc.setFont(BODY, 'bold');
    doc.text(fmtMoney(conv(lineAmt), cur),          colSub - 2, midY, { align: 'right' });

    // Hairline separator
    y += rowH;
    doc.setDrawColor(...T.hair);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  };

  if (jobItems.length === 0) {
    // Inter ships with normal+bold only; use normal for the empty-state line.
    doc.setFont(BODY, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...T.muted);
    doc.text('No items on this job.', PAGE_W / 2, y + 8, { align: 'center' });
    y += 14;
    doc.setDrawColor(...T.hair);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  } else {
    for (const it of jobItems) drawItemRow(it);
  }

  y += 6;

  // ── TOTALS BLOCK (right-aligned) ───────────────────────────────
  const totalsW = CONTENT_W * 0.42;
  const totalsX = PAGE_W - MARGIN_X - totalsW;

  doc.setFont(BODY, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...T.muted);
  doc.text('Subtotal', totalsX + 2, y + 5);
  doc.setTextColor(...T.ink);
  doc.setFont(BODY, 'bold');
  doc.text(fmtMoney(conv(subtotal), cur), totalsX + totalsW - 2, y + 5, { align: 'right' });
  y += 7;

  if (discAmt > 0) {
    doc.setFont(BODY, 'normal');
    doc.setTextColor(...T.muted);
    const discLabel =
      discPct > 0 && discFixed > 0 ? `Discount (${discPct}% + fixed)`
        : discPct > 0 ? `Discount (${discPct}%)`
          : 'Discount';
    doc.text(discLabel, totalsX + 2, y + 5);
    doc.setTextColor(...ORANGE);
    doc.setFont(BODY, 'bold');
    doc.text(`-${fmtMoney(conv(discAmt), cur)}`, totalsX + totalsW - 2, y + 5, { align: 'right' });
    y += 7;
  }

  // Total Due — heavy ink rule + orange amount
  doc.setDrawColor(...T.ink);
  doc.setLineWidth(0.6);
  doc.line(totalsX, y, totalsX + totalsW, y);
  y += 6;

  doc.setFont(BODY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...T.ink);
  doc.text('TOTAL DUE', totalsX + 2, y + 4);
  doc.setFontSize(15);
  doc.setTextColor(...ORANGE);
  doc.text(fmtMoney(conv(total), cur), totalsX + totalsW - 2, y + 4, { align: 'right' });
  y += 12;

  // ── NOTES ──────────────────────────────────────────────────────
  if (job.notes && job.notes.trim()) {
    if (y > PAGE_H - MARGIN_BOTTOM - 50) { doc.addPage(); paintPageBg(); y = MARGIN_TOP; }
    drawColLabel(doc, 'NOTES', MARGIN_X, y, BODY);
    y += 5;
    doc.setFont(BODY, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...T.ink);
    const notesLines = doc.splitTextToSize(job.notes.trim(), CONTENT_W - 8) as string[];
    const notesH = notesLines.length * 4.2 + 6;
    doc.setFillColor(...T.surface);
    doc.setDrawColor(...T.surfaceBorder);
    doc.setLineWidth(0.2);
    doc.roundedRect(MARGIN_X, y, CONTENT_W, notesH, 1.2, 1.2, 'FD');
    doc.setTextColor(...T.ink);
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

  if (y > PAGE_H - MARGIN_BOTTOM - 40) { doc.addPage(); paintPageBg(); y = MARGIN_TOP; }
  drawColLabel(doc, 'TERMS', MARGIN_X, y, BODY);
  y += 5;
  doc.setFont(BODY, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...T.muted);
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
function drawColLabel(doc: jsPDF, label: string, x: number, y: number, family: string = 'helvetica') {
  doc.setFont(family, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ORANGE);
  doc.text(label, x, y);
}
