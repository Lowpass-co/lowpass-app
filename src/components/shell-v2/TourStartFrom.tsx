'use client';

/* ============================================
   LOWPASS — New tour · "Budget & advance" step (Nov 2026, Adam)

   Pick a budget template by scale (or Custom), type the percentages (blank is
   0% — said on screen), and choose which advance questions the show days ask
   and whether days off get an advance. Controlled: the modal owns the value
   and sends it to POST /api/tours/[id]/start-from after the tour is created.
   ============================================ */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  BUDGET_TEMPLATES,
  MONEY_FIELDS,
  moneyToWrites,
  type AdvanceStarterKey,
  type MoneyKey,
} from '@/lib/templates/tourTemplates';

export interface StartFromValue {
  budgetTemplateId: string | null;
  money: Record<MoneyKey, string>;
  advanceShow: AdvanceStarterKey | null;
  advanceDaysOff: boolean;
  /** The user picked the advance set themselves (a template pick no longer changes it). */
  advanceTouched: boolean;
}

export const EMPTY_START_FROM: StartFromValue = {
  budgetTemplateId: null,
  money: Object.fromEntries(MONEY_FIELDS.map((f) => [f.key, ''])) as Record<MoneyKey, string>,
  advanceShow: null,
  advanceDaysOff: false,
  advanceTouched: false,
};

/** The typed percentages are usable (blank counts as 0%). */
export function startFromError(v: StartFromValue): string | null {
  const r = moneyToWrites(v.money);
  return r.ok ? null : r.error;
}

interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

const SHOW_OPTIONS: { value: AdvanceStarterKey | ''; label: string }[] = [
  { value: '', label: 'Workspace setting (custom)' },
  { value: 'headline', label: 'Headline show day' },
  { value: 'support', label: 'Support show day' },
  { value: 'festival', label: 'Festival day' },
];

export function TourStartFrom({ value, onChange }: { value: StartFromValue; onChange: (v: StartFromValue) => void }) {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/budget/templates')
      .then(async (r) => {
        if (!r.ok) throw new Error(`Couldn’t load templates (${r.status})`);
        return (await r.json()) as { templates?: TemplateOption[] };
      })
      .then((j) => { if (live) setTemplates(j.templates ?? []); })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : 'Couldn’t load templates'); });
    return () => { live = false; };
  }, []);

  const pickTemplate = (t: TemplateOption | null) => {
    const def = t?.is_system ? BUDGET_TEMPLATES.find((d) => d.name === t.name) : undefined;
    onChange({
      ...value,
      budgetTemplateId: t?.id ?? null,
      // A scale template suggests its show-day questions until you choose yourself.
      advanceShow: value.advanceTouched ? value.advanceShow : def ? def.advanceShow : value.advanceShow,
    });
  };
  const setMoney = (k: MoneyKey, v: string) => onChange({ ...value, money: { ...value.money, [k]: v } });
  const error = startFromError(value);

  return (
    <div className="flex flex-col gap-6">
      {/* Budget */}
      <section>
        <h3 style={h3}>Budget</h3>
        <p style={hint}>Start from the template closest to this tour. Salaries, per diems, hotels and flights fill in by themselves from Payroll, Hotels and Travel.</p>
        {loadError ? <p role="alert" style={{ ...hint, color: 'var(--color-lp-error)' }}>{loadError} — you can still create the tour and pick one later.</p> : null}
        <div role="radiogroup" aria-label="Budget template" className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {(templates ?? []).map((t) => (
            <Card key={t.id} on={value.budgetTemplateId === t.id} onClick={() => pickTemplate(t)} title={t.name} body={t.description ?? (t.is_system ? '' : 'Your template')} />
          ))}
          <Card on={value.budgetTemplateId === null} onClick={() => pickTemplate(null)} title="Custom" body="Start blank and build it yourself." />
          {templates === null && !loadError ? <span style={hint}>Loading templates…</span> : null}
        </div>
      </section>

      {/* Money */}
      <section>
        <h3 style={h3}>Commissions & overheads</h3>
        <p style={hint}>Leave a box blank and it’s <strong style={{ color: 'var(--lp-text)' }}>0%</strong>. You can change any of these on the budget later.</p>
        <div className="grid gap-x-4 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {MONEY_FIELDS.map((f) => (
            <div key={f.key} style={{ minWidth: 0 }}>
              {/* Label row carries the suggestion, so every box keeps the column's full width. */}
              <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: 'var(--lp-space-1)', minHeight: 'var(--lp-space-6)' }}>
                <label htmlFor={`sf-${f.key}`} style={{ ...label, marginBottom: 0 }}>{f.label}</label>
                {f.suggest !== undefined && value.money[f.key] === '' ? (
                  <button type="button" onClick={() => setMoney(f.key, String(f.suggest))} className="btn-transition" style={suggestBtn} title={`Suggested: ${f.suggest}%`}>
                    Use {f.suggest}%
                  </button>
                ) : null}
              </div>
              <div className="flex items-center" style={pctBox}>
                <input
                  id={`sf-${f.key}`}
                  type="text"
                  inputMode="decimal"
                  value={value.money[f.key]}
                  onChange={(e) => setMoney(f.key, e.target.value)}
                  placeholder="0"
                  aria-describedby={`sf-${f.key}-of`}
                  style={pctInput}
                />
                <span style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-sm)' }}>%</span>
              </div>
              <span id={`sf-${f.key}-of`} style={{ ...hint, margin: 'var(--lp-space-1) 0 0', display: 'block' }}>of {f.of}</span>
            </div>
          ))}
        </div>
        {error ? <p role="alert" style={{ ...hint, color: 'var(--color-lp-error)', marginTop: 'var(--lp-space-2)' }}>{error}</p> : null}
      </section>

      {/* Advance */}
      <section>
        <h3 style={h3}>Advance</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          <div>
            <label htmlFor="sf-show" style={label}>Show days ask</label>
            <select
              id="sf-show"
              value={value.advanceShow ?? ''}
              onChange={(e) => onChange({ ...value, advanceShow: (e.target.value || null) as AdvanceStarterKey | null, advanceTouched: true })}
              style={select}
            >
              {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span style={{ ...hint, display: 'block', marginTop: 'var(--lp-space-1)' }}>Festival dates always ask the festival questions.</span>
          </div>
          <label style={{ ...label, display: 'flex', alignItems: 'flex-start', gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-6)', cursor: 'pointer', color: 'var(--lp-text)' }}>
            <input type="checkbox" checked={value.advanceDaysOff} onChange={(e) => onChange({ ...value, advanceDaysOff: e.target.checked })} style={{ marginTop: 'var(--lp-space-1)' }} />
            <span>
              Advance days off too
              <span style={{ ...hint, display: 'block', margin: 0 }}>Local info, parking and airport distances.</span>
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}

function Card({ on, onClick, title, body }: { on: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="btn-transition relative text-left"
      style={{
        padding: 'var(--lp-space-3)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer',
        border: `1px solid ${on ? 'var(--lp-text)' : 'var(--lp-border)'}`,
        background: on ? 'var(--lp-surface-hover)' : 'var(--lp-panel)',
      }}
    >
      {on ? <Check size={14} aria-hidden style={{ position: 'absolute', top: 'var(--lp-space-3)', right: 'var(--lp-space-3)', color: 'var(--lp-text)' }} /> : null}
      <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)', paddingRight: 'var(--lp-space-5)' }}>{title}</span>
      {body ? <span style={{ display: 'block', marginTop: 'var(--lp-space-1)', fontSize: 'var(--lp-text-xs)', lineHeight: 1.4, color: 'var(--lp-text-secondary)' }}>{body}</span> : null}
    </button>
  );
}

const h3: React.CSSProperties = { margin: 0, fontSize: 'var(--lp-text-base)', fontWeight: 600, color: 'var(--lp-text)' };
const hint: React.CSSProperties = { margin: 'var(--lp-space-1) 0 var(--lp-space-3)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', lineHeight: 1.45 };
const label: React.CSSProperties = { display: 'block', marginBottom: 'var(--lp-space-1)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' };
const pctBox: React.CSSProperties = {
  minWidth: 0, gap: 'var(--lp-space-2)', padding: '0 var(--lp-space-3)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-bg)',
};
const pctInput: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: 'var(--lp-space-2) 0', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', background: 'transparent',
  border: 0, outline: 'none', fontFamily: 'var(--lp-font-numeric)',
};
const suggestBtn: React.CSSProperties = {
  padding: '0 var(--lp-space-2)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', background: 'transparent',
  border: '1px dashed var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer', whiteSpace: 'nowrap',
};
const select: React.CSSProperties = {
  width: '100%', padding: 'var(--lp-space-2) var(--lp-space-3)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)',
  background: 'var(--lp-bg)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', outline: 'none',
};
