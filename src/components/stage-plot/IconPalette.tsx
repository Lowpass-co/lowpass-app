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

  // Custom-item generator (§SP-FIX-1b·5): generate an icon from an
  // uploaded photo. Saved to the workspace library by the endpoint;
  // previewed here. (Dragging customs onto the canvas needs the §SP10
  // custom-library/canvas resolution — not wired yet.)
  const [genOpen, setGenOpen] = useState(false);
  const [genLabel, setGenLabel] = useState('');
  const [genW, setGenW] = useState('1');
  const [genD, setGenD] = useState('1');
  const [genFile, setGenFile] = useState<File | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  const [generated, setGenerated] = useState<IconDescriptor[]>([]);

  const generateFromImage = async () => {
    if (!genLabel.trim() || !genFile) {
      setGenErr('Pick an image and enter a name.');
      return;
    }
    setGenBusy(true);
    setGenErr('');
    try {
      const fd = new FormData();
      fd.append('label', genLabel.trim());
      fd.append('w', genW);
      fd.append('d', genD);
      fd.append('image', genFile);
      const res = await fetch('/api/stage-plot/icons/generate', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setGenErr(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const it = json.item;
      setGenerated((prev) => [
        { name: it.name, label: it.label, category: 'utility' as IconDescriptor['category'], footprint: it.footprint, viewBox: it.viewBox, body: it.body },
        ...prev,
      ]);
      setGenLabel('');
      setGenFile(null);
      setGenOpen(false);
    } catch (e) {
      setGenErr(String(e));
    } finally {
      setGenBusy(false);
    }
  };

  const customField: React.CSSProperties = { fontSize: 'var(--lp-text-xs)', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)' };

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
                  title={`${icon.label} — drag onto the stage or click to add`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', icon.name);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(icon.name)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 6, borderRadius: 8, border: '1px solid transparent', background: 'transparent', cursor: 'grab', color: 'var(--lp-text-secondary)' }}
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

        {!query.trim() ? (
          <section style={{ marginBottom: 16, borderTop: '1px solid var(--lp-border)', paddingTop: 12 }}>
            <h3 style={{ fontSize: 'var(--lp-text-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)', margin: '0 0 8px' }}>
              Custom (AI)
            </h3>
            {generated.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 6, marginBottom: 8 }}>
                {generated.map((icon) => (
                  <div key={icon.name} title={`${icon.label} — saved to the workspace library`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 6 }}>
                    <StagePlotIcon icon={icon} mode="library" size={30} showBadge={false} />
                    {showLabels && <span style={{ fontSize: 9, lineHeight: 1.1, textAlign: 'center', color: 'var(--lp-text-tertiary)' }}>{icon.label}</span>}
                  </div>
                ))}
              </div>
            ) : null}

            {genOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px solid var(--lp-border)', borderRadius: 8, background: 'var(--lp-surface)' }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 5 * 1024 * 1024) {
                      setGenErr('Image exceeds 5MB');
                      setGenFile(null);
                    } else {
                      setGenErr('');
                      setGenFile(f);
                    }
                  }}
                  style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}
                />
                <input value={genLabel} onChange={(e) => setGenLabel(e.target.value)} placeholder="name e.g. Wireless rack" style={customField} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={genW} onChange={(e) => setGenW(e.target.value)} placeholder="W ft" style={{ ...customField, width: '50%' }} />
                  <input value={genD} onChange={(e) => setGenD(e.target.value)} placeholder="D ft" style={{ ...customField, width: '50%' }} />
                </div>
                {genErr ? <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-danger, #e5484d)' }}>⚠ {genErr}</div> : null}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={generateFromImage}
                    disabled={genBusy || !genFile || !genLabel.trim()}
                    style={{ flex: 1, fontSize: 'var(--lp-text-xs)', padding: '6px', borderRadius: 6, border: 'none', background: 'var(--lp-orange)', color: '#fff', fontWeight: 600, cursor: genBusy ? 'default' : 'pointer', opacity: genBusy || !genFile || !genLabel.trim() ? 0.6 : 1 }}
                  >
                    {genBusy ? 'Generating…' : 'Generate'}
                  </button>
                  <button type="button" onClick={() => { setGenOpen(false); setGenErr(''); }} disabled={genBusy} style={{ fontSize: 'var(--lp-text-xs)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setGenOpen(true)}
                style={{ width: '100%', fontSize: 'var(--lp-text-xs)', padding: '7px', borderRadius: 6, border: '1px dashed var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}
              >
                ＋ Generate icon from image
              </button>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
