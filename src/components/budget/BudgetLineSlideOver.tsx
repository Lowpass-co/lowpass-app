'use client';

import { useState } from 'react';
import { SlideOver } from '@/components/shell/SlideOver';
import { isUx14DerivedBudgetLine, ux14BudgetLineDerivedHint } from '@/lib/budget/budgetUx14Derived';
import type { BudgetLineItem } from '@/types';
import { cn } from '@/lib/utils';

type BudgetLineSlideOverProps = {
  line: BudgetLineItem;
  tourId: string;
  tourCurrency: string;
  onClose: () => void;
  /** Math scratchpad only explicit amount mutation UX14 */
  onApplyAmount: (amount: number) => void;
};

export function BudgetLineSlideOver({ line, tourId, tourCurrency, onClose, onApplyAmount }: BudgetLineSlideOverProps) {
  const cc = tourCurrency.trim().toUpperCase() || 'GBP';
  const derived = isUx14DerivedBudgetLine(line);

  return (
    <SlideOver open backdrop onClose={onClose} title={line.label?.trim() || 'Budget line'} width="wide" subtitle={
      <>
        {String(line.category ?? '').replace(/_/g, ' ')}{' · '}
        {Number(line.proposed_cost ?? 0).toLocaleString('en-GB', { style: 'currency', currency: cc })}
      </>
    }>
      {derived ? (
        <section className="border-b border-lp-border pb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Source</h3>
          <p className="mt-2 text-sm text-lp-text-secondary">{ux14BudgetLineDerivedHint(line)}</p>
          <p className="mt-3 text-[11px] text-lp-text-tertiary">
            Canonical rows refresh from flights, hotels, rooming and hire — overwrite amounts via those entities whenever possible.
          </p>
        </section>
      ) : null}

      <NotesBlock text={line.notes} />
      <ReceiptsStub />
      <AttachmentsStub />
      <ScratchPad currency={cc} onApply={onApplyAmount} />
      <CommentsStub />
      <ActivityStub tourId={tourId} lineId={line.id} />

      <p className="mt-12 text-[10px] text-lp-text-tertiary">
        Editing tour {tourId.slice(0, 8)}… (context panel only — edits happen inline grid or maths below)
      </p>
    </SlideOver>
  );
}

function NotesBlock({ text }: { text?: string | null }) {
  return (
    <section className="mt-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Notes</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm text-lp-text-secondary">{text?.trim() ? text : '—'}</p>
    </section>
  );
}

function ReceiptsStub() {
  return (
    <section className="mt-8">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Receipts</h3>
      <p className="mt-2 text-[11px] text-lp-text-tertiary">Linked receipts land in UX19 — placeholders only.</p>
    </section>
  );
}

function AttachmentsStub() {
  return (
    <section className="mt-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Attachments</h3>
      <p className="mt-2 text-[11px] text-lp-text-tertiary">Files stay routed through canonical records for now.</p>
    </section>
  );
}

function CommentsStub() {
  return (
    <section className="mt-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Comments</h3>
      <p className="mt-2 text-[11px] text-lp-text-tertiary">Threaded mentions ship with collaboration workspace.</p>
    </section>
  );
}

function ActivityStub({ tourId, lineId }: { tourId: string; lineId: string }) {
  void tourId;
  void lineId;
  return (
    <section className="mt-6 pb-36">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Activity</h3>
      <p className="mt-2 text-[11px] text-lp-text-tertiary">No audit entries yet.</p>
    </section>
  );
}

function ScratchPad({ currency, onApply }: { currency: string; onApply: (n: number) => void }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<number | null>(null);

  const compute = () => {
    const trimmed = expr.trim().replace(/\s+/g, '');
    if (!trimmed) {
      setResult(null);
      return;
    }
    try {
      if (!/^[\d.+*/()-]+$/.test(trimmed)) {
        setResult(null);
        return;
      }
      const v = new Function(`"use strict"; return (${trimmed});`)() as unknown;
      setResult(Number.isFinite(Number(v)) ? Number(v) : null);
    } catch {
      setResult(null);
    }
  };

  return (
    <section className="mt-8 rounded-lg border border-dashed border-lp-border bg-lp-bg-secondary/30 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide lp-table-header-text">Math scratchpad</h3>
      <input
        value={expr}
        onBlur={compute}
        onChange={(e) => setExpr(e.target.value)}
        className={
          cn(
            'mt-4 w-full rounded-md border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text',
            'outline-none ring-lp-orange focus:ring-1'
          )
        }
        placeholder="Try: (120 + 85) / 3"
      />
      <button type="button" onClick={compute} className="mt-4 text-[11px] font-semibold text-lp-orange">
        Evaluate
      </button>
      {result !== null ? (
        <p className="mt-3 text-lg font-semibold tabular-nums text-lp-text">
          = {result.toLocaleString('en-GB', { style: 'currency', currency })}
        </p>
      ) : (
        <p className="mt-3 text-xs text-lp-text-secondary">Supports + − × ÷ and parentheses.</p>
      )}
      <button
        disabled={result === null}
        type="button"
        onClick={() => result !== null && onApply(result)}
        className={
          cn(
            'mt-8 w-full rounded-md bg-lp-orange py-3 text-[11px] font-semibold uppercase tracking-wide text-white',
            'hover:bg-lp-orange/90 disabled:cursor-not-allowed disabled:opacity-40'
          )
        }
      >
        Set as proposed amount…
      </button>
    </section>
  );
}
