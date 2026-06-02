/* ============================================================
   LOWPASS — Stage Plot icon debug page (§SP-FIX-1a)

   Dev-only (middleware allow-lists /stage-plot-* when NODE_ENV
   !== production). Renders the 8 canonical anchors at the four
   review sizes (16 / 32 / 80 / 240px) in BOTH library + canvas
   modes, then the entire current registry by category so the
   visual-language audit is a direct side-by-side. Use it to
   confirm the set reads as one coherent family at every size.
   ============================================================ */
'use client';

import { useState } from 'react';
import { StagePlotIcon } from '@/components/stage-plot/StagePlotIcon';
import { canonicalIcons } from '@/lib/stage-plot/icons/canonical';
import { ALL_ICONS, CATEGORIES } from '@/lib/stage-plot/icons';
import type { IconDescriptor } from '@/lib/stage-plot/icons/types';

const SIZES = [16, 32, 80, 240] as const;
const BRAND = '#FF4500';

function Swatch({ icon, mode }: { icon: IconDescriptor; mode: 'library' | 'canvas' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, padding: '10px 0' }}>
      {SIZES.map((s) => (
        <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: s, height: s }}>
            <StagePlotIcon icon={icon} mode={mode} size={s} brandColor={BRAND} showBadge={false} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--lp-text-tertiary)' }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ icon }: { icon: IconDescriptor }) {
  return (
    <div style={{ border: '1px solid var(--lp-border)', borderRadius: 8, padding: 14, background: 'var(--lp-surface)' }}>
      <div style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)' }}>{icon.label}</div>
      <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginBottom: 6 }}>
        {icon.name} · {icon.footprint.width_ft}×{icon.footprint.depth_ft} ft · {icon.viewBox ?? '0 0 100 100'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--lp-text-tertiary)' }}>library</div>
      <Swatch icon={icon} mode="library" />
      <div style={{ fontSize: 10, color: 'var(--lp-text-tertiary)' }}>canvas (brand tint)</div>
      <Swatch icon={icon} mode="canvas" />
    </div>
  );
}

export default function StagePlotIconDebugPage() {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const match = (i: IconDescriptor) => !q || `${i.name} ${i.label}`.toLowerCase().includes(q);

  return (
    <div style={{ padding: 28, background: 'var(--lp-bg)', minHeight: '100vh', color: 'var(--lp-text)' }}>
      <h1 style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 700 }}>Stage Plot — icon audit</h1>
      <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', maxWidth: 720 }}>
        Canonical anchors first (§SP-FIX-1a), then the current registry for comparison. Each row shows 16 / 32 / 80 / 240px.
        The set should read as one visual language: same stroke weight, same detail vocabulary, top-down footprints.
      </p>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter by name / label…"
        style={{ margin: '14px 0', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)', width: 280 }}
      />

      <section style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 'var(--lp-text-md)', fontWeight: 700, color: 'var(--lp-orange)' }}>
          ★ Canonical anchors ({canonicalIcons.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginTop: 10 }}>
          {canonicalIcons.filter(match).map((i) => (
            <Card key={i.name} icon={i} />
          ))}
        </div>
      </section>

      {CATEGORIES.map((cat) => {
        const icons = ALL_ICONS.filter((i) => i.category === cat.key && match(i));
        if (!icons.length) return null;
        return (
          <section key={cat.key} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 'var(--lp-text-md)', fontWeight: 700 }}>
              {cat.label} <span style={{ color: 'var(--lp-text-tertiary)', fontWeight: 400 }}>({icons.length})</span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginTop: 10 }}>
              {icons.map((i) => (
                <Card key={i.name} icon={i} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
