/* ============================================
   LOWPASS — RC-4 the PDF gate (RCP-07 / RCP-08)

   RC-4's whole point is that a PDF is no longer short-circuited into manual
   entry — it goes down the same scan path as a photo, because the route
   rasterises page 1 first. Two properties matter and they pull opposite ways:

   RCP-07  a PDF IS scanned (ocr is actually called, and a read PDF proposes).
   RCP-08  a PDF the server can't rasterise is STILL SAVED — it lands in
           needs_manual with the server's message, after createReceipt +
           uploadFile. Losing a receipt is the one outcome this feature must
           never produce, so the fallback is pinned as hard as the feature.

   Plus the negative: a genuinely unscannable type never reaches the scanner.

   What is NOT tested here: the rasteriser itself. renderPdfFirstPageToPng
   drives headless Chromium and pdf.js — no jsdom stands in for that. Its real
   behaviour is only observable on the deploy.
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { isScannable, isOcrableImage } from '@/components/budget/useReceiptScan';

const calls: string[] = [];
/** What the mocked ocr() hands back — set per test. */
let ocrOutcome: { data: unknown; error: string | null } = { data: null, error: null };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/budget/useReceiptScan', async () => {
  const actual = await vi.importActual<typeof import('@/components/budget/useReceiptScan')>(
    '@/components/budget/useReceiptScan',
  );
  return {
    ...actual, // isScannable / isOcrableImage stay REAL — they're the gate under test
    useReceiptScan: () => ({
      ocr: vi.fn(async () => {
        calls.push('ocr');
        return { ...ocrOutcome, receiptId: null };
      }),
      createReceipt: vi.fn(async () => {
        calls.push('createReceipt');
        return { id: 'r1', receipt_number: 'R-001' };
      }),
      uploadFile: vi.fn(async () => {
        calls.push('uploadFile');
        return { path: 'p/1.pdf', url: null };
      }),
      patchReceipt: vi.fn(async () => {
        calls.push('patchReceipt');
        return {};
      }),
      createTransaction: vi.fn(async () => { calls.push('createTransaction'); }),
      linkTransaction: vi.fn(async () => { calls.push('linkTransaction'); }),
      signUrl: vi.fn(async () => null),
    }),
  };
});

import { ReceiptDropPanel } from './ReceiptDropPanel';

const SCAN = {
  vendor: 'Premier Inn',
  date: '2026-10-01',
  total_amount: 412.5,
  currency: 'GBP',
  category: 'Accommodation',
  description: null,
  payment_method: null,
};

function fileOfType(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

beforeEach(() => {
  calls.length = 0;
  ocrOutcome = { data: SCAN, error: null };
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
});

function drop(files: File[]) {
  fireEvent.drop(screen.getByTestId('receipt-drop-zone'), {
    dataTransfer: { files, types: ['Files'] },
  });
}

describe('the gate itself', () => {
  it('a PDF is scannable, but is still not an image', () => {
    const pdf = fileOfType('folio.pdf', 'application/pdf');
    expect(isScannable(pdf)).toBe(true);
    // The route rasterises it — the client must not claim it can go to Vision raw.
    expect(isOcrableImage(pdf)).toBe(false);
  });

  it('an unscannable type is neither', () => {
    const csv = fileOfType('ledger.csv', 'text/csv');
    expect(isScannable(csv)).toBe(false);
    expect(isOcrableImage(csv)).toBe(false);
  });
});

describe('RCP-07 — a PDF is scanned, not skipped', () => {
  it('calls the scanner for a PDF and reads it', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('folio.pdf', 'application/pdf')]);

    await waitFor(() => expect(calls).toContain('ocr'));
    await waitFor(() => expect(screen.getByText('Read')).toBeTruthy());
  });

  it('still saves before it scans — the RC-1 ordering holds for PDFs too', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('folio.pdf', 'application/pdf')]);

    await waitFor(() => expect(calls).toContain('ocr'));
    const firstOcr = calls.indexOf('ocr');
    expect(calls.indexOf('createReceipt')).toBeLessThan(firstOcr);
    expect(calls.indexOf('uploadFile')).toBeLessThan(firstOcr);
  });
});

describe('RCP-08 — a PDF that won’t rasterise is still saved', () => {
  it('falls back to needs_manual with the server’s message, after the upload', async () => {
    ocrOutcome = { data: null, error: 'Could not read this PDF — enter the details manually.' };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('scanned.pdf', 'application/pdf')]);

    await waitFor(() => expect(screen.getByText('Needs details')).toBeTruthy());
    expect(screen.getByText(/Could not read this PDF/)).toBeTruthy();
    // The receipt exists regardless — the render failure costs the scan, not the file.
    expect(calls).toContain('createReceipt');
    expect(calls).toContain('uploadFile');
  });

  it('writes no money on the failure path', async () => {
    ocrOutcome = { data: null, error: 'Could not read this PDF — enter the details manually.' };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('scanned.pdf', 'application/pdf')]);

    await waitFor(() => expect(screen.getByText('Needs details')).toBeTruthy());
    expect(calls).not.toContain('createTransaction');
    expect(calls).not.toContain('linkTransaction');
  });
});

describe('unscannable types never reach the scanner', () => {
  it('a CSV is saved and flagged without an ocr call', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('ledger.csv', 'text/csv')]);

    await waitFor(() => expect(screen.getByText('Needs details')).toBeTruthy());
    expect(calls).toContain('uploadFile');
    expect(calls).not.toContain('ocr');
  });
});
