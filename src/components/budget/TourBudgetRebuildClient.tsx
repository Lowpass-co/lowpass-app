'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BudgetSection, computeSectionTotals } from '@/components/budget/BudgetSection';
import { BudgetLineSlideOver } from '@/components/budget/BudgetLineSlideOver';
import { useToast } from '@/components/ui/Toast';
import { spreadsheetColumnsFor } from '@/lib/budget/budgetUx14SectionColumns';
import { SECTION_LABELS, type BudgetSectionKind, BUDGET_SECTION_ORDER } from '@/lib/budget/budgetUx14Kinds';
import { defaultCategoryForUx14Section } from '@/lib/budget/defaultCategoryForUx14Section';
import { convertToCurrency } from '@/lib/budget/fx';
import { resolveSectionForLine } from '@/lib/budget/normalizeBudgetSection';
import { patchFieldsFromUx14Cell, ux14ColumnIsPersisted } from '@/lib/budget/ux14PatchFields';
import type { BudgetLineItem } from '@/types';
import { cn } from '@/lib/utils';

export const SECTION_IDS = BUDGET_SECTION_ORDER.filter((k) => k !== 'summary');

function computePrimaryCurrency(rows: BudgetLineItem[], fallback: string): string {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const cc = (r.currency && r.currency.trim().toUpperCase()) || fallback.trim().toUpperCase();
    counts.set(cc, (counts.get(cc) ?? 0) + 1);
  });
  let best = fallback.trim().toUpperCase();
  let n = -1;
  counts.forEach((cnt, cc) => {
    if (cnt > n) {
      n = cnt;
      best = cc;
    }
  });
  return best;
}

function normalizeAnchorHash(): BudgetSectionKind {
  const fallback = SECTION_IDS[0];
  if (typeof window === 'undefined') return fallback;
  const h = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  if (h === 'summary') return 'summary';
  if ((SECTION_IDS as readonly string[]).includes(h)) return h as BudgetSectionKind;
  return fallback;
}

export type TourBudgetRebuildClientProps = {
  tourId: string;
  initialLines: BudgetLineItem[];
  tourDefaultCurrency: string;
};

/** UX14 budget hub client */
export function TourBudgetRebuildClient({ tourId, initialLines, tourDefaultCurrency }: TourBudgetRebuildClientProps) {
  const { showToast } = useToast();
  const [lines, setLines] = useState<BudgetLineItem[]>(initialLines);
  const [overlayLine, setOverlayLine] = useState<BudgetLineItem | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<BudgetSectionKind>('income');

  useEffect(() => {
    void setLines(initialLines);
  }, [initialLines, tourId]);

  useEffect(() => {
    void setActiveAnchor(normalizeAnchorHash());
    const h = () => void setActiveAnchor(normalizeAnchorHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(SECTION_IDS.map((k) => [k, [] as BudgetLineItem[]])) as Record<
      (typeof SECTION_IDS)[number],
      BudgetLineItem[]
    >;
    for (const line of lines) {
      const resolved = resolveSectionForLine(line);
      const bucket = SECTION_IDS.includes(resolved as (typeof SECTION_IDS)[number])
        ? (resolved as (typeof SECTION_IDS)[number])
        : 'other';
      buckets[bucket]?.push(line);
    }
    return buckets;
  }, [lines]);

  const primaryBySection = useMemo(() => {
    const fb = tourDefaultCurrency.trim().toUpperCase() || 'GBP';
    const out: Partial<Record<(typeof SECTION_IDS)[number], string>> = {};
    SECTION_IDS.forEach((sid) => {
      out[sid] = computePrimaryCurrency(grouped[sid] ?? [], fb);
    });
    return out;
  }, [grouped, tourDefaultCurrency]);

  const pendingTimers = useRef<Record<string, NodeJS.Timeout | undefined>>({});
  const pendingPayload = useRef<Record<string, Record<string, unknown>>>({});

  const flushPatch = useCallback(
    async (id: string) => {
      const payload = pendingPayload.current[id];
      if (!payload || Object.keys(payload).length === 0) return;
      pendingPayload.current[id] = {};

      try {
        const res = await fetch('/api/budget/line-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...payload }),
        });
        if (!res.ok) {
          let msg = 'Save failed';
          try {
            const js = await res.json();
            if (typeof js.error === 'string') msg = js.error;
          } catch {}
          throw new Error(msg);
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [showToast]
  );

  const schedulePatch = useCallback(
    (rowId: string) => {
      const prev = pendingTimers.current[rowId];
      if (prev) clearTimeout(prev);
      pendingTimers.current[rowId] = setTimeout(() => {
        void flushPatch(rowId);
        delete pendingTimers.current[rowId];
      }, 500);
    },
    [flushPatch]
  );

  const onCommitCell = async (rowId: string, columnId: string, raw: unknown): Promise<void> => {
    // Skip the synthetic pinned-bottom totals row.
    if (rowId.endsWith('-totals')) return;
    if (!ux14ColumnIsPersisted(columnId)) return;
    const fields = patchFieldsFromUx14Cell(columnId, raw);
    if (Object.keys(fields).length === 0) return;

    setLines((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? ({
              ...(row as object),
              ...fields,
              updated_at: new Date().toISOString(),
            } as BudgetLineItem)
          : row
      )
    );

    pendingPayload.current[rowId] = { ...(pendingPayload.current[rowId] ?? {}), ...fields };
    schedulePatch(rowId);
  };

  const addRow = useCallback(
    async (section: Exclude<BudgetSectionKind, 'summary'>) => {
      const category = defaultCategoryForUx14Section(section);
      const grp = [...(grouped[section] ?? [])].sort(
        (a, b) => Number(a.sort_order ?? a.order_index) - Number(b.sort_order ?? b.order_index)
      );
      const sortOrder = grp.length ? Math.max(...grp.map((r) => Number(r.sort_order ?? r.order_index))) + 1 : 0;

      try {
        const res = await fetch('/api/budget/line-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tour_id: tourId,
            category,
            label:
              section === 'income' ? 'New income line'
              : section === 'payroll' ? 'Payroll line'
              : 'New expense line',
            proposed_cost: 0,
            actual_cost: 0,
            currency: tourDefaultCurrency.trim() || null,
            quantity: 1,
            section,
            sort_order: sortOrder,
          }),
        });
        if (!res.ok) throw new Error('post');
        const created = await res.json();
        setLines((prev) => [...prev, created as BudgetLineItem]);
      } catch {
        showToast('Could not add row', 'error');
      }
    },
    [grouped, tourDefaultCurrency, tourId, showToast]
  );

  const tourCcy = tourDefaultCurrency.trim().toUpperCase() || 'GBP';

  const grandTotals = useMemo(() => {
    const flat = SECTION_IDS.flatMap((k) => grouped[k] ?? []);
    let grandInTour = 0;
    for (const r of flat) {
      const amt = Number(r.proposed_cost ?? 0);
      const ccy = (r.currency && r.currency.trim().toUpperCase()) ?? tourCcy;
      grandInTour += convertToCurrency(Number.isFinite(amt) ? amt : 0, ccy, tourCcy);
    }
    const linked = flat.filter(
      (r) => !!(r.flight_id || r.hotel_id || r.room_id || r.gear_id || r.tour_gear_id)
    ).length;
    return {
      rows: flat.length,
      linked,
      grandFormatted: grandInTour.toLocaleString('en-GB', { style: 'currency', currency: tourCcy }),
    };
  }, [grouped, tourCcy]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-8 lg:flex-row')}>
      <nav
        className={
          cn(
            'sticky top-[var(--header-h,72px)] z-30 h-fit shrink-0 self-start rounded-xl border border-lp-border bg-lp-surface/95 p-2 shadow-sm backdrop-blur lg:min-w-[11.25rem]'
          )
        }
        aria-label="Budget sections"
      >
        <p className={cn('mb-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider lp-table-header-text')}>
          Sections
        </p>
        <ul className={cn('flex flex-row flex-wrap gap-1 lg:flex-col')}>
          {[...SECTION_IDS, 'summary'].map((sid) => {
            const summary = sid === 'summary';
            const href = summary ? '#summary' : `#${sid}`;
            return (
              <li key={sid}>
                <a
                  href={href}
                  className={cn(
                    'flex rounded-md px-3 py-2 text-sm lg:py-1.5',
                    (summary ? activeAnchor === 'summary' : activeAnchor === sid)
                      ? 'bg-lp-orange/15 font-semibold text-lp-orange'
                      : 'text-lp-text-secondary hover:bg-lp-orange/[0.06] hover:text-lp-text'
                  )}
                  onClick={(e) => {
                    if (sid === 'summary') {
                      e.preventDefault();
                      document.getElementById('budget-summary-anchor')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                      window.history.replaceState(null, '', href);
                      setActiveAnchor('summary');
                      return;
                    }
                    setTimeout(() => setActiveAnchor(sid as BudgetSectionKind), 50);
                  }}
                >
                  {SECTION_LABELS[sid as keyof typeof SECTION_LABELS]}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-14">
        <header>
          <div className={cn('mb-2 flex flex-wrap items-baseline gap-5')}>
            <h1 className="text-2xl font-semibold tracking-tight text-lp-text" style={{ color: 'var(--lp-text)' }}>
              Budget workspace
            </h1>
            <span className={cn(
              'rounded-full border border-lp-border px-4 py-1 text-[11px] font-semibold lp-table-header-text text-lp-text'
            )}
            >
              Grand total {grandTotals.grandFormatted}
            </span>
            <Link
              href={`/budget?tour_id=${encodeURIComponent(tourId)}&view=detail&tab=summary`}
              className={cn(
                'text-xs font-semibold underline decoration-lp-orange/55 underline-offset-4 hover:text-lp-orange'
              )}
            >
              Legacy spreadsheet
            </Link>
          </div>
          <p className="max-w-xl text-sm text-lp-text-secondary">
            Derived rows sync from canon entities — inline edits persist (500ms debounced). FX uses a static GBP-pivot lookup (UX14 simplification).
          </p>
        </header>

        {SECTION_IDS.map((section) => (
          <div key={section}>
            <BudgetSection
              columns={spreadsheetColumnsFor(section)}
              kind={section as Exclude<BudgetSectionKind, 'summary'>}
              footerNote=""
              onCommitCell={onCommitCell}
              onRowOpen={setOverlayLine}
              primaryCurrency={primaryBySection[section] ?? tourCcy}
              rows={grouped[section] ?? []}
              tourDefaultCurrency={tourDefaultCurrency}
              entitySearchTourId={tourId}
            />
            <button
              className={
                cn(
                  'mt-5 rounded-md border border-dashed border-lp-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide lp-table-header-text',
                  'transition-colors hover:border-lp-orange/45 hover:bg-lp-orange/[0.06]'
                )
              }
              type="button"
              onClick={() => void addRow(section)}
            >
              + Add row
            </button>
          </div>
        ))}

        <section id="budget-summary-anchor" className={
          cn(
            'scroll-mt-24 rounded-xl border border-lp-border bg-lp-surface p-6'
          )
        }
        >
          <h2 className={'text-lg font-semibold'} style={{ color: 'var(--lp-text)' }}>
            Summary
          </h2>
          <dl className="mt-4 grid gap-8 sm:grid-cols-2">
            <div>
              <dt className={
                cn('text-[10px] font-semibold uppercase tracking-wide lp-table-header-text')
              }
              >
                Rows · linked
              </dt>
              <dd className="mt-3 text-2xl tabular-nums">
                {grandTotals.rows}{' '}·{' '}
                <span className={'text-lg font-medium text-lp-text-secondary'}>{grandTotals.linked}</span>
              </dd>
            </div>
            <div>
              <dt className={
                cn('text-[10px] font-semibold uppercase tracking-wide lp-table-header-text')
              }
              >
                Sections
              </dt>
              <dd className="mt-3 text-xs text-lp-text-secondary">
                {[...SECTION_IDS]
                  .filter((sid) => (grouped[sid] ?? []).length > 0)
                  .map((sid) => `${SECTION_LABELS[sid]} (${computeSectionTotals(grouped[sid] ?? [], tourCcy).inPrimary.toLocaleString('en-GB', { minimumFractionDigits: 0 })})`)
                  .join(' · ') ||
                  'Empty budget'}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {overlayLine ? (
        <BudgetLineSlideOver
          tourId={tourId}
          line={overlayLine}
          tourCurrency={tourDefaultCurrency}
          onClose={() => setOverlayLine(null)}
          onApplyAmount={(n) => {
            pendingPayload.current[overlayLine.id] = {
              ...(pendingPayload.current[overlayLine.id] ?? {}),
              proposed_cost: n,
            };
            setLines((prev) =>
              prev.map((r) =>
                r.id === overlayLine.id
                  ? ({
                      ...r,
                      proposed_cost: n,
                      updated_at: new Date().toISOString(),
                    } as BudgetLineItem)
                  : r
              )
            );
            schedulePatch(overlayLine.id);
          }}
        />
      ) : null}
    </div>
  );
}
