'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SECTION_GAP = 'var(--lp-space-12)';

const CARD: React.CSSProperties = {
  background: 'var(--lp-surface)',
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-lg)',
  boxShadow: 'var(--lp-shadow-sm)',
  padding: 'var(--lp-space-6)',
};

const H2: React.CSSProperties = {
  fontSize: 'var(--lp-text-xl)',
  lineHeight: 'var(--lp-leading-snug)' as React.CSSProperties['lineHeight'],
  fontWeight: 600,
  color: 'var(--lp-text)',
  marginBottom: 'var(--lp-space-2)',
};

const CAPTION: React.CSSProperties = {
  fontSize: 'var(--lp-text-sm)',
  color: 'var(--lp-text-secondary)',
  marginBottom: 'var(--lp-space-4)',
  lineHeight: 'var(--lp-leading-normal)' as React.CSSProperties['lineHeight'],
};

const COLOUR_GROUPS: Record<string, string[]> = {
  brand: [
    '--color-lp-orange',
    '--color-lp-orange-hover',
    '--color-lp-orange-light',
    '--color-lp-orange-subtle',
    '--color-lp-orange-subtle-hover',
  ],
  surface: [
    '--color-lp-bg',
    '--color-lp-bg-secondary',
    '--color-lp-bg-tertiary',
    '--color-lp-surface',
    '--color-lp-surface-hover',
  ],
  border: ['--color-lp-border', '--color-lp-border-light'],
  text: [
    '--color-lp-text',
    '--color-lp-text-secondary',
    '--color-lp-text-tertiary',
    '--color-lp-text-inverse',
    '--color-lp-table-header-text',
  ],
  status: [
    '--color-lp-success',
    '--color-lp-warning',
    '--color-lp-error',
    '--color-lp-info',
    '--color-lp-status-not-started',
    '--color-lp-status-in-progress',
    '--color-lp-status-complete',
    '--color-lp-status-needs-review',
  ],
  'day-types': [
    '--color-lp-day-show',
    '--color-lp-day-off',
    '--color-lp-day-travel',
    '--color-lp-day-rehearsal',
    '--color-lp-day-press',
    '--color-lp-day-radio',
    '--color-lp-day-tv',
    '--color-lp-day-festival',
  ],
  sidebar: [
    '--lp-sidebar-bg',
    '--lp-sidebar-border',
    '--lp-sidebar-text',
    '--lp-sidebar-text-heading',
    '--lp-sidebar-text-muted',
    '--lp-sidebar-active-bg',
    '--lp-sidebar-hover-bg',
    '--lp-sidebar-icon',
    '--lp-sidebar-icon-active',
  ],
  dashboard: ['--lp-dashboard-card-bg', '--lp-dashboard-card-border'],
  budget: [
    '--color-lp-budget-wrap',
    '--color-lp-budget-wrap-border',
    '--color-lp-budget-card',
    '--color-lp-budget-card-border',
  ],
};

const SPACE_KEYS = [
  '--lp-space-0',
  '--lp-space-1',
  '--lp-space-2',
  '--lp-space-3',
  '--lp-space-4',
  '--lp-space-5',
  '--lp-space-6',
  '--lp-space-8',
  '--lp-space-10',
  '--lp-space-12',
  '--lp-space-16',
] as const;

const TEXT_SIZES = [
  '--lp-text-2xs',
  '--lp-text-xs',
  '--lp-text-sm',
  '--lp-text-base',
  '--lp-text-md',
  '--lp-text-lg',
  '--lp-text-xl',
  '--lp-text-2xl',
  '--lp-text-3xl',
  '--lp-text-4xl',
] as const;

const LEADS = [
  '--lp-leading-tight',
  '--lp-leading-snug',
  '--lp-leading-normal',
  '--lp-leading-relaxed',
] as const;

const Z_SHOWCASE = [
  { label: 'overlay', v: 'var(--lp-z-overlay)' as const },
  { label: 'dropdown', v: 'var(--lp-z-dropdown)' as const },
  { label: 'modal', v: 'var(--lp-z-modal)' as const },
] as const;

const DURATIONS = ['instant', 'fast', 'base', 'slow', 'slower', 'page'] as const;
const DURATION_VARS = DURATIONS.map((d) => `--lp-duration-${d}` as const);
const EASES = ['standard', 'emphasized', 'decelerate', 'accelerate'] as const;
const EASE_VARS = EASES.map((e) => `--lp-ease-${e}` as const);

const RADII = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'full'] as const;
const RADIUS_VARS = RADII.map((r) => (r === 'full' ? '--lp-radius-full' : (`--lp-radius-${r}` as const)));

const SHADOWS = ['xs', 'sm', 'md', 'lg', 'xl', 'overlay', 'focus-ring'] as const;
const SHADOW_VARS = SHADOWS.map((s) => `--lp-shadow-${s}` as const);

const MOTION_CELLS = DURATION_VARS.flatMap((dVar) =>
  EASE_VARS.map((eVar) => ({ dVar, eVar, key: `${dVar}__${eVar}` })),
);

function ColourSwatch({ name, themeKey }: { name: string; themeKey: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const style: React.CSSProperties = { background: `var(${name}, #ccc)` };
  const [resolved, setResolved] = useState('…');
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const b = cs.backgroundColor;
      setResolved(
        b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent' ? b : cs.backgroundImage || '—',
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [name, themeKey]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-center text-xs font-medium" style={{ color: 'var(--lp-text)' }}>{name}</div>
      <div
        ref={ref}
        className="h-20 w-20 shrink-0 border"
        style={{
          ...style,
          borderColor: 'var(--lp-border)',
        }}
      />
      <div
        className="max-w-[100px] break-all text-center text-[10px] font-mono"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        {resolved}
      </div>
    </div>
  );
}

function SpacingBar({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 'var(--lp-space-2)' }}>
      <div className="w-44 shrink-0 text-xs font-mono" style={{ color: 'var(--lp-text-secondary)' }}>{name}</div>
      <div
        className="h-3"
        style={{
          width: `var(${name})`,
          background: 'rgba(255, 69, 0, 0.14)',
        }}
      />
    </div>
  );
}

export function DesignTokensClient() {
  const [htmlDark, setHtmlDark] = useState(false);
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setHtmlDark(document.documentElement.classList.contains('dark'));
    }, 0);
    return () => clearTimeout(t);
  }, [themeKey]);

  const setLight = useCallback(() => {
    document.documentElement.classList.remove('dark');
    setHtmlDark(false);
    setThemeKey((k) => k + 1);
  }, []);
  const setDark = useCallback(() => {
    document.documentElement.classList.add('dark');
    setHtmlDark(true);
    setThemeKey((k) => k + 1);
  }, []);

  return (
    <div>
      <div
        className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border px-3 py-2"
        style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg-secondary)' }}
      >
        <p className="m-0 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          Theme: toggles the same <code className="font-mono">.dark</code> class on <code className="font-mono">&lt;html&gt;</code> as the rest of the app.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={setLight}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              background: !htmlDark ? 'var(--lp-surface-hover)' : 'transparent',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border)',
            }}
          >
            Light
          </button>
          <button
            type="button"
            onClick={setDark}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              background: htmlDark ? 'var(--lp-surface-hover)' : 'transparent',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border)',
            }}
          >
            Dark
          </button>
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: SECTION_GAP }}>
        <section style={CARD}>
          <h2 style={H2}>Colours</h2>
          <p style={CAPTION}>
            Adaptive and fixed colour tokens. Dashboard page background uses a gradient; swatches here are solid card/border fields.
          </p>
          {Object.entries(COLOUR_GROUPS).map(([group, names]) => (
            <div key={group} style={{ marginBottom: 'var(--lp-space-6)' }}>
              <h3
                className="mb-3 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--lp-text-secondary)', letterSpacing: 'var(--lp-tracking-caps)' }}
              >
                {group}
              </h3>
              <div className="flex flex-wrap gap-4">
                {names.map((n) => (
                  <ColourSwatch key={n} name={n} themeKey={themeKey} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section style={CARD}>
          <h2 style={H2}>Spacing</h2>
          <p style={CAPTION}>4px grid — for custom CSS; Tailwind spacing utilities still apply.</p>
          {SPACE_KEYS.map((k) => (
            <SpacingBar key={k} name={k} />
          ))}
        </section>

        <section style={CARD}>
          <h2 style={H2}>Type scale</h2>
          <p style={CAPTION}>
            Text sizes, then line-height examples at <code>--lp-text-base</code>.
          </p>
          {TEXT_SIZES.map((k) => (
            <p
              key={k}
              className="mb-2"
              style={{
                fontSize: `var(${k})`,
                lineHeight: 'var(--lp-leading-normal)' as React.CSSProperties['lineHeight'],
                color: 'var(--lp-text)',
              }}
            >
              {k} — The quick brown fox jumps over the lazy dog. 1234567890
            </p>
          ))}
          <div className="mt-6 space-y-2 border-t pt-4" style={{ borderColor: 'var(--lp-border)' }}>
            {LEADS.map((lk) => (
              <p
                key={lk}
                style={{
                  fontSize: 'var(--lp-text-base)',
                  lineHeight: `var(${lk})` as React.CSSProperties['lineHeight'],
                  color: 'var(--lp-text)',
                }}
              >
                {lk} — Lorem ipsum dolor sit amet, consectetur adipiscing elit. Longer line for line-height check.
              </p>
            ))}
          </div>
        </section>

        <section style={CARD}>
          <h2 style={H2}>Z-layers</h2>
          <p style={CAPTION}>
            Stacked panels using overlay → dropdown → modal (scoped to this preview only).
          </p>
          <div
            className="relative h-32 overflow-hidden rounded-md"
            style={{ background: 'var(--lp-bg-tertiary)' }}
          >
            <div
              className="absolute left-4 top-4 h-16 w-24 rounded"
              style={{
                background: 'var(--lp-surface)',
                zIndex: Z_SHOWCASE[0].v,
                boxShadow: 'var(--lp-shadow-sm)',
              }}
            />
            <div
              className="absolute left-10 top-6 h-16 w-24 rounded"
              style={{
                background: 'var(--color-lp-orange-subtle)',
                zIndex: Z_SHOWCASE[1].v,
                opacity: 0.85,
              }}
            />
            <div
              className="absolute left-16 top-8 h-16 w-24 rounded border-2"
              style={{
                background: 'var(--lp-surface)',
                borderColor: 'var(--color-lp-orange)',
                zIndex: Z_SHOWCASE[2].v,
              }}
            />
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
            {Z_SHOWCASE.map((z) => `${z.label}: ${z.v}`).join(' · ')}
          </p>
        </section>

        <section style={CARD}>
          <h2 style={H2}>Motion</h2>
          <p style={CAPTION}>
            Each cell pairs one duration and one ease. Hover the bar; it slides using that pair. (
            {MOTION_CELLS.length} combinations)
          </p>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
            {MOTION_CELLS.map(({ dVar, eVar, key }) => (
              <div
                key={key}
                className="flex h-8 items-stretch overflow-hidden rounded border"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <div
                  className="h-full w-8 min-h-0 shrink-0 rounded-sm"
                  style={{ background: 'var(--color-lp-orange-subtle)' }}
                  onMouseEnter={(e) => {
                    const t = e.currentTarget;
                    t.style.transition = `transform var(${dVar}) var(${eVar})`;
                    t.style.transform = 'translateX(56px)';
                  }}
                  onMouseLeave={(e) => {
                    const t = e.currentTarget;
                    t.style.transition = `transform var(${dVar}) var(${eVar})`;
                    t.style.transform = 'translateX(0)';
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        <section style={CARD}>
          <h2 style={H2}>Radii</h2>
          <p style={CAPTION}>Corner radii; cards often use <code>--lp-radius-lg</code>.</p>
          <div className="flex flex-wrap gap-6">
            {RADIUS_VARS.map((r) => (
              <div key={r} className="flex flex-col items-center gap-1">
                <div
                  className="h-16 w-16"
                  style={{
                    borderRadius: `var(${r})`,
                    background: 'var(--lp-surface-hover)',
                    border: '1px solid var(--lp-border)',
                  }}
                />
                <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{r}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={CARD}>
          <h2 style={H2}>Shadows</h2>
          <p style={CAPTION}>
            Adaptive by theme — use the Light / Dark control above. Boxes use <code>--lp-bg</code> with no border.
          </p>
          <div className="flex flex-wrap gap-6">
            {SHADOW_VARS.map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <div
                  className="h-20 w-[120px] rounded"
                  style={{
                    background: 'var(--lp-bg)',
                    boxShadow: `var(${s})`,
                  }}
                />
                <span className="text-center text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{s}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={CARD}>
          <h2 style={H2}>Row density</h2>
          <p style={CAPTION}>Comfortable / compact / tight — for future DataTable and SpreadsheetGrid.</p>
          {(
            [
              { key: 'comfortable', h: '--lp-row-comfortable', py: '--lp-row-cell-padding-y-comfortable' },
              { key: 'compact', h: '--lp-row-compact', py: '--lp-row-cell-padding-y-compact' },
              { key: 'tight', h: '--lp-row-tight', py: '--lp-row-cell-padding-y-tight' },
            ] as const
          ).map((row) => (
            <div key={row.key} style={{ marginBottom: 'var(--lp-space-6)' }}>
              <p className="mb-1 text-sm font-medium" style={{ color: 'var(--lp-text)' }}>{row.key}</p>
              <table className="w-full border-collapse" style={{ fontSize: 'var(--lp-text-sm)' }}>
                <thead>
                  <tr style={{ height: `var(${row.h})` }}>
                    <th
                      className="text-left"
                      style={{
                        padding: `var(${row.py}) var(--lp-row-cell-padding-x)`,
                        color: 'var(--lp-table-header-text)',
                        border: '1px solid var(--lp-border)',
                        background: 'var(--lp-bg-secondary)',
                      }}
                    >
                      Col A
                    </th>
                    <th
                      className="text-left"
                      style={{
                        padding: `var(${row.py}) var(--lp-row-cell-padding-x)`,
                        color: 'var(--lp-table-header-text)',
                        border: '1px solid var(--lp-border)',
                        background: 'var(--lp-bg-secondary)',
                      }}
                    >
                      Col B
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((i) => (
                    <tr key={i} style={{ height: `var(${row.h})` }}>
                      <td
                        style={{
                          padding: `var(${row.py}) var(--lp-row-cell-padding-x)`,
                          border: '1px solid var(--lp-border)',
                        }}
                      >
                        Row {i} A
                      </td>
                      <td
                        style={{
                          padding: `var(${row.py}) var(--lp-row-cell-padding-x)`,
                          border: '1px solid var(--lp-border)',
                        }}
                      >
                        {i * 1000}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section style={CARD}>
          <h2 style={H2}>Page shell metrics (UX02)</h2>
          <p style={CAPTION}>Future TopBar + LeftRail + content + slide-over — not wired in layout yet; labels reference tokens.</p>
          <div
            className="overflow-auto rounded"
            style={{ background: 'var(--lp-bg-tertiary)', padding: 'var(--lp-space-4)' }}
          >
            <svg viewBox="0 0 320 200" width="100%" style={{ maxWidth: 480 }} aria-hidden>
              <rect x="0" y="0" width="320" height="40" fill="var(--lp-surface)" stroke="var(--lp-border)" />
              <text x="8" y="25" fontSize="9" fill="var(--lp-text-tertiary)">
                --lp-topbar-height
              </text>
              <rect x="0" y="40" width="64" height="160" fill="var(--lp-bg-secondary)" stroke="var(--lp-border)" />
              <text x="4" y="128" fontSize="7" fill="var(--lp-text-tertiary)" transform="rotate(-90 8 120)">
                rail
              </text>
              <rect x="64" y="40" width="200" height="160" fill="var(--lp-surface)" stroke="var(--lp-border)" />
              <text x="100" y="100" fontSize="9" fill="var(--lp-text-tertiary)">
                content
              </text>
              <rect
                x="264"
                y="40"
                width="56"
                height="160"
                fill="var(--lp-surface-hover)"
                stroke="var(--color-lp-orange)"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            </svg>
          </div>
        </section>
      </div>
    </div>
  );
}
