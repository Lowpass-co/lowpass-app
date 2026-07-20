'use client';

/* ============================================
   LOWPASS — <SettlementWalkClient> (M1-B, the arena flip)

   Left: the shows list / catch-up queue (past shows not Full & Final are flagged).
   Right: the selected show's WALK — Guarantee → deductions → Adjusted gross →
   expenses → Show net → +overage +merch → Artist total → −deposit → Balance due →
   −payments → Outstanding. Mono numerics, 18px key totals, 11px caps labels,
   negatives red (hue budget). Itemized rows persist via /api/budget/settlement/lines;
   guarantee/overage/merch/deposit + Full & Final via /api/budget/settlement. On any
   deductions change we push Σ into reconciled_deductions so the income cascade
   carries it unchanged.
   ============================================ */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { computeWalk } from '@/lib/settlement/walk';
import type { ShowWalk } from '@/lib/settlement/loadWalk';

const DEDUCTION_KINDS = ['withholding', 'tax', 'venue_cost', 'commission', 'other'] as const;
const PAYMENT_METHODS = ['wire', 'check', 'cash', 'ach'] as const;

export function SettlementWalkClient({
  tourId,
  currency,
  shows,
}: {
  tourId: string;
  currency: string;
  shows: ShowWalk[];
}) {
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
   *  carries the itemized total unchanged. `excludeId` drops a just-removed row. */
  async function pushDeductionSum(show: ShowWalk, _sid: string, excludeId?: string) {
    const sum = show.deductions.filter((d) => d.id !== excludeId).reduce((n, d) => n + d.amount, 0);
    await post('/api/budget/settlement', { routing_id: show.routingId, reconciled_deductions: sum });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 'var(--lp-space-4)', minHeight: 0 }}>
      {/* Shows list / catch-up queue */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', padding: '0 2px 2px' }}>
          Shows
        </div>
        {shows.length === 0 ? (
          <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>No shows to settle yet.</p>
        ) : (
          shows.map((s) => {
            const isSel = s.routingId === selectedId;
            const unsettled = s.date != null && s.date < today && !s.fullAndFinal;
            return (
              <button
                key={s.routingId}
                type="button"
                onClick={() => setSelectedId(s.routingId)}
                className="btn-transition flex items-center justify-between"
                style={{
                  gap: 8,
                  padding: '8px 10px',
                  textAlign: 'left',
                  background: isSel ? 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)' : 'var(--lp-surface)',
                  border: `1px solid ${isSel ? 'var(--color-lp-orange)' : unsettled ? 'color-mix(in srgb, var(--color-lp-warning) 40%, transparent)' : 'var(--lp-border-subtle)'}`,
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.city || s.venue_name || 'Show'}
                  </span>
                  <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{s.date ?? '—'}</span>
                </span>
                {s.fullAndFinal ? (
                  <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--color-lp-status-complete)' }}>Settled</span>
                ) : unsettled ? (
                  <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--color-lp-warning)' }}>Due</span>
                ) : null}
              </button>
            );
          })
        )}
      </aside>

      {/* Walk panel */}
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

  return (
    <section
      style={{
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
        background: 'var(--lp-panel)',
        padding: 'var(--lp-space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-2)',
      }}
    >
      <header className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
            {show.city || show.venue_name || 'Show'}
          </div>
          <div className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{show.date ?? '—'}</div>
        </div>
        <div className="flex items-center" style={{ gap: 'var(--lp-space-3)' }}>
          <button
            type="button"
            data-testid="settlement-export-pdf"
            data-routing-id={show.routingId}
            onClick={() => void exportPdf(show.routingId, show.city || show.venue_name || 'Show')}
            className="btn-transition"
            style={{ padding: '4px 10px', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', background: 'transparent', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' }}
            title="Download this show's settlement as a PDF"
          >
            Export PDF
          </button>
          <label className="flex items-center" style={{ gap: 6, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={show.fullAndFinal} disabled={busy} onChange={(e) => onSaveGrain({ full_and_final: e.target.checked, status: 'reconciled' })} />
            Full &amp; Final
          </label>
        </div>
      </header>

      {/* Guarantee */}
      <MoneyInput label="Guarantee" value={show.guarantee} fmt={fmt} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_guarantee: v })} />

      {/* Deductions */}
      <LineGroup
        label="Deductions"
        rows={show.deductions.map((d) => ({ id: d.id, left: kindLabel(d.kind) + (d.label ? ` · ${d.label}` : ''), amount: -d.amount }))}
        legacyNote={show.deductionsAreLegacy ? 'Legacy value — add itemized lines to break it out' : undefined}
        fmt={fmt}
        busy={busy}
        onRemove={(id) => onRemoveLine('deduction', id)}
        adder={<DeductionAdder busy={busy} onAdd={(f) => onAddLine('deduction', f)} />}
      />
      <Subtotal label="Adjusted gross" value={walk.adjustedGross} fmt={fmt} />

      {/* Expenses */}
      <LineGroup
        label="Show expenses"
        rows={show.expenses.map((e) => ({ id: e.id, left: e.label || 'Expense', amount: -e.amount }))}
        fmt={fmt}
        busy={busy}
        onRemove={(id) => onRemoveLine('expense', id)}
        adder={<LabelAmountAdder busy={busy} placeholder="Expense" onAdd={(f) => onAddLine('expense', f)} />}
      />
      <Subtotal label="Show net" value={walk.showNet} fmt={fmt} />

      <MoneyInput label="Overage / bonus" value={show.overage} fmt={fmt} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_overage: v })} sign="+" />
      <MoneyInput label="Merch" value={show.merch} fmt={fmt} disabled={busy} onCommit={(v) => onSaveGrain({ reconciled_merch: v })} sign="+" />
      <Total label="Artist total" value={walk.artistTotal} fmt={fmt} />

      <MoneyInput label="Deposit received" value={show.depositReceived} fmt={fmt} disabled={busy} onCommit={(v) => onSaveGrain({ deposit_received: v })} sign="−" />
      <Total label="Balance due" value={walk.balanceDue} fmt={fmt} />

      {/* Payments */}
      <LineGroup
        label="Payments"
        rows={show.payments.map((p) => ({ id: p.id, left: methodLabel(p.method) + (p.paid_on ? ` · ${p.paid_on}` : ''), amount: -p.amount }))}
        fmt={fmt}
        busy={busy}
        onRemove={(id) => onRemoveLine('payment', id)}
        adder={<PaymentAdder busy={busy} onAdd={(f) => onAddLine('payment', f)} />}
      />
      <Total label="Outstanding" value={walk.outstanding} fmt={fmt} emphatic />
    </section>
  );
}

/* -------- primitives -------- */

function walkLegacy(show: ShowWalk): number {
  // The synthetic legacy deduction amount = artistTotal-implied; recomputed here
  // only for the local pre-refresh walk (loadWalk supplies the real value server-side).
  return show.walk.deductionsTotal;
}

function money(fmt: Intl.NumberFormat, n: number) {
  return fmt.format(Math.abs(n));
}

function RowShell({ label, right, strong }: { label: React.ReactNode; right: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '3px 0', borderTop: strong ? '1px solid var(--lp-border-subtle)' : undefined }}>
      <span className="lp-label-caps" style={{ fontSize: 11, color: 'var(--lp-text-secondary)' }}>{label}</span>
      {right}
    </div>
  );
}

function MoneyInput({ label, value, fmt, disabled, onCommit, sign }: { label: string; value: number; fmt: Intl.NumberFormat; disabled: boolean; onCommit: (v: number) => void; sign?: '+' | '−' }) {
  const [v, setV] = useState(String(value || ''));
  return (
    <RowShell
      label={sign ? `${sign} ${label}` : label}
      right={
        <input
          value={v}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { const n = Number(v) || 0; if (n !== value) onCommit(n); }}
          className="lp-mono"
          style={{ width: 130, textAlign: 'right', fontSize: 14, background: 'var(--lp-surface)', border: '1px solid var(--lp-border-strong)', borderRadius: 6, padding: '3px 8px', color: 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}
          placeholder={fmt.format(0)}
        />
      }
    />
  );
}

function Subtotal({ label, value, fmt }: { label: string; value: number; fmt: Intl.NumberFormat }) {
  return (
    <RowShell
      strong
      label={label}
      right={<span className="lp-mono" style={{ fontSize: 14, color: value < 0 ? 'var(--color-lp-error)' : 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}>{value < 0 ? '−' : ''}{money(fmt, value)}</span>}
    />
  );
}

function Total({ label, value, fmt, emphatic }: { label: string; value: number; fmt: Intl.NumberFormat; emphatic?: boolean }) {
  return (
    <RowShell
      strong
      label={<span style={{ fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>{label}</span>}
      right={<span className="lp-mono" style={{ fontSize: 18, fontWeight: 'var(--lp-weight-bold)', color: value < 0 ? 'var(--color-lp-error)' : emphatic ? 'var(--color-lp-orange)' : 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}>{value < 0 ? '−' : ''}{money(fmt, value)}</span>}
    />
  );
}

function LineGroup({ label, rows, legacyNote, fmt, busy, onRemove, adder }: { label: string; rows: { id: string; left: string; amount: number }[]; legacyNote?: string; fmt: Intl.NumberFormat; busy: boolean; onRemove: (id: string) => void; adder: React.ReactNode }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <div className="lp-label-caps" style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginBottom: 2 }}>{label}</div>
      {rows.length === 0 && !legacyNote ? null : null}
      {legacyNote ? <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic', marginBottom: 2 }}>{legacyNote}</div> : null}
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between" style={{ padding: '2px 0' }}>
          <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.left}</span>
          <span className="flex items-center" style={{ gap: 8 }}>
            <span className="lp-mono" style={{ fontSize: 13, color: 'var(--color-lp-error)', fontVariantNumeric: 'tabular-nums' }}>−{money(fmt, r.amount)}</span>
            <button type="button" disabled={busy} onClick={() => onRemove(r.id)} title="Remove" style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 4 }}>{adder}</div>
    </div>
  );
}

const addBtnStyle: React.CSSProperties = { fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-orange)', background: 'transparent', border: 0, cursor: 'pointer', padding: 0 };
const inputStyle: React.CSSProperties = { fontSize: 13, background: 'var(--lp-surface)', border: '1px solid var(--lp-border-strong)', borderRadius: 6, padding: '3px 8px', color: 'var(--lp-text)' };

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
  return ({ withholding: 'Withholding', tax: 'Tax', venue_cost: 'Venue cost', commission: 'Commission', other: 'Other' } as Record<string, string>)[k] ?? k;
}
function methodLabel(m: string): string {
  return ({ wire: 'Wire', check: 'Check', cash: 'Cash', ach: 'ACH' } as Record<string, string>)[m] ?? m;
}
