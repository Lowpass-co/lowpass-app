/* ============================================
   LOWPASS — RQ-8: vendor is editable, provenance is honest (RCP-23/24)

   Adam: "They say manual, but I can't edit things like the vendor without
   opening the slide out." Two separate faults with one shared cause — the grid
   knew the vendor's VALUE but not which transaction it came from.

   RCP-23  a receipt-backed line reads AUTO, naming the receipt.
   RCP-24  the vendor cell writes through the EXISTING transaction PATCH, and
           refuses (visibly) when there is no single transaction to target.

   These pin the wiring in BudgetGridView, which is where both bugs lived. The
   Grid primitive itself is unchanged and is covered by its own suite.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/components/budget/BudgetGridView.tsx'), 'utf8');

describe('RCP-23 — receipt-backed lines read AUTO', () => {
  it('sets provenance from the receipt map', () => {
    expect(src).toContain("row._provenance = 'auto'");
    expect(src).toContain('receiptSourceByLine');
  });

  it('does NOT touch isDerivedLine to do it', () => {
    /* isDerivedLine means "reconcile-owned, regenerated every sync". A receipt
       line is not that, and marking it so would put it under the regeneration
       contract — the chip would be right and the behaviour wrong. Provenance
       and derived-ness are different facts and must stay separate. */
    expect(src).not.toContain('DERIVED_SOURCE_TYPES');
    expect(src).not.toMatch(/isDerivedLine\s*=/);
  });
});

describe('RCP-24 — the vendor cell writes through the transaction path', () => {
  it('is no longer a read-only column', () => {
    expect(src).not.toMatch(/id: 'vendor'[^}]*ro: true/);
  });

  it('PATCHes the transaction, not the line item', () => {
    expect(src).toMatch(/\/api\/budget\/transactions\/\$\{txnId\}/);
    expect(src).toContain('vendor_name');
  });

  it('refuses VISIBLY when there is no single transaction to target', () => {
    // The Grid has no per-cell read-only predicate, so an un-targetable edit
    // would otherwise sit on screen looking saved.
    expect(src).toContain('several transactions');
    expect(src).toMatch(/showToast\([^)]*several transactions/);
  });

  it('does not let an empty vendor through to a route that rejects it', () => {
    expect(src).toMatch(/Vendor can[’']t be empty/);
  });

  it('writes NO money — vendor editing never touches a line-item amount', () => {
    const vendorBlock = src.slice(src.indexOf("if (field === 'vendor')"));
    const upToReturn = vendorBlock.slice(0, vendorBlock.indexOf('gridEditToPatch'));
    expect(upToReturn).not.toContain('actual_cost');
    expect(upToReturn).not.toContain('proposed_cost');
  });
});
