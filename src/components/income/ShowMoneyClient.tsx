'use client';

/* ============================================
   LOWPASS — Income & settlements: ONE page (Nov 2026, Adam — "Option B")

   It used to be two pages behind a switch in the far corner, with the deal
   typed on both (two vocabularies, stored apart), actual money typable in two
   places (the settlement AND Income's "Manual override", which silently cut
   the settlement off), and a show nobody had touched showing a green $0.

   Now: every show on the left; the picked show on the right —
     Deal — expected     (the ONE deal; the only place it's typed)
     On the night — actual   (the settlement; the only place actual money is typed)
     Payment             (deposit, payments, still owed)
   Rules: src/lib/income/showMoney.ts. The picked show is in the URL (?show=).
   ============================================ */

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { IncomeRow } from '@/lib/budget/income';
import type { ShowWalk } from '@/lib/settlement/loadWalk';
import { buildShowList, defaultShowId, NEEDS_YOU, STATUS_LABEL, statusSummary, type ShowMoneyRow, type ShowStatus } from '@/lib/income/showMoney';
import { dealLabel } from '@/lib/income/deal';
import { useToast } from '@/components/ui/Toast';
import { VersionLockModal } from '@/components/budget/versioning/VersionLockModal';
import type { BudgetVersionVm, VersionStatus } from '@/components/budget/versioning/versionApi';
import { Button, Chip, HUE_ACTUAL, HUE_NEEDS, LinkButton, fmtMoney, moneyFormat } from './moneyUi';
import { ShowDealCard } from './ShowDealCard';
import { ShowNightCard, ShowPaymentCard, liveWalk, type LineType, type NightHandlers } from './ShowNightCard';

const STD_CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'NZD', 'MXN'];

const statusHue = (s: ShowStatus) => (s === 'settled' ? HUE_ACTUAL : NEEDS_YOU.has(s) ? HUE_NEEDS : 'var(--lp-text-tertiary)');

function shortDate(iso: string | null): string {
  if (!iso) return 'No date';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function ShowMoneyClient({
  tourId,
  tourCurrency,
  initialIncome,
  walks,
  fxRates,
  initialShowId,
  versionLocked,
  lockedVersionId,
  canApprove,
  viewedStatus,
  draftVersionId,
  versions,
}: {
  tourId: string;
  tourCurrency: string;
  initialIncome: IncomeRow[];
  walks: ShowWalk[];
  fxRates: Record<string, number>;
  initialShowId: string | null;
  versionLocked: boolean;
  lockedVersionId: string | null;
  canApprove: boolean;
  viewedStatus: VersionStatus;
  draftVersionId: string | null;
  versions: BudgetVersionVm[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [income, setIncome] = useState<IncomeRow[]>(initialIncome);
  // A server refresh (after a settlement save) brings new income rows too —
  // the settlement carries actuals onto them. (State-from-props, React's
  // documented pattern — no effect.)
  const [seenIncome, setSeenIncome] = useState(initialIncome);
  if (seenIncome !== initialIncome) {
    setSeenIncome(initialIncome);
    setIncome(initialIncome);
  }

  const native = (tourCurrency || 'GBP').toUpperCase();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const rows = useMemo(() => buildShowList(income, walks, native, today), [income, walks, native, today]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialShowId && rows.some((r) => r.routingId === initialShowId) ? initialShowId : defaultShowId(rows),
  );
  const selected = rows.find((r) => r.routingId === selectedId) ?? rows[0] ?? null;

  const pick = (id: string) => {
    setSelectedId(id);
    // Keep the picked show in the URL (shareable, survives reload) without a
    // server round-trip.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('show', id);
      window.history.replaceState(window.history.state, '', u.toString());
    } catch {
      /* ignore */
    }
  };

  const currencyOptions = useMemo(
    () => Array.from(new Set([native, ...STD_CURRENCIES, ...Object.keys(fxRates).map((c) => c.toUpperCase())])),
    [native, fxRates],
  );

  const onMerged = useCallback((routingId: string, merged: Partial<IncomeRow>) => {
    setIncome((prev) => {
      const i = prev.findIndex((r) => r.routing_id === routingId);
      if (i < 0) return [...prev, { ...(merged as IncomeRow), routing_id: routingId }];
      const next = [...prev];
      next[i] = { ...next[i], ...merged, routing_id: routingId };
      return next;
    });
  }, []);

  const refresh = () => startTransition(() => router.refresh());

  async function post(url: string, body: unknown, method = 'POST') {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error ?? 'Could not save');
      return j as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  }

  async function ensureSettlement(show: ShowMoneyRow): Promise<string | null> {
    if (show.walk?.settlementId) return show.walk.settlementId;
    const row = await post('/api/budget/settlement', { routing_id: show.routingId });
    return (row?.id as string | undefined) ?? null;
  }

  /** Σ itemized deductions → reconciled_deductions, so the settlement carries
   *  the itemized total to the income row (unchanged money invariant: ALL
   *  kinds, box-office fees included). */
  async function pushDeductionSum(show: ShowMoneyRow, add: number, excludeId?: string) {
    const sum = (show.walk?.deductions ?? []).filter((d) => d.id !== excludeId).reduce((n, d) => n + d.amount, 0) + add;
    await post('/api/budget/settlement', { routing_id: show.routingId, reconciled_deductions: sum });
  }

  const guard = (fn: () => Promise<void>) => () =>
    void fn()
      .then(refresh)
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Could not save', 'error'));

  const handlers = (show: ShowMoneyRow): NightHandlers => ({
    busy: busy || pending,
    onSave: (patch) => guard(async () => void (await post('/api/budget/settlement', { routing_id: show.routingId, ...patch })))(),
    onAddLine: (type: LineType, fields) =>
      guard(async () => {
        const sid = await ensureSettlement(show);
        if (!sid) throw new Error('Could not start the settlement');
        await post('/api/budget/settlement/lines', { type, settlement_id: sid, ...fields });
        if (type === 'deduction') await pushDeductionSum(show, Number(fields.amount) || 0);
      })(),
    onRemoveLine: (type: LineType, id) =>
      guard(async () => {
        await post('/api/budget/settlement/lines', { type, id }, 'DELETE');
        if (type === 'deduction') await pushDeductionSum(show, 0, id);
      })(),
    onSaveVip: (v) =>
      guard(async () => {
        const merged = await post('/api/budget/income', { routing_id: show.routingId, actual_vip: v });
        onMerged(show.routingId, merged as Partial<IncomeRow>);
      })(),
  });

  const toSettle = rows.filter((r) => r.status === 'to_settle');

  return (
    <section className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-4)' }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--lp-space-3)' }}>
        <p className="text-lp-text" style={{ margin: 0, fontSize: 'var(--lp-text-sm)' }} data-testid="show-money-summary">
          {statusSummary(rows)}
        </p>
        <Legend />
      </div>

      {toSettle.length > 0 ? <CatchUp shows={toSettle} onDone={refresh} /> : null}

      {rows.length === 0 ? (
        <p className="text-lp-text-secondary" style={{ fontSize: 'var(--lp-text-sm)' }}>
          No shows on this tour yet — show days in Dates &amp; routing appear here.
        </p>
      ) : (
        <div className="grid min-w-0" style={{ gridTemplateColumns: 'minmax(15rem, 20rem) minmax(0, 1fr)', gap: 'var(--lp-space-4)', alignItems: 'start' }}>
          <ShowList rows={rows} selectedId={selected?.routingId ?? null} onPick={pick} />
          {selected ? (
            <ShowPanel
              key={selected.routingId}
              show={selected}
              tourCurrency={native}
              currencyOptions={currencyOptions}
              versionLocked={versionLocked}
              onLockedEdit={() => setLockOpen(true)}
              onMerged={onMerged}
              h={handlers(selected)}
            />
          ) : null}
        </div>
      )}

      <VersionLockModal
        open={lockOpen}
        versionId={lockedVersionId}
        canApprove={canApprove}
        tourId={tourId}
        viewedStatus={viewedStatus}
        draftVersionId={draftVersionId}
        versions={versions}
        onClose={() => setLockOpen(false)}
      />
    </section>
  );
}

function Legend() {
  const dot = (c: string) => <span aria-hidden style={{ width: 'var(--lp-space-2)', height: 'var(--lp-space-2)', borderRadius: 'var(--lp-radius-full)', background: c, display: 'inline-block' }} />;
  return (
    <span className="flex flex-wrap items-center text-lp-text-secondary" style={{ gap: 'var(--lp-space-3)', fontSize: 'var(--lp-text-xs)' }}>
      <span className="flex items-center" style={{ gap: 'var(--lp-space-1)' }}>{dot('var(--lp-text-tertiary)')} Expected = the deal</span>
      <span className="flex items-center" style={{ gap: 'var(--lp-space-1)' }}>{dot(HUE_ACTUAL)} Actual = the night</span>
      <span className="flex items-center" style={{ gap: 'var(--lp-space-1)' }}>{dot(HUE_NEEDS)} Needs you</span>
    </span>
  );
}

function ShowList({ rows, selectedId, onPick }: { rows: ShowMoneyRow[]; selectedId: string | null; onPick: (id: string) => void }) {
  return (
    <nav aria-label="Shows" className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-1)' }}>
      {rows.map((r) => {
        const on = r.routingId === selectedId;
        const fmt = moneyFormat(r.currency);
        const walk = liveWalk(r);
        const figure = r.status === 'settled' || r.status === 'awaiting_payment' || r.status === 'in_progress' ? walk?.artistTotal ?? 0 : r.expected.settlementTotal;
        const figureIsActual = r.status !== 'upcoming' && r.status !== 'to_settle';
        return (
          <button
            key={r.routingId}
            type="button"
            onClick={() => onPick(r.routingId)}
            aria-current={on ? 'true' : undefined}
            className="btn-transition flex min-w-0 items-center justify-between rounded-md text-left"
            style={{
              gap: 'var(--lp-space-2)',
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              cursor: 'pointer',
              background: on ? 'var(--color-lp-surface-hover)' : 'var(--color-lp-surface)',
              border: `1px solid ${on ? 'var(--lp-border-strong)' : 'var(--lp-border)'}`,
              borderLeft: `3px solid ${statusHue(r.status)}`,
            }}
          >
            <span className="min-w-0">
              <span className="block truncate text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)' }}>
                {r.city || r.venue || 'Show'}
              </span>
              <span className="block truncate text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-xs)' }}>
                {shortDate(r.date)}
                {r.venue && r.city ? ` · ${r.venue}` : ''}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end" style={{ gap: 'var(--lp-space-1)' }}>
              <span className="lp-mono" style={{ fontSize: 'var(--lp-text-xs)', color: figureIsActual ? HUE_ACTUAL : 'var(--lp-text-secondary)' }}>
                {fmtMoney(fmt, figure)}
              </span>
              <Chip label={STATUS_LABEL[r.status]} hue={statusHue(r.status)} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ShowPanel({
  show,
  tourCurrency,
  currencyOptions,
  versionLocked,
  onLockedEdit,
  onMerged,
  h,
}: {
  show: ShowMoneyRow;
  tourCurrency: string;
  currencyOptions: string[];
  versionLocked: boolean;
  onLockedEdit: () => void;
  onMerged: (routingId: string, merged: Partial<IncomeRow>) => void;
  h: NightHandlers;
}) {
  const fmt = moneyFormat(show.currency);
  const walk = liveWalk(show);
  const actualTyped = show.status !== 'upcoming' && show.status !== 'to_settle';
  const ff = !!show.walk?.fullAndFinal;
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-4)' }}>
      <header className="rounded-lg border border-lp-border bg-lp-surface" style={{ padding: 'var(--lp-space-4)' }}>
        <div className="flex flex-wrap items-start justify-between" style={{ gap: 'var(--lp-space-3)' }}>
          <div className="min-w-0">
            <div className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-xs)' }}>
              {shortDate(show.date)}
              {show.venue && show.city ? ` · ${show.venue}` : ''} · {dealLabel(show.income?.deal_type)}
            </div>
            <h2 className="text-lp-text" style={{ margin: 0, fontSize: 'var(--lp-text-xl)', fontWeight: 'var(--lp-weight-semibold)' }}>
              {show.city || show.venue || 'Show'}
            </h2>
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-2)' }}>
            <Chip label={STATUS_LABEL[show.status]} hue={statusHue(show.status)} />
            <Button onClick={() => void exportPdf(show.routingId, show.city || show.venue || 'Show')} title="Download this show's settlement as a PDF">
              Export PDF
            </Button>
            <Button
              primary={ff ? HUE_ACTUAL : undefined}
              disabled={h.busy}
              onClick={() => h.onSave(ff ? { full_and_final: false, status: 'pending' } : { full_and_final: true, status: 'reconciled' })}
              title={ff ? 'Reopen this settlement' : 'The settlement is agreed and final'}
            >
              {ff ? '✓ Full & final' : 'Mark full & final'}
            </Button>
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--lp-space-3)', marginTop: 'var(--lp-space-3)' }}>
          <Figure label="Expected" value={fmtMoney(fmt, show.expected.settlementTotal)} sub="from the deal" />
          <Figure label="Actual" value={actualTyped && walk ? fmtMoney(fmt, walk.artistTotal) : '—'} sub={actualTyped ? 'artist total' : 'not typed yet'} color={actualTyped ? HUE_ACTUAL : undefined} />
          <Figure
            label="Still owed"
            value={actualTyped && walk ? fmtMoney(fmt, walk.outstanding) : '—'}
            sub={actualTyped ? (walk && walk.outstanding > 0.005 ? 'after payments' : 'all paid') : ''}
            color={actualTyped && walk ? (walk.outstanding > 0.005 ? (ff ? HUE_NEEDS : undefined) : HUE_ACTUAL) : undefined}
          />
        </div>
      </header>

      <div className="grid min-w-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(26rem, 1fr))', gap: 'var(--lp-space-4)', alignItems: 'start' }}>
        <ShowDealCard
          routingId={show.routingId}
          row={show.income}
          expected={show.expected}
          currency={show.currency}
          tourCurrency={tourCurrency}
          currencyOptions={currencyOptions}
          versionLocked={versionLocked}
          onLockedEdit={onLockedEdit}
          onMerged={onMerged}
        />
        <div className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-4)' }}>
          <ShowNightCard show={show} h={h} />
          <ShowPaymentCard show={show} h={h} />
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-xs)' }}>{label}</div>
      <div className="lp-mono truncate" style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-semibold)', color: color ?? 'var(--lp-text)' }}>
        {value}
      </div>
      {sub ? <div className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-2xs)' }}>{sub}</div> : null}
    </div>
  );
}

/* Catch up — settle past shows nobody has touched at their deal's guarantee,
   one settlement POST per show, in order (the income carry runs per show).
   Nothing is written until "Settle N". */
function CatchUp({ shows, onDone }: { shows: ShowMoneyRow[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const n = checked.size;
  async function run() {
    const targets = shows.filter((s) => checked.has(s.routingId));
    setProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        await fetch('/api/budget/settlement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: s.routingId, reconciled_guarantee: s.expected.guarantee, status: 'reconciled', full_and_final: true }),
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
    <div className="rounded-lg border bg-lp-surface" style={{ borderColor: `color-mix(in srgb, ${HUE_NEEDS} 45%, var(--lp-border))`, padding: 'var(--lp-space-3) var(--lp-space-4)' }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--lp-space-2)' }}>
        <span className="text-lp-text" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)' }}>
          {shows.length} played show{shows.length === 1 ? '' : 's'} not settled yet
        </span>
        <LinkButton onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Settle at the guarantee…'}</LinkButton>
      </div>
      {open ? (
        <div className="flex flex-col" style={{ gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-2)' }}>
          <p className="text-lp-text-secondary" style={{ margin: 0, fontSize: 'var(--lp-text-xs)' }}>
            Marks each ticked show full &amp; final with its deal’s guarantee as the actual guarantee. Open a show to add anything else.
          </p>
          {shows.map((s) => (
            <label key={s.routingId} className="flex items-center text-lp-text-secondary" style={{ gap: 'var(--lp-space-2)', fontSize: 'var(--lp-text-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checked.has(s.routingId)}
                disabled={progress != null}
                onChange={() =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.routingId)) next.delete(s.routingId);
                    else next.add(s.routingId);
                    return next;
                  })
                }
              />
              <span>{shortDate(s.date)}</span>
              <span className="min-w-0 truncate">{s.city || s.venue || 'Show'}</span>
              <span className="lp-mono" style={{ marginLeft: 'auto' }}>{moneyFormat(s.currency).format(s.expected.guarantee)} guarantee</span>
            </label>
          ))}
          <div>
            <Button primary={n > 0 && !progress ? HUE_NEEDS : undefined} disabled={n === 0 || progress != null} onClick={() => void run()}>
              {progress ? `Settling ${progress.done}/${progress.total}…` : `Settle ${n} show${n === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function exportPdf(routingId: string, label: string) {
  const res = await fetch('/api/budget/settlement/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routing_id: routingId }),
  });
  if (!res.ok) return;
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
