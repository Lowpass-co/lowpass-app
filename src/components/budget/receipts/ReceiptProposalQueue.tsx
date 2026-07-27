/* ============================================
   LOWPASS — <ReceiptProposalQueue> (RC-3)

   The review surface for receipt proposals. One card per receipt: thumbnail,
   the EXTRACTED FIELDS (all editable), the proposed action with its reason, and
   Approve / Reject.

   WHY THIS ISN'T WorkbookImportModal. That modal is the same GRAMMAR — same
   import_pending_lines rows, same accept/reject route pair — but it renders a
   146-line checkbox list: no thumbnail, no editable fields, no link-vs-create
   toggle. Receipts need all three. So this shares the data layer and the routes
   (the hard rule) and only forks the CARD, which is the part that genuinely
   differs. The workbook modal is untouched.

   NOTHING WRITES WITHOUT APPROVAL. Cards start at the proposal's own default:
   accept for a clean match, SKIP for anything flagged as a possible duplicate.
   The batch controls are explicit ("Approve all links", "Approve all new lines",
   "Reject all") — there is deliberately no auto-apply.

   EDITING IS REAL. Every field here is sent as `edits[id]` and merged over the
   stored value server-side at apply time, so what lands is what the reviewer
   approved — not what the OCR guessed. Switching the action between "link" and
   "new line" converts the proposal in place (spec RC-2: editing a target line
   converts an (a) into a different (a); switching to new line converts to (b)).

   THE INVARIANT is upstream of this file: the apply route posts amounts as
   TRANSACTIONS only. Nothing here writes, so nothing here can bypass it.
   ============================================ */

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Link2, Plus, X } from 'lucide-react';

export interface QueueLineOption {
  id: string;
  label: string;
  section: string | null;
}

export interface QueueProposal {
  id: string;
  target: 'receipt_txn' | 'receipt_line';
  receipt_id: string | null;
  source_ref: string | null;
  dup_of: string | null;
  dup_reason: string | null;
  status: string;
  value: {
    vendor: string | null;
    date: string | null;
    amount: number | null;
    currency: string | null;
    label?: string;
    sectionName?: string | null;
    lineItemId?: string | null;
    reason?: string;
  };
}

type EditPatch = Partial<QueueProposal['value']> & { target?: QueueProposal['target'] };

const fieldStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 'var(--lp-text-sm)',
  padding: '5px 8px',
  borderRadius: 'var(--lp-radius-md)',
  border: '1px solid var(--lp-border)',
  background: 'var(--lp-surface)',
  color: 'var(--lp-text)',
};

export function ReceiptProposalQueue({
  batchId,
  proposals,
  lines,
  previewByReceiptId = {},
  onApplied,
}: {
  batchId: string;
  proposals: QueueProposal[];
  lines: QueueLineOption[];
  /** Thumbnails carried over from the drop, keyed by receipt id. */
  previewByReceiptId?: Record<string, string>;
  onApplied?: (summary: string) => void;
}) {
  // Seeded from the PROPOSAL's own default — duplicates arrive as 'skipped'.
  const [accepted, setAccepted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposals.map((p) => [p.id, p.status !== 'skipped'])),
  );
  const [edits, setEdits] = useState<Record<string, EditPatch>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const merged = useMemo(
    () =>
      proposals.map((p) => ({
        ...p,
        target: (edits[p.id]?.target ?? p.target) as QueueProposal['target'],
        value: { ...p.value, ...edits[p.id] },
      })),
    [proposals, edits],
  );

  const patch = (id: string, next: EditPatch) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));

  const acceptCount = merged.filter((p) => accepted[p.id]).length;

  const setAll = (pred: (p: QueueProposal) => boolean, v: boolean) =>
    setAccepted((prev) => {
      const next = { ...prev };
      for (const p of merged) if (pred(p)) next[p.id] = v;
      return next;
    });

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/budget/receipts/proposals/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,
          accept: merged.filter((p) => accepted[p.id]).map((p) => p.id),
          // Send the merged values — including a changed target — so the server
          // writes what was approved.
          edits: Object.fromEntries(
            merged
              .filter((p) => accepted[p.id] && edits[p.id])
              .map((p) => [p.id, { ...p.value, lineItemId: p.value.lineItemId ?? null }]),
          ),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Could not apply the batch.');
        return;
      }
      setSummary(j.summary ?? 'Applied.');
      onApplied?.(j.summary ?? 'Applied.');
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <div
        data-testid="receipt-batch-summary"
        style={{
          marginTop: 'var(--lp-space-3)',
          padding: 'var(--lp-space-3)',
          borderRadius: 'var(--lp-radius-md)',
          background: 'var(--lp-panel)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
        }}
      >
        {summary}
      </div>
    );
  }

  if (proposals.length === 0) return null;

  return (
    <section aria-label="Receipt proposals" style={{ marginTop: 'var(--lp-space-4)' }}>
      <header className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 'var(--lp-space-2)' }}>
        <h3 className="lp-label-caps" style={{ margin: 0, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
          Proposed — nothing is added until you approve
        </h3>
        <span className="lp-mono" style={{ fontSize: '12.5px', color: 'var(--lp-text-secondary)' }}>
          {acceptCount}/{merged.length} selected
        </span>
      </header>

      {/* Batch controls — explicit, never an auto-apply default. */}
      <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 'var(--lp-space-3)' }}>
        <BatchBtn onClick={() => setAll((p) => p.target === 'receipt_txn', true)}>Approve all links</BatchBtn>
        <BatchBtn onClick={() => setAll((p) => p.target === 'receipt_line', true)}>Approve all new lines</BatchBtn>
        <BatchBtn onClick={() => setAll(() => true, false)}>Reject all</BatchBtn>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {merged.map((p) => {
          const isLink = p.target === 'receipt_txn';
          const preview = p.receipt_id ? previewByReceiptId[p.receipt_id] : undefined;
          return (
            <li
              key={p.id}
              data-testid="receipt-proposal-card"
              style={{
                display: 'grid',
                gridTemplateColumns: '48px minmax(0,1fr) auto',
                gap: 12,
                padding: 'var(--lp-space-3)',
                borderRadius: 'var(--lp-radius-lg)',
                border: `1px solid ${p.dup_of ? 'var(--color-lp-warning)' : 'var(--lp-border)'}`,
                background: 'var(--lp-panel)',
              }}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--lp-radius-md)' }} />
              ) : (
                <span aria-hidden style={{ width: 48, height: 48, borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-surface)' }} />
              )}

              <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
                <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
                  {p.source_ref ? (
                    <span className="lp-mono" style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>{p.source_ref}</span>
                  ) : null}
                  <span
                    className="inline-flex items-center"
                    style={{
                      gap: 4,
                      fontSize: 'var(--lp-text-2xs)',
                      padding: '1px 7px',
                      borderRadius: 'var(--lp-radius-full)',
                      background: isLink ? 'color-mix(in srgb, var(--color-lp-status-complete) 14%, transparent)' : 'color-mix(in srgb, var(--lp-orange) 12%, transparent)',
                      color: isLink ? 'var(--color-lp-status-complete)' : 'var(--lp-orange)',
                    }}
                  >
                    {isLink ? <Link2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {isLink ? 'Link to existing line' : 'Create new line'}
                  </span>
                  {p.value.reason ? (
                    <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>{p.value.reason}</span>
                  ) : null}
                </div>

                {p.dup_of ? (
                  <p className="flex items-center" style={{ gap: 6, margin: 0, fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-warning)' }}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {p.dup_reason ?? 'Possible duplicate'} — skipped by default
                  </p>
                ) : null}

                {/* Every extracted value is editable before approving. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <Cap>Vendor</Cap>
                    <input style={fieldStyle} value={p.value.vendor ?? ''} onChange={(e) => patch(p.id, { vendor: e.target.value })} />
                  </label>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <Cap>Date</Cap>
                    <input type="date" style={fieldStyle} value={(p.value.date ?? '').slice(0, 10)} onChange={(e) => patch(p.id, { date: e.target.value })} />
                  </label>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <Cap>Amount</Cap>
                    <input
                      type="number"
                      step="0.01"
                      style={fieldStyle}
                      value={p.value.amount ?? ''}
                      onChange={(e) => patch(p.id, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>
                </div>

                {/* The action itself is editable: pick a line, or switch to a new one. */}
                <label style={{ display: 'grid', gap: 2 }}>
                  <Cap>Goes to</Cap>
                  <select
                    style={fieldStyle}
                    value={isLink ? p.value.lineItemId ?? '' : '__new__'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__new__') patch(p.id, { target: 'receipt_line', lineItemId: null });
                      else patch(p.id, { target: 'receipt_txn', lineItemId: v });
                    }}
                  >
                    <option value="__new__">＋ Create a new line</option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.section ? `${l.section} · ` : ''}{l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-start" style={{ gap: 4 }}>
                <IconBtn
                  active={!!accepted[p.id]}
                  label="Approve"
                  onClick={() => setAccepted((a) => ({ ...a, [p.id]: true }))}
                >
                  <Check className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  active={!accepted[p.id]}
                  label="Reject"
                  onClick={() => setAccepted((a) => ({ ...a, [p.id]: false }))}
                >
                  <X className="h-4 w-4" />
                </IconBtn>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p style={{ marginTop: 8, fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-error)' }}>{error}</p>
      ) : null}

      <div className="flex items-center" style={{ gap: 8, marginTop: 'var(--lp-space-3)' }}>
        <button
          type="button"
          disabled={busy || acceptCount === 0}
          onClick={() => void apply()}
          data-testid="receipt-apply"
          className="btn-transition"
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--lp-radius-md)',
            border: '1px solid var(--lp-orange)',
            background: acceptCount === 0 || busy ? 'var(--lp-surface)' : 'var(--lp-orange)',
            color: acceptCount === 0 || busy ? 'var(--lp-text-tertiary)' : '#fff',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            cursor: acceptCount === 0 || busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Applying…' : `Approve ${acceptCount}`}
        </button>
        <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
          Rejected receipts stay stored — nothing is lost.
        </span>
      </div>
    </section>
  );
}

function Cap({ children }: { children: React.ReactNode }) {
  return (
    <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)' }}>
      {children}
    </span>
  );
}

function BatchBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-transition"
      style={{
        padding: '5px 10px',
        borderRadius: 'var(--lp-radius-md)',
        border: '1px solid var(--lp-border)',
        background: 'transparent',
        color: 'var(--lp-text-secondary)',
        fontSize: 'var(--lp-text-xs)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="btn-transition"
      style={{
        padding: 6,
        borderRadius: 'var(--lp-radius-md)',
        border: `1px solid ${active ? 'var(--lp-orange)' : 'var(--lp-border)'}`,
        background: active ? 'color-mix(in srgb, var(--lp-orange) 10%, transparent)' : 'transparent',
        color: active ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
