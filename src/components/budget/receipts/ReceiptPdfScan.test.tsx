/* ============================================
   LOWPASS — the PDF path (RCP-07..09, RCP-11..12)

   A PDF is not short-circuited into manual entry — it goes down the same scan
   path as a photo. Since RC-5 the whole document goes, and one file may hold
   several receipts. Properties that pull against each other:

   RCP-07  a PDF IS scanned (ocr is called, and a read PDF proposes).
   RCP-08  a PDF the server can't read is STILL SAVED — needs_manual with the
           server's message, AFTER createReceipt + uploadFile. Losing a receipt
           is the one outcome this feature must never produce, so the fallback
           is pinned as hard as the feature.
   RCP-09  a file that isn't a receipt at all is refused at the door.
   RCP-11  a PDF holding three receipts yields THREE receipt rows, one per
           document, all against the one uploaded file.
   RCP-12  a one-document PDF still yields exactly one — the multi path must not
           duplicate the ordinary case.

   What is NOT tested here: the extraction itself. Whether the model reads the
   total off page 4 of a real folio (RCP-10) is a property of the API and the
   prompt, and no jsdom stands in for it — that one is Cowork's walk. The
   NORMALISER between them is pure, and tested in receiptDocuments.test.tsx.
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { isScannable, isOcrableImage } from '@/components/budget/useReceiptScan';

const calls: string[] = [];
/** What the mocked ocr() hands back — set per test. */
let ocrOutcome: { data: unknown; documents: unknown[]; error: string | null } = {
  data: null,
  documents: [],
  error: null,
};
/** Receipt rows created, in order — proves N documents make N receipts. */
const created: Array<Record<string, unknown>> = [];

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
      createReceipt: vi.fn(async (fields: Record<string, unknown>) => {
        calls.push('createReceipt');
        created.push(fields ?? {});
        return { id: `r${created.length}`, receipt_number: `R-00${created.length}` };
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
  created.length = 0;
  ocrOutcome = { data: SCAN, documents: [{ ...SCAN, pages: [1], line_items: null }], error: null };
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
    // It goes as a `document` block, not an image — the client must not claim
    // a PDF is something Vision can take raw as an image.
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

describe('RCP-11/12 — one PDF, N receipts', () => {
  const THREE = [
    { vendor: 'Shell', date: '2026-10-01', total_amount: 88.2, currency: 'GBP', category: 'Fuel', description: null, payment_method: null, pages: [1], line_items: null },
    { vendor: 'Premier Inn', date: '2026-10-02', total_amount: 412.5, currency: 'GBP', category: 'Accommodation', description: null, payment_method: null, pages: [2, 3], line_items: null },
    { vendor: 'Pret', date: '2026-10-03', total_amount: 14.8, currency: 'GBP', category: 'Catering', description: null, payment_method: null, pages: [4], line_items: null },
  ];

  it('RCP-11: three documents become three receipt rows on one upload', async () => {
    ocrOutcome = { data: THREE[0], documents: THREE, error: null };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('week-of-receipts.pdf', 'application/pdf')]);

    await waitFor(() => expect(screen.getAllByTestId('receipt-drop-item').length).toBe(3));
    // Three receipts, ONE file: three creates, but only one upload.
    expect(calls.filter((c) => c === 'createReceipt').length).toBe(3);
    expect(calls.filter((c) => c === 'uploadFile').length).toBe(1);
  });

  it('RCP-11: each sibling records the pages it covers', async () => {
    ocrOutcome = { data: THREE[0], documents: THREE, error: null };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('week-of-receipts.pdf', 'application/pdf')]);

    await waitFor(() => expect(created.length).toBe(3));
    // created[0] is the save-first row (page range unknown until the scan);
    // the siblings carry the range the extraction gave them.
    expect(created[1]).toMatchObject({ page_from: 2, page_to: 3 });
    expect(created[2]).toMatchObject({ page_from: 4, page_to: 4 });
  });

  it('RCP-11: the split writes no money — still transactions-only', async () => {
    ocrOutcome = { data: THREE[0], documents: THREE, error: null };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('week-of-receipts.pdf', 'application/pdf')]);

    await waitFor(() => expect(created.length).toBe(3));
    expect(calls).not.toContain('createTransaction');
    expect(calls).not.toContain('linkTransaction');
  });

  it('RCP-12: a one-document PDF still yields exactly one receipt', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('folio.pdf', 'application/pdf')]);

    await waitFor(() => expect(screen.getByText('Read')).toBeTruthy());
    expect(screen.getAllByTestId('receipt-drop-item').length).toBe(1);
    expect(calls.filter((c) => c === 'createReceipt').length).toBe(1);
  });
});

describe('RCP-08 — a PDF the server can’t read is still saved', () => {
  it('falls back to needs_manual with the server’s message, after the upload', async () => {
    ocrOutcome = { data: null, documents: [], error: 'Could not read this PDF — enter the details manually.' };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('scanned.pdf', 'application/pdf')]);

    await waitFor(() => expect(screen.getByText('Needs details')).toBeTruthy());
    expect(screen.getByText(/Could not read this PDF/)).toBeTruthy();
    // The receipt exists regardless — the render failure costs the scan, not the file.
    expect(calls).toContain('createReceipt');
    expect(calls).toContain('uploadFile');
  });

  it('writes no money on the failure path', async () => {
    ocrOutcome = { data: null, documents: [], error: 'Could not read this PDF — enter the details manually.' };

    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('scanned.pdf', 'application/pdf')]);

    await waitFor(() => expect(screen.getByText('Needs details')).toBeTruthy());
    expect(calls).not.toContain('createTransaction');
    expect(calls).not.toContain('linkTransaction');
  });
});

describe('RCP-09 — unscannable types never reach the scanner', () => {
  /* CHANGED IN RQ-2. This used to assert a CSV was SAVED and flagged. It is now
     refused at the door instead, because save-first exists to stop a RECEIPT
     being lost, and a CSV is not a receipt — it is the wrong file dropped by
     mistake. Saving it filled the receipts table with spreadsheets nobody would
     ever review. The rejection is visible, with a reason, and costs no upload. */
  it('a CSV is refused with a reason — no upload, no scan', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([fileOfType('ledger.csv', 'text/csv')]);

    await waitFor(() => expect(screen.getByText(/Not a receipt file/)).toBeTruthy());
    expect(calls).not.toContain('uploadFile');
    expect(calls).not.toContain('ocr');
  });

  it('an oversized image is refused, and says how big it was', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([big]);

    await waitFor(() => expect(screen.getByText(/Too big — 11\.0 MB/)).toBeTruthy());
    expect(calls).not.toContain('uploadFile');
  });
});
