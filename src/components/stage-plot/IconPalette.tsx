/* ============================================
   LOWPASS — <IconPalette> (§SP2b / §SP3)

   Categorised, searchable icon library. Click an icon to add it
   to the plot. Library state = outline; optional global label
   toggle. The properties panel + canvas live alongside in
   <StagePlotEditor>.
   ============================================ */
'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, searchIcons, listIconsByCategory } from '@/lib/stage-plot/icons';
import { StagePlotIcon } from '@/components/stage-plot/StagePlotIcon';
import type { IconDescriptor } from '@/lib/stage-plot/icons/types';

export interface IconPaletteProps {
  onAdd: (iconName: string) => void;
}

export function IconPalette({ onAdd }: IconPaletteProps) {
  const [query, setQuery] = useState('');
  const [showLabels, setShowLabels] = useState(false);

  const sections = useMemo(() => {
    if (query.trim()) {
      const hits = searchIcons(query);
      return [{ key: 'search', label: `Results (${hits.length})`, icons: hits }];
    }
    return CATEGORIES.map((c) => ({ key: c.key, label: c.label, icons: listIconsByCategory(c.key) })).filter(
      (s) => s.icons.length > 0,
    );
  }, [query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--lp-border)', background: 'var(--lp-bg)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--lp-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          style={{ flex: 1, fontSize: 'var(--lp-text-sm)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }}
        />
        <button
          type="button"
          onClick={() => setShowLabels((s) => !s)}
          title="Toggle labels"
          style={{ fontSize: 'var(--lp-text-2xs)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--lp-border)', background: showLabels ? 'var(--lp-surface-hover)' : 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}
        >
          Aa
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {sections.map((s) => (
          <section key={s.key} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 'var(--lp-text-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)', margin: '0 0 8px' }}>
              {s.label}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 6 }}>
              {s.icons.map((icon: IconDescriptor) => (
                <button
                  key={icon.name}
                  type="button"
                  title={icon.label}
                  onClick={() => onAdd(icon.name)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 6, borderRadius: 8, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--lp-surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <StagePlotIcon icon={icon} mode="library" size={30} showBadge={false} />
                  {showLabels && (
                    <span style={{ fontSize: 9, lineHeight: 1.1, textAlign: 'center', color: 'var(--lp-text-tertiary)' }}>{icon.label}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
