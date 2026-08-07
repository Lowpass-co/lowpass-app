'use client';

/* ============================================
   LOWPASS — <SettlementWalkClient> (ATOM-bar redesign, 2026-08-07)

   Adam: "Lowpass looks like a late 90s website comparably [to ATOM's
   settlement sheet]." Rebuilt in the app's money grammar (same language as
   the income deal slide-over):

     - KPI STRIP up top (spec §3, all client-derivable): Outstanding ·
       Settled · Not settled · Awaiting payment · Unsettled N of M.
     - SHOWS RAIL: card rows with venue + date + guarantee + a status chip
       (SETTLED green / DUE amber / open) — the catch-up queue readable at a
       glance.
     - THE WALK as ledger cards: "The walk" (guarantee → itemized deductions
       → adjusted gross → expenses → show net → +overage +merch → ARTIST
       TOTAL) and "Settle & pay" (−deposit → BALANCE DUE → payments log →
       OUTSTANDING emphatic). Mono tabular numerals, hairline rules, ruled
       totals, negatives red. Hue = green (settled money domain); orange is
       reserved for the one number that still moves: Outstanding.

   LOGIC UNCHANGED: same computeWalk, same /api/budget/settlement +
   /lines endpoints, same Σ(deductions) → reconciled_deductions push, same
   Full & Final semantics, same PDF export (data-testid preserved).
   ============================================ */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BO_FEE_KINDS, computeBoxOffice, computeWalk } from '@/lib/settlement/walk';
import type { ShowWalk } from '@/lib/settlement/loadWalk';

// Migration 262 — the DeductionAdder offers the BO fee kinds too; those lines
// render in the box-office waterfall, not the guarantee-side Deductions group.
const DEDUCTION_KINDS = ['withholding', 'tax', 'venue_cost', 'commission', 'other', 'facility_fee', 'ticket_fees', 'cc_fees'] as const;
const PAYMENT_METHODS = ['wire', 'check', 'cash', 'ach'] as const;
const isBoFeeKind = (k: string) => (BO_FEE_KINDS as readonly string[]).includes(k);

// Deal type vocabulary (migration 262) — '' renders as — / clears to null.
const DEAL_TYPES = ['', 'guarantee', 'guarantee_plus', 'door_deal', 'flat', 'festival'] as const;
const DEAL_TYPE_LABELS: Record<string, string> = {
  '': '—',
  guarantee: 'Guarantee',
  guarantee_plus: 'Guarantee + bonus',
  door_deal: 'Door deal',
  flat: 'Flat',
  festival: 'Festival',
};

const HUE_SETTLED = 'var(--color-lp-status-complete)';
const HUE_DUE = 'var(--color-lp-warning)';
const HUE_OUT = 'var(--lp-orange)';

export function SettlementWalkClient({
  tourId,
  currency,
  shows,
}: {
  tourId: string;
  currency: string;
  shows: ShowWalk[];
}) {
  void tourId;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedId, setSelectedId] = useState<string | null>(shows[0]?.routingId ?? null);
  const selected = shows.find((s) => s.routingId === selectedId) ?? shows[0] ?? null;

  const fmt = useMemo(
    () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 }),
    [currency],
  );

  // ── KPI strip (spec §3) — all derivable from the loaded walks ──
  const kpi = useMemo(() => {
    let outstanding = 0;
    let settledCount = 0;
    let notSettled = 0;
    let awaitingPayment = 0;
    for (const s of shows) {
      if (s.settlementId) outstanding += s.walk.outstanding;
      if (s.fullAndFinal) {
        settledCount++;
        if (s.walk.outstanding > 0) awaitingPayment++;
      } else if (s.date != null && s.date < today) {
        notSettled++;
      }
    }
    return { outstanding, settledCount, notSettled, awaitingPayment, total: shows.length };
  }, [shows, today]);

  const refresh = () => startTransition(() => router.refresh());

  async function post(url: string, body: unknown, method = 'POST') {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed');
      return await res.json().catch(() => ({}));
    } finally {
      setBusy(false);
    }
  }

  /** Ensure a settlement row exists for the show; returns its id. */
  async function ensureSettlement(show: ShowWalk): Promise<string | null> {
    if (show.settlementId) return show.settlementId;
    const row = await post('/api/budget/settlement', { routing_id: show.routingId });
    return (row?.id as string | undefined) ?? null;
  }

  async function saveGrain(show: ShowWalk, patch: Record<string, unknown>) {
    await post('/api/budget/settlement', { routing_id: show.routingId, ...patch });
    refresh();
  }

  async function addLine(show: ShowWalk, type: 'deduction' | 'expense' | 'payment', fields: Record<string, unknown>) {
    const sid = await ensureSettlement(show);
    if (!sid) return;
    await post('/api/budget/settlement/lines', { type, settlement_id: sid, ...fields });
    if (type === 'deduction') await pushDeductionSum(show, sid);
    refresh();
  }

  async function removeLine(show: ShowWalk, type: 'deduction' | 'expense' | 'payment', id: string) {
    await post('/api/budget/settlement/lines', { type, id }, 'DELETE');
    if (type === 'deduction' && show.settlementId) await pushDeductionSum(show, show.settlementId, id);
    refresh();
  }

  /** Push Σ(itemized deductions) into reconciled_deductions so the income cascade
   *  carries the itemized total unchanged. `excludeId` drops a just-removed row.
   *  MONEY INVARIANT (migration 262): this Σ sums ALL deduction kinds — including
   *  the BO fee kinds (facility_fee / ticket_fees / cc_fees) that RENDER in the
   *  box-office waterfall instead of the Deductions group. The split is display
   *  only; the income cascade total must not move. */
  async function pushDeductionSum(show: ShowWalk, _sid: string, excludeId?: string) {
    const sum = show.deductions.filter((d) => d.id !== excludeId).reduce((n, d) => n + d.amount, 0);
    await post('/api/budget/settlement', { routing_id: show.routingId, reconciled_deductions: sum });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
      {/* ── KPI strip ── */}
      <div style={{ display: 'flex', borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border)', background: 'var(--lp-panel)', overflow: 'hidden', flexWrap: 'wrap' }}>
        <Kpi label="Outstanding" value={fmt.format(kpi.outstanding)} hue={kpi.outstanding > 0 ? HUE_OUT : 'var(--lp-text-tertiary)'} />
        <Kpi label="Settled" value={String(kpi.settledCount)} hue={HUE_SETTLED} divider />
        <Kpi label="Not settled" value={String(kpi.notSettled)} hue={kpi.notSettled > 0 ? HUE_DUE : 'var(--lp-text-tertiary)'} divider />
        <Kpi label="Awaiting payment" value={String(kpi.awaitingPayment)} hue={kpi.awaitingPayment > 0 ? HUE_OUT : 'var(--lp-text-tertiary)'} divider />
        <Kpi label="Unsettled shows" value={`${kpi.total - kpi.settledCount} of ${kpi.total}`} hue="var(--lp-text-secondary)" divider />
      </div>

      {/* ── Catch-up batch (spec §3) — settle the backlog at the contracted number ── */}
      {kpi.notSettled > 0 ? (
        <CatchUpPanel
          shows={shows.filter((s) => s.date != null && s.date < today && !s.fullAndFinal)}
          fmt={fmt}
          onDone={refresh}
        />
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 330px) 1fr', gap: 'var(--lp-space-4)', minHeight: 0 }}>
        {/* ── Shows rail ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', padding: '0 2px 2px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Shows</span>
            {kpi.notSettled > 0 ? <span style={{ color: HUE_DUE }}>{kpi.notSettled} due</span> : null}
          </div>
          {shows.length === 0 ? (
            <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
              No shows to settle yet — routing dates become settleable shows automatically.
            </p>
          ) : (
            shows.map((s) => {
              const isSel = s.routingId === selectedId;
              const unsettled = s.date != null && s.date < today && !s.fullAndFinal;
              const hue = s.fullAndFinal ? HUE_SETTLED : unsettled ? HUE_DUE : 'var(--lp-border-subtle)';
              return (
                <button
                  key={s.routingId}
                  type="button"
                  onClick={() => setSelectedId(s.routingId)}
                  className="btn-transition"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '9px 12px', textAlign: 'left', cursor: 'pointer', minWidth: 0,
                    background: isSel ? 'color-mix(in srgb, var(--lp-orange) 8%, var(--lp-surface))' : 'var(--lp-surface)',
                    border: `1px solid ${isSel ? 'var(--lp-orange)' : 'var(--lp-border-subtle)'}`,
                    borderLeft: `3px solid ${isSel ? 'var(--lp-orange)' : hue}`,
                    borderRadius: 'var(--lp-radius-md)',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.city || s.venue_name || 'Show'}
                    </span>
                    <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                      {s.date ?? '—'}{s.guarantee ? ` · ${fmt.format(s.guarantee)} gtd` : ''}
                    </span>
                  </span>
                  {s.fullAndFinal ? (
                    <Chip label="SETTLED" hue={HUE_SETTLED} />
                  ) : unsettled ? (
                    <Chip label="DUE" hue={HUE_DUE} />
                  ) : null}
                </button>
              );
            })
          )}
        </aside>

        {/* ── Walk panel ── */}
        {selected ? (
          <WalkPanel
            key={selected.routingId}
            show={selected}
            fmt={fmt}
            busy={busy || pending}
            onSaveGrain={(patch) => void saveGrain(selected, patch)}
            onAddLine={(type, fields) => void addLine(selected, type, fields)}
            onRemoveLine={(type, id) => void removeLine(selected, type, id)}
          />
        ) : (
          <div style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-sm)' }}>Select a show to settle.</div>
        )}
      </div>
    </div>
  );
}

function WalkPanel({
  show,
  fmt,
  busy,
  onSaveGrain,
  onAddLine,
  onRemoveLine,
}: {
  show: ShowWalk;
  fmt: Intl.NumberFormat;
  busy: boolean;
  onSaveGrain: (patch: Record<string, unknown>) => void;
  onAddLine: (type: 'deduction' | 'expense' | 'payment', fields: Record<string, unknown>) => void;
  onRemoveLine: (type: 'deduction' | 'expense' | 'payment', id: string) => void;
}) {
  // Recompute locally so the walk reflects edits before the refresh lands.
  const walk = computeWalk({
    guarantee: show.guarantee,
    deductions: show.deductions.length > 0 ? show.deductions : show.deductionsAreLegacy ? [{ amount: walkLegacy(show) }] : [],
    expenses: show.expenses,
    overage: show.overage,
    merch: show.merch,
    depositReceived: show.depositReceived,
    payments: show.payments,
  });

  // Migration 262 — the deduction lines SPLIT for display: BO fee kinds render
  // in the box-office waterfall, the rest stay in the Deductions group. The
  // walk maths above and Σ → reconciled_deductions still use ALL of them.
  const boFees = show.deductions.filter((d) => isBoFeeKind(d.kind));
  const walkDeductions = show.deductions.filter((d) => !isBoFeeKind(d.kind));
  const bo = computeBoxOffice(
    {
      dealType: show.dealType,
      dealPct: show.dealPct,
      bonusThreshold: show.bonusThreshold,
      bonusPct: show.bonusPct,
      ticketPrice: show.ticketPrice,
      ticketCapacity: show.ticketCapacity,
      comps: show.comps,
      ticketsSold: show.ticketsSold,
      grossBO: show.grossBO,
    },
    boFees,
    walk.expensesTotal,
    show.guarantee,
  );

  const statusChip = show.fullAndFinal
    ? { label: 'SETTLED · FULL & FINAL', hue: HUE_SETTLED }
    : { label: 'OPEN', hue: 'var(--lp-text-tertiary)' };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {/* HERO — identity + status + actions */}
      <div
        style={{
          borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border)',
          background: `linear-gradient(180deg, color-mix(in srgb, ${show.fullAndFinal ? HUE_SETTLED : HUE_OUT} 8%, var(--lp-surface)) 0%, var(--lp-surface) 100%)`,
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)', marginBottom: 2 }}>
              {show.date ?? '—'}{show.venue_name && show.city ? ` · ${show.venue_name}` : ''}
            </div>
            <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--lp-text)' }}>
              {show.city || show.venue_name || 'Show'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Chip label={statusChip.label} hue={statusChip.hue} />
            <button
              type="button"
              data-testid="settlement-export-pdf"
              data-routing-id={show.routingId}
              onClick={() => void exportPdf(show.routingId, show.city || show.venue_name || 'Show')}
              className="btn-transition"
              style={{ padding: '5px 12px', fontSize: 'var(--lp-text-xs)', fontWeight: 600, color: 'var(--lp-text-secondary)', background: 'transparent', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' }}
              title="Download this show's settlement as a PDF"
            >
              Export PDF
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSaveGrain({ full_and_final: !show.fullAndFinal, status: 'reconciled' })}
              className="btn-transition"
              title={show.fullAndFinal ? 'Reopen this settlement' : 'Mark this settlement Full & Final'}
              style={{
                padding: '5px 12px', fontSize: 'var(--lp-text-xs)', fontWeight: 700, cursor: 'pointer',
                borderRadius: 'var(--lp-radius-md)',
                border: `1px solid ${show.fullAndFinal ? HUE_SETTLED : 'var(--lp-border-strong)'}`,
                background: show.fullAndFinal ? HUE_SETTLED : 'transparent',
                color: show.fullAndFinal ? 'var(--lp-text-inverse, #fff)' : 'var(--lp-text)',
              }}
            >
              {show.fullAndFinal ? '✓ Full & Final' : 'Mark Full & Final'}
            </button>
          </div>
        </div>
        {/* At-a-glance triplet */}
        <div style={{ display: 'flex', marginTop: 12, borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', background: 'var(--lp-panel)', overflow: 'hidden' }}>
          <Kpi label="Artist total" value={fmt.format(walk.artistTotal)} hue="var(--lp-text)" />
          <Kpi label="Balance due" value={fmt.format(walk.balanceDue)} hue="var(--lp-text)" divider />
          <Kpi label="Outstanding" value={fmt.format(walk.outstanding)} hue={walk.outstanding > 0 ? HUE_OUT : HUE_SETTLED} divider />
        </div>
      </div>

      {/* CARD 0 — deal & box office (migration 262). Terms + BO waterfall; the
          suggested overage is APPLIED only by the explicit button below. */}
      <Card title="Deal & box office" hue="var(--lp-orange)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
          <Sel
            label="Deal type"
            value={show.dealType ?? ''}
            options={[...DEAL_TYPES]}
            labels={DEAL_TYPE_LABELS}
            disabled={busy}
            onPick={(v) => onSaveGrain({ deal_type: v || null })}
          />
          <Num label="Deal %" value={show.dealPct} disabled={busy} onCommit={(v) => onSaveGrain({ deal_pct: v })} />
          <Num label="Bonus @ (tix)" value={show.bonusThreshold} disabled={busy} onCommit={(v) => onSaveGrain({ bonus_threshold: v })} />
          <Num label="Bonus %" value={show.bonusPct} disabled={busy} onCommit={(v) => onSaveGrain({ bonus_pct: v })} />
          <Num label="Ticket price" value={show.ticketPrice} disabled={busy} onCommit={(v) => onSaveGrain({ ticket_price: v })} />
          <Num label="Capacity" value={show.ticketCapacity} disabled={busy} onCommit={(v) => onSaveGrain({ ticket_capacity: v })} />
          <Num label="Comps" value={show.comps} disabled={busy} onCommit={(v) => onSaveGrain({ comps: v })} />
          <Num label="Tickets sold" value={show.ticketsSold} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_tickets_sold: v })} />
          <Num label="Gross box office" value={show.grossBO} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_gross: v })} />
        </div>

        {bo ? (
          <div style={{ marginTop: 12 }}>
            <Rule label="Gross box office" value={bo.grossBO} fmt={fmt} />
            {/* BO fee lines (facility / ticket / CC) — these kinds live HERE,
                not in the guarantee-side Deductions group. */}
            {boFees.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.5px 0' }}>
                <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {kindLabel(d.kind)}{d.label ? ` · ${d.label}` : ''}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="lp-mono" style={{ fontSize: 13, color: 'var(--color-lp-error)', fontVariantNumeric: 'tabular-nums' }}>−{money(fmt, d.amount)}</span>
                  <button type="button" disabled={busy} onClick={() => onRemoveLine('deduction', d.id)} title="Remove" style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              </div>
            ))}
            {boFees.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--lp-text-tertiary)', padding: '2.5px 0' }}>
                No box-office fees yet — add Facility fee / Ticket fees / CC fees in the deductions adder below.
              </div>
            ) : null}
            <Rule label="Net box office" value={bo.netBO} fmt={fmt} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.5px 0' }}>
              <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>− Show expenses</span>
              <span className="lp-mono" style={{ fontSize: 13, color: 'var(--color-lp-error)', fontVariantNumeric: 'tabular-nums' }}>−{money(fmt, walk.expensesTotal)}</span>
            </div>
            <Rule label="Split pool" value={bo.splitPool} fmt={fmt} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.5px 0' }}>
              <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Artist share @ {show.dealPct}%</span>
              <span className="lp-mono" style={{ fontSize: 13, color: 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}>{money(fmt, bo.artistShare)}</span>
            </div>
            {bo.bonus > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.5px 0' }}>
                <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>＋ Bonus @ {show.bonusPct}% above {show.bonusThreshold} tix</span>
                <span className="lp-mono" style={{ fontSize: 13, color: 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}>{money(fmt, bo.bonus)}</span>
              </div>
            ) : null}
            <RuledTotal label="Suggested overage" value={bo.resolvedOverage} fmt={fmt} hue={HUE_OUT} />
            {/* NEVER auto-written — this click is the consent that moves money. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => onSaveGrain({ reconciled_overage: bo.resolvedOverage })}
              className="btn-transition"
              style={{
                marginTop: 8, padding: '6px 14px', fontSize: 'var(--lp-text-xs)', fontWeight: 700, cursor: 'pointer',
                borderRadius: 'var(--lp-radius-md)', border: `1px solid ${HUE_OUT}`,
                background: `color-mix(in srgb, ${HUE_OUT} 10%, transparent)`, color: HUE_OUT,
              }}
            >
              Apply {fmt.format(bo.resolvedOverage)} to Overage
            </button>
          </div>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--lp-text-tertiary)' }}>
            Enter a percentage deal + tickets/gross to compute the waterfall.
          </p>
        )}
      </Card>

      {/* CARD 1 — the walk */}
      <Card title="The walk" hue={HUE_SETTLED}>
        <LedgerInput label="Guarantee" value={show.guarantee} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_guarantee: v })} />

        <LineGroup
          label="Deductions"
          rows={walkDeductions.map((d) => ({ id: d.id, left: kindLabel(d.kind) + (d.label ? ` · ${d.label}` : ''), amount: -d.amount }))}
          legacyNote={show.deductionsAreLegacy ? 'Legacy single value — add itemized lines to break it out' : undefined}
          emptyNote="No deductions yet — withholding, taxes, venue costs and commissions itemize here."
          fmt={fmt}
          busy={busy}
          onRemove={(id) => onRemoveLine('deduction', id)}
          adder={<DeductionAdder busy={busy} onAdd={(f) => onAddLine('deduction', f)} />}
        />
        <Rule label="Adjusted gross" value={walk.adjustedGross} fmt={fmt} />

        <LineGroup
          label="Show expenses"
          rows={show.expenses.map((e) => ({ id: e.id, left: e.label || 'Expense', amount: -e.amount }))}
          emptyNote="No show expenses logged against the settlement."
          fmt={fmt}
          busy={busy}
          onRemove={(id) => onRemoveLine('expense', id)}
          adder={<LabelAmountAdder busy={busy} placeholder="Expense" onAdd={(f) => onAddLine('expense', f)} />}
        />
        <Rule label="Show net" value={walk.showNet} fmt={fmt} />

        <LedgerInput label="＋ Overage / bonus" value={show.overage} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_overage: v })} />
        <LedgerInput label="＋ Merch" value={show.merch} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_merch: v })} />
        <RuledTotal label="Artist total" value={walk.artistTotal} fmt={fmt} hue={HUE_SETTLED} />
      </Card>

      {/* CARD 2 — settle & pay */}
      <Card title="Settle & pay" hue={HUE_OUT}>
        <LedgerInput label="− Deposit received" value={show.depositReceived} disabled={busy} onCommit={(v) => onSaveGrain({ deposit_received: v })} />
        <Rule label="Balance due" value={walk.balanceDue} fmt={fmt} />

        <LineGroup
          label="Payments"
          rows={show.payments.map((p) => ({ id: p.id, left: methodLabel(p.method) + (p.paid_on ? ` · ${p.paid_on}` : ''), amount: -p.amount }))}
          emptyNote="Nothing logged yet — wires, checks and cash land here as they arrive."
          fmt={fmt}
          busy={busy}
          onRemove={(id) => onRemoveLine('payment', id)}
          adder={<PaymentAdder busy={busy} onAdd={(f) => onAddLine('payment', f)} />}
        />
        <RuledTotal label="Outstanding" value={walk.outstanding} fmt={fmt} hue={walk.outstanding > 0 ? HUE_OUT : HUE_SETTLED} />
      </Card>
    </section>
  );
}

/* -------- primitives (the app's money grammar) -------- */

function walkLegacy(show: ShowWalk): number {
  return show.walk.deductionsTotal;
}

function money(fmt: Intl.NumberFormat, n: number) {
  return fmt.format(Math.abs(n));
}

function Kpi({ label, value, hue, divider }: { label: string; value: string; hue: string; divider?: boolean }) {
  return (
    <div style={{ flex: '1 1 110px', padding: '10px 16px', borderLeft: divider ? '1px solid var(--lp-border)' : 'none', minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 750, fontFamily: 'var(--lp-font-numeric)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: hue, marginTop: 2, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function Chip({ label, hue }: { label: string; hue: string }) {
  return (
    <span
      style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em', padding: '4px 9px', whiteSpace: 'nowrap',
        borderRadius: 'var(--lp-radius-full)', color: hue,
        border: `1px solid color-mix(in srgb, ${hue} 45%, transparent)`,
        background: `color-mix(in srgb, ${hue} 10%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function Card({ title, hue, children }: { title: string; hue: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border)', background: 'var(--lp-panel)',
        borderLeft: `3px solid color-mix(in srgb, ${hue} 65%, transparent)`, padding: '12px 18px 14px',
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--lp-text-secondary)' }}>{title}</h3>
      {children}
    </section>
  );
}

/** A ledger line whose figure is an INPUT (mono, right, saves on blur). */
function LedgerInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value || ''));
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4.5px 0', borderBottom: '1px solid var(--lp-border-subtle, var(--lp-border))' }}>
      <span style={{ fontSize: 12, color: 'var(--lp-text-secondary)' }}>{label}</span>
      <input
        value={v}
        disabled={disabled}
        inputMode="decimal"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Number(v) || 0; if (n !== value) onCommit(n); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="lp-mono"
        style={{ width: 130, textAlign: 'right', fontSize: 13.5, background: 'var(--lp-bg)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '5px 9px', color: 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}
        placeholder="—"
      />
    </div>
  );
}

/** A computed subtotal with a hairline rule. */
function Rule({ label, value, fmt }: { label: string; value: number; fmt: Intl.NumberFormat }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--lp-border-subtle, var(--lp-border))' }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--lp-text-secondary)' }}>{label}</span>
      <span className="lp-mono" style={{ fontSize: 14, fontWeight: 600, color: value < 0 ? 'var(--color-lp-error)' : 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}>
        {value < 0 ? '−' : ''}{money(fmt, value)}
      </span>
    </div>
  );
}

/** The emphatic ruled total that closes a card. */
function RuledTotal({ label, value, fmt, hue }: { label: string; value: number; fmt: Intl.NumberFormat; hue: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0 2px', borderTop: `2px solid color-mix(in srgb, ${hue} 55%, transparent)`, marginTop: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: hue }}>{label}</span>
      <span className="lp-mono" style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.01em', color: value < 0 ? 'var(--color-lp-error)' : hue, fontVariantNumeric: 'tabular-nums' }}>
        {value < 0 ? '−' : ''}{money(fmt, value)}
      </span>
    </div>
  );
}

function LineGroup({ label, rows, legacyNote, emptyNote, fmt, busy, onRemove, adder }: { label: string; rows: { id: string; left: string; amount: number }[]; legacyNote?: string; emptyNote?: string; fmt: Intl.NumberFormat; busy: boolean; onRemove: (id: string) => void; adder: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 0 4px' }}>
      <div className="lp-label-caps" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)', marginBottom: 3 }}>{label}</div>
      {legacyNote ? <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic', marginBottom: 2 }}>{legacyNote}</div> : null}
      {rows.length === 0 && !legacyNote && emptyNote ? (
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-tertiary)', marginBottom: 3 }}>{emptyNote}</div>
      ) : null}
      {rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.5px 0' }}>
          <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.left}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="lp-mono" style={{ fontSize: 13, color: 'var(--color-lp-error)', fontVariantNumeric: 'tabular-nums' }}>−{money(fmt, r.amount)}</span>
            <button type="button" disabled={busy} onClick={() => onRemove(r.id)} title="Remove" style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 4 }}>{adder}</div>
    </div>
  );
}

const addBtnStyle: React.CSSProperties = { fontSize: 'var(--lp-text-xs)', fontWeight: 600, color: 'var(--color-lp-orange)', background: 'transparent', border: 0, cursor: 'pointer', padding: 0 };
const inputStyle: React.CSSProperties = { fontSize: 13, background: 'var(--lp-bg)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '5px 9px', color: 'var(--lp-text)' };

/* Field components (migration 262) — labels above inputs, same grammar as the
   income deal slide-over's Sel/Num. Blank commits null (clears the field). */

const fieldLabelStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--lp-text-tertiary)' };
const fieldInputStyle: React.CSSProperties = { ...inputStyle, width: '100%', fontFamily: 'var(--lp-font-numeric)', textAlign: 'right' };

function Num({ label, value, disabled, onCommit }: { label: string; value: number | null; disabled: boolean; onCommit: (v: number | null) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <input
        key={`${label}:${value ?? ''}`}
        type="number"
        inputMode="decimal"
        defaultValue={value ?? ''}
        disabled={disabled}
        placeholder="—"
        onBlur={(e) => {
          if (e.target.value === String(value ?? '')) return;
          onCommit(e.target.value.trim() === '' ? null : Number(e.target.value) || 0);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={fieldInputStyle}
      />
    </label>
  );
}

function Sel({ label, value, options, labels, disabled, onPick }: { label: string; value: string; options: string[]; labels?: Record<string, string>; disabled: boolean; onPick: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onPick(e.target.value)} style={{ ...fieldInputStyle, textAlign: 'left', fontFamily: 'inherit' }}>
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );
}

/* Catch-up batch (spec §3) — settle the backlog of past-unsettled shows at
   their CONTRACTED guarantee via the EXISTING settlement endpoint, one POST per
   show, SEQUENTIALLY — so the income cascade runs per show with zero new money
   code. Nothing is written until the explicit "Settle N shows" click. */
function CatchUpPanel({ shows, fmt, onDone }: { shows: ShowWalk[]; fmt: Intl.NumberFormat; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [fullFinal, setFullFinal] = useState(true); // default ON
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const allChecked = shows.length > 0 && shows.every((s) => checked.has(s.routingId));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const running = progress != null;
  const n = checked.size;

  async function run() {
    const targets = shows.filter((s) => checked.has(s.routingId));
    if (targets.length === 0) return;
    setProgress({ done: 0, total: targets.length });
    try {
      // SEQUENTIAL on purpose: the route's income cascade runs per show.
      for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        await fetch('/api/budget/settlement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routing_id: s.routingId,
            reconciled_guarantee: s.contractedGuarantee ?? 0,
            status: 'reconciled',
            ...(fullFinal ? { full_and_final: true } : {}),
          }),
        });
        setProgress({ done: i + 1, total: targets.length });
      }
    } finally {
      setProgress(null);
      setChecked(new Set());
      onDone();
    }
  }

  return (
    <div style={{ borderRadius: 'var(--lp-radius-lg)', border: `1px solid color-mix(in srgb, ${HUE_DUE} 40%, var(--lp-border))`, background: 'var(--lp-panel)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 16px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 700, color: 'var(--lp-text)' }}>
          Catch up — {shows.length} past show{shows.length === 1 ? '' : 's'} not settled
        </span>
        <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>{open ? 'Hide ▴' : 'Settle at contracted ▾'}</span>
      </button>
      {open ? (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--lp-text-xs)', fontWeight: 600, color: 'var(--lp-text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allChecked}
              disabled={running}
              onChange={() => setChecked(allChecked ? new Set() : new Set(shows.map((s) => s.routingId)))}
              style={{ accentColor: 'var(--lp-orange)' }}
            />
            Select all
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
            {shows.map((s) => (
              <label key={s.routingId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checked.has(s.routingId)}
                  disabled={running}
                  onChange={() => toggle(s.routingId)}
                  style={{ accentColor: 'var(--lp-orange)' }}
                />
                <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{s.date ?? '—'}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.city || s.venue_name || 'Show'}</span>
                <span className="lp-mono" style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text)' }}>
                  {fmt.format(s.contractedGuarantee ?? 0)} gtd
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--lp-text-xs)', fontWeight: 600, color: 'var(--lp-text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={fullFinal} disabled={running} onChange={(e) => setFullFinal(e.target.checked)} style={{ accentColor: 'var(--lp-orange)' }} />
              mark Full &amp; Final
            </label>
            <button
              type="button"
              disabled={running || n === 0}
              onClick={() => void run()}
              className="btn-transition"
              style={{
                padding: '6px 14px', fontSize: 'var(--lp-text-xs)', fontWeight: 700, cursor: running || n === 0 ? 'default' : 'pointer',
                borderRadius: 'var(--lp-radius-md)', border: `1px solid ${HUE_DUE}`,
                background: n > 0 && !running ? HUE_DUE : 'transparent',
                color: n > 0 && !running ? 'var(--lp-text-inverse, #fff)' : 'var(--lp-text-tertiary)',
              }}
            >
              {progress ? `Settling ${progress.done}/${progress.total}…` : `Settle ${n} show${n === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeductionAdder({ busy, onAdd }: { busy: boolean; onAdd: (f: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>('withholding');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  if (!open) return <button type="button" style={addBtnStyle} onClick={() => setOpen(true)}>+ Add deduction</button>;
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
      <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
        {DEDUCTION_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
      </select>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" style={{ ...inputStyle, width: 120 }} />
      <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
      <button type="button" disabled={busy || !Number(amount)} style={addBtnStyle} onClick={() => { onAdd({ kind, label: label.trim() || null, amount: Number(amount) }); setOpen(false); setLabel(''); setAmount(''); }}>Add</button>
      <button type="button" style={{ ...addBtnStyle, color: 'var(--lp-text-tertiary)' }} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function LabelAmountAdder({ busy, placeholder, onAdd }: { busy: boolean; placeholder: string; onAdd: (f: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  if (!open) return <button type="button" style={addBtnStyle} onClick={() => setOpen(true)}>+ Add {placeholder.toLowerCase()}</button>;
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, width: 140 }} />
      <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
      <button type="button" disabled={busy || !Number(amount)} style={addBtnStyle} onClick={() => { onAdd({ label: label.trim() || null, amount: Number(amount) }); setOpen(false); setLabel(''); setAmount(''); }}>Add</button>
      <button type="button" style={{ ...addBtnStyle, color: 'var(--lp-text-tertiary)' }} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function PaymentAdder({ busy, onAdd }: { busy: boolean; onAdd: (f: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>('wire');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  if (!open) return <button type="button" style={addBtnStyle} onClick={() => setOpen(true)}>+ Log payment</button>;
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
      <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
      </select>
      <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
      <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} style={inputStyle} />
      <button type="button" disabled={busy || !Number(amount)} style={addBtnStyle} onClick={() => { onAdd({ method, amount: Number(amount), paid_on: paidOn || null }); setOpen(false); setAmount(''); setPaidOn(''); }}>Add</button>
      <button type="button" style={{ ...addBtnStyle, color: 'var(--lp-text-tertiary)' }} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

async function exportPdf(routingId: string, label: string) {
  const res = await fetch('/api/budget/settlement/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routing_id: routingId }),
  });
  if (!res.ok) { alert('Export failed'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${label} — Settlement.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function kindLabel(k: string): string {
  return ({ withholding: 'Withholding', tax: 'Tax', venue_cost: 'Venue cost', commission: 'Commission', other: 'Other', facility_fee: 'Facility fee', ticket_fees: 'Ticket fees', cc_fees: 'CC fees' } as Record<string, string>)[k] ?? k;
}
function methodLabel(m: string): string {
  return ({ wire: 'Wire', check: 'Check', cash: 'Cash', ach: 'ACH' } as Record<string, string>)[m] ?? m;
}
