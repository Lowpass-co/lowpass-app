'use client';

/* ============================================
   LOWPASS — <TourAccessEditor> (Nov 2026 permissions)

   What a Member can open: which tours (all, or picked ones) and, on those,
   each area at none / view / edit — started from a preset. Controlled; the
   parent saves. Rules: src/lib/permissions/areas.ts.
   ============================================ */

import {
  AREAS,
  AREA_HINTS,
  AREA_LABELS,
  MONEY_AREAS,
  PRESETS,
  PRESET_ACCESS,
  PRESET_LABELS,
  presetFor,
  type AreaLevel,
  type TourAccess,
} from '@/lib/permissions/areas';

export type AccessDraft = { tours: 'all' | string[]; access: TourAccess };

export const EMPTY_DRAFT: AccessDraft = { tours: [], access: {} };

/** Draft → rows for the invite / access APIs. */
export function draftToRows(d: AccessDraft): { tour_id: string | null; area: string; level: string }[] {
  const tourIds: (string | null)[] = d.tours === 'all' ? [null] : d.tours;
  const out: { tour_id: string | null; area: string; level: string }[] = [];
  for (const t of tourIds) for (const a of AREAS) if (d.access[a]) out.push({ tour_id: t, area: a, level: d.access[a]! });
  return out;
}

/** Rows → draft. Rows that don't share one set of areas across their tours
 *  (edited by hand in the database) are merged, highest level winning. */
export function rowsToDraft(rows: { tour_id: string | null; area: string; level: string }[]): AccessDraft {
  const access: TourAccess = {};
  let all = false;
  const tours = new Set<string>();
  for (const r of rows) {
    if (r.tour_id === null) all = true;
    else tours.add(r.tour_id);
    const a = r.area as keyof TourAccess;
    if ((AREAS as readonly string[]).includes(r.area) && (r.level === 'view' || r.level === 'edit')) {
      if (access[a] !== 'edit') access[a] = r.level;
    }
  }
  return { tours: all ? 'all' : [...tours], access };
}

export function draftIsEmpty(d: AccessDraft): boolean {
  return draftToRows(d).length === 0;
}

const LEVELS: AreaLevel[] = ['none', 'view', 'edit'];

export function TourAccessEditor({
  value,
  onChange,
  tours,
  disabled = false,
}: {
  value: AccessDraft;
  onChange: (next: AccessDraft) => void;
  tours: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const preset = presetFor(value.access);
  const moneyOn = AREAS.filter((a) => MONEY_AREAS.has(a) && value.access[a]);
  const pickTour = (id: string, on: boolean) => {
    const cur = value.tours === 'all' ? [] : value.tours;
    onChange({ ...value, tours: on ? [...new Set([...cur, id])] : cur.filter((t) => t !== id) });
  };
  const setLevel = (area: (typeof AREAS)[number], level: AreaLevel) => {
    const next = { ...value.access };
    if (level === 'none') delete next[area];
    else next[area] = level;
    onChange({ ...value, access: next });
  };

  const box: React.CSSProperties = {
    border: '1px solid var(--lp-border-subtle)',
    borderRadius: 'var(--lp-radius-md)',
    padding: 'var(--lp-space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--lp-space-2)',
  };
  const label: React.CSSProperties = { fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)', color: 'var(--lp-text)' };
  const hint: React.CSSProperties = { fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-3)', opacity: disabled ? 0.5 : 1 }}>
      <div style={box}>
        <div style={label}>Tours</div>
        <label style={{ display: 'flex', gap: 8, fontSize: 'var(--lp-text-sm)' }}>
          <input
            type="radio"
            disabled={disabled}
            checked={value.tours === 'all'}
            onChange={() => onChange({ ...value, tours: 'all' })}
            style={{ accentColor: 'var(--color-lp-orange)' }}
          />
          All tours — including ones added later
        </label>
        <label style={{ display: 'flex', gap: 8, fontSize: 'var(--lp-text-sm)' }}>
          <input
            type="radio"
            disabled={disabled}
            checked={value.tours !== 'all'}
            onChange={() => onChange({ ...value, tours: [] })}
            style={{ accentColor: 'var(--color-lp-orange)' }}
          />
          Only these tours
        </label>
        {value.tours !== 'all' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 'var(--lp-space-5)', maxHeight: 180, overflow: 'auto' }}>
            {tours.length === 0 ? <span style={hint}>No tours yet.</span> : null}
            {tours.map((t) => (
              <label key={t.id} style={{ display: 'flex', gap: 8, fontSize: 'var(--lp-text-sm)' }}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={(value.tours as string[]).includes(t.id)}
                  onChange={(e) => pickTour(t.id, e.target.checked)}
                  style={{ accentColor: 'var(--color-lp-orange)' }}
                />
                {t.name}
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={label}>On those tours</span>
          <select
            aria-label="Preset"
            disabled={disabled}
            value={preset ?? ''}
            onChange={(e) => {
              const p = e.target.value as (typeof PRESETS)[number];
              if (p) onChange({ ...value, access: { ...PRESET_ACCESS[p] } });
            }}
            style={{
              fontSize: 'var(--lp-text-sm)',
              padding: '2px 6px',
              background: 'var(--lp-panel)',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border-subtle)',
              borderRadius: 'var(--lp-radius-sm)',
            }}
          >
            <option value="">{preset ? '' : 'Custom'}</option>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div role="table" aria-label="Areas" style={{ display: 'flex', flexDirection: 'column' }}>
          {AREAS.map((a) => {
            const cur: AreaLevel = value.access[a] ?? 'none';
            return (
              <div
                key={a}
                role="row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 0',
                  borderTop: '1px solid var(--lp-border-subtle)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{AREA_LABELS[a]}</div>
                  <div style={hint}>{AREA_HINTS[a]}</div>
                </div>
                <div role="radiogroup" aria-label={AREA_LABELS[a]} style={{ display: 'flex', flexShrink: 0 }}>
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={cur === l}
                      disabled={disabled}
                      onClick={() => setLevel(a, l)}
                      style={{
                        fontSize: 'var(--lp-text-xs)',
                        padding: '3px 9px',
                        border: '1px solid var(--lp-border-subtle)',
                        marginLeft: -1,
                        cursor: disabled ? 'default' : 'pointer',
                        color: cur === l ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                        background: cur === l ? 'color-mix(in srgb, var(--color-lp-orange) 14%, transparent)' : 'transparent',
                        fontWeight: cur === l ? 'var(--lp-weight-medium)' : 'normal',
                        textTransform: 'capitalize',
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {moneyOn.length > 0 ? (
          <div style={{ ...hint, color: 'var(--color-lp-orange)' }}>
            Money: they will see {moneyOn.map((a) => AREA_LABELS[a]).join(', ')}.
          </div>
        ) : null}
      </div>
    </div>
  );
}
