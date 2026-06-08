/* ============================================
   LOWPASS — Budget Settings tab (Phase D)

   Replaces the old placeholder with the budget's structural editor:
     1. Phase tracking toggle (budget_settings.track_phases).
     2. This tour's sections — add / rename / reorder / delete.
     3. Templates — apply a preset to this tour, clone a system preset
        into the workspace, and edit workspace templates (sections +
        default line labels).

   All writes go through the budget APIs and router.refresh()-sync.
   Token-clean; no hardcoded hex.
   ============================================ */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useBudgetConfirm } from '@/components/budget/BudgetConfirmDialog';
import { useTrackPhases } from '@/components/budget/BudgetTrackPhasesContext';
import { InlineSelectCell } from '@/components/budget/cells/InlineSelectCell';
import type {
  BudgetSection,
  BudgetTemplate,
  BudgetTemplateSection,
} from '@/types';

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--lp-text-2xs)',
  fontWeight: 'var(--lp-weight-semibold)',
  letterSpacing: 'var(--lp-tracking-caps)',
  textTransform: 'uppercase',
  color: 'var(--lp-text-tertiary)',
};
const cardStyle: React.CSSProperties = {
  borderColor: 'var(--lp-border-strong)',
  background: 'var(--lp-surface)',
};
const inputStyle: React.CSSProperties = {
  border: '1px solid var(--lp-border)',
  background: 'var(--lp-bg)',
  color: 'var(--lp-text)',
  borderRadius: 'var(--lp-radius-md)',
  padding: 'var(--lp-space-1) var(--lp-space-2)',
  fontSize: 'var(--lp-text-sm)',
  outline: 'none',
};

export function BudgetSettingsTab({
  tourId,
  sections,
}: {
  tourId: string;
  sections: BudgetSection[];
}) {
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-5 py-2">
      <PhaseToggleCard />
      <OverheadsCard tourId={tourId} />
      <CommissionsCard tourId={tourId} />
      <TourSectionsCard tourId={tourId} sections={sections} />
      <TemplatesCard tourId={tourId} />
    </div>
  );
}

/* -------------------------------------------------- */
/* Overheads — insurance / contingency / accountancy / */
/* merch COGS %, each with a configurable base (Phase 1). */
/* -------------------------------------------------- */
type OverheadSettings = {
  insurance_pct: number;
  contingency_pct: number;
  accountancy_pct: number;
  merch_cogs_pct: number;
  insurance_basis: string;
  contingency_basis: string;
  accountancy_basis: string;
};

const BASIS_OPTIONS = [
  { value: 'income_gross', label: 'of gross income' },
  { value: 'expenses_pre_contingency', label: 'of expenses' },
  { value: 'expenses_total', label: 'of total expenses' },
];

function OverheadsCard({ tourId }: { tourId: string }) {
  const { showToast } = useToast();
  const [s, setS] = useState<OverheadSettings | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/budget/settings?tour_id=${encodeURIComponent(tourId)}`);
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const d = (await res.json()) as Partial<OverheadSettings>;
        if (!active) return;
        setS({
          insurance_pct: Number(d.insurance_pct ?? 0),
          contingency_pct: Number(d.contingency_pct ?? 0),
          accountancy_pct: Number(d.accountancy_pct ?? 0),
          merch_cogs_pct: Number(d.merch_cogs_pct ?? 0),
          insurance_basis: d.insurance_basis ?? 'income_gross',
          contingency_basis: d.contingency_basis ?? 'expenses_pre_contingency',
          accountancy_basis: d.accountancy_basis ?? 'income_gross',
        });
      } catch {
        if (active)
          setS({
            insurance_pct: 0,
            contingency_pct: 0,
            accountancy_pct: 0,
            merch_cogs_pct: 0,
            insurance_basis: 'income_gross',
            contingency_basis: 'expenses_pre_contingency',
            accountancy_basis: 'income_gross',
          });
      }
    })();
    return () => {
      active = false;
    };
  }, [tourId]);

  /* Optimistic — apply locally, POST in the background, no refresh
     (pitfall #1). Roll back + toast on failure. */
  const save = (patch: Partial<OverheadSettings>) => {
    if (!s) return;
    const prev = s;
    const next = { ...s, ...patch };
    setS(next);
    void (async () => {
      try {
        const res = await fetch('/api/budget/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, ...patch }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
      } catch (err) {
        setS(prev);
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      }
    })();
  };

  const pctRow = (
    key: 'insurance' | 'contingency' | 'accountancy',
    label: string,
  ) => {
    const pctKey = `${key}_pct` as const;
    const basisKey = `${key}_basis` as const;
    return (
      <div className="flex items-center gap-3" key={key}>
        <span className="w-28 shrink-0" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={0.5}
            value={s ? +(s[pctKey] * 100).toFixed(2) : 0}
            onChange={(e) => save({ [pctKey]: (Number(e.target.value) || 0) / 100 } as Partial<OverheadSettings>)}
            disabled={!s}
            className="w-16"
            style={{ ...inputStyle, textAlign: 'right' }}
          />
          <span style={{ color: 'var(--lp-text-tertiary)' }}>%</span>
        </div>
        <div className="w-44">
          <InlineSelectCell
            variant="field"
            showTone={false}
            ariaLabel={`${label} base`}
            value={s ? s[basisKey] : 'income_gross'}
            options={BASIS_OPTIONS}
            onCommit={(v) => save({ [basisKey]: v } as Partial<OverheadSettings>)}
          />
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-lg border p-4" style={cardStyle}>
      <h2 className="lp-h3">Overheads</h2>
      <p
        className="mt-1"
        style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}
      >
        Percentages feed the Summary P&amp;L. Each picks the base it
        applies to (gross income, expenses, or total expenses).
      </p>
      <div className="mt-3 space-y-2">
        {pctRow('insurance', 'Insurance')}
        {pctRow('contingency', 'Contingency')}
        {pctRow('accountancy', 'Accountancy')}
        <div className="flex items-center gap-3">
          <span className="w-28 shrink-0" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
            Merch COGS
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={0.5}
              value={s ? +(s.merch_cogs_pct * 100).toFixed(2) : 0}
              onChange={(e) => save({ merch_cogs_pct: (Number(e.target.value) || 0) / 100 })}
              disabled={!s}
              className="w-16"
              style={{ ...inputStyle, textAlign: 'right' }}
            />
            <span style={{ color: 'var(--lp-text-tertiary)' }}>%</span>
          </div>
          <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
            of merch income
          </span>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------- */
/* Commissions — manager/agent %, each on a chosen base */
/* (gross/net/merch/pre-tax). Feeds the Summary P&L.    */
/* -------------------------------------------------- */
const COMMISSION_BASIS_OPTIONS = [
  { value: 'gross', label: 'gross' },
  { value: 'net', label: 'net' },
  { value: 'gross_merch', label: 'merch' },
  { value: 'net_merch', label: 'net merch' },
  { value: 'gross_minus_tax', label: 'pre-tax' },
];

type CommissionRow = { id: string; label: string; percentage: number; basis: string };

function CommissionsCard({ tourId }: { tourId: string }) {
  const { showToast } = useToast();
  const { requestConfirm, dialog } = useBudgetConfirm();
  const [rows, setRows] = useState<CommissionRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/budget/commissions?tour_id=${encodeURIComponent(tourId)}`);
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const d = (await res.json()) as { commissions?: CommissionRow[] };
        if (active)
          setRows(
            (d.commissions ?? []).map((c) => ({
              id: c.id,
              label: c.label,
              percentage: Number(c.percentage) || 0,
              basis: c.basis || 'gross',
            })),
          );
      } catch {
        if (active) setRows([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [tourId]);

  /* Optimistic PATCH — apply locally, persist in the background, no
     router.refresh(). Roll back + toast on failure. */
  const commit = (id: string, fields: Partial<Omit<CommissionRow, 'id'>>) => {
    if (!rows) return;
    const before = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    void (async () => {
      try {
        const res = await fetch('/api/budget/commissions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...fields }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
      } catch (err) {
        setRows(before);
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      }
    })();
  };

  // Local-only update while typing the %; commit() fires on blur.
  const setLocalPct = (id: string, fraction: number) =>
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, percentage: fraction } : r)) ?? prev);

  const add = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/budget/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, label: 'New commission', percentage: 0, basis: 'gross' }),
      });
      if (!res.ok) throw new Error(`Add failed (${res.status})`);
      const c = (await res.json()) as CommissionRow;
      setRows((prev) => [
        ...(prev ?? []),
        { id: c.id, label: c.label, percentage: Number(c.percentage) || 0, basis: c.basis || 'gross' },
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Add failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: CommissionRow) =>
    requestConfirm({
      title: 'Delete commission?',
      message: `Delete "${row.label || 'commission'}"? It will no longer feed the Summary P&L.`,
      confirmLabel: 'Delete commission',
      onConfirm: () => {
        const before = rows;
        setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
        void (async () => {
          try {
            const res = await fetch('/api/budget/commissions', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: row.id }),
            });
            if (!res.ok) throw new Error(`Delete failed (${res.status})`);
          } catch (err) {
            if (before) setRows(before);
            showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
          }
        })();
      },
    });

  return (
    <section className="rounded-lg border p-4" style={cardStyle}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="lp-h3">Commissions</h2>
          <p className="mt-1" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            Manager / agent percentages. Each feeds the Summary P&amp;L on its chosen base.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || rows === null}
          onClick={() => void add()}
          className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add commission
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {rows === null ? (
          <li style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>Loading…</li>
        ) : rows.length === 0 ? (
          <li style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
            No commissions yet — add one above.
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5"
              style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)' }}
            >
              <InlineText
                value={r.label}
                onCommit={(label) => commit(r.id, { label })}
                style={{
                  flex: 1,
                  ...inputStyle,
                  border: '1px solid transparent',
                  background: 'transparent',
                  fontSize: 'var(--lp-text-base)',
                }}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={+(r.percentage * 100).toFixed(2)}
                  onChange={(e) => setLocalPct(r.id, (Number(e.target.value) || 0) / 100)}
                  onBlur={(e) => commit(r.id, { percentage: (Number(e.target.value) || 0) / 100 })}
                  className="w-16"
                  style={{ ...inputStyle, textAlign: 'right' }}
                  aria-label={`${r.label} percentage`}
                />
                <span style={{ color: 'var(--lp-text-tertiary)' }}>%</span>
              </div>
              <div className="w-32">
                <InlineSelectCell
                  variant="field"
                  showTone={false}
                  ariaLabel={`${r.label} basis`}
                  value={r.basis}
                  options={COMMISSION_BASIS_OPTIONS}
                  onCommit={(v) => commit(r.id, { basis: v })}
                />
              </div>
              <button
                type="button"
                aria-label={`Delete ${r.label}`}
                title="Delete commission"
                onClick={() => remove(r)}
                className="btn-transition rounded p-1"
                style={{ color: 'var(--lp-text-tertiary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-lp-error)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--lp-text-tertiary)';
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))
        )}
      </ul>
      {dialog}
    </section>
  );
}

/* -------------------------------------------------- */
/* 1. Phase tracking toggle                            */
/* -------------------------------------------------- */
function PhaseToggleCard() {
  // Phase 4.2 — the toggle now drives the SHARED track-phases context.
  // Flipping it optimistically animates the phase strip above the tabs
  // (BudgetPhaseStripGate) and persists in the background — no
  // router.refresh(), so the grid + tab state don't flash.
  const { trackPhases: on, setTrackPhases, busy } = useTrackPhases();

  const toggle = () => setTrackPhases(!on);

  return (
    <section className="rounded-lg border p-4" style={cardStyle}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="lp-h3">Phase tracking</h2>
          <p
            className="mt-1"
            style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}
          >
            Tag each line with a tour phase (pre-prod, rehearsals, show days,
            wrap) and group the grid by phase. Off by default to keep the
            spreadsheet lean.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Toggle phase tracking"
          disabled={busy}
          onClick={toggle}
          className="btn-transition relative shrink-0 rounded-full"
          style={{
            width: 44,
            height: 24,
            background: on
              ? 'var(--color-lp-orange)'
              : 'var(--lp-border-strong)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <span
            className="btn-transition absolute rounded-full"
            style={{
              top: 2,
              left: on ? 22 : 2,
              width: 20,
              height: 20,
              background: 'var(--lp-surface)',
            }}
          />
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------- */
/* 2. This tour's sections                             */
/* -------------------------------------------------- */
function TourSectionsCard({
  tourId,
  sections,
}: {
  tourId: string;
  sections: BudgetSection[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestConfirm, dialog } = useBudgetConfirm();
  const [busy, setBusy] = useState(false);

  const sorted = [...sections].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  );

  const call = useCallback(
    async (method: string, body: Record<string, unknown> | null, qs = '') => {
      setBusy(true);
      try {
        const res = await fetch(`/api/budget/sections${qs}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Failed (${res.status})`);
        }
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      } finally {
        setBusy(false);
      }
    },
    [router, showToast],
  );

  const move = (index: number, dir: -1 | 1) => {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    // Swap sort_order between the two adjacent sections.
    void call('PATCH', { id: a.id, sort_order: b.sort_order ?? index + dir });
    void call('PATCH', { id: b.id, sort_order: a.sort_order ?? index });
  };

  return (
    <section className="rounded-lg border p-4" style={cardStyle}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="lp-h3">Sections</h2>
          <p
            className="mt-1"
            style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}
          >
            The backbone of this budget. Line items group under these.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void call('POST', { tour_id: tourId, name: 'New section' })}
          className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add section
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {sorted.length === 0 ? (
          <li style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
            No sections yet — add one, or apply a template below.
          </li>
        ) : (
          sorted.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5"
              style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)' }}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  style={{ color: 'var(--lp-text-tertiary)', opacity: i === 0 ? 0.3 : 1 }}
                >
                  <ChevronDown className="h-3 w-3 rotate-180" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={busy || i === sorted.length - 1}
                  onClick={() => move(i, 1)}
                  style={{
                    color: 'var(--lp-text-tertiary)',
                    opacity: i === sorted.length - 1 ? 0.3 : 1,
                  }}
                >
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
              </div>
              <InlineText
                value={s.name}
                onCommit={(name) => void call('PATCH', { id: s.id, name })}
                style={{ flex: 1, ...inputStyle, border: '1px solid transparent', background: 'transparent', fontSize: 'var(--lp-text-base)' }}
              />
              <button
                type="button"
                aria-label={`Delete ${s.name}`}
                title="Delete section"
                disabled={busy}
                onClick={() =>
                  requestConfirm({
                    title: 'Delete section?',
                    message: `Delete "${s.name}"? Its line items move to Uncategorised (they are not deleted).`,
                    confirmLabel: 'Delete section',
                    onConfirm: () =>
                      void call('DELETE', null, `?id=${encodeURIComponent(s.id)}`),
                  })
                }
                className="btn-transition rounded p-1"
                style={{ color: 'var(--lp-text-tertiary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-lp-error)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--lp-text-tertiary)';
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))
        )}
      </ul>
      {dialog}
    </section>
  );
}

/* -------------------------------------------------- */
/* 3. Templates                                        */
/* -------------------------------------------------- */
function TemplatesCard({ tourId }: { tourId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestConfirm, dialog } = useBudgetConfirm();
  const [templates, setTemplates] = useState<BudgetTemplate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/budget/templates');
      if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
      const b = (await res.json()) as { templates?: BudgetTemplate[] };
      setTemplates(b.templates ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error');
      setTemplates([]);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  /* BUD-19 — inline rename of a workspace template name. Optimistic
     local update; reload to resync on failure. */
  const renameTemplate = async (id: string, name: string) => {
    setTemplates((prev) =>
      prev ? prev.map((t) => (t.id === id ? { ...t, name } : t)) : prev,
    );
    try {
      const res = await fetch('/api/budget/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rename failed', 'error');
      await load();
    }
  };

  const apply = async (templateId: string) => {
    setBusy(templateId);
    try {
      const res = await fetch('/api/budget/templates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId, templateId }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Apply failed');
      }
      const b = (await res.json()) as { lines_added?: number };
      showToast(`Applied — ${b.lines_added ?? 0} line(s) added`);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Apply failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  /* Fix-pack B Task 4b — start a template from scratch (no clone). */
  const createBlank = async () => {
    setBusy('__new__');
    try {
      const res = await fetch('/api/budget/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New template' }),
      });
      if (!res.ok) throw new Error(`Could not create template (${res.status})`);
      showToast('Blank template created');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create template', 'error');
    } finally {
      setBusy(null);
    }
  };

  const clone = async (template: BudgetTemplate) => {
    setBusy(`clone-${template.id}`);
    try {
      const res = await fetch('/api/budget/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (copy)`,
          description: template.description,
          tier: template.tier,
          clone_from: template.id,
        }),
      });
      if (!res.ok) throw new Error('Clone failed');
      showToast('Cloned into your workspace');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Clone failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const performRemove = async (template: BudgetTemplate) => {
    setBusy(`del-${template.id}`);
    try {
      const res = await fetch(
        `/api/budget/templates?id=${encodeURIComponent(template.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = (template: BudgetTemplate) => {
    requestConfirm({
      title: 'Delete template?',
      message: `Delete the "${template.name}" template? This can't be undone.`,
      confirmLabel: 'Delete template',
      onConfirm: () => void performRemove(template),
    });
  };

  return (
    <section className="rounded-lg border p-4" style={cardStyle}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="lp-h3">Templates</h2>
          <p
            className="mt-1"
            style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}
          >
            Apply a preset to add any missing sections + lines to this tour, clone
            a system preset to customise, or edit your own templates.
          </p>
        </div>
        {/* Fix-pack B Task 4b — start a template from scratch. */}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void createBlank()}
          className="btn-transition inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            opacity: busy !== null ? 0.6 : 1,
          }}
        >
          {busy === '__new__' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          New template
        </button>
      </div>

      {templates === null ? (
        <div
          className="mt-4 flex items-center gap-2"
          style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-sm)' }}
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {templates.map((t) => {
            const isOpen = expanded === t.id;
            return (
              <li
                key={t.id}
                className="rounded-md border"
                style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)' }}
              >
                {/* Phase 4.4 — uniform row: leading disclosure column
                    (chevron for editable templates, spacer for system so
                    names align) · name + badge · fixed action group
                    [Apply][Copy][Trash-or-spacer] in a constant order so
                    the chevron no longer shoves "Apply to tour". */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* leading disclosure — keeps a constant 28px gutter on
                      every row whether or not it expands. */}
                  {t.is_system ? (
                    <span className="shrink-0" style={{ width: 28 }} aria-hidden />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : t.id)}
                      aria-label={isOpen ? 'Collapse' : 'Edit template'}
                      aria-expanded={isOpen}
                      className="btn-transition shrink-0 rounded-md p-1.5"
                      style={{ color: 'var(--lp-text-secondary)' }}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {/* BUD-19 — your templates rename inline; system
                          presets are read-only. Matching padding so the
                          plain span and the ghost input share a baseline. */}
                      {t.is_system ? (
                        <span
                          style={{
                            fontSize: 'var(--lp-text-base)',
                            fontWeight: 'var(--lp-weight-medium)',
                            color: 'var(--lp-text)',
                            border: '1px solid transparent',
                            padding: 'var(--lp-space-1) var(--lp-space-2)',
                          }}
                        >
                          {t.name}
                        </span>
                      ) : (
                        <InlineText
                          value={t.name}
                          title="Click to rename"
                          style={{
                            fontSize: 'var(--lp-text-base)',
                            fontWeight: 'var(--lp-weight-medium)',
                            minWidth: 0,
                          }}
                          onCommit={(name) => void renameTemplate(t.id, name)}
                        />
                      )}
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5"
                        style={{
                          ...labelStyle,
                          background: t.is_system
                            ? 'var(--lp-bg-deep)'
                            : 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
                          color: t.is_system
                            ? 'var(--lp-text-tertiary)'
                            : 'var(--color-lp-orange)',
                        }}
                      >
                        {t.is_system ? 'System' : 'Yours'}
                      </span>
                    </div>
                    {t.description ? (
                      <p
                        className="mt-0.5 truncate"
                        style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}
                      >
                        {t.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Constant-order action group on every row. */}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void apply(t.id)}
                    className="btn-transition shrink-0 rounded-md px-2.5 py-1"
                    style={{
                      border: '1px solid var(--color-lp-orange)',
                      color: 'var(--color-lp-orange)',
                      background: 'transparent',
                      fontSize: 'var(--lp-text-xs)',
                      fontWeight: 'var(--lp-weight-medium)',
                    }}
                  >
                    {busy === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      'Apply to tour'
                    )}
                  </button>

                  {/* Phase 4.4 — Copy on EVERY template (system clones to a
                      workspace copy; custom duplicates itself). */}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void clone(t)}
                    title={
                      t.is_system
                        ? 'Clone into your workspace'
                        : 'Duplicate this template'
                    }
                    aria-label={t.is_system ? 'Clone template' : 'Duplicate template'}
                    className="btn-transition shrink-0 rounded-md p-1.5"
                    style={{ color: 'var(--lp-text-secondary)' }}
                  >
                    {busy === `clone-${t.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </button>

                  {/* Trash only for editable templates; system keeps a
                      same-width spacer so the action group stays aligned. */}
                  {t.is_system ? (
                    <span className="shrink-0" style={{ width: 28 }} aria-hidden />
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void remove(t)}
                      aria-label="Delete template"
                      className="btn-transition shrink-0 rounded-md p-1.5"
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>

                {isOpen && !t.is_system ? (
                  <TemplateEditor templateId={t.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </section>
  );
}

/* Nested editor for a workspace template's sections + default lines. */
function TemplateEditor({ templateId }: { templateId: string }) {
  const { showToast } = useToast();
  const [sections, setSections] = useState<BudgetTemplateSection[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budget/templates?id=${encodeURIComponent(templateId)}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const b = (await res.json()) as { template?: { sections?: BudgetTemplateSection[] } };
      setSections(b.template?.sections ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error');
      setSections([]);
    }
  }, [templateId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const sectionCall = async (method: string, body: Record<string, unknown> | null, qs = '') => {
    try {
      const res = await fetch(`/api/budget/templates/${templateId}/sections${qs}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const lineCall = async (method: string, body: Record<string, unknown> | null, qs = '') => {
    try {
      const res = await fetch(`/api/budget/templates/${templateId}/lines${qs}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  return (
    <div
      className="border-t px-3 py-3"
      style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg-deep)' }}
    >
      {sections === null ? (
        <div style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-xs)' }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* BUD-19 — each template section as a bordered card (header +
              indented default-line list), mirroring the budget's own
              section idiom for a consistent picker. */}
          {sections.map((s) => (
            <div
              key={s.id}
              className="rounded-md border"
              style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}
            >
              <div
                className="flex items-center gap-2 border-b px-2.5 py-1.5"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <InlineText
                  value={s.name}
                  onCommit={(name) => void sectionCall('PATCH', { id: s.id, name })}
                  style={{
                    flex: 1,
                    ...inputStyle,
                    border: '1px solid transparent',
                    background: 'transparent',
                    fontWeight: 'var(--lp-weight-semibold)',
                  }}
                />
                <button
                  type="button"
                  aria-label="Delete section"
                  title="Delete section"
                  onClick={() => void sectionCall('DELETE', null, `?id=${encodeURIComponent(s.id)}`)}
                  className="btn-transition rounded p-1"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <ul className="space-y-0.5 px-2.5 py-2">
                {(s.lines ?? []).map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-1 w-1 shrink-0 rounded-full"
                      style={{ background: 'var(--lp-border-strong)' }}
                    />
                    <InlineText
                      value={l.label}
                      onCommit={(label) => void lineCall('PATCH', { id: l.id, label })}
                      style={{
                        flex: 1,
                        ...inputStyle,
                        border: '1px solid transparent',
                        background: 'transparent',
                        fontSize: 'var(--lp-text-sm)',
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Delete line"
                      title="Delete line"
                      onClick={() => void lineCall('DELETE', null, `?id=${encodeURIComponent(l.id)}`)}
                      className="btn-transition rounded p-1"
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      void lineCall('POST', {
                        template_section_id: s.id,
                        label: 'New line',
                      })
                    }
                    className="btn-transition inline-flex items-center gap-1 rounded-md border"
                    style={{
                      fontSize: 'var(--lp-text-xs)',
                      fontWeight: 600,
                      color: 'var(--lp-text-secondary)',
                      background: 'var(--lp-surface)',
                      borderColor: 'var(--lp-border)',
                      padding: '2px 8px',
                      marginLeft: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus className="h-3 w-3" aria-hidden /> Add line
                  </button>
                </li>
              </ul>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void sectionCall('POST', { name: 'New section' })}
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1"
            style={{
              borderColor: 'var(--lp-border-strong)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus className="h-3 w-3" aria-hidden /> Add section
          </button>
        </div>
      )}
    </div>
  );
}

/* Small inline-editable text field (click → edit, Enter/blur commit,
   Escape cancel; skips unchanged/empty).

   Phase 4.4 — "ghost" affordance: reads as plain text at rest, reveals a
   bordered input on hover/focus so it doesn't look like a permanently-
   cheap text box. Border + background are transparent until interacted
   with; both transition smoothly. */
function InlineText({
  value,
  onCommit,
  style,
  title,
}: {
  value: string;
  onCommit: (next: string) => void;
  style?: React.CSSProperties;
  title?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [active, setActive] = useState(false); // hover OR focus
  // Resync the field when the server value changes (e.g. after refresh).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onCommit(t);
    else setDraft(value);
  };

  return (
    <input
      type="text"
      value={draft}
      aria-label="Edit name"
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={(e) => {
        setActive(false);
        commit();
        void e;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{
        color: 'var(--lp-text)',
        outline: 'none',
        border: '1px solid',
        borderColor: active ? 'var(--lp-border-strong)' : 'transparent',
        background: active ? 'var(--lp-surface)' : 'transparent',
        borderRadius: 'var(--lp-radius-md)',
        padding: 'var(--lp-space-1) var(--lp-space-2)',
        transition:
          'border-color var(--lp-duration-fast) var(--lp-ease-standard), background var(--lp-duration-fast) var(--lp-ease-standard)',
        ...style,
      }}
    />
  );
}
