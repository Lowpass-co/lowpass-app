/* ============================================
   LOWPASS — RC-2 proposal engine (RCP-02 / RCP-03 / RCP-05)

   RCP-02  a matching receipt proposes a LINK, and says why.
   RCP-03  a receipt matching nothing proposes a NEW LINE.
   RCP-05  a receipt duplicating an existing transaction is flagged and
           defaults to SKIP.

   Plus the invariant, asserted structurally: every proposal this engine can emit
   ends in a TRANSACTION. There is no shape that writes actual_cost, so the
   reconcile and the manual-override guard can never be bypassed by this path.

   Named .test.tsx because vitest is scoped to .test.tsx — .test.ts is reserved
   for the standalone node money harnesses.
   ============================================ */

import { describe, it, expect } from 'vitest';
import {
  proposeForReceipt,
  findDuplicateTransaction,
  NAME_THRESHOLD,
  type BudgetLineFacts,
  type ReceiptFacts,
  type TransactionFacts,
} from './receiptMatch';

const LINES: BudgetLineFacts[] = [
  {
    id: 'line-fuel',
    sectionId: 's1',
    sectionName: 'Travel',
    label: 'Bus fuel — Nov',
    category: 'Fuel',
    estimate: 5000,
    actual: 1200,
    vendor: 'Shell',
  },
  {
    id: 'line-catering',
    sectionId: 's2',
    sectionName: 'Hospitality',
    label: 'Catering — crew meals',
    category: 'Catering',
    estimate: 3000,
    actual: 0,
    vendor: null,
  },
];

const TOUR = { tourStart: '2026-10-01', tourEnd: '2026-10-28' };

function receipt(over: Partial<ReceiptFacts> = {}): ReceiptFacts {
  return {
    vendor: 'Shell',
    date: '2026-10-05',
    total_amount: 88.2,
    currency: 'GBP',
    category: 'Fuel',
    description: null,
    ...over,
  };
}

describe('RCP-02 — link to an existing line, with a reason', () => {
  it('proposes receipt_txn against the matching line', () => {
    const p = proposeForReceipt(receipt(), LINES, [], TOUR);
    expect(p.target).toBe('receipt_txn');
    expect(p.lineItemId).toBe('line-fuel');
  });

  it('states WHY it matched — the reviewer needs the signal named', () => {
    const p = proposeForReceipt(receipt(), LINES, [], TOUR);
    expect(p.reason).toMatch(/category matches “Fuel”/);
    expect(p.reason.length).toBeGreaterThan(0);
  });

  it('a strong vendor match alone is enough to link', () => {
    const p = proposeForReceipt(
      receipt({ category: null, vendor: 'Bus fuel — Nov' }),
      LINES,
      [],
      TOUR,
    );
    expect(p.target).toBe('receipt_txn');
    expect(p.reason).toMatch(/vendor matches/);
  });
});

describe('RCP-03 — no match proposes a new line', () => {
  it('proposes receipt_line when nothing connects', () => {
    const p = proposeForReceipt(
      receipt({ vendor: 'Zzyzx Welding Supplies', category: 'Welding', total_amount: 4210 }),
      LINES,
      [],
      TOUR,
    );
    expect(p.target).toBe('receipt_line');
    expect(p.lineItemId).toBeNull();
  });

  it('names the new line from the receipt and carries a section', () => {
    const p = proposeForReceipt(
      receipt({ vendor: 'Zzyzx Welding', category: 'Welding', description: 'rig repair', total_amount: 4210 }),
      LINES,
      [],
      TOUR,
    );
    expect(p.value.label).toBe('Zzyzx Welding — rig repair');
    expect(p.value.sectionName).toBe('Welding');
  });

  it('falls back to the catch-all section when the receipt has no category', () => {
    const p = proposeForReceipt(
      receipt({ vendor: 'Unknown Co', category: null, total_amount: 9999 }),
      LINES,
      [],
      TOUR,
    );
    expect(p.target).toBe('receipt_line');
    expect(p.value.sectionName).toBe('Uncategorised');
  });

  it('amount + date alone NEVER attach money to someone else’s line', () => {
    // Same amount range and inside the tour window, but no category and no name
    // overlap — this must not link.
    const p = proposeForReceipt(
      receipt({ vendor: 'Qqqq Ltd', category: null, description: null, total_amount: 50 }),
      LINES,
      [],
      TOUR,
    );
    expect(p.target).toBe('receipt_line');
  });
});

describe('RCP-05 — duplicate guard', () => {
  const existing: TransactionFacts[] = [
    { id: 'txn-1', lineItemId: 'line-fuel', vendorName: 'Shell', amount: 88.2, paidAt: '2026-10-05' },
  ];

  it('flags a repeat and DEFAULTS TO SKIP', () => {
    const p = proposeForReceipt(receipt(), LINES, existing, TOUR);
    expect(p.dupOf).toBe('txn-1');
    expect(p.dupReason).toMatch(/Possible duplicate/);
    expect(p.defaultAccept).toBe(false);
  });

  it('a non-duplicate defaults to accept', () => {
    const p = proposeForReceipt(receipt({ total_amount: 401.55, date: '2026-10-19' }), LINES, existing, TOUR);
    expect(p.dupOf).toBeNull();
    expect(p.defaultAccept).toBe(true);
  });

  it('does not flag a same-vendor charge far outside the date window', () => {
    expect(
      findDuplicateTransaction(receipt({ date: '2026-10-25' }), existing),
    ).toBeNull();
  });

  it('tolerates a 1% amount difference (same charge, rounding)', () => {
    expect(findDuplicateTransaction(receipt({ total_amount: 88.6 }), existing)).not.toBeNull();
  });
});

describe('THE INVARIANT — every proposal ends in a transaction', () => {
  it('emits only receipt_txn or receipt_line; neither writes actual_cost', () => {
    const cases: ReceiptFacts[] = [
      receipt(),
      receipt({ vendor: 'Nothing Matches Ltd', category: null, total_amount: 12345 }),
      receipt({ total_amount: null }),
      receipt({ vendor: null, category: null, description: null }),
    ];
    for (const r of cases) {
      const p = proposeForReceipt(r, LINES, [], TOUR);
      expect(['receipt_txn', 'receipt_line']).toContain(p.target);
      // The payload carries an AMOUNT for a transaction — never an actual_cost key.
      expect(Object.keys(p.value)).not.toContain('actual_cost');
      expect(Object.keys(p.value)).toContain('amount');
    }
  });

  it('a receipt_txn always names the line the transaction attaches to', () => {
    const p = proposeForReceipt(receipt(), LINES, [], TOUR);
    expect(p.target).toBe('receipt_txn');
    expect(typeof p.lineItemId).toBe('string');
  });
});

describe('threshold is caller-side (dedupe.ts unchanged)', () => {
  it('exports the 0.85 threshold it applies', () => {
    expect(NAME_THRESHOLD).toBe(0.85);
  });
});
