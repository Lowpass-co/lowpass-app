'use client';

/* ============================================================
   LOWPASS — <ChangeReviewQueue> (Design pass §7 · VIS-AA-02)

   The ONE review-grammar component, shared by both change-review callers:

     1. AI extraction review  — DealInfoUploadBlock (fill/FillMode.tsx): the
        deal-memo extractor proposes field values.
     2. Venue intake review   — the "venue filled N fields" queue (pending the
        write-path decision, see FillMode note / handover).

   Grammar (§7): each proposed change is a row — old value struck through → new
   value — with a per-row ✓ accept / ✕ reject, and an explicit "Apply N
   accepted" commit. Rejecting a row leaves the current value untouched.

   This component is the review UI ONLY. It never merges: onApply hands the
   accepted rows back to the caller, which writes them through its normal field
   path. For intake, the §12.4 never-clobber guard (src/lib/advance/intake.ts)
   stays authoritative on the write path — this queue does not re-implement it.
   ============================================================ */

import { useState } from 'react';
import { Check, X, ArrowRight } from 'lucide-react';

export interface ReviewRow {
  /** Target field id the accepted newValue writes to. */
  id: string;
  label: string;
  /** Current value (struck through when a newValue supersedes it). */
  oldValue?: string | null;
  newValue: string;
}

export function ChangeReviewQueue({
  rows,
  sourceLabel,
  applyLabel = 'Apply',
  onApply,
  onCancel,
}: {
  rows: ReviewRow[];
  /** e.g. "AI extracted 5 fields" or "Venue filled 3 fields · 2h ago". */
  sourceLabel?: string;
  applyLabel?: string;
  onApply: (accepted: ReviewRow[]) => void;
  onCancel?: () => void;
}) {
  const [accepted, setAccepted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, true])),
  );
  const acceptedRows = rows.filter((r) => accepted[r.id]);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--lp-space-3)' }}>
      {sourceLabel ? (
        <div
          className="lp-label-caps"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          {sourceLabel}
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="flex flex-col">
        {rows.map((r) => {
          const acc = accepted[r.id];
          const hasOld = r.oldValue != null && String(r.oldValue).trim() !== '';
          return (
            <li
              key={r.id}
              className="flex items-start gap-3"
              style={{
                padding: 'var(--lp-space-2) 0',
                borderTop: '1px solid var(--lp-border-subtle)',
              }}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="lp-label-caps"
                  style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}
                >
                  {r.label}
                </div>
                <div
                  className="mt-1 flex flex-wrap items-center"
                  style={{ gap: 6, fontSize: 'var(--lp-text-sm)' }}
                >
                  {hasOld ? (
                    <span
                      style={{
                        textDecoration: 'line-through',
                        color: 'var(--lp-text-tertiary)',
                      }}
                    >
                      {r.oldValue}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
                      empty
                    </span>
                  )}
                  <ArrowRight size={13} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
                  <span
                    style={{
                      color: acc ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                      textDecoration: acc ? 'none' : 'line-through',
                      fontWeight: 'var(--lp-weight-medium)',
                    }}
                  >
                    {r.newValue}
                  </span>
                </div>
              </div>

              {/* per-row ✓ accept / ✕ reject */}
              <div className="flex shrink-0 items-center gap-1">
                <DecisionButton
                  active={acc}
                  tone="accept"
                  label={`Accept ${r.label}`}
                  onClick={() => setAccepted((p) => ({ ...p, [r.id]: true }))}
                >
                  <Check size={14} />
                </DecisionButton>
                <DecisionButton
                  active={!acc}
                  tone="reject"
                  label={`Reject ${r.label}`}
                  onClick={() => setAccepted((p) => ({ ...p, [r.id]: false }))}
                >
                  <X size={14} />
                </DecisionButton>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="btn-transition rounded-lg border px-3.5 py-2"
            style={{
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text)',
              borderColor: 'var(--lp-border-strong)',
              background: 'transparent',
            }}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onApply(acceptedRows)}
          disabled={acceptedRows.length === 0}
          className="btn-transition btn-primary-press rounded-lg px-3.5 py-2"
          style={{
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text-inverse, #fff)',
            background:
              acceptedRows.length === 0
                ? 'var(--lp-surface-hover)'
                : 'var(--color-lp-orange)',
            border: '1px solid transparent',
            cursor: acceptedRows.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {applyLabel} {acceptedRows.length} accepted
        </button>
      </div>
    </div>
  );
}

function DecisionButton({
  active,
  tone,
  label,
  onClick,
  children,
}: {
  active: boolean;
  tone: 'accept' | 'reject';
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const accent =
    tone === 'accept' ? 'var(--color-lp-status-complete)' : 'var(--color-lp-error)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className="btn-transition flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 'var(--lp-radius-md)',
        border: `1px solid ${active ? accent : 'var(--lp-border-strong)'}`,
        color: active ? accent : 'var(--lp-text-tertiary)',
        background: active
          ? `color-mix(in srgb, ${accent} 14%, transparent)`
          : 'transparent',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
