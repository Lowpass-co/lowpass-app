/* ============================================
   LOWPASS — RC-1 smokes (RCP-01 + the save-first invariant)

   RCP-01  a multi-file drop SAVES every file.
   Plus the ordering that is the whole point of the stage: the receipt row and
   its upload happen BEFORE the OCR call, so a failed scan can never lose a
   receipt. That's an ordering property — only a call-order assertion catches it.

   Also pinned: RC-1 writes NO money. Not one call to the transactions route.
   The amount only becomes a transaction when a proposal is approved (RC-2), and
   even then only through POST /line-items/{id}/transactions — never a direct
   actual_cost write.
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const calls: string[] = [];

vi.mock('@/components/budget/useReceiptScan', async () => {
  const actual = await vi.importActual<typeof import('@/components/budget/useReceiptScan')>(
    '@/components/budget/useReceiptScan',
  );
  return {
    ...actual,
    useReceiptScan: () => ({
      ocr: vi.fn(async () => {
        calls.push('ocr');
        return { data: { vendor: 'Shell', date: '2026-10-01', total_amount: 88.2, currency: 'GBP', category: 'Fuel', description: null, payment_method: null }, receiptId: null, error: null };
      }),
      createReceipt: vi.fn(async () => {
        calls.push('createReceipt');
        return { id: `r${calls.length}`, receipt_number: 'R-001' };
      }),
      uploadFile: vi.fn(async () => {
        calls.push('uploadFile');
        return { path: 'p/1.jpg', url: null };
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

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  calls.length = 0;
  // jsdom has no object-URL support.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
});

function drop(files: File[]) {
  const zone = screen.getByTestId('receipt-drop-zone');
  fireEvent.drop(zone, { dataTransfer: { files, types: ['Files'] } });
}

describe('RC-1 — the drop zone', () => {
  it('RCP-01: a multi-file drop saves EVERY file', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([imageFile('a.jpg'), imageFile('b.jpg'), imageFile('c.jpg')]);

    await waitFor(() => {
      expect(screen.getAllByTestId('receipt-drop-item').length).toBe(3);
    });
    await waitFor(() => {
      expect(calls.filter((c) => c === 'createReceipt').length).toBe(3);
      expect(calls.filter((c) => c === 'uploadFile').length).toBe(3);
    });
  });

  it('SAVES BEFORE IT SCANS — createReceipt + uploadFile precede the first ocr', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([imageFile('a.jpg')]);

    await waitFor(() => expect(calls).toContain('ocr'));

    const firstOcr = calls.indexOf('ocr');
    expect(calls.indexOf('createReceipt')).toBeLessThan(firstOcr);
    expect(calls.indexOf('uploadFile')).toBeLessThan(firstOcr);
  });

  it('writes NO money — the transaction routes are never touched in RC-1', async () => {
    render(<ReceiptDropPanel tourId="t1" tourCurrency="GBP" />);
    drop([imageFile('a.jpg'), imageFile('b.jpg')]);

    await waitFor(() => expect(calls).toContain('ocr'));
    expect(calls).not.toContain('createTransaction');
    expect(calls).not.toContain('linkTransaction');
  });
});
