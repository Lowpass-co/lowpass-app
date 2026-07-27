/* ============================================
   LOWPASS — the Receipts bank (RQ-6 · RCP-17..20)

   The bug this surface fixes: a receipt that failed to scan was SAVED and then
   invisible. So the tests that matter are about visibility, not features.

   RCP-17  a failed receipt is listed, in Needs details, with what it is missing.
   RCP-18  the bank OPENS on Needs details when any exist — the work first, not a
           wall of filed receipts.
   RCP-19  editing fields writes to the RECEIPT only. No transaction, no
           actual_cost — the money invariant holds on this surface too.
   RCP-20  filing against a line goes through the transaction path, and refuses
           when there is no amount rather than filing a zero.
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReceiptRow } from '@/lib/budget/loadReceipts';

const calls: Array<{ fn: string; args: unknown[] }> = [];

/** RQ-2 — the bank now reads ?receipt= (the ⌘K landing ported off the retired
 *  modal inbox), so the router mock has to provide search params too. */
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/components/budget/useReceiptScan', async () => {
  const actual = await vi.importActual<typeof import('@/components/budget/useReceiptScan')>(
    '@/components/budget/useReceiptScan',
  );
  return {
    ...actual,
    useReceiptScan: () => ({
      ocr: vi.fn(async (...args: unknown[]) => {
        calls.push({ fn: 'ocr', args });
        return { data: null, documents: [], error: 'Still unreadable' };
      }),
      createReceipt: vi.fn(async () => ({ id: 'r9', receipt_number: 'R-009' })),
      uploadFile: vi.fn(async () => ({ path: 'p/1.pdf', url: null })),
      patchReceipt: vi.fn(async (...args: unknown[]) => {
        calls.push({ fn: 'patchReceipt', args });
        return {};
      }),
      createTransaction: vi.fn(async (...args: unknown[]) => {
        calls.push({ fn: 'createTransaction', args });
      }),
      linkTransaction: vi.fn(async (...args: unknown[]) => {
        calls.push({ fn: 'linkTransaction', args });
      }),
      signUrl: vi.fn(async () => 'https://signed.example/receipt.pdf'),
    }),
  };
});

import { ReceiptsBank } from './ReceiptsBank';

/** Adam's failed iPhone-photo PDF: saved, unreadable, no fields. */
const FAILED: ReceiptRow = {
  id: 'r1', receipt_number: 'R-006',
  vendor: null, date: null, category: null, description: null,
  amount: null, currency: 'USD',
  file_path: 'w/t/r1.pdf', linked_line_item_id: null,
  page_from: null, page_to: null, created_at: '2026-07-21T10:00:00Z',
  state: 'needs_details', missing: ['vendor', 'date', 'amount'],
  scanned: false, // never scanned — the upload path skipped it (RQ-5 FINAL)
};

const FILED: ReceiptRow = {
  ...FAILED,
  id: 'r2', receipt_number: 'R-005',
  vendor: 'Shell', date: '2026-10-01', amount: 88.2,
  linked_line_item_id: 'line-fuel',
  state: 'filed', missing: [],
};

const READY: ReceiptRow = {
  ...FAILED,
  id: 'r3', receipt_number: 'R-007',
  vendor: 'BNA Airport Parking', date: '2026-07-26', amount: 72,
  state: 'needs_details', missing: [],
};

const LINES = [{ id: 'line-fuel', label: 'Bus fuel — Nov', section: 'Travel' }];

function renderBank(receipts: ReceiptRow[]) {
  return render(
    <ReceiptsBank tourId="t1" tourCurrency="USD" receipts={receipts} lines={LINES} />,
  );
}

beforeEach(() => {
  calls.length = 0;
  searchParams = new URLSearchParams();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204, blob: async () => new Blob(['x']) })));
  vi.stubGlobal('confirm', () => true);
});

describe('RCP-17 — the failed receipt is FINDABLE', () => {
  it('lists a receipt that never scanned', () => {
    renderBank([FAILED]);
    expect(screen.getAllByTestId('receipt-row').length).toBe(1);
    // Its fields are empty but PRESENT and editable — the receipt is a thing you
    // can act on, not an error message.
    expect((screen.getByLabelText('Vendor') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('R-006')).toBeTruthy();
    expect(screen.getByTestId('receipt-state').textContent).toBe('Needs details');
  });

  it('says what it is missing rather than just failing quietly', () => {
    renderBank([FAILED]);
    expect(screen.getByText(/Missing vendor, date, amount/)).toBeTruthy();
  });

  it('an empty tour explains where receipts come from', () => {
    renderBank([]);
    expect(screen.getByTestId('receipts-empty').textContent).toMatch(/scanned or not/);
  });
});

describe('RCP-18 — the bank opens on the work', () => {
  it('defaults to Needs details when any exist', () => {
    renderBank([FAILED, FILED]);
    // Only the needs-details one is shown, not the filed one.
    expect(screen.getAllByTestId('receipt-row').length).toBe(1);
    expect(screen.getByTestId('receipt-state').textContent).toBe('Needs details');
  });

  it('falls back to All when there is no work', () => {
    renderBank([FILED]);
    expect(screen.getAllByTestId('receipt-row').length).toBe(1);
    expect(screen.getByTestId('receipt-state').textContent).toBe('Filed');
  });

  it('every filter is reachable, with its count', () => {
    renderBank([FAILED, FILED]);
    expect(screen.getByTestId('receipts-filter-filed').textContent).toMatch(/Filed\s*1/);
    fireEvent.click(screen.getByTestId('receipts-filter-all'));
    expect(screen.getAllByTestId('receipt-row').length).toBe(2);
  });
});

describe('RCP-19 — editing writes to the receipt, never to money', () => {
  it('saves the edited fields through patchReceipt only', async () => {
    renderBank([FAILED]);

    fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'BNA Airport Parking' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '72.00' } });
    fireEvent.click(screen.getByTestId('receipt-save'));

    await waitFor(() => expect(calls.some((c) => c.fn === 'patchReceipt')).toBe(true));
    const patch = calls.find((c) => c.fn === 'patchReceipt');
    expect(patch?.args[1]).toMatchObject({ vendor: 'BNA Airport Parking', cost_tour_currency: 72 });

    // THE invariant: nothing on this path creates a transaction.
    expect(calls.some((c) => c.fn === 'createTransaction')).toBe(false);
    expect(calls.some((c) => c.fn === 'linkTransaction')).toBe(false);
  });

  it('a non-numeric amount is refused before it reaches the server', async () => {
    renderBank([FAILED]);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: 'about eighty' } });
    fireEvent.click(screen.getByTestId('receipt-save'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/isn’t a number/));
    expect(calls.some((c) => c.fn === 'patchReceipt')).toBe(false);
  });

  it('Save only appears once something is edited', () => {
    renderBank([FAILED]);
    expect(screen.queryByTestId('receipt-save')).toBeNull();
    fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'X' } });
    expect(screen.getByTestId('receipt-save')).toBeTruthy();
  });
});

describe('RCP-20 — filing goes through the transaction path', () => {
  it('creates a TRANSACTION, then links the receipt', async () => {
    renderBank([READY]);
    fireEvent.change(screen.getByTestId('receipt-link-line'), { target: { value: 'line-fuel' } });

    await waitFor(() => expect(calls.some((c) => c.fn === 'createTransaction')).toBe(true));
    const txn = calls.find((c) => c.fn === 'createTransaction');
    expect(txn?.args[0]).toBe('line-fuel');
    expect(txn?.args[1]).toMatchObject({ amount: 72, vendor_name: 'BNA Airport Parking', receipt_id: 'r3' });

    // The transaction comes FIRST; the receipt link follows it.
    const txnAt = calls.findIndex((c) => c.fn === 'createTransaction');
    const patchAt = calls.findIndex((c) => c.fn === 'patchReceipt');
    expect(txnAt).toBeLessThan(patchAt);
  });

  it('refuses to file a receipt with no amount instead of filing a zero', async () => {
    renderBank([FAILED]);
    fireEvent.change(screen.getByTestId('receipt-link-line'), { target: { value: 'line-fuel' } });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Add an amount/));
    expect(calls.some((c) => c.fn === 'createTransaction')).toBe(false);
  });
});

describe('why is it missing? — scanned vs never scanned', () => {
  /* RQ-5 FINAL took two rounds to diagnose because these looked identical, and
     they want opposite actions: Re-scan versus type it in. */
  it('a receipt the scan never ran on says so', () => {
    renderBank([FAILED]);
    expect(screen.getByTestId('receipt-scan-state').textContent).toBe('Not scanned yet');
  });

  it('a receipt that WAS scanned and read nothing says THAT', () => {
    renderBank([{ ...FAILED, scanned: true }]);
    expect(screen.getByTestId('receipt-scan-state').textContent).toBe('Scanned — nothing readable');
  });

  it('a complete receipt says neither — there is nothing to explain', () => {
    renderBank([{ ...READY, scanned: true }]);
    expect(screen.queryByTestId('receipt-scan-state')).toBeNull();
  });
});

describe('RQ-2 — the ⌘K deep link lands here', () => {
  /* This was the ONE capability the retired modal inbox had that the bank
     didn't, so it moved rather than being dropped — a deep link into a deleted
     surface is a worse outcome than keeping two drop zones. */
  it('a deep-linked receipt is shown whatever state it is in', () => {
    searchParams = new URLSearchParams('receipt=r2'); // r2 is FILED
    renderBank([FAILED, FILED]);
    // Without the deep link the bank would open on Needs details and hide r2.
    expect(screen.getAllByTestId('receipt-row').length).toBe(2);
  });

  it('marks the receipt that was asked for', () => {
    searchParams = new URLSearchParams('receipt=r2');
    renderBank([FAILED, FILED]);
    const focused = document.querySelectorAll('[data-focused="true"]');
    expect(focused.length).toBe(1);
  });

  it('no deep link → the normal work-first default', () => {
    renderBank([FAILED, FILED]);
    expect(screen.getAllByTestId('receipt-row').length).toBe(1);
  });
});

describe('re-scan reuses the one seam', () => {
  it('re-signs the stored file and hands it to ocr()', async () => {
    renderBank([FAILED]);
    fireEvent.click(screen.getByTestId('receipt-retry'));

    await waitFor(() => expect(calls.some((c) => c.fn === 'ocr')).toBe(true));
    const ocr = calls.find((c) => c.fn === 'ocr');
    expect((ocr?.args[0] as File).name).toBe('r1.pdf');
    expect(ocr?.args[1]).toBe('r1'); // scoped to this receipt
  });

  it('a second failure reports it and keeps the receipt', async () => {
    renderBank([FAILED]);
    fireEvent.click(screen.getByTestId('receipt-retry'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Still unreadable/));
    expect(screen.getAllByTestId('receipt-row').length).toBe(1);
  });
});
