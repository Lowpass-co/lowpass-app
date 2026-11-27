'use client';

/* ============================================
   LOWPASS — <ShowNightCard> + <ShowPaymentCard>: the night = ACTUAL
   (Nov 2026, Adam)

   The ONLY place actual show money is typed. Every figure is the settlement
   (POST /api/budget/settlement + /lines — the same routes, the same walk maths
   in computeWalk, the same Σ(deductions) → reconciled_deductions push), and
   the settlement carries it to the income row. VIP is the one exception: it
   is paid outside the promoter's settlement, so its actual is saved on the
   income row (actual_vip — which no longer marks the row Manual).

   Each line shows Expected (from the deal, muted) beside Actual (the input,
   green rule). Blank = not typed yet — never a silent 0 that reads as paid.
   ============================================ */

import type { ReactNode } from 'react';
import { BO_FEE_KINDS, computeBoxOffice } from '@/lib/settlement/walk';
import { fillPlan, hasNightFigures, recomputeWalk, withholdingToAdd, type ShowMoneyRow } from '@/lib/income/showMoney';
import { Button, Card, HUE_ACTUAL, HUE_BAD, HUE_NEEDS, LineAdder, LinkButton, NumField, NumInput, fmtMoney, moneyFormat } from './moneyUi';

export type LineType = 'deduction' | 'expense' | 'payment';

const DEDUCTION_KINDS = [
  { value: 'withholding', label: 'Withholding' },
  { value: 'tax', label: 'Tax' },
  { value: 'venue_cost', label: 'Venue cost' },
  { value: 'commission', label: 'Commission' },
  { value: 'other', label: 'Other' },
  { value: 'facility_fee', label: 'Facility fee (box office)' },
  { value: 'ticket_fees', label: 'Ticket fees (box office)' },
  { value: 'cc_fees', label: 'Card fees (box office)' },
] as const;
const PAYMENT_METHODS = [
  { value: 'wire', label: 'Wire' },
  { value: 'check', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'ach', label: 'ACH' },
] as const;
const isBoFee = (k: string) => (BO_FEE_KINDS as readonly string[]).includes(k);
const kindLabel = (k: string) => DEDUCTION_KINDS.find((d) => d.value === k)?.label.replace(' (box office)', '') ?? k;
const methodLabel = (m: string) => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;

const COLS = 'minmax(0, 1fr) 7.5rem 8.5rem';

export interface NightHandlers {
  onSave: (patch: Record<string, unknown>) => void;
  onAddLine: (type: LineType, fields: Record<string, unknown>) => void;
  onRemoveLine: (type: LineType, id: string) => void;
  onSaveVip: (v: number | null) => void;
}

/** The walk recomputed from the loaded show, so the totals follow edits. */
export function liveWalk(show: ShowMoneyRow) {
  return show.walk ? recomputeWalk(show.walk).walk : null;
}

export function ShowNightCard({ show, h }: { show: ShowMoneyRow; h: NightHandlers }) {
  const fmt = moneyFormat(show.currency);
  const w = show.walk;
  const e = show.expected;
  const walk = liveWalk(show);
  const typed = hasNightFigures(w);
  const cur = show.currency;
  const plan = fillPlan(e, w);
  const canFill = Object.keys(plan.patch).length > 0 || plan.withholding != null;
  // Withholding the deal takes off that the night hasn't yet (Adam: "it
  // shows tax but calculates without tax as the final number").
  const owedWithholding = typed ? withholdingToAdd(e, w) : null;
  const addWithholding = (amount: number) => h.onAddLine('deduction', { kind: 'withholding', label: `${e.withholdingPct}%`, amount });
  const expensesTotal = (w?.expenses ?? []).reduce((n, x) => n + x.amount, 0);
  const boFees = (w?.deductions ?? []).filter((d) => isBoFee(d.kind));
  const otherDeductions = (w?.deductions ?? []).filter((d) => !isBoFee(d.kind));
  const inc = show.income;

  const bo = computeBoxOffice(
    {
      dealType: inc?.deal_type ?? null,
      dealPct: inc?.deal_pct ?? null,
      threshold: inc?.deal_threshold ?? null,
      pctAbove: inc?.deal_pct_above ?? null,
      faceValue: inc?.face_value ?? null,
      ticketsSold: w?.ticketsSold ?? null,
      grossBO: w?.grossBO ?? null,
    },
    boFees,
    walk?.expensesTotal ?? 0,
    w?.guarantee ?? 0,
  );

  const diff = walk && typed ? walk.artistTotal - e.settlementTotal : null;

  return (
    <Card
      title="On the night — actual"
      hint="What the show actually paid, from the settlement. Blank means not typed yet."
      accent={HUE_ACTUAL}
      action={
        canFill ? (
          <Button
            onClick={() => {
              if (Object.keys(plan.patch).length > 0) h.onSave(plan.patch);
              if (plan.withholding != null) addWithholding(plan.withholding);
            }}
            title="Types the deal's guarantee, overage and merch into the blank actual boxes, and its withholding as a deduction"
          >
            Fill from the deal
          </Button>
        ) : undefined
      }
    >
      <HeaderRow />

      <Row label="Guarantee" expected={fmtMoney(fmt, e.guarantee)}>
        <NumInput ariaLabel="Actual guarantee" actual currency={cur} value={w?.guarantee || null} onCommit={(v) => h.onSave({ reconciled_guarantee: v })} />
      </Row>

      <Group
        title="Deductions"
        expected={e.withholding ? `−${fmt.format(e.withholding)} withholding` : undefined}
        lines={otherDeductions.map((d) => ({ id: d.id, left: `${kindLabel(d.kind)}${d.label ? ` · ${d.label}` : ''}`, amount: d.amount }))}
        legacy={w?.deductionsAreLegacy ? `${fmtMoney(fmt, -w.walk.deductionsTotal)} as one figure — add lines to break it down` : undefined}
        actual={
          owedWithholding != null ? (
            <LinkButton onClick={() => addWithholding(owedWithholding)}>+ Withholding {fmt.format(owedWithholding)}</LinkButton>
          ) : otherDeductions.length > 0 ? (
            fmtMoney(fmt, -otherDeductions.reduce((n, d) => n + d.amount, 0))
          ) : undefined
        }
        fmt={fmt}
        onRemove={(id) => h.onRemoveLine('deduction', id)}
        adder={<LineAdder addLabel="Add deduction" kinds={DEDUCTION_KINDS} onAdd={(f) => h.onAddLine('deduction', { kind: f.kind, label: f.label, amount: f.amount })} />}
      />

      <Group
        title="Show expenses"
        lines={(w?.expenses ?? []).map((x) => ({ id: x.id, left: x.label || 'Expense', amount: x.amount }))}
        actual={expensesTotal ? fmtMoney(fmt, -expensesTotal) : undefined}
        fmt={fmt}
        onRemove={(id) => h.onRemoveLine('expense', id)}
        adder={<LineAdder addLabel="Add expense" placeholder="Expense" onAdd={(f) => h.onAddLine('expense', { label: f.label, amount: f.amount })} />}
      />

      {/* Box office — the night's facts; the % deals work their overage out. */}
      <div className="rounded-md border border-lp-border" style={{ padding: 'var(--lp-space-3)', margin: 'var(--lp-space-2) 0' }}>
        <div className="text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', marginBottom: 'var(--lp-space-2)' }}>
          Box office
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--lp-space-3)' }}>
          <NumField label="Tickets sold" kind="count" zeroIsBlank={false} actual value={w?.ticketsSold ?? null} onCommit={(v) => h.onSave({ reconciled_tickets_sold: v })} />
          <NumField label="Comps" kind="count" zeroIsBlank={false} actual value={w?.comps ?? null} onCommit={(v) => h.onSave({ comps: v })} />
          <NumField label="Gross box office" currency={cur} actual value={w?.grossBO ?? null} onCommit={(v) => h.onSave({ reconciled_gross: v })} />
        </div>
        {boFees.length > 0 ? (
          <div style={{ marginTop: 'var(--lp-space-2)' }}>
            {boFees.map((d) => (
              <LineItem key={d.id} left={`${kindLabel(d.kind)}${d.label ? ` · ${d.label}` : ''}`} amount={d.amount} fmt={fmt} onRemove={() => h.onRemoveLine('deduction', d.id)} />
            ))}
          </div>
        ) : null}
        {bo ? (
          <div style={{ marginTop: 'var(--lp-space-2)', borderTop: '1px solid var(--lp-border)', paddingTop: 'var(--lp-space-2)' }}>
            <Calc label="Gross" value={fmtMoney(fmt, bo.grossBO)} />
            {bo.feesTotal ? <Calc label="− Box-office fees" value={fmtMoney(fmt, -bo.feesTotal)} /> : null}
            {walk?.expensesTotal ? <Calc label="− Show expenses" value={fmtMoney(fmt, -walk.expensesTotal)} /> : null}
            <Calc label="= Split pool" value={fmtMoney(fmt, bo.splitPool)} />
            <Calc
              label={`Artist share @ ${inc?.deal_pct}%${bo.escalated ? `, ${inc?.deal_pct_above ?? inc?.deal_pct}% above ${inc?.deal_threshold} tickets` : ''}`}
              value={fmtMoney(fmt, bo.artistShare)}
            />
            <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-1)' }}>
              <span className="text-lp-text" style={{ fontSize: 'var(--lp-text-sm)' }}>
                Works out at <strong className="lp-mono">{fmt.format(bo.resolvedOverage)}</strong> overage on top of the guarantee
              </span>
              {Math.round(bo.resolvedOverage) !== Math.round(w?.overage ?? 0) ? (
                <Button onClick={() => h.onSave({ reconciled_overage: Math.round(bo.resolvedOverage * 100) / 100 })}>
                  Use as overage
                </Button>
              ) : (
                <span className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-xs)' }}>Overage matches</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-lp-text-tertiary" style={{ margin: 'var(--lp-space-2) 0 0', fontSize: 'var(--lp-text-xs)' }}>
            {inc?.deal_type === 'VS' || inc?.deal_type === 'DOOR'
              ? 'Enter tickets sold (or the gross) to work out the overage from the deal.'
              : 'Optional on this deal — for the record. Box-office fees: add them as deductions.'}
          </p>
        )}
      </div>

      <Row label="+ Overage" expected={fmtMoney(fmt, e.overage)}>
        <NumInput ariaLabel="Actual overage" actual currency={cur} value={w?.overage || null} onCommit={(v) => h.onSave({ reconciled_overage: v })} />
      </Row>
      <Row label="+ Merch" expected={fmtMoney(fmt, e.merch)}>
        <NumInput ariaLabel="Actual merch" actual currency={cur} value={w?.merch || null} onCommit={(v) => h.onSave({ reconciled_merch: v })} />
      </Row>

      <div className="grid items-center" style={{ gridTemplateColumns: COLS, gap: 'var(--lp-space-2)', borderTop: `2px solid color-mix(in srgb, ${HUE_ACTUAL} 50%, transparent)`, marginTop: 'var(--lp-space-2)', paddingTop: 'var(--lp-space-2)' }}>
        <span className="text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)' }}>= Artist total</span>
        <span className="lp-mono text-lp-text-secondary" style={{ textAlign: 'right', fontSize: 'var(--lp-text-sm)' }}>{fmtMoney(fmt, e.settlementTotal)}</span>
        <span className="lp-mono" style={{ textAlign: 'right', fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: typed ? HUE_ACTUAL : 'var(--lp-text-tertiary)' }}>
          {typed && walk ? fmtMoney(fmt, walk.artistTotal) : '—'}
        </span>
      </div>
      {diff != null && Math.round(diff) !== 0 ? (
        <p style={{ margin: 'var(--lp-space-1) 0 0', textAlign: 'right', fontSize: 'var(--lp-text-xs)', color: diff < 0 ? HUE_BAD : HUE_ACTUAL }}>
          {diff < 0 ? `${fmt.format(-diff)} short of expected` : `${fmt.format(diff)} over expected`}
        </p>
      ) : null}

      <div style={{ marginTop: 'var(--lp-space-3)' }}>
        <Row label="VIP (paid separately)" expected={fmtMoney(fmt, e.vip)}>
          <NumInput ariaLabel="Actual VIP" actual currency={cur} value={inc?.actual_vip || null} onCommit={h.onSaveVip} />
        </Row>
      </div>
    </Card>
  );
}

export function ShowPaymentCard({ show, h }: { show: ShowMoneyRow; h: NightHandlers }) {
  const fmt = moneyFormat(show.currency);
  const w = show.walk;
  const walk = liveWalk(show);
  const typed = hasNightFigures(w);
  const out = walk?.outstanding ?? 0;
  const outColor = !typed ? 'var(--lp-text-tertiary)' : out > 0.005 ? (w?.fullAndFinal ? HUE_NEEDS : 'var(--lp-text)') : HUE_ACTUAL;
  return (
    <Card title="Payment" hint="What's been paid against the settlement.">
      <div className="grid items-center" style={{ gridTemplateColumns: 'minmax(0, 1fr) 8.5rem', gap: 'var(--lp-space-2)' }}>
        <span className="text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-sm)' }}>− Deposit already received</span>
        <NumInput ariaLabel="Deposit received" actual currency={show.currency} value={w?.depositReceived || null} onCommit={(v) => h.onSave({ deposit_received: v })} />
        <span className="text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)' }}>= Balance due on the night</span>
        <span className="lp-mono text-lp-text" style={{ textAlign: 'right', fontSize: 'var(--lp-text-sm)' }}>{typed && walk ? fmtMoney(fmt, walk.balanceDue) : '—'}</span>
      </div>
      <div style={{ marginTop: 'var(--lp-space-2)' }}>
        {(w?.payments ?? []).map((p) => (
          <LineItem key={p.id} left={`${methodLabel(p.method)}${p.paid_on ? ` · ${p.paid_on}` : ''}`} amount={p.amount} fmt={fmt} onRemove={() => h.onRemoveLine('payment', p.id)} />
        ))}
        <LineAdder addLabel="Log a payment" kinds={PAYMENT_METHODS} withDate onAdd={(f) => h.onAddLine('payment', { method: f.kind, amount: f.amount, paid_on: f.date })} />
      </div>
      <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--lp-border)', marginTop: 'var(--lp-space-3)', paddingTop: 'var(--lp-space-2)' }}>
        <span className="text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)' }}>Still owed</span>
        <span className="lp-mono" style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: outColor }}>{typed && walk ? fmtMoney(fmt, out) : '—'}</span>
      </div>
    </Card>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function HeaderRow() {
  const cap = { fontSize: 'var(--lp-text-2xs)', fontWeight: 'var(--lp-weight-semibold)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' };
  return (
    <div className="grid" style={{ gridTemplateColumns: COLS, gap: 'var(--lp-space-2)', paddingBottom: 'var(--lp-space-1)', borderBottom: '1px solid var(--lp-border)' }}>
      <span />
      <span className="text-lp-text-tertiary" style={{ ...cap, textAlign: 'right' }}>Expected</span>
      <span style={{ ...cap, textAlign: 'right', color: HUE_ACTUAL }}>Actual</span>
    </div>
  );
}

function Row({ label, expected, children }: { label: string; expected: string; children: ReactNode }) {
  return (
    <div className="grid items-center" style={{ gridTemplateColumns: COLS, gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) 0' }}>
      <span className="text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-sm)' }}>{label}</span>
      <span className="lp-mono text-lp-text-tertiary" style={{ textAlign: 'right', fontSize: 'var(--lp-text-sm)' }}>{expected}</span>
      {children}
    </div>
  );
}

function Group({
  title,
  expected,
  actual,
  lines,
  legacy,
  fmt,
  onRemove,
  adder,
}: {
  title: string;
  expected?: string;
  /** The Actual column: the lines' total, or a one-click add. */
  actual?: ReactNode;
  lines: { id: string; left: string; amount: number }[];
  legacy?: string;
  fmt: Intl.NumberFormat;
  onRemove: (id: string) => void;
  adder: ReactNode;
}) {
  return (
    <div style={{ padding: 'var(--lp-space-1) 0' }}>
      <div className="grid items-center" style={{ gridTemplateColumns: COLS, gap: 'var(--lp-space-2)' }}>
        <span className="text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-sm)' }}>− {title}</span>
        <span className="lp-mono text-lp-text-tertiary" style={{ textAlign: 'right', fontSize: 'var(--lp-text-xs)' }}>{expected ?? ''}</span>
        <span className="lp-mono text-lp-text" style={{ textAlign: 'right', fontSize: 'var(--lp-text-sm)' }}>{actual ?? ''}</span>
      </div>
      <div style={{ paddingLeft: 'var(--lp-space-3)' }}>
        {legacy ? <div className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-xs)' }}>{legacy}</div> : null}
        {lines.map((l) => (
          <LineItem key={l.id} left={l.left} amount={l.amount} fmt={fmt} onRemove={() => onRemove(l.id)} />
        ))}
        {adder}
      </div>
    </div>
  );
}

function LineItem({ left, amount, fmt, onRemove }: { left: string; amount: number; fmt: Intl.NumberFormat; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) 0' }}>
      <span className="min-w-0 truncate text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-sm)' }}>{left}</span>
      <span className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
        <span className="lp-mono text-lp-text" style={{ fontSize: 'var(--lp-text-sm)' }}>{fmtMoney(fmt, -amount)}</span>
        <LinkButton muted onClick={onRemove}>Remove</LinkButton>
      </span>
    </div>
  );
}

function Calc({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-2)', padding: 0 }}>
      <span className="text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-xs)' }}>{label}</span>
      <span className="lp-mono text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-xs)' }}>{value}</span>
    </div>
  );
}
