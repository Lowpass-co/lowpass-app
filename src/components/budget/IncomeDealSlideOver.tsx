'use client';

/* ============================================
   LOWPASS — <IncomeDealSlideOver> (per-show deal editor · ATOM-bar redesign)

   Adam (2026-08-07): "make sure the slide out and settlement menu looks
   Modern and logical … ATOM does it nicely." The ATOM teardown's actual
   lessons applied here:
     - colour is bound to MEANING: orange = contracted/forecast, green =
       settled, amber = manual/override — and each keeps its hue everywhere;
     - money reads as a LEDGER, not a form: the contracted maths is a mono
       right-aligned waterfall (guarantee → −WH → +overage → +merch → +VIP →
       = Contracted), the exact reading order a settlement uses;
     - fields sit in card groups with a 2-col grid, labels above inputs;
     - the settled block is a distinct green-railed card with a real CTA to
       the walk, not a pile of rows.

   LOGIC IS UNCHANGED from the first cut: each field commits on blur/Enter as
   a single POST /api/budget/income { routing_id, <field> } — same names,
   same clamps, 423 → the parent's VersionLockModal, server-merged row pushed
   back up via onRowMerged. ƒ outputs keep the #28 override-flag semantics.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { IncomeRow } from '@/lib/budget/income';
import { useToast } from '@/components/ui/Toast';

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const postTax = (pre: number, wh: number) => pre * (1 - clamp(wh, 0, 100) / 100);

const DEAL_TYPES = ['VS', 'PLUS', 'FLAT'];
const PCT_FIELDS = new Set(['withholding_pct', 'est_sell_thru', 'deal_pct', 'deal_pct_above', 'merch_fee_pct']);

/* Meaning-bound hues (ATOM lesson: one hue per meaning, kept everywhere). */
const HUE_CONTRACTED = 'var(--lp-orange)';
const HUE_SETTLED = 'var(--color-lp-status-complete)';
const HUE_MANUAL = 'var(--color-lp-warning)';

export function IncomeDealSlideOver({
  tourId,
  row,
  currencyOptions,
  nativeCurrency,
  versionLocked,
  onLockedEdit,
  onRowMerged,
  onClose,
}: {
  tourId: string;
  row: IncomeRow;
  currencyOptions: string[];
  nativeCurrency: string;
  versionLocked: boolean;
  onLockedEdit: () => void;
  onRowMerged: (routingId: string, merged: Partial<IncomeRow>) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = useCallback(
    async (patch: Record<string, unknown>, isProposed: boolean) => {
      if (isProposed && versionLocked) {
        onLockedEdit();
        return;
      }
      try {
        const res = await fetch('/api/budget/income', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: row.routing_id, ...patch }),
        });
        if (res.status === 423) {
          onLockedEdit();
          return;
        }
        if (!res.ok) {
          showToast('Could not save', 'error');
          return;
        }
        const merged = (await res.json().catch(() => null)) as Partial<IncomeRow> | null;
        if (merged) onRowMerged(row.routing_id, merged);
      } catch {
        showToast('Could not save', 'error');
      }
    },
    [row.routing_id, versionLocked, onLockedEdit, onRowMerged, showToast],
  );

  const commitNumber = useCallback(
    (field: string, raw: string, isProposed = true) => {
      const v = raw.trim() === '' ? null : num(raw);
      const value = v == null ? null : PCT_FIELDS.has(field) ? clamp(v, 0, 100) : v;
      void save({ [field]: value }, isProposed);
    },
    [save],
  );

  const setOverrideFlag = useCallback(
    (flag: 'overage_is_override' | 'merch_is_override' | 'vip_is_override', value: boolean) => {
      void save({ [flag]: value }, true);
    },
    [save],
  );

  const sym = useMemo(() => {
    const c = (row.currency || nativeCurrency).toUpperCase();
    return { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' }[c] ?? `${c} `;
  }, [row.currency, nativeCurrency]);
  const money = useCallback(
    (v: number | null | undefined): string => (v != null ? `${sym}${Math.round(v).toLocaleString('en-US')}` : '—'),
    [sym],
  );

  const gtdPost = postTax(num(row.pre_tax_guarantee), num(row.withholding_pct));
  const ovPost = postTax(num(row.pre_tax_overage), num(row.withholding_pct));
  const contracted = gtdPost + ovPost + num(row.merch_income) + num(row.vip_income);
  const hasSettled =
    row.actual_guarantee != null || row.actual_overage != null || row.actual_merch != null ||
    row.actual_vip != null || row.actual_deductions != null;
  const settled = hasSettled
    ? num(row.actual_guarantee) + num(row.actual_overage) + num(row.actual_merch) + num(row.actual_vip) - num(row.actual_deductions)
    : null;
  const isManual = row.actuals_source === 'manual';
  const statusChip = hasSettled
    ? isManual
      ? { label: 'MANUAL', hue: HUE_MANUAL }
      : { label: 'AUTO · SETTLEMENT', hue: HUE_SETTLED }
    : { label: 'NOT SETTLED', hue: 'var(--lp-text-tertiary)' };

  const body = (
    <div role="dialog" aria-label={`Deal — ${row.venue_name ?? row.date ?? 'show'}`} style={{ position: 'fixed', inset: 0, zIndex: 1200 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', opacity: mounted ? 1 : 0, transition: 'opacity 180ms ease' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(520px, 94vw)',
          background: 'var(--lp-bg)', borderLeft: '1px solid var(--lp-border-strong)',
          boxShadow: 'var(--lp-shadow-lg, -12px 0 32px rgba(0,0,0,0.35))',
          transform: mounted ? 'translateX(0)' : 'translateX(24px)', opacity: mounted ? 1 : 0,
          transition: 'transform 200ms ease, opacity 200ms ease',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* ── HERO: identity + status ── */}
        <div
          style={{
            padding: '18px 22px 14px',
            background: `linear-gradient(180deg, color-mix(in srgb, ${HUE_CONTRACTED} 9%, var(--lp-surface)) 0%, var(--lp-surface) 100%)`,
            borderBottom: '1px solid var(--lp-border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)', marginBottom: 2 }}>
                {row.date ?? ''}{row.city ? ` · ${row.city}` : ''}
              </div>
              <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--lp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.venue_name || 'Untitled show'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                style={{
                  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em', padding: '4px 9px',
                  borderRadius: 'var(--lp-radius-full)', color: statusChip.hue,
                  border: `1px solid color-mix(in srgb, ${statusChip.hue} 45%, transparent)`,
                  background: `color-mix(in srgb, ${statusChip.hue} 10%, transparent)`,
                }}
              >
                {statusChip.label}
              </span>
              <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* KPI band — hairline-divided triplet, mono numerals. */}
          <div style={{ display: 'flex', marginTop: 14, borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', background: 'var(--lp-panel)', overflow: 'hidden' }}>
            <Kpi label="Contracted" value={money(contracted)} hue={HUE_CONTRACTED} />
            <Kpi label="Settled" value={settled != null ? money(settled) : '—'} hue={HUE_SETTLED} divider />
            <Kpi
              label="Variance"
              value={settled != null ? `${settled - contracted >= 0 ? '+' : '−'}${money(Math.abs(settled - contracted)).replace('—', '0')}` : '—'}
              hue={settled == null ? 'var(--lp-text-tertiary)' : settled - contracted >= 0 ? HUE_SETTLED : 'var(--color-lp-error)'}
              divider
            />
          </div>
          {versionLocked ? (
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: HUE_MANUAL }}>Viewing a locked version — deal fields are read-only.</p>
          ) : null}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── THE DEAL ── */}
          <Card title="The deal" hue={HUE_CONTRACTED}>
            <FieldGrid>
              <Sel label="Currency" value={(row.currency || nativeCurrency).toUpperCase()} options={currencyOptions}
                onPick={(v) => void save({ currency: v === nativeCurrency.toUpperCase() ? null : v }, true)} />
              <Sel label="Deal type" value={row.deal_type ?? ''} options={['', ...DEAL_TYPES]} labels={{ '': '—' }}
                hint="VS auto-projects overage · PLUS is manual · FLAT has no backend"
                onPick={(v) => void save({ deal_type: v || null }, true)} />
              <Num label="Deal %" field="deal_pct" value={row.deal_pct} onCommit={commitNumber} />
              <Num label="Tier @ (tix)" field="deal_threshold" value={row.deal_threshold} onCommit={commitNumber} />
              <Num label="Tier rate %" field="deal_pct_above" value={row.deal_pct_above} onCommit={commitNumber} />
              <Num label={`Guarantee ${sym.trim()}`} field="pre_tax_guarantee" value={row.pre_tax_guarantee} onCommit={commitNumber} />
              <Num label="Withholding %" field="withholding_pct" value={row.withholding_pct} onCommit={commitNumber} />
            </FieldGrid>
          </Card>

          {/* ── BOX OFFICE / MERCH / VIP inputs ── */}
          <Card title="Projection inputs" hue={HUE_CONTRACTED}>
            <FieldGrid>
              <Num label="Capacity" field="capacity" value={row.capacity} onCommit={commitNumber} />
              <Num label="Sell-through %" field="est_sell_thru" value={row.est_sell_thru} onCommit={commitNumber} hint="Blank inherits the tour default" />
              <Num label={`Face value ${sym.trim()}`} field="face_value" value={row.face_value} onCommit={commitNumber} />
              <Num label="$/head (merch)" field="dollars_per_head" value={row.dollars_per_head} onCommit={commitNumber} hint="Blank inherits the tour default" />
              <Num label="Merch fee %" field="merch_fee_pct" value={row.merch_fee_pct} onCommit={commitNumber} />
              <Num label="VIP tickets" field="vip_tickets" value={row.vip_tickets} onCommit={commitNumber} />
              <Num label={`VIP price ${sym.trim()}`} field="vip_price" value={row.vip_price} onCommit={commitNumber} />
            </FieldGrid>
          </Card>

          {/* ── THE MATHS — contracted waterfall ledger ── */}
          <Card title="Contracted — the maths" hue={HUE_CONTRACTED}>
            <Ledger>
              <LRow label="Guarantee" value={money(row.pre_tax_guarantee)} />
              <LRow label={`− withholding ${num(row.withholding_pct)}%`} value={money(gtdPost)} sub="post-tax guarantee" />
              <LRow
                label="＋ Overage ƒ" value={money(row.pre_tax_overage)}
                overridden={!!row.overage_is_override}
                onOverride={(on) => setOverrideFlag('overage_is_override', on)}
                editField="pre_tax_overage" editValue={row.pre_tax_overage} onCommit={commitNumber}
              />
              <LRow
                label="＋ Merch ƒ" value={money(row.merch_income)}
                overridden={!!row.merch_is_override}
                onOverride={(on) => setOverrideFlag('merch_is_override', on)}
                editField="merch_income" editValue={row.merch_income} onCommit={commitNumber}
              />
              <LRow
                label="＋ VIP ƒ" value={money(row.vip_income)}
                overridden={!!row.vip_is_override}
                onOverride={(on) => setOverrideFlag('vip_is_override', on)}
                editField="vip_income" editValue={row.vip_income} onCommit={commitNumber}
              />
              <LTotal label="Contracted" value={money(contracted)} hue={HUE_CONTRACTED} />
            </Ledger>
            <p style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--lp-text-tertiary)' }}>
              ƒ = computed by the projection engine. Override to hand-enter; revert to recompute.
            </p>
          </Card>

          {/* ── SETTLED — walk-authoritative ledger ── */}
          <Card title="Settled" hue={HUE_SETTLED} chip={statusChip}>
            {hasSettled ? (
              <Ledger>
                <LRow label="Guarantee" value={money(row.actual_guarantee)} />
                <LRow label="＋ Overage" value={money(row.actual_overage)} />
                <LRow label="＋ Merch" value={money(row.actual_merch)} />
                <LRow label="＋ VIP" value={money(row.actual_vip)} />
                <LRow label="− Deductions" value={money(row.actual_deductions)} />
                <LTotal label="Settled net" value={money(settled)} hue={HUE_SETTLED} />
                <LRow label="Tickets · Cap · Gross" value={`${row.actual_tickets_sold ?? '—'} · ${row.actual_capacity ?? '—'} · ${money(row.actual_gross)}`} sub="box-office context" />
              </Ledger>
            ) : (
              /* ATOM lesson: an empty state is an invitation with a next action. */
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--lp-text-secondary)' }}>
                Nothing settled yet. When this show settles, the walk&apos;s figures land here automatically — and this card goes green.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Link
                href={`/budget/${tourId}/settlement`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                  padding: '7px 14px', borderRadius: 'var(--lp-radius-md)', fontSize: 12.5, fontWeight: 700,
                  background: HUE_SETTLED, color: 'var(--lp-text-inverse, #fff)',
                }}
              >
                Open the settlement walk →
              </Link>
              {!overrideOpen ? (
                <button
                  type="button"
                  onClick={() => setOverrideOpen(true)}
                  style={{ border: '1px solid var(--lp-border-strong)', background: 'transparent', color: 'var(--lp-text-secondary)', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  Manual override…
                </button>
              ) : null}
            </div>

            {overrideOpen ? (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 'var(--lp-radius-md)', border: `1px solid color-mix(in srgb, ${HUE_MANUAL} 40%, transparent)`, background: `color-mix(in srgb, ${HUE_MANUAL} 6%, transparent)`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--lp-text-secondary)' }}>
                  Overriding marks this show <strong style={{ color: HUE_MANUAL }}>Manual</strong> — the settlement cascade stops writing these until you settle it again from the walk.
                </p>
                <FieldGrid>
                  <Num label="Guarantee" field="actual_guarantee" value={row.actual_guarantee} onCommit={(f, v) => commitNumber(f, v, false)} />
                  <Num label="Overage" field="actual_overage" value={row.actual_overage} onCommit={(f, v) => commitNumber(f, v, false)} />
                  <Num label="Merch" field="actual_merch" value={row.actual_merch} onCommit={(f, v) => commitNumber(f, v, false)} />
                  <Num label="Tickets sold" field="actual_tickets_sold" value={row.actual_tickets_sold} onCommit={(f, v) => commitNumber(f, v, false)} />
                  <Num label="Settled capacity" field="actual_capacity" value={row.actual_capacity} onCommit={(f, v) => commitNumber(f, v, false)} />
                  <Num label="Gross box office" field="actual_gross" value={row.actual_gross} onCommit={(f, v) => commitNumber(f, v, false)} />
                </FieldGrid>
                <button type="button" onClick={() => setOverrideOpen(false)} style={{ alignSelf: 'flex-end', border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', fontSize: 12, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

/* ── building blocks ───────────────────────────────────────────────── */

function Kpi({ label, value, hue, divider }: { label: string; value: string; hue: string; divider?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '10px 14px', borderLeft: divider ? '1px solid var(--lp-border)' : 'none' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 750, fontFamily: 'var(--lp-font-numeric)', letterSpacing: '-0.01em', color: hue, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Card({ title, hue, chip, children }: { title: string; hue: string; chip?: { label: string; hue: string }; children: React.ReactNode }) {
  return (
    <section
      style={{
        borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border)', background: 'var(--lp-panel)',
        borderLeft: `3px solid color-mix(in srgb, ${hue} 65%, transparent)`, padding: '12px 16px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--lp-text-secondary)' }}>{title}</h3>
        {chip ? (
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.07em', padding: '2px 8px', borderRadius: 'var(--lp-radius-full)', color: chip.hue, border: `1px solid color-mix(in srgb, ${chip.hue} 45%, transparent)` }}>
            {chip.label}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 9px',
  fontSize: 13, background: 'var(--lp-bg)', color: 'var(--lp-text)', width: '100%',
  fontFamily: 'var(--lp-font-numeric)', textAlign: 'right',
};

function Num({
  label, field, value, onCommit, hint,
}: {
  label: string; field: string; value: number | null | undefined;
  onCommit: (field: string, raw: string) => void; hint?: string;
}) {
  return (
    <label title={hint} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--lp-text-tertiary)', cursor: hint ? 'help' : undefined }}>{label}</span>
      <input
        key={`${field}:${value ?? ''}`}
        type="number"
        inputMode="decimal"
        defaultValue={value ?? ''}
        placeholder="—"
        onBlur={(e) => { if (e.target.value !== String(value ?? '')) onCommit(field, e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={inputStyle}
      />
    </label>
  );
}

function Sel({
  label, value, options, labels, onPick, hint,
}: {
  label: string; value: string; options: string[]; labels?: Record<string, string>;
  onPick: (v: string) => void; hint?: string;
}) {
  return (
    <label title={hint} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--lp-text-tertiary)', cursor: hint ? 'help' : undefined }}>{label}</span>
      {/* 2026-08-07 native control kill: .lp-select supplies background-color,
          padding (with chevron clearance) and the chevron itself — inputStyle's
          `background` shorthand / `padding` are dropped so they can't wipe it. */}
      <select value={value} onChange={(e) => onPick(e.target.value.toUpperCase())} className="lp-select" style={{ ...inputStyle, background: undefined, padding: undefined, textAlign: 'left', fontFamily: 'inherit' }}>
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );
}

/* Ledger: the settlement reading order — labels left, mono figures right,
   hairline rules, one emphatic total. */
function Ledger({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

function LRow({
  label, value, sub, overridden, onOverride, editField, editValue, onCommit,
}: {
  label: string; value: string; sub?: string;
  overridden?: boolean; onOverride?: (on: boolean) => void;
  editField?: string; editValue?: number | null; onCommit?: (field: string, raw: string) => void;
}) {
  const editable = !!(overridden && editField && onCommit);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4.5px 0', borderBottom: '1px solid var(--lp-border-subtle, var(--lp-border))' }}>
      <span style={{ fontSize: 12, color: 'var(--lp-text-secondary)', display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        {label}
        {sub ? <span style={{ fontSize: 10, color: 'var(--lp-text-tertiary)' }}>{sub}</span> : null}
        {overridden ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: HUE_MANUAL }}>OVERRIDE</span> : null}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {editable ? (
          <input
            key={`${editField}:${editValue ?? ''}`}
            type="number"
            inputMode="decimal"
            defaultValue={editValue ?? ''}
            onBlur={(e) => { if (e.target.value !== String(editValue ?? '')) onCommit!(editField!, e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ ...inputStyle, width: 110 }}
          />
        ) : (
          <span style={{ fontSize: 13, fontFamily: 'var(--lp-font-numeric)', fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text)' }}>{value}</span>
        )}
        {onOverride ? (
          <button
            type="button"
            onClick={() => onOverride(!overridden)}
            title={overridden ? 'Revert to the formula (recomputes from the inputs)' : 'Stop tracking the formula and hand-enter this value'}
            style={{ border: '1px solid var(--lp-border)', background: 'transparent', color: 'var(--lp-text-tertiary)', borderRadius: 'var(--lp-radius-sm)', padding: '1.5px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            {overridden ? 'Revert' : 'ƒ'}
          </button>
        ) : null}
      </span>
    </div>
  );
}

function LTotal({ label, value, hue }: { label: string; value: string; hue: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0 2px', borderTop: `2px solid color-mix(in srgb, ${hue} 55%, transparent)`, marginTop: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: hue }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 750, fontFamily: 'var(--lp-font-numeric)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: hue }}>{value}</span>
    </div>
  );
}
