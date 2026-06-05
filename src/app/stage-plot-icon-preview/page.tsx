/* ============================================
   LOWPASS — Stage Plot icon catalog (dev only) (§SP1a·2)

   Renders every built-in icon in both library + canvas modes,
   grouped by category, with footprint labels. A development
   verification + browsing tool for the icon sprint (§SP1a–§SP1c).
   Dev-gated: returns 404 in production.
   ============================================ */
'use client';

import { ALL_ICONS, CATEGORIES, listIconsByCategory } from '@/lib/stage-plot/icons';
import { StagePlotIcon } from '@/components/stage-plot/StagePlotIcon';

export default function StagePlotIconPreviewPage() {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div style={{ padding: 32, background: 'var(--lp-bg)', color: 'var(--lp-text)', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 'var(--lp-text-2xl)', fontWeight: 700, marginBottom: 4 }}>Stage Plot icons</h1>
      <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', marginBottom: 24 }}>
        {ALL_ICONS.length} built-in icons · library (outline) vs canvas (brand-tint fill + category stroke)
      </p>

      {CATEGORIES.map((cat) => {
        const icons = listIconsByCategory(cat.key);
        if (icons.length === 0) return null;
        return (
          <section key={cat.key} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 'var(--lp-text-md)', fontWeight: 600, marginBottom: 12 }}>
              {cat.label} <span style={{ color: 'var(--lp-text-tertiary)' }}>· {cat.badge}</span>
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {icons.map((icon) => (
                <div
                  key={icon.name}
                  style={{
                    width: 120,
                    padding: 12,
                    border: '1px solid var(--lp-border)',
                    borderRadius: 10,
                    background: 'var(--lp-surface)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center', height: 64 }}>
                    <StagePlotIcon icon={icon} mode="library" size={36} />
                    <StagePlotIcon icon={icon} mode="canvas" size={48} showBadge={false} />
                  </div>
                  <div style={{ fontSize: 'var(--lp-text-xs)', marginTop: 8, fontWeight: 500 }}>{icon.label}</div>
                  <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                    {icon.footprint.width_ft}×{icon.footprint.depth_ft} ft
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
