'use client';

/* ============================================
   LOWPASS — <ShowDealCard>: the show's ONE deal = EXPECTED (Nov 2026, Adam)

   The only place a deal is typed. Every field saves on blur through the
   page (onSave → ShowMoneyClient.saveIncome: shown at once, one save queue
   per show, 423 → the version-lock modal); the server's merged row lays the
   engine's outputs back on.

   The overage / merch / VIP lines are worked out by the projection engine
   (src/lib/budget/incomeProjection.ts) from the deal and the projection
   inputs. Guarantee plus %: the overage is typed (saved with
   overage_is_override so a guarantee edit can't zero it). Each worked-out
   line can still be typed over ("Type it") and handed back ("Work it out").
   ============================================ */

import { useState } from 'react';
import type { IncomeRow } from '@/lib/budget/income';
import { DEAL_TYPES, normaliseDealType, isPercentageDeal } from '@/lib/income/deal';
import type { Expected } from '@/lib/income/showMoney';
import { Card, FieldGrid, LinkButton, NumField, NumInput, SelField, fmtMoney, moneyFormat } from './moneyUi';

const PCT_FIELDS = new Set(['withholding_pct', 'est_sell_thru', 'deal_pct', 'deal_pct_above', 'merch_fee_pct']);
type OverrideFlag = 'overage_is_override' | 'merch_is_override' | 'vip_is_override';

export function ShowDealCard({
  row,
  expected,
  currency,
  tourCurrency,
  currencyOptions,
  versionLocked,
  onLockedEdit,
  onSave,
}: {
  row: IncomeRow | null;
  expected: Expected;
  currency: string;
  tourCurrency: string;
  currencyOptions: string[];
  versionLocked: boolean;
  onLockedEdit: () => void;
  /** The page applies it at once and saves behind (ShowMoneyClient). */
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const fmt = moneyFormat(currency);
  const dealType = normaliseDealType(row?.deal_type);

  const save = (patch: Record<string, unknown>) => {
    if (versionLocked) {
      onLockedEdit();
      return;
    }
    onSave(patch);
  };

  const num = (field: string) => (v: number | null) => {
    const value = v == null ? null : PCT_FIELDS.has(field) ? Math.max(0, Math.min(100, v)) : v;
    save({ [field]: value });
  };
  const typeOver = (field: string, flag: OverrideFlag) => (v: number | null) => save({ [field]: v ?? 0, [flag]: true });

  const pctDeal = isPercentageDeal(dealType);
  const hasPct = pctDeal || dealType === 'PLUS';

  return (
    <Card
      title="Deal — expected"
      hint="What this show should pay. Typed once here; the settlement reads it."
    >
      <FieldGrid>
        <SelField
          label="Deal"
          value={dealType ?? ''}
          options={[{ value: '', label: '— Not set' }, ...DEAL_TYPES.map((d) => ({ value: d.value, label: d.label }))]}
          hint={DEAL_TYPES.find((d) => d.value === dealType)?.help}
          onPick={(v) => save({ deal_type: v || null })}
        />
        <SelField
          label="Currency"
          value={currency}
          options={currencyOptions.map((c) => ({ value: c, label: c === tourCurrency ? `${c} (tour)` : c }))}
          onPick={(v) => save({ currency: v === tourCurrency ? null : v })}
        />
        <NumField label="Guarantee" currency={currency} value={row?.pre_tax_guarantee ?? null} onCommit={num('pre_tax_guarantee')} />
        <NumField label="Withholding" kind="pct" value={row?.withholding_pct ?? null} onCommit={num('withholding_pct')} />
        {hasPct ? (
          <>
            <NumField label={dealType === 'DOOR' ? 'Door %' : 'Deal %'} kind="pct" value={row?.deal_pct ?? null} onCommit={num('deal_pct')} />
            {/* The escalator — one rule for Expected and Actual (tieredShare). */}
            <div className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-1)' }} title="Only the tickets above this count earn the higher %.">
              <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>Higher % above N tickets</span>
              <span className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
                <NumInput ariaLabel="Escalator tickets" kind="count" value={row?.deal_threshold ?? null} onCommit={num('deal_threshold')} placeholder="tickets" />
                <span className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-xs)' }}>at</span>
                <NumInput ariaLabel="Escalator %" kind="pct" value={row?.deal_pct_above ?? null} onCommit={num('deal_pct_above')} placeholder="%" />
              </span>
            </div>
          </>
        ) : null}
        <NumField label="Capacity" kind="count" value={row?.capacity ?? null} onCommit={num('capacity')} />
        <NumField label="Ticket price" currency={currency} value={row?.face_value ?? null} onCommit={num('face_value')} />
      </FieldGrid>

      <div style={{ marginTop: 'var(--lp-space-3)' }}>
        <LinkButton muted onClick={() => setMoreOpen((o) => !o)}>
          {moreOpen ? '▾ Projection inputs' : '▸ Projection inputs (sell-through, merch, VIP)'}
        </LinkButton>
        {moreOpen ? (
          <div style={{ marginTop: 'var(--lp-space-2)' }}>
            <FieldGrid cols={3}>
              <NumField label="Sell-through" kind="pct" value={row?.est_sell_thru ?? null} onCommit={num('est_sell_thru')} placeholder="Tour default" />
              <NumField label="Merch per head" currency={currency} value={row?.dollars_per_head ?? null} onCommit={num('dollars_per_head')} placeholder="Tour default" />
              <NumField label="Merch fee" kind="pct" value={row?.merch_fee_pct ?? null} onCommit={num('merch_fee_pct')} placeholder="Tour default" />
              <NumField label="VIP tickets" kind="count" value={row?.vip_tickets ?? null} onCommit={num('vip_tickets')} />
              <NumField label="VIP price" currency={currency} value={row?.vip_price ?? null} onCommit={num('vip_price')} />
            </FieldGrid>
          </div>
        ) : null}
      </div>

      {/* The expected maths, in settlement reading order. */}
      <div style={{ marginTop: 'var(--lp-space-4)', borderTop: '1px solid var(--lp-border)', paddingTop: 'var(--lp-space-2)' }}>
        <Line label="Guarantee" value={fmtMoney(fmt, expected.guarantee)} />
        <WorkedLine
          label={dealType === 'PLUS' ? '+ Overage (typed)' : '+ Overage'}
          value={expected.overage}
          fmt={fmt}
          typed={dealType === 'PLUS' || !!row?.overage_is_override}
          canWorkOut={pctDeal}
          onType={typeOver('pre_tax_overage', 'overage_is_override')}
          onWorkOut={() => save({ overage_is_override: false })}
          canType={dealType !== 'FLAT'}
          note={dealType === 'FLAT' ? 'none on a flat guarantee' : !dealType ? 'set the deal' : undefined}
        />
        {expected.withholding ? <Line label={`− Withholding ${expected.withholdingPct}%`} value={fmtMoney(fmt, -expected.withholding)} /> : null}
        <WorkedLine
          label="+ Merch"
          value={expected.merch}
          fmt={fmt}
          typed={!!row?.merch_is_override}
          canWorkOut
          onType={typeOver('merch_income', 'merch_is_override')}
          onWorkOut={() => save({ merch_is_override: false })}
        />
        <Line label="= Settlement should come to" value={fmtMoney(fmt, expected.settlementTotal)} strong />
        <WorkedLine
          label="+ VIP (paid separately)"
          value={expected.vip}
          fmt={fmt}
          typed={!!row?.vip_is_override}
          canWorkOut
          onType={typeOver('vip_income', 'vip_is_override')}
          onWorkOut={() => save({ vip_is_override: false })}
        />
        <Line label="= Expected income" value={fmtMoney(fmt, expected.total)} strong />
      </div>
      {versionLocked ? (
        <p className="text-lp-text-secondary" style={{ margin: 'var(--lp-space-2) 0 0', fontSize: 'var(--lp-text-xs)' }}>
          You’re viewing a locked budget version — the deal is read-only here.
        </p>
      ) : null}
    </Card>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) 0' }}>
      <span className={strong ? 'text-lp-text' : 'text-lp-text-secondary'} style={{ fontSize: 'var(--lp-text-sm)', fontWeight: strong ? 'var(--lp-weight-semibold)' : undefined }}>
        {label}
      </span>
      <span className="lp-mono text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: strong ? 'var(--lp-weight-semibold)' : undefined }}>
        {value}
      </span>
    </div>
  );
}

/** A line the engine works out — or that's typed over. */
function WorkedLine({
  label,
  value,
  fmt,
  typed,
  canWorkOut,
  onType,
  onWorkOut,
  note,
  canType = true,
}: {
  label: string;
  value: number;
  fmt: Intl.NumberFormat;
  typed: boolean;
  canWorkOut: boolean;
  onType: (v: number | null) => void;
  onWorkOut: () => void;
  note?: string;
  canType?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const showInput = typed || editing;
  return (
    <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) 0' }}>
      <span className="text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-sm)' }}>
        {label}
        {note ? <span className="text-lp-text-tertiary"> · {note}</span> : null}
      </span>
      <span className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
        {showInput ? (
          <NumInput ariaLabel={label} currency={fmt.resolvedOptions().currency ?? 'GBP'} zeroIsBlank={false} value={value} onCommit={(v) => { onType(v); setEditing(false); }} width="8.5rem" />
        ) : (
          <span className="lp-mono text-lp-text" style={{ fontSize: 'var(--lp-text-sm)' }}>{fmtMoney(fmt, value)}</span>
        )}
        {typed && canWorkOut ? (
          <LinkButton muted onClick={onWorkOut}>Work it out</LinkButton>
        ) : !showInput && canType ? (
          <LinkButton muted onClick={() => setEditing(true)}>Type it</LinkButton>
        ) : null}
      </span>
    </div>
  );
}
