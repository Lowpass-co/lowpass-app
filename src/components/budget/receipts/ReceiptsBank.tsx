'use client';

/* ============================================
   LOWPASS — <ReceiptsBank> (RQ-6)

   Adam: "now I don't know where they've gone."

   Every receipt on the tour, in one list, whatever happened to it. A scan that
   failed lands here exactly like one that worked — that is the entire point.
   Before this, a failed receipt was stored and then invisible, which made
   save-first a promise the app kept privately.

   FOUR STATES, DERIVED NOT STORED (src/lib/budget/receiptState.ts):
     Needs details · Proposed · Filed · Rejected

   The default filter is **Needs details** when any exist. The first thing you
   should see is the work, not a wall of finished receipts.

   NO MONEY IS WRITTEN HERE. Editing fields PATCHes the receipt; the amount only
   becomes money when a proposal is approved and a transaction is written. That
   is the same invariant as everywhere else in this feature, and after RQ-4 the
   receipts route enforces it structurally rather than by convention.

   Retry-scan re-uses the ONE seam: it re-signs the stored file, hands it back to
   useReceiptScan.ocr() as a File, and lets the existing route do the work. No
   second scan path.
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, RefreshCw, Trash2, ExternalLink, Check } from 'lucide-react';
import { useReceiptScan } from '@/components/budget/useReceiptScan';
import { RECEIPT_STATE_LABEL, type ReceiptState } from '@/lib/budget/receiptState';
import { pageRangeLabel } from '@/lib/budget/receiptDocuments';
import type { ReceiptRow } from '@/lib/budget/loadReceipts';

const FILTERS: Array<{ key: ReceiptState | 'all'; label: string }> = [
  { key: 'needs_details', label: RECEIPT_STATE_LABEL.needs_details },
  { key: 'proposed', label: RECEIPT_STATE_LABEL.proposed },
  { key: 'filed', label: RECEIPT_STATE_LABEL.filed },
  { key: 'rejected', label: RECEIPT_STATE_LABEL.rejected },
  { key: 'all', label: 'All' },
];

/* Needs-details is the only state coloured as work. Proposed/Filed/Rejected are
   informational — badging them all would make the colour meaningless. */
const STATE_COLOR: Record<ReceiptState, string> = {
  needs_details: 'var(--color-lp-warning)',
  proposed: 'var(--lp-text-secondary)',
  filed: 'var(--color-lp-status-complete)',
  rejected: 'var(--lp-text-tertiary)',
};

type Draft = { vendor: string; date: string; amount: string };

export interface ReceiptsBankProps {
  tourId: string;
  tourCurrency: string;
  receipts: ReceiptRow[];
  /** Budget lines, for the "link to a line" action. */
  lines: Array<{ id: string; label: string; section: string | null }>;
}

export function ReceiptsBank({ tourId, tourCurrency, receipts, lines }: ReceiptsBankProps) {
  const router = useRouter();
  const scan = useReceiptScan(tourId, tourCurrency);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: receipts.length };
    for (const r of receipts) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [receipts]);

  // Open on the work when there is any; otherwise show everything.
  const [filter, setFilter] = useState<ReceiptState | 'all'>(
    (counts.needs_details ?? 0) > 0 ? 'needs_details' : 'all',
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const visible = useMemo(
    () => (filter === 'all' ? receipts : receipts.filter((r) => r.state === filter)),
    [receipts, filter],
  );

  const draftFor = useCallback(
    (r: ReceiptRow): Draft =>
      drafts[r.id] ?? {
        vendor: r.vendor ?? '',
        date: r.date ?? '',
        amount: r.amount == null ? '' : String(r.amount),
      },
    [drafts],
  );

  /* Seed from the ROW on first edit, not from `prev[id]` — that is undefined
     until something has been typed, and spreading it produced a partial draft
     missing the untouched fields, which then blew up on save. The row is the
     baseline; the draft is an overlay on it. */
  const setDraft = useCallback((r: ReceiptRow, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const base: Draft = prev[r.id] ?? {
        vendor: r.vendor ?? '',
        date: r.date ?? '',
        amount: r.amount == null ? '' : String(r.amount),
      };
      return { ...prev, [r.id]: { ...base, ...patch } };
    });
  }, []);

  const mark = useCallback((id: string, what: string | null) => {
    setBusy((prev) => {
      const next = { ...prev };
      if (what) next[id] = what;
      else delete next[id];
      return next;
    });
  }, []);

  const fail = useCallback((id: string, msg: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });
  }, []);

  /** Save the edited fields. Writes to the receipt ONLY — never to a budget line. */
  const save = useCallback(
    async (r: ReceiptRow) => {
      const d = draftFor(r);
      const amount = d.amount.trim() === '' ? null : Number(d.amount);
      if (amount !== null && !Number.isFinite(amount)) {
        fail(r.id, 'That amount isn’t a number.');
        return;
      }
      mark(r.id, 'saving');
      fail(r.id, null);
      try {
        await scan.patchReceipt(r.id, {
          vendor: d.vendor.trim() || null,
          date: d.date.trim() || null,
          ...(amount === null ? {} : { cost_tour_currency: amount }),
        });
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[r.id];
          return next;
        });
        router.refresh();
      } catch (e) {
        fail(r.id, e instanceof Error ? e.message : 'Could not save.');
      } finally {
        mark(r.id, null);
      }
    },
    [draftFor, fail, mark, router, scan],
  );

  /** Re-run the scan on the stored file, through the existing seam. */
  const retry = useCallback(
    async (r: ReceiptRow) => {
      mark(r.id, 'scanning');
      fail(r.id, null);
      try {
        const url = await scan.signUrl(r.id);
        if (!url) throw new Error('The stored file could not be opened.');
        const blob = await fetch(url).then((res) => res.blob());
        const name = r.file_path?.split('/').pop() ?? 'receipt';
        const outcome = await scan.ocr(new File([blob], name, { type: blob.type }), r.id);
        if (!outcome.data) {
          fail(r.id, outcome.error ?? 'Still couldn’t read it — enter the details by hand.');
          return;
        }
        router.refresh();
      } catch (e) {
        fail(r.id, e instanceof Error ? e.message : 'Could not re-scan.');
      } finally {
        mark(r.id, null);
      }
    },
    [fail, mark, router, scan],
  );

  /** Link to an existing line. The AMOUNT becomes a transaction — the one money path. */
  const link = useCallback(
    async (r: ReceiptRow, lineId: string) => {
      if (!lineId) return;
      if (r.amount == null || !Number.isFinite(r.amount) || r.amount === 0) {
        fail(r.id, 'Add an amount before filing this against a line.');
        return;
      }
      mark(r.id, 'linking');
      fail(r.id, null);
      try {
        await scan.createTransaction(lineId, {
          vendor_name: r.vendor?.trim() || 'Receipt',
          amount: r.amount,
          paid_at: r.date,
          receipt_id: r.id,
        });
        await scan.patchReceipt(r.id, { in_budget: true, linked_line_item_id: lineId });
        router.refresh();
      } catch (e) {
        fail(r.id, e instanceof Error ? e.message : 'Could not file it.');
      } finally {
        mark(r.id, null);
      }
    },
    [fail, mark, router, scan],
  );

  const remove = useCallback(
    async (r: ReceiptRow) => {
      const label = r.receipt_number ?? r.vendor ?? 'this receipt';
      if (!window.confirm(`Delete ${label}? The file goes too. This can't be undone.`)) return;
      mark(r.id, 'deleting');
      try {
        const res = await fetch('/api/budget/receipts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: r.id }),
        });
        if (!res.ok && res.status !== 204) throw new Error('Delete failed');
        router.refresh();
      } catch (e) {
        fail(r.id, e instanceof Error ? e.message : 'Could not delete.');
      } finally {
        mark(r.id, null);
      }
    },
    [fail, mark, router],
  );

  const openFile = useCallback(
    async (r: ReceiptRow) => {
      const url = await scan.signUrl(r.id);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else fail(r.id, 'The stored file could not be opened.');
    },
    [fail, scan],
  );

  return (
    <section aria-label="Receipts" data-testid="receipts-bank">
      {/* Filter chips, each carrying its count so the shape of the work is visible
          without clicking through. */}
      <div className="flex flex-wrap items-center" style={{ gap: 6, marginBottom: 'var(--lp-space-4)' }}>
        {FILTERS.map((f) => {
          const n = counts[f.key] ?? 0;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              data-testid={`receipts-filter-${f.key}`}
              onClick={() => setFilter(f.key)}
              className="btn-transition"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 'var(--lp-radius-pill)',
                border: `1px solid ${on ? 'var(--lp-border-strong)' : 'var(--lp-border)'}`,
                background: on ? 'var(--lp-panel)' : 'transparent',
                color: on ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                fontSize: 'var(--lp-text-xs)',
                cursor: 'pointer',
              }}
            >
              {f.label}
              <span
                className="lp-mono"
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  color:
                    f.key === 'needs_details' && n > 0
                      ? 'var(--color-lp-warning)'
                      : 'var(--lp-text-tertiary)',
                }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p
          data-testid="receipts-empty"
          style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)', margin: 0 }}
        >
          {receipts.length === 0
            ? 'No receipts yet. Drop one on the Expenses tab and it will appear here — scanned or not.'
            : `Nothing in ${FILTERS.find((f) => f.key === filter)?.label}.`}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {visible.map((r) => {
            const d = draftFor(r);
            const dirty = drafts[r.id] !== undefined;
            const working = busy[r.id];
            const pages = pageRangeLabel(
              r.page_from == null ? null : [r.page_from, r.page_to ?? r.page_from],
            );
            return (
              <li
                key={r.id}
                data-testid="receipt-row"
                style={{
                  border: '1px solid var(--lp-border)',
                  borderRadius: 'var(--lp-radius-lg)',
                  background: 'var(--lp-surface)',
                  padding: 'var(--lp-space-3)',
                }}
              >
                <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => void openFile(r)}
                    title="Open the stored file"
                    style={{
                      width: 34, height: 34, display: 'grid', placeItems: 'center',
                      borderRadius: 'var(--lp-radius-sm)', border: '1px solid var(--lp-border)',
                      background: 'var(--lp-panel)', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
                  </button>

                  <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', minWidth: 52 }}>
                    {r.receipt_number ?? '—'}
                  </span>

                  <input
                    aria-label="Vendor"
                    value={d.vendor}
                    placeholder="Vendor"
                    onChange={(e) => setDraft(r, { vendor: e.target.value })}
                    style={{ ...inputStyle, flex: '1 1 150px' }}
                  />
                  <input
                    aria-label="Date"
                    type="date"
                    value={d.date}
                    onChange={(e) => setDraft(r, { date: e.target.value })}
                    style={{ ...inputStyle, width: 140 }}
                  />
                  <input
                    aria-label="Amount"
                    inputMode="decimal"
                    value={d.amount}
                    placeholder="0.00"
                    onChange={(e) => setDraft(r, { amount: e.target.value })}
                    className="lp-mono"
                    style={{ ...inputStyle, width: 96, textAlign: 'right' }}
                  />

                  <span
                    data-testid="receipt-state"
                    style={{
                      fontSize: 'var(--lp-text-2xs)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: STATE_COLOR[r.state],
                      minWidth: 92,
                    }}
                  >
                    {RECEIPT_STATE_LABEL[r.state]}
                  </span>

                  <span className="ml-auto flex items-center" style={{ gap: 6 }}>
                    {dirty ? (
                      <button
                        type="button"
                        data-testid="receipt-save"
                        onClick={() => void save(r)}
                        disabled={!!working}
                        className="btn-transition"
                        style={{ ...actionStyle, borderColor: 'var(--lp-orange)', color: 'var(--lp-orange)' }}
                      >
                        {working === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Save
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid="receipt-retry"
                      onClick={() => void retry(r)}
                      disabled={!!working || !r.file_path}
                      title={r.file_path ? 'Read this file again' : 'No stored file to re-read'}
                      className="btn-transition"
                      style={actionStyle}
                    >
                      {working === 'scanning' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Re-scan
                    </button>
                    <button
                      type="button"
                      onClick={() => void openFile(r)}
                      className="btn-transition"
                      style={actionStyle}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </button>
                    <button
                      type="button"
                      data-testid="receipt-delete"
                      onClick={() => void remove(r)}
                      disabled={!!working}
                      className="btn-transition"
                      style={{ ...actionStyle, color: 'var(--color-lp-error)', borderColor: 'var(--lp-border)' }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </div>

                <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: 6, paddingLeft: 44 }}>
                  {r.missing.length > 0 ? (
                    <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--color-lp-warning)' }}>
                      Missing {r.missing.join(', ')}
                    </span>
                  ) : null}
                  {pages ? (
                    <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                      {pages} of a shared file
                    </span>
                  ) : null}
                  {r.state !== 'filed' ? (
                    <label style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      File against
                      <select
                        data-testid="receipt-link-line"
                        defaultValue=""
                        disabled={!!working}
                        onChange={(e) => void link(r, e.target.value)}
                        style={{ ...inputStyle, width: 190 }}
                      >
                        <option value="">a line…</option>
                        {lines.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.section ? `${l.section} · ` : ''}{l.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {errors[r.id] ? (
                    <span role="alert" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--color-lp-error)' }}>
                      {errors[r.id]}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-md)',
  background: 'var(--lp-panel)',
  color: 'var(--lp-text)',
  fontSize: 'var(--lp-text-sm)',
  padding: '4px 8px',
};

const actionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-md)',
  background: 'transparent',
  color: 'var(--lp-text-secondary)',
  fontSize: 'var(--lp-text-2xs)',
  padding: '3px 8px',
  cursor: 'pointer',
};
