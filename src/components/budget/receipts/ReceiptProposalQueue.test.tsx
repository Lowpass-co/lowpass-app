/* ============================================
   LOWPASS — RC-3 review queue (RCP-04 / RCP-05 / RCP-06)

   RCP-04  edit-then-approve sends the EDITED value, not the OCR guess.
   RCP-05  a duplicate arrives pre-skipped and is excluded unless opted in.
   RCP-06  reject sends no accept id — no ledger rows.

   Plus the gate itself: nothing is submitted until Approve is pressed.
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiptProposalQueue, type QueueProposal } from './ReceiptProposalQueue';

let lastBody: Record<string, unknown> | null = null;

beforeEach(() => {
  lastBody = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      lastBody = JSON.parse(String(init?.body ?? '{}'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ summary: '2 receipts · 1 linked · 0 new lines · 1 skipped' }),
      });
    }),
  );
});

const CLEAN: QueueProposal = {
  id: 'p1',
  target: 'receipt_txn',
  receipt_id: 'r1',
  source_ref: 'R-001',
  dup_of: null,
  dup_reason: null,
  status: 'pending',
  value: { vendor: 'Shell', date: '2026-10-05', amount: 88.2, currency: 'GBP', lineItemId: 'line-fuel', reason: 'category matches “Fuel”' },
};

const DUPE: QueueProposal = {
  id: 'p2',
  target: 'receipt_txn',
  receipt_id: 'r2',
  source_ref: 'R-002',
  dup_of: 'txn-1',
  dup_reason: 'Possible duplicate of an existing transaction from Shell',
  status: 'skipped',
  value: { vendor: 'Shell', date: '2026-10-05', amount: 88.2, currency: 'GBP', lineItemId: 'line-fuel' },
};

const LINES = [{ id: 'line-fuel', label: 'Bus fuel — Nov', section: 'Travel' }];

function renderQueue(proposals: QueueProposal[]) {
  return render(<ReceiptProposalQueue batchId="b1" proposals={proposals} lines={LINES} />);
}

describe('RC-3 — nothing writes without approval', () => {
  it('submits nothing until Approve is pressed', () => {
    renderQueue([CLEAN]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders one card per proposal, with the reason', () => {
    renderQueue([CLEAN, DUPE]);
    expect(screen.getAllByTestId('receipt-proposal-card').length).toBe(2);
    expect(screen.getByText(/category matches/)).toBeTruthy();
  });
});

describe('RCP-05 — duplicates arrive pre-skipped', () => {
  it('excludes the flagged duplicate from the accept list', async () => {
    renderQueue([CLEAN, DUPE]);
    // Only the clean one is selected by default.
    expect(screen.getByTestId('receipt-apply').textContent).toMatch(/Approve 1/);

    fireEvent.click(screen.getByTestId('receipt-apply'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(lastBody?.accept).toEqual(['p1']);
  });

  it('shows why it was flagged', () => {
    renderQueue([DUPE]);
    expect(screen.getByText(/Possible duplicate/)).toBeTruthy();
  });
});

describe('RCP-04 — edit then approve writes the EDITED value', () => {
  it('sends the edited amount, not the scanned one', async () => {
    renderQueue([CLEAN]);

    const amount = screen.getByDisplayValue('88.2') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '91.40' } });

    fireEvent.click(screen.getByTestId('receipt-apply'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const edits = lastBody?.edits as Record<string, { amount?: number }>;
    expect(edits.p1.amount).toBe(91.4);
  });

  it('switching the target to “new line” converts the proposal', async () => {
    renderQueue([CLEAN]);

    const select = screen.getByDisplayValue(/Bus fuel/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '__new__' } });

    fireEvent.click(screen.getByTestId('receipt-apply'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const edits = lastBody?.edits as Record<string, { lineItemId?: string | null }>;
    expect(edits.p1.lineItemId).toBeNull();
  });
});

describe('RCP-16 — the section is visible and editable on a new-line proposal', () => {
  const NEW_LINE: QueueProposal = {
    id: 'p3',
    target: 'receipt_line',
    receipt_id: 'r3',
    source_ref: 'R-003',
    dup_of: null,
    dup_reason: null,
    status: 'pending',
    value: {
      vendor: 'Pret', date: '2026-10-03', amount: 14.8, currency: 'GBP',
      label: 'Pret', lineItemId: null,
      sectionName: 'Catering', createSection: true,
      sectionReason: 'No section matches “catering” — proposing a new Catering section',
    },
  };

  it('shows the resolved section and says why', () => {
    renderQueue([NEW_LINE]);
    expect((screen.getByTestId('proposal-section') as HTMLInputElement).value).toBe('Catering');
    expect(screen.getByText(/proposing a new Catering section/)).toBeTruthy();
  });

  it('the section is NOT “Uncategorised” — that was the bug', () => {
    renderQueue([NEW_LINE]);
    expect((screen.getByTestId('proposal-section') as HTMLInputElement).value).not.toBe('Uncategorised');
  });

  it('typing over it sends the edited section', async () => {
    renderQueue([NEW_LINE]);
    fireEvent.change(screen.getByTestId('proposal-section'), { target: { value: 'Hospitality' } });
    fireEvent.click(screen.getByTestId('receipt-apply'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const edits = lastBody?.edits as Record<string, { sectionName?: string }>;
    expect(edits.p3.sectionName).toBe('Hospitality');
  });

  it('a LINK proposal has no section field — it inherits the line’s', () => {
    renderQueue([CLEAN]);
    expect(screen.queryByTestId('proposal-section')).toBeNull();
  });
});

describe('RCP-06 — reject writes nothing', () => {
  it('rejecting everything disables Approve, so no request is possible', () => {
    renderQueue([CLEAN]);
    fireEvent.click(screen.getByLabelText('Reject'));
    const btn = screen.getByTestId('receipt-apply') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('“Reject all” clears the selection', () => {
    renderQueue([CLEAN, DUPE]);
    fireEvent.click(screen.getByText('Reject all'));
    expect((screen.getByTestId('receipt-apply') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('batch controls are explicit, never auto-apply', () => {
  it('“Approve all links” selects the link proposals', async () => {
    renderQueue([CLEAN, DUPE]);
    fireEvent.click(screen.getByText('Approve all links'));
    fireEvent.click(screen.getByTestId('receipt-apply'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect((lastBody?.accept as string[]).sort()).toEqual(['p1', 'p2']);
  });

  it('shows the one-line summary after applying', async () => {
    renderQueue([CLEAN]);
    fireEvent.click(screen.getByTestId('receipt-apply'));
    await waitFor(() => {
      expect(screen.getByTestId('receipt-batch-summary').textContent).toMatch(/1 linked/);
    });
  });
});
