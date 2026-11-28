/* ============================================
   LOWPASS — a rental job (Nov 2026 visual pass)

   One worksheet: the header says what the job is (status pill, one line of
   facts), "Add gear" is one search box, the lines are grouped by category
   with each group's subtotal, and the rail on the right carries every figure
   once — total, discount, week, currency. Pricing is priceQuote
   (src/lib/rental/quote.ts), the same function the jobs list and the PDF use.
   ============================================ */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FileDown, Package, Pencil, Trash2, X } from 'lucide-react';
import { jobDaysPerWeek, WEEK_CHOICES } from '@/lib/rental-pricing';
import { priceQuote, weekRuleText, type PricedLine } from '@/lib/rental/quote';
import { fmtRange, hireDays, type JobStatus } from '@/lib/rental/jobList';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { NumInput } from '@/components/income/moneyUi';
import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow, SectionHeader } from '@/components/spreadsheet-grid/types';
import { rentalApi, statusPatch } from './rentalApi';
import GearSlideOver from '@/components/entity/gear/GearSlideOver';
import { gearToStock } from '@/lib/rental/stockRow';
import { AddGear } from './AddGear';
import { Popover, StatusMenu, Thumb } from './rentalUi';
import { exportJobPdf, type PdfMode } from './exportJobPdf';
import {
  QUOTE_CURRENCIES, calcDays, fmtMoney, jobCurrency, fmtDate, resolveQuoteDisplay,
  type EquipmentArtistOption, type EquipmentTourOption,
  type RentalJob, type RentalInventoryItem, type RentalJobItem,
} from './types';

export type LinesUpdate = RentalJobItem[] | ((prev: RentalJobItem[]) => RentalJobItem[]);

export interface RentalSettingsView {
  daysPerWeek: number | null;
  quoteValidDays: number;
  paymentDetails: string | null;
}

interface Props {
  job: RentalJob;
  inventory: RentalInventoryItem[];
  artists: EquipmentArtistOption[];
  tours: EquipmentTourOption[];
  /** The job's lines as the page loaded them (refreshed on open). */
  lines: RentalJobItem[];
  onLinesChange: (jobId: string, next: LinesUpdate) => void;
  onBack: () => void;
  onEdit: () => void;
  /** Throws with the reason when the delete fails. */
  onDelete: () => Promise<void>;
  onJobUpdated: (job: RentalJob) => void;
  settings: RentalSettingsView;
  /** An item was just added to stock from this job. */
  onStockAdded: (item: RentalInventoryItem) => void;
}

export function JobDetail({ job, inventory, artists, tours, lines, onLinesChange, onBack, onEdit, onDelete, onJobUpdated, settings, onStockAdded }: Props) {
  const { showToast } = useToast();
  /** "Add 'X' to stock" from Add gear: the new-item panel, then onto the job. */
  const [newStock, setNewStock] = useState<{ text: string; qty: number } | null>(null);

  async function stockCreated(gearId: string) {
    const want = newStock;
    setNewStock(null);
    try {
      const res = await fetch(`/api/gear/${gearId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      onStockAdded(gearToStock((await res.json()) as Record<string, unknown>));
    } catch {
      showToast('It’s in your stock, but this page couldn’t load it — refresh to add it.', 'error');
      return;
    }
    await addGear(gearId, want?.qty ?? 1);
  }
  const setLines = useCallback((next: LinesUpdate) => onLinesChange(job.id, next), [job.id, onLinesChange]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* ── The quote's currency ──
     LIVE WHILE DRAFTING, FROZEN ON COMMIT. job.fx_rate is null for a draft, so
     the rate is re-fetched and the numbers move with the market — right while
     you are still quoting. The moment the job leaves 'draft' the rate it last
     showed is stamped onto the row (handleStatusChange): a client who accepted
     Tuesday's number must not open the same quote on Friday and find another. */
  const cur = jobCurrency(job);
  const isDraft = job.status === 'draft';
  /* The fetched rate remembers which currency it was for, so switching
     currency never shows the old rate (and the effect only sets state from
     the fetch's answer). */
  const [fetched, setFetched] = useState<{ cur: string; rate: number | null; at: string | null } | null>(null);
  const fresh = fetched && fetched.cur === cur ? fetched : null;
  const liveRate = cur === 'USD' ? 1 : fresh?.rate ?? null;
  const rateMissing = cur !== 'USD' && !!fresh && fresh.rate == null;
  const fxRate = !isDraft && job.fx_rate != null ? Number(job.fx_rate) : liveRate;
  const fxRateAt = !isDraft && job.fx_rate_at ? job.fx_rate_at : fresh?.at ?? null;

  useEffect(() => {
    /* A frozen job never re-fetches: that would silently re-price a signed
       document. */
    if (!isDraft || cur === 'USD') return;
    let cancelled = false;
    (async () => {
      let rate: number | null = null;
      let at: string | null = null;
      try {
        const res = await fetch(`/api/budget/exchange-rate?from=USD&to=${encodeURIComponent(cur)}`);
        const body = (await res.json()) as { rate?: number; fetched_at?: string };
        if (typeof body.rate === 'number') {
          rate = body.rate;
          at = body.fetched_at ?? new Date().toISOString();
        }
      } catch {
        /* Said on screen (rateMissing) rather than converting 1:1. */
      }
      if (!cancelled) setFetched({ cur, rate, at });
    })();
    return () => { cancelled = true; };
  }, [cur, isDraft]);

  const conv = useCallback((usd: number) => (fxRate == null ? usd : usd * fxRate), [fxRate]);
  /* R2-6 — every figure labels itself with dispCur, NOT cur: with no rate the
     numbers are still dollars and say so (resolveQuoteDisplay). */
  const { dispCur, converted } = resolveQuoteDisplay(cur, fxRate);
  const money = (usd: number) => fmtMoney(conv(usd), dispCur);

  /** Every job change goes to the server; the screen shows it at once and
   *  puts it back if the save fails (said, never swallowed). */
  async function saveJob(patch: Partial<RentalJob> & Record<string, unknown>, what: string): Promise<boolean> {
    const before = job;
    onJobUpdated({ ...job, ...patch } as RentalJob);
    try {
      const saved = await rentalApi.updateJob(job.id, patch);
      onJobUpdated({ ...before, ...saved });
      return true;
    } catch (e) {
      onJobUpdated(before);
      showToast(`Couldn’t save ${what}: ` + (e instanceof Error ? e.message : 'unknown error'), 'error');
      return false;
    }
  }

  const week = jobDaysPerWeek(job, settings.daysPerWeek);
  const days = calcDays(job.start_date, job.end_date, week);
  const onHire = hireDays(job.start_date, job.end_date);

  /* Fresh lines on open — the list's copy may be a page-load old. */
  useEffect(() => {
    let cancelled = false;
    rentalApi.lines(job.id).then(
      (items) => { if (!cancelled) setLines(items); },
      (e) => { if (!cancelled) showToast('Couldn’t load the lines: ' + (e instanceof Error ? e.message : 'unknown error'), 'error'); },
    );
    return () => { cancelled = true; };
  }, [job.id, setLines, showToast]);

  const quote = priceQuote({ lines, stock: inventory, days, discountPercent: job.discount_percent, discountFixed: job.discount_fixed });

  const artistLabel = job.artist?.name ?? artists.find((a) => a.id === job.artist_id)?.name ?? null;
  const tourLabel = job.tour?.name ?? tours.find((t) => t.id === job.tour_id)?.name ?? null;

  /* ── Lines ── */
  async function addGear(gearId: string, qty: number): Promise<boolean> {
    try {
      setLines(await rentalApi.addLines(job.id, [{ gear_id: gearId, quantity: qty, day_rate_override: null }]));
      return true;
    } catch (e) {
      showToast('Couldn’t add it: ' + (e instanceof Error ? e.message : 'unknown error'), 'error');
      return false;
    }
  }

  async function saveLine(lineId: string, patch: { quantity?: number; day_rate_override?: number | null }, what: string) {
    try {
      const saved = await rentalApi.updateLine(job.id, lineId, patch);
      setLines((prev) => prev.map((r) => (r.id === lineId ? saved : r)));
    } catch (e) {
      showToast(`Couldn’t save the ${what}: ` + (e instanceof Error ? e.message : 'unknown error'), 'error');
    }
  }

  /** Qty and rate are the writable cells. Rate arrives in the quote's
   *  currency and is stored in USD (the stock's unit) — or a GBP quote would
   *  write GBP into a USD column and the next switch would convert twice. */
  async function commitLineCell(rowId: string, columnId: string, value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (columnId === 'quantity') await saveLine(rowId, { quantity: Math.max(1, Math.round(n)) }, 'quantity');
    if (columnId === 'rate') await saveLine(rowId, { day_rate_override: fxRate ? n / fxRate : n }, 'rate');
  }

  async function removeLine(id: string) {
    try {
      await rentalApi.deleteLine(job.id, id);
      setLines((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      showToast('Couldn’t remove it: ' + (e instanceof Error ? e.message : 'unknown error'), 'error');
    }
  }

  type LineVm = PricedLine & { shownRate: number; shownTotal: number };
  const rows: GridRow<LineVm>[] = quote.lines.map((l) => ({
    id: l.id,
    data: { ...l, shownRate: conv(l.rate), shownTotal: conv(l.total) },
  }));
  const sectionHeaders: SectionHeader[] = quote.groups.map((g, i) => ({
    afterRowId: i === 0 ? null : quote.groups[i - 1].lines[quote.groups[i - 1].lines.length - 1].id,
    label: `${g.category} · ${money(g.subtotal)}`,
  }));

  const columns: GridColumn<LineVm>[] = [
    {
      id: 'thumb', header: '', accessor: 'imageUrl', width: 48, align: 'center',
      type: { kind: 'computed', render: (r) => <Thumb src={(r as LineVm).imageUrl} icon={<Package size={13} strokeWidth={1.75} aria-hidden />} /> },
    },
    {
      id: 'name', header: 'Item', accessor: 'name', flex: true, minWidth: 220,
      type: {
        kind: 'computed',
        render: (r) => {
          const l = r as LineVm;
          return (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-lp-text">{l.name}</span>
              {l.custom ? <span className="shrink-0 text-xs" style={{ color: 'var(--color-lp-warning)' }} title="This line’s rate isn’t the item’s own. Right-click to reset it.">custom rate</span> : null}
            </span>
          );
        },
      },
    },
    { id: 'quantity', header: 'Qty', accessor: 'quantity', type: { kind: 'number', min: 1, decimals: 0 }, width: 72, align: 'right' },
    { id: 'rate', header: 'Day rate', accessor: 'shownRate', type: { kind: 'currency', currency: dispCur }, width: 120, align: 'right' },
    {
      id: 'total', header: 'Total', accessor: 'shownTotal', width: 130, align: 'right',
      type: { kind: 'computed', render: (r) => <span className="tabular-nums text-lp-text">{fmtMoney((r as LineVm).shownTotal, dispCur)}</span> },
    },
    {
      /* A remove button you can see (Adam: "I need to be able to remove
         items from a job") — right-click has it too. */
      id: 'remove', header: '', accessor: 'id', width: 44, align: 'center', resizable: false,
      type: {
        kind: 'computed',
        render: (r) => (
          <button
            type="button"
            aria-label={`Remove ${(r as LineVm).name} from the job`}
            title="Remove from job"
            onClick={() => void removeLine((r as LineVm).id)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-[var(--color-lp-error)]"
          >
            <X size={14} aria-hidden />
          </button>
        ),
      },
    },
  ];

  /* ── Status ── Freeze the FX rate the first time this job leaves 'draft'.
     Never re-stamped: a later status change leaves the original rate alone. */
  async function handleStatusChange(next: JobStatus) {
    const known = isDraft && fxRate != null ? { rate: fxRate, at: fxRateAt ?? new Date().toISOString() } : null;
    await saveJob(await statusPatch(job, next, known), 'the status');
  }

  const facts = [
    job.client_name,
    [artistLabel, tourLabel].filter(Boolean).join(' / ') || null,
    fmtRange(job.start_date, job.end_date),
    onHire ? `${onHire} day${onHire === 1 ? '' : 's'} → ${days} billed` : `${days} billed`,
  ].filter(Boolean) as string[];

  const docLabel = job.status === 'invoiced' ? 'Invoice PDF' : job.status === 'completed' ? 'Receipt PDF' : 'Quote PDF';

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-lp-text-tertiary transition-colors hover:text-lp-text"
      >
        <ArrowLeft size={14} aria-hidden /> Rental jobs
      </button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="lp-page-title" style={{ margin: 0, color: 'var(--lp-text)' }}>{job.name}</h1>
            <StatusMenu status={job.status} onChange={(s) => void handleStatusChange(s)} />
          </div>
          <button
            type="button"
            onClick={onEdit}
            title={`Edit details · ${weekRuleText(week)}`}
            className="mt-1.5 text-left text-sm text-lp-text-secondary hover:text-lp-text"
          >
            {facts.join(' · ')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            label={docLabel}
            defaultPayment={job.status === 'invoiced'}
            hasPayment={!!settings.paymentDetails}
            onExport={async (mode, includePayment) => {
              try {
                await exportJobPdf({
                  job,
                  jobItems: lines,
                  inventory,
                  artistLabel,
                  tourLabel,
                  mode,
                  daysPerWeek: week,
                  validDays: settings.quoteValidDays,
                  paymentDetails: includePayment ? settings.paymentDetails : null,
                });
              } catch (err) {
                console.error('PDF export failed', err);
                showToast('The PDF didn’t export. Try again.', 'error');
              }
            }}
          />
          <ContextMenu
            items={[
              { label: 'Edit details', icon: Pencil, onClick: onEdit },
              { label: 'Delete job', icon: Trash2, variant: 'danger', onClick: () => setConfirmDelete(true) },
            ]}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <AddGear
            stock={inventory.filter((i) => i.status !== 'retired' || lines.some((l) => l.gear_id === i.id))}
            onJob={(gearId) => lines.filter((l) => l.gear_id === gearId).reduce((s, l) => s + (l.quantity || 0), 0)}
            conv={conv}
            currency={dispCur}
            onAdd={addGear}
            onAddToStock={(text, qty) => setNewStock({ text, qty })}
          />
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}>
            {rows.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm text-lp-text">Nothing on this job yet</p>
                <p className="mt-1 text-sm text-lp-text-tertiary">Search above to add gear. Type a number first to add several, like “8 sm58”.</p>
              </div>
            ) : (
              <SpreadsheetGrid<LineVm>
                columns={columns}
                rows={rows}
                sectionHeaders={sectionHeaders}
                ariaLabel="Lines on this job"
                columnWidthsKey="lp-cols-rental-lines"
                onCommitCell={commitLineCell}
                onRowDelete={(rowId) => void removeLine(rowId)}
                rowDeleteLabel="Remove from job"
                contextMenuItems={(row) => [
                  { id: 'more', label: 'One more', onSelect: () => void saveLine(row.id, { quantity: row.data.quantity + 1 }, 'quantity') },
                  ...(row.data.quantity > 1
                    ? [{ id: 'fewer', label: 'One fewer', onSelect: () => void saveLine(row.id, { quantity: row.data.quantity - 1 }, 'quantity') }]
                    : []),
                  ...(row.data.custom
                    ? [{ id: 'reset', label: 'Reset to the item’s rate', onSelect: () => void saveLine(row.id, { day_rate_override: null }, 'rate') }]
                    : []),
                ]}
                density="compact"
              />
            )}
          </div>
        </div>

        <aside className="self-start rounded-xl border p-5 lg:sticky lg:top-20" style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}>
          <div className="text-xs text-lp-text-tertiary">Total</div>
          <div className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight text-lp-text">{money(quote.total)}</div>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={money(quote.subtotal)} />
            {quote.discount > 0 ? <Row label="Discount" value={`−${money(quote.discount)}`} /> : null}
          </dl>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-lp-text-tertiary">Discount %</span>
              <NumInput
                ariaLabel="Discount percent"
                kind="pct"
                value={job.discount_percent}
                onCommit={(v) => void saveJob({ discount_percent: v ?? 0 }, 'the discount')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-lp-text-tertiary">Less (USD)</span>
              <NumInput
                ariaLabel="Fixed discount in USD"
                currency="USD"
                value={job.discount_fixed}
                onCommit={(v) => void saveJob({ discount_fixed: v ?? 0 }, 'the discount')}
              />
            </label>
          </div>

          <div className="mt-5 space-y-3 border-t pt-4" style={{ borderColor: 'var(--lp-border)' }}>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-lp-text-secondary">A week is</span>
              <select
                aria-label="A week is charged as"
                className="lp-select rounded-lg border px-2 py-1 text-sm"
                style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                value={job.days_per_week == null ? '' : String(Number(job.days_per_week))}
                onChange={(e) => void saveJob({ days_per_week: e.target.value === '' ? null : Number(e.target.value) }, 'the week')}
              >
                <option value="">{jobDaysPerWeek({}, settings.daysPerWeek)} days (yours)</option>
                {WEEK_CHOICES.map((n) => (
                  <option key={n} value={String(n)}>{n === 7 ? '7 days (no week rate)' : `${n} days`}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-lp-text-secondary">Show in</span>
              <select
                value={cur}
                onChange={(e) => void saveJob({ display_currency: e.target.value }, 'the currency')}
                disabled={!isDraft}
                aria-label="Quote currency"
                title={isDraft ? undefined : 'Locked — the rate froze when this left draft'}
                className="lp-select rounded-lg border px-2 py-1 text-sm disabled:opacity-50"
                style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
              >
                {QUOTE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {cur !== 'USD' ? (
              !converted ? (
                <p className="text-xs leading-snug" style={{ color: 'var(--color-lp-warning)' }}>
                  No {cur} rate available{rateMissing ? '' : ' for this quote'} — figures shown in USD.
                </p>
              ) : (
                <p className="text-xs leading-snug text-lp-text-tertiary">
                  1 USD = {fxRate!.toFixed(4)} {cur}
                  {fxRateAt ? ` · ${fmtDate(fxRateAt.slice(0, 10))}` : ''}
                  {isDraft ? ' · live' : ' · frozen'}
                </p>
              )
            ) : null}
          </div>

          <dl className="mt-5 space-y-2 border-t pt-4 text-sm" style={{ borderColor: 'var(--lp-border)' }}>
            <Row label="Lines" value={`${quote.lines.length} · ${quote.pieces} pc${quote.pieces === 1 ? '' : 's'}`} muted />
            <Row label="Billed" value={`${days} day${days === 1 ? '' : 's'}`} muted />
          </dl>
        </aside>
      </div>

      {newStock ? (
        <GearSlideOver
          id={null}
          initialQuery={newStock.text}
          onClose={() => setNewStock(null)}
          onCreated={(id) => void stockCreated(id)}
        />
      ) : null}

      <DeleteConfirmationModal
        open={confirmDelete}
        itemName={job.name}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        description="Its lines go with it. Your stock isn’t touched."
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-lp-text-secondary">{label}</dt>
      <dd className={`shrink-0 tabular-nums ${muted ? 'text-lp-text-secondary' : 'text-lp-text'}`}>{value}</dd>
    </div>
  );
}

/** Export: one button; light / dark and payment details in its menu. */
function ExportMenu({
  label,
  defaultPayment,
  hasPayment,
  onExport,
}: {
  label: string;
  defaultPayment: boolean;
  hasPayment: boolean;
  onExport: (mode: PdfMode, includePayment: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<PdfMode>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  const [pay, setPay] = useState<boolean | null>(null);
  const includePayment = hasPayment && (pay ?? defaultPayment);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="right"
      width={250}
      trigger={({ toggle }) => (
        <Button variant="secondary" size="sm" leadingIcon={<FileDown size={14} aria-hidden />} onClick={toggle} loading={busy} aria-haspopup="menu" aria-expanded={open}>
          {label}
        </Button>
      )}
    >
      <div className="space-y-3 p-1.5">
        <div className="grid grid-cols-2 gap-1 rounded-lg p-0.5" style={{ backgroundColor: 'var(--lp-bg-secondary)' }} role="radiogroup" aria-label="PDF look">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className="rounded-md py-1 text-xs capitalize"
              style={{
                backgroundColor: mode === m ? 'var(--lp-surface)' : 'transparent',
                color: mode === m ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                boxShadow: mode === m ? 'var(--lp-shadow-sm)' : undefined,
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <label className={`flex items-start gap-2 text-sm ${hasPayment ? 'text-lp-text' : 'text-lp-text-tertiary'}`}>
          <input type="checkbox" className="lp-checkbox mt-0.5" checked={includePayment} disabled={!hasPayment} onChange={(e) => setPay(e.target.checked)} />
          <span>
            Payment details
            {!hasPayment ? <span className="block text-xs">Add them in Rental settings</span> : null}
          </span>
        </label>
        <Button
          variant="primary"
          size="sm"
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onExport(mode, includePayment);
            setBusy(false);
            setOpen(false);
          }}
        >
          Download
        </Button>
      </div>
    </Popover>
  );
}
