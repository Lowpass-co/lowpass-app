'use client';

/* ============================================
   LOWPASS — <BudgetGridView> (Phase 3, Stage B mount)

   The canonical <Grid> + <GridSlideOver> on the REAL Budget Expenses data.
   Reads via the budgetAdapter (DB rows → grid Section[]); persists cell /
   slide edits via the existing /api/budget/line-items PATCH route
   (optimistic — the grid already shows the value; only failures refresh).

   Decisions (PHASE3_BUDGET_MAP.md): status stays the DB set; derived lines
   (Payroll/Rooming/…) lock est+act; no vendor column; FX from
   src/lib/budget/fx.ts; formula sections live on the Summary tab (excluded).
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Grid } from '@/components/grid/Grid';
import { VersionLockModal } from '@/components/budget/versioning/VersionLockModal';
import type { VersionStatus, BudgetVersionVm } from '@/components/budget/versioning/versionApi';
import { AddReceiptPanel, type AddReceiptResult } from '@/components/budget/AddReceiptPanel';
import type { Column, GridFx, GridLineApi, GridStatusConfig } from '@/components/grid/types';
import { budgetToGridSections, gridEditToPatch } from '@/lib/grid/budgetAdapter';
import { convertToCurrency } from '@/lib/budget/fx';
import { useToast } from '@/components/ui/Toast';
import type { BudgetLineItem, BudgetSection } from '@/types';

/** DB status set (decision 1 — kept, no migration). */
const STATUS_OPTIONS = ['draft', 'quoted', 'approved', 'paid', 'disputed'];
const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--lp-text-tertiary)',
  quoted: 'var(--color-lp-warning)',
  approved: 'var(--color-lp-info)',
  paid: 'var(--color-lp-success)',
  disputed: 'var(--color-lp-error)',
};
const STATUS_CONFIG: GridStatusConfig = { options: STATUS_OPTIONS, colors: STATUS_COLORS };

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'];

// Receipts B1.5 — drop-onto-grid guard (mirrors the upload route's ALLOWED + 10MB).
const RECEIPT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const RECEIPT_MAX_SIZE = 10 * 1024 * 1024;

/** BUD-01 — receipt chip label: the receipt's own number, plus the vendor when
 *  set (attach-created receipts are blank, so this is graceful when empty).
 *  Falls back to 'Receipt' only if the number is somehow missing. */
function receiptChipLabel(number: string | null | undefined, vendor: string | null | undefined): string {
  const num = (number ?? '').trim();
  const ven = (vendor ?? '').trim();
  if (!num) return 'Receipt';
  return ven ? `${num} · ${ven}` : num;
}

/** Document "type" chip from a filename / MIME (real attachments have no
 *  category column — show the extension, e.g. PDF / PNG). */
function docTypeFromName(name: string, fileType?: string | null): string {
  const ext = (name.split('.').pop() ?? '').toUpperCase();
  if (ext && ext.length <= 4 && ext !== name.toUpperCase()) return ext;
  if (fileType?.includes('pdf')) return 'PDF';
  if (fileType?.startsWith('image/')) return 'Image';
  return 'File';
}

/** Expenses column set — no vendor (decision 3), no day-type. */
const EXPENSE_COLS: Column[] = [
  { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false },
  { id: 'item', label: 'Item', type: 'text', w: 320, min: 160, resize: true },
  { id: 'est', label: 'Estimate', type: 'money', w: 120, min: 90, resize: true },
  { id: 'act', label: 'Actual', type: 'money', w: 120, min: 90, resize: true },
  { id: 'var', label: 'Variance', type: 'variance', w: 110, min: 90, resize: true },
  { id: 'status', label: 'Status', type: 'status', w: 130, min: 100, resize: true, options: STATUS_OPTIONS, optColors: STATUS_COLORS },
  { id: 'rcpts', label: 'Receipts', type: 'receipts', w: 90, min: 70, resize: false },
  { id: 'notes', label: 'Notes', type: 'text', w: 220, min: 120, resize: true, hidden: true },
];

export interface BudgetGridViewProps {
  lines: BudgetLineItem[];
  sections: BudgetSection[];
  tourCurrency: string;
  tourId: string;
  /** B2 — the active version is approved → proposed (est) cells read-only. */
  versionLocked?: boolean;
  /** the locked/viewed version id (for the Unlock-or-New-Version modal). */
  lockedVersionId?: string | null;
  canApprove?: boolean;
  /** State-fix B1 — the viewed version's status + the editable draft head, so the
   *  lock modal is status-aware (Current → unlock; historical → switch to draft). */
  viewedStatus?: VersionStatus;
  draftVersionId?: string | null;
  /** B2 — the full version list, so a historical version's lock modal can offer
   *  "Make this version Current" (rollback). */
  versions?: BudgetVersionVm[];
}

export function BudgetGridView({
  lines, sections, tourCurrency, tourId,
  versionLocked = false, lockedVersionId = null, canApprove = false,
  viewedStatus = 'draft', draftVersionId = null, versions = [],
}: BudgetGridViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [lockModalOpen, setLockModalOpen] = useState(false);
  // Receipts overhaul B1 — the Add-Receipt panel. `onAddReceipt` (lineApi) opens
  // it and stashes a resolver; the panel's onClose resolves the awaiting promise
  // so the slide-over can reflect the saved receipt.
  const [receiptPanel, setReceiptPanel] = useState<
    { lineId: string; txnId?: string; file?: File; resolve: (r: AddReceiptResult | null) => void } | null
  >(null);

  // Receipts B1.5 — drag a receipt image/PDF straight onto a line-item row →
  // open the SAME AddReceiptPanel scrape flow, pre-targeted to that line + the
  // file already in the pipeline. Guard mirrors AddReceiptPanel's upload limits.
  const handleFileDropToRow = useCallback(
    (lineId: string, file: File) => {
      if (!RECEIPT_ALLOWED_TYPES.includes(file.type)) {
        showToast('Drop a receipt image (JPG/PNG/WebP) or PDF.', 'error');
        return;
      }
      if (file.size > RECEIPT_MAX_SIZE) {
        showToast('Receipt too large (max 10MB).', 'error');
        return;
      }
      setReceiptPanel({ lineId, file, resolve: () => {} });
    },
    [showToast],
  );
  // `native` = the tour's own currency (fallback for currency-less lines).
  // `display` = the page DISPLAY selector (?display=), shared with the burn bar
  // + export controls. Flipping it re-renders this client component (via
  // useSearchParams) → new fx → grid cells AND totals convert together. (BUD-41)
  const searchParams = useSearchParams();
  const native = (tourCurrency || 'GBP').toUpperCase();
  const display = (searchParams.get('display') ?? native).toUpperCase();

  const fx: GridFx = {
    displayCurrency: display,
    currencies: CURRENCIES,
    // a currency-less line is in the NATIVE tour currency, not the display one.
    toDisplay: (amount, from) => convertToCurrency(amount, (from || native).toUpperCase(), display),
    symbol: (cur) => CUR_SYMBOL[(cur || display).toUpperCase()] ?? `${(cur || display).toUpperCase()} `,
    formatDisplay: (amount) =>
      (CUR_SYMBOL[display] ?? `${display} `) + Math.round(Number(amount) || 0).toLocaleString('en-US'),
  };

  // Seed grid rows with the NATIVE currency as the per-line fallback (display
  // conversion happens at render time via fx) so a DISPLAY flip never relabels
  // a currency-less line's source currency.
  const data = budgetToGridSections(lines, sections, { tourCurrency: native, ungroupedName: 'Uncategorised' });

  // Persist a single cell / slide edit. Optimistic — the grid already shows
  // the new value; a rejected write surfaces a toast + a refresh to true state.
  const onEdit = useCallback(
    (rowUid: string, field: string, value: unknown) => {
      const patch = gridEditToPatch(field, value);
      if (!patch) return; // non-persisting field (idx/variance/receipts/vendor)
      void fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowUid, ...patch }),
      })
        .then((res) => {
          if (res.status === 423) {
            // VERSION_LOCKED — raise the Unlock-or-New-Version modal, not a toast.
            setLockModalOpen(true);
            router.refresh();
          } else if (!res.ok) {
            showToast('Could not save the change', 'error');
            router.refresh();
          }
        })
        .catch(() => {
          showToast('Could not save the change', 'error');
          router.refresh();
        });
    },
    [router, showToast],
  );

  // Structural CRUD: POST/DELETE then refresh (the new row needs a real id;
  // rename is a PATCH with no refresh — the grid already shows it).
  const refreshOnFail = (res: Response) => {
    if (!res.ok) {
      showToast('Could not save the change', 'error');
    }
    router.refresh();
  };

  const onAddLine = useCallback(
    (sectionUid: string) => {
      void fetch('/api/budget/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          category: 'misc',
          label: 'New line item',
          section_id: sectionUid === 'ungrouped' ? null : sectionUid,
          currency: display,
        }),
      })
        .then(refreshOnFail)
        .catch(() => {
          showToast('Could not add the line', 'error');
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourId, display],
  );

  const onAddSection = useCallback(() => {
    void fetch('/api/budget/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, name: 'New section', kind: 'custom', sort_order: sections.length }),
    })
      .then(refreshOnFail)
      .catch(() => {
        showToast('Could not add the section', 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, sections.length]);

  const onRenameSection = useCallback((sectionUid: string, name: string) => {
    if (sectionUid === 'ungrouped') return;
    void fetch('/api/budget/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sectionUid, name }),
    }).catch(() => undefined); // optimistic; the grid already renamed locally
  }, []);

  const onDeleteRow = useCallback((rowUid: string) => {
    void fetch(`/api/budget/line-items?id=${encodeURIComponent(rowUid)}`, { method: 'DELETE' })
      .then(refreshOnFail)
      .catch(() => {
        showToast('Could not delete the line', 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reorder persistence (BUD-42). Optimistic — the grid already shows the new
  // order; PATCH each uid with its new index. On any failure, toast + refresh
  // to the true order. Reuses the existing PATCH routes (both accept sort_order).
  const persistOrder = useCallback(
    (endpoint: string, orderedUids: string[]) => {
      void Promise.all(
        orderedUids.map((id, i) =>
          fetch(endpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, sort_order: i }),
          }).then((res) => {
            if (!res.ok) throw new Error('reorder failed');
          }),
        ),
      ).catch(() => {
        showToast('Could not save the new order', 'error');
        router.refresh();
      });
    },
    [router, showToast],
  );

  const onReorderRow = useCallback(
    (_sectionUid: string, orderedRowUids: string[]) =>
      persistOrder('/api/budget/line-items', orderedRowUids),
    [persistOrder],
  );

  // #5 — the grid's section list includes the synthetic "Ungrouped" pseudo-
  // section (_uid 'ungrouped') and any not-yet-persisted uid, which have no
  // budget_sections row. PATCHing those 404s and — because persistOrder uses
  // Promise.all — rejected the WHOLE batch, so a valid reorder toasted an error
  // and refreshed back to the old order ("reorder doesn't persist"). Persist
  // only real DB section ids, re-indexed among themselves.
  const knownSectionIds = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const onReorderSection = useCallback(
    (orderedSectionUids: string[]) =>
      persistOrder('/api/budget/sections', orderedSectionUids.filter((id) => knownSectionIds.has(id))),
    [persistOrder, knownSectionIds],
  );

  // Steps 3–5 — async transactions/documents CRUD against the real tables.
  // Transactions: budget_line_item_transactions (actual_cost auto-syncs
  // server-side unless override — no double-write here). Documents:
  // budget_line_item_attachments. Receipts: a txn's receipt is an
  // expense_receipts row (decision: real two-table model).
  const lineApi = useMemo<GridLineApi>(
    () => ({
      listTransactions: async (lineId) => {
        const res = await fetch(`/api/budget/line-items/${lineId}/transactions`);
        if (!res.ok) return [];
        const json = await res.json();
        return (json.transactions ?? []).map(
          (t: {
            id: string;
            vendor_name: string | null;
            paid_at: string | null;
            amount: number;
            receipt_id: string | null;
            receipt_number: string | null;
            receipt_vendor: string | null;
          }) => ({
            id: t.id,
            date: t.paid_at ?? '',
            desc: t.vendor_name ?? '',
            amount: Number(t.amount) || 0,
            receipt: t.receipt_id ?? null,
            // BUD-48/BUD-01 — real receipt number (+ vendor) when joined; fall
            // back to a generic label only if the number is somehow missing.
            receiptLabel: t.receipt_id ? receiptChipLabel(t.receipt_number, t.receipt_vendor) : undefined,
          }),
        );
      },
      addTransaction: async (lineId) => {
        const res = await fetch(`/api/budget/line-items/${lineId}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_name: 'New transaction', amount: 0 }),
        });
        const t = (await res.json()).transaction;
        return {
          id: t.id,
          date: t.paid_at ?? '',
          desc: t.vendor_name ?? '',
          amount: Number(t.amount) || 0,
          receipt: t.receipt_id ?? null,
        };
      },
      patchTransaction: async (txnId, patch) => {
        const body: Record<string, unknown> = {};
        if (patch.desc !== undefined) body.vendor_name = patch.desc;
        if (patch.date !== undefined) body.paid_at = patch.date || null;
        if (patch.amount !== undefined) body.amount = patch.amount;
        await fetch(`/api/budget/transactions/${txnId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      },
      deleteTransaction: async (txnId) => {
        await fetch(`/api/budget/transactions/${txnId}`, { method: 'DELETE' });
      },
      attachReceipt: async (lineId, txnId) => {
        const rRes = await fetch('/api/budget/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, linked_line_item_id: lineId, in_budget: false }),
        });
        const receipt = await rRes.json();
        await fetch(`/api/budget/transactions/${txnId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt_id: receipt.id }),
        });
        return {
          receiptId: receipt.id as string,
          label: receiptChipLabel(receipt.receipt_number as string | null, receipt.vendor as string | null),
        };
      },
      // Receipts overhaul B1 — open the real Add-Receipt panel (drop → upload →
      // scan → confirm) and resolve when the user saves/cancels.
      onAddReceipt: (ctx) =>
        new Promise<AddReceiptResult | null>((resolve) => {
          setReceiptPanel({ lineId: ctx.lineId, txnId: ctx.txnId, resolve });
        }),
      signReceiptUrl: async (receiptId) => {
        try {
          const res = await fetch(`/api/budget/receipts/sign?receipt_id=${encodeURIComponent(receiptId)}`);
          if (!res.ok) return null;
          return ((await res.json()) as { url: string | null }).url;
        } catch {
          return null;
        }
      },
      listDocuments: async (lineId) => {
        const res = await fetch(`/api/budget/line-items/${lineId}/attachments`);
        if (!res.ok) return [];
        const json = await res.json();
        return (json.attachments ?? []).map(
          (a: { id: string; file_name: string; file_type: string | null; file_url: string }) => ({
            id: a.id,
            type: docTypeFromName(a.file_name, a.file_type),
            name: a.file_name,
            url: a.file_url,
          }),
        );
      },
      addDocument: async (lineId, file) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/budget/line-items/${lineId}/attachments`, { method: 'POST', body: fd });
        const a = await res.json();
        return { id: a.id as string, type: docTypeFromName(a.file_name, a.file_type), name: a.file_name, url: a.file_url };
      },
      renameDocument: async (lineId, docId, name) => {
        await fetch(`/api/budget/line-items/${lineId}/attachments`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: docId, file_name: name }),
        });
      },
      deleteDocument: async (lineId, docId) => {
        await fetch(`/api/budget/line-items/${lineId}/attachments`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: docId }),
        });
      },
    }),
    [tourId],
  );

  return (
    <>
      <Grid
        // re-init when the line/section COUNT changes (add/delete via a refresh);
        // cell edits don't change counts, so the grid keeps its session state.
        key={`${tourId}:${lines.length}:${sections.length}:${versionLocked ? 'locked' : 'draft'}`}
        initialColumns={EXPENSE_COLS}
        initialData={data}
        fx={fx}
        slideStatuses={STATUS_CONFIG}
        slideLineVariant
        fillHandle
        clickTwiceToOpen
        versionLocked={versionLocked}
        onLockedEdit={() => setLockModalOpen(true)}
        onEdit={onEdit}
        onAddLine={onAddLine}
        onAddSection={onAddSection}
        onRenameSection={onRenameSection}
        onDeleteRow={onDeleteRow}
        onReorderRow={onReorderRow}
        onReorderSection={onReorderSection}
        onFileDropToRow={handleFileDropToRow}
        lineApi={lineApi}
      />
      <VersionLockModal
        open={lockModalOpen}
        versionId={lockedVersionId}
        canApprove={canApprove}
        tourId={tourId}
        viewedStatus={viewedStatus}
        draftVersionId={draftVersionId}
        versions={versions}
        onClose={() => setLockModalOpen(false)}
      />
      {receiptPanel ? (
        <AddReceiptPanel
          tourId={tourId}
          tourCurrency={tourCurrency}
          lineId={receiptPanel.lineId}
          txnId={receiptPanel.txnId}
          initialFile={receiptPanel.file}
          onClose={(result) => {
            receiptPanel.resolve(result);
            setReceiptPanel(null);
          }}
        />
      ) : null}
    </>
  );
}
