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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IncomeRow } from '@/lib/budget/income';
import type { ShowWalk } from '@/lib/settlement/loadWalk';
import { applySettlementPatch, blankWalk, buildShowList, defaultShowId, NEEDS_YOU, recomputeWalk, STATUS_LABEL, statusSummary, type ShowMoneyRow, type ShowStatus } from '@/lib/income/showMoney';
import { createSaveQueue } from '@/lib/income/saveQueue';
import { dealLabel } from '@/lib/income/deal';
import { useToast } from '@/components/ui/Toast';
import { VersionLockModal } from '@/components/budget/versioning/VersionLockModal';
import type { BudgetVersionVm, VersionStatus } from '@/components/budget/versioning/versionApi';
import { Button, Chip, HUE_ACTUAL, HUE_BAD, HUE_NEEDS, LinkButton, fmtMoney, moneyFormat } from './moneyUi';
import { ShowDealCard } from './ShowDealCard';
import { ShowNightCard, ShowPaymentCard, liveWalk, type LineType, type NightHandlers } from './ShowNightCard';
import type { SettlementDeduction, SettlementExpense, SettlementPayment } from '@/lib/settlement/loadWalk';

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
  const [lockOpen, setLockOpen] = useState(false);
  const [income, setIncome] = useState<IncomeRow[]>(initialIncome);
  const [walkState, setWalkState] = useState<ShowWalk[]>(walks);
  // A server refresh (Catch up, an error) brings the server's rows back.
  // (State-from-props, React's documented pattern — no effect.)
  const [seen, setSeen] = useState({ initialIncome, walks });
  if (seen.initialIncome !== initialIncome || seen.walks !== walks) {
    setSeen({ initialIncome, walks });
    setIncome(initialIncome);
    setWalkState(walks);
  }

  /* Saves (Nov 2026, Adam: "data entry is super slow… if I edit before the
     new thing displays, it overwrites it"). An edit changes the page AT
     ONCE; the save goes out behind it through ONE queue per show (in order,
     edits made meanwhile folded into the next save — saveQueue.ts). Nothing
     waits for, or reloads, the whole page. walksRef is the same list as
     walkState, kept in step synchronously so a queued save (deduction
     totals, the settlement id) reads what's on screen now. */
  const walksRef = useRef<ShowWalk[]>(walks);
  useEffect(() => {
    walksRef.current = walks;
  }, [walks]);
  const realIds = useRef(new Map<string, string>());
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [queue] = useState(() => createSaveQueue((n) => setSaving(n)));

  const native = (tourCurrency || 'GBP').toUpperCase();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const rows = useMemo(() => buildShowList(income, walkState, native, today), [income, walkState, native, today]);
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

  function updateWalk(show: ShowMoneyRow, fn: (w: ShowWalk) => ShowWalk) {
    const prev = walksRef.current;
    const i = prev.findIndex((w) => w.routingId === show.routingId);
    const cur = i >= 0 ? prev[i] : blankWalk({ ...show, venue: show.venue });
    const next = i >= 0 ? prev.map((w, j) => (j === i ? fn(cur) : w)) : [...prev, fn(cur)];
    walksRef.current = next;
    setWalkState(next);
  }
  const walkOf = (routingId: string) => walksRef.current.find((w) => w.routingId === routingId) ?? null;

  /** A save failed: say so and put the page back to what the server has. */
  const fail = (e: unknown) => {
    if (e instanceof LockedError) return;
    setSaveError(true);
    showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    router.refresh();
  };

  async function send(url: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 423) {
      setLockOpen(true);
      throw new LockedError();
    }
    if (!res.ok) throw new Error((j.error as string | undefined) ?? 'Could not save');
    setSaveError(false);
    return j;
  }

  /** The deal (and Actual VIP) — budget_income. */
  function saveIncome(routingId: string, patch: Record<string, unknown>) {
    onMerged(routingId, patch as Partial<IncomeRow>);
    queue
      .patch(routingId, 'income', patch, async (all) => {
        const row = await send('/api/budget/income', { routing_id: routingId, ...all });
        // The server's row (engine outputs: overage, merch, VIP) with any
        // edit typed since laid back on top.
        onMerged(routingId, { ...(row as Partial<IncomeRow>), ...((queue.pending(routingId, 'income') ?? {}) as Partial<IncomeRow>) });
      })
      .catch(fail);
  }

  /** Inside a queued task: the settlement's id, made first if needed. */
  async function settlementIdFor(show: ShowMoneyRow): Promise<string> {
    const have = walkOf(show.routingId)?.settlementId;
    if (have) return have;
    const row = await send('/api/budget/settlement', { routing_id: show.routingId });
    const id = row.id as string | undefined;
    if (!id) throw new Error('Could not start the settlement');
    updateWalk(show, (w) => ({ ...w, settlementId: id }));
    return id;
  }

  /** Inside a queued task: Σ itemised deductions (as on screen) →
   *  reconciled_deductions, so the settlement carries the itemised total to
   *  the income row (ALL kinds, box-office fees included). */
  async function pushDeductionSum(show: ShowMoneyRow) {
    const sum = (walkOf(show.routingId)?.deductions ?? []).reduce((n, d) => n + d.amount, 0);
    await send('/api/budget/settlement', { routing_id: show.routingId, reconciled_deductions: sum });
  }

  const handlers = (show: ShowMoneyRow): NightHandlers => ({
    onSave: (patch) => {
      updateWalk(show, (w) => applySettlementPatch(w, patch));
      queue
        .patch(show.routingId, 'settlement', patch, async (all) => {
          const row = await send('/api/budget/settlement', { routing_id: show.routingId, ...all });
          const id = row.id as string | undefined;
          if (id) updateWalk(show, (w) => (w.settlementId ? w : { ...w, settlementId: id }));
        })
        .catch(fail);
    },
    onAddLine: (type: LineType, fields) => {
      const tmp = `tmp-${crypto.randomUUID()}`;
      updateWalk(show, (w) => recomputeWalk(addLine(w, type, tmp, fields)));
      queue
        .run(show.routingId, async () => {
          const sid = await settlementIdFor(show);
          const row = await send('/api/budget/settlement/lines', { type, settlement_id: sid, ...fields });
          const id = row.id as string;
          realIds.current.set(tmp, id);
          updateWalk(show, (w) => renameLine(w, type, tmp, id));
          if (type === 'deduction') await pushDeductionSum(show);
        })
        .catch(fail);
    },
    onRemoveLine: (type: LineType, id) => {
      updateWalk(show, (w) => recomputeWalk(dropLine(w, type, id)));
      queue
        .run(show.routingId, async () => {
          // A line still being added has a stand-in id; its add ran first.
          const real = id.startsWith('tmp-') ? realIds.current.get(id) : id;
          if (real) await send('/api/budget/settlement/lines', { type, id: real }, 'DELETE');
          if (type === 'deduction') await pushDeductionSum(show);
        })
        .catch(fail);
    },
    onSaveVip: (v) => saveIncome(show.routingId, { actual_vip: v }),
  });

  const toSettle = rows.filter((r) => r.status === 'to_settle');

  return (
    <section className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-4)' }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--lp-space-3)' }}>
        <p className="text-lp-text" style={{ margin: 0, fontSize: 'var(--lp-text-sm)' }} data-testid="show-money-summary">
          {statusSummary(rows)}
        </p>
        <span className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-3)' }}>
          <SaveState saving={saving > 0} error={saveError} />
          <Legend />
        </span>
      </div>

      {toSettle.length > 0 ? <CatchUp shows={toSettle} onDone={() => router.refresh()} /> : null}

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
              onSaveDeal={(patch) => saveIncome(selected.routingId, patch)}
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

class LockedError extends Error {}

/* Lines on the local walk (ids: a stand-in `tmp-…` until the save returns). */
function addLine(w: ShowWalk, type: LineType, id: string, f: Record<string, unknown>): ShowWalk {
  const amount = Number(f.amount) || 0;
  if (type === 'deduction') {
    const d: SettlementDeduction = { id, kind: String(f.kind ?? 'other'), label: (f.label as string | null) ?? null, amount, currency: null };
    return { ...w, deductions: [...w.deductions, d], deductionsAreLegacy: false };
  }
  if (type === 'expense') {
    const x: SettlementExpense = { id, label: (f.label as string | null) ?? null, amount, currency: null };
    return { ...w, expenses: [...w.expenses, x] };
  }
  const p: SettlementPayment = { id, method: String(f.method ?? 'wire'), amount, currency: null, paid_on: (f.paid_on as string | null) ?? null, note: null };
  return { ...w, payments: [...w.payments, p] };
}
function renameLine(w: ShowWalk, type: LineType, from: string, to: string): ShowWalk {
  const re = <T extends { id: string }>(xs: T[]) => xs.map((x) => (x.id === from ? { ...x, id: to } : x));
  if (type === 'deduction') return { ...w, deductions: re(w.deductions) };
  if (type === 'expense') return { ...w, expenses: re(w.expenses) };
  return { ...w, payments: re(w.payments) };
}
function dropLine(w: ShowWalk, type: LineType, id: string): ShowWalk {
  const rm = <T extends { id: string }>(xs: T[]) => xs.filter((x) => x.id !== id);
  if (type === 'deduction') return { ...w, deductions: rm(w.deductions) };
  if (type === 'expense') return { ...w, expenses: rm(w.expenses) };
  return { ...w, payments: rm(w.payments) };
}

function SaveState({ saving, error }: { saving: boolean; error: boolean }) {
  const [shown, setShown] = useState<'saving' | 'saved' | null>(null);
  const [was, setWas] = useState(saving);
  if (was !== saving) {
    setWas(saving);
    setShown(saving ? 'saving' : 'saved');
  }
  useEffect(() => {
    if (shown !== 'saved') return;
    const t = window.setTimeout(() => setShown(null), 2000);
    return () => window.clearTimeout(t);
  }, [shown]);
  const text = error && !saving ? 'Not saved' : shown === 'saving' ? 'Saving…' : shown === 'saved' ? 'Saved' : '';
  return (
    <span
      role="status"
      aria-live="polite"
      className="lp-mono"
      style={{ fontSize: 'var(--lp-text-xs)', minWidth: '4.5rem', textAlign: 'right', color: error && !saving ? HUE_BAD : 'var(--lp-text-tertiary)' }}
    >
      {text}
    </span>
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
  onSaveDeal,
  h,
}: {
  show: ShowMoneyRow;
  tourCurrency: string;
  currencyOptions: string[];
  versionLocked: boolean;
  onLockedEdit: () => void;
  onSaveDeal: (patch: Record<string, unknown>) => void;
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
          row={show.income}
          expected={show.expected}
          currency={show.currency}
          tourCurrency={tourCurrency}
          currencyOptions={currencyOptions}
          versionLocked={versionLocked}
          onLockedEdit={onLockedEdit}
          onSave={onSaveDeal}
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
