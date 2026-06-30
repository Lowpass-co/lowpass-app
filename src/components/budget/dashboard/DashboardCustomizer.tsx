'use client';

/* ============================================
   LOWPASS — <DashboardCustomizer> (P&L brick dashboard, Phase 1 — #29)

   A "Customize" control for the Summary brick layout. Opens a small popover with
   a draggable show/hide list — the SAME interaction model as the export template
   builder's Sections accordion (GripVertical drag-to-reorder + Eye toggle).
   In-memory only in Phase 1 (the parent owns the DashboardConfig state); a Reset
   restores the DEFAULT (today's layout). Token-clean.
   ============================================ */

import { useState } from 'react';
import { Eye, EyeOff, GripVertical, LayoutDashboard, RotateCcw } from 'lucide-react';
import {
  DASHBOARD_BRICK_LABELS,
  DEFAULT_DASHBOARD_CONFIG,
  type DashboardBrickId,
  type DashboardConfig,
} from './dashboardConfig';

export function DashboardCustomizer({
  config,
  onChange,
}: {
  config: DashboardConfig;
  onChange: (next: DashboardConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<DashboardBrickId | null>(null);

  const toggle = (id: DashboardBrickId) =>
    onChange({ ...config, bricks: config.bricks.map((b) => (b.id === id ? { ...b, show: !b.show } : b)) });

  const reorder = (fromId: DashboardBrickId, toId: DashboardBrickId) => {
    if (fromId === toId) return;
    const arr = [...config.bricks];
    const from = arr.findIndex((b) => b.id === fromId);
    const to = arr.findIndex((b) => b.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    onChange({ ...config, bricks: arr });
  };

  const hiddenCount = config.bricks.filter((b) => !b.show).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
        style={{
          borderColor: 'var(--lp-border)',
          color: 'var(--lp-text-secondary)',
          background: 'transparent',
          fontSize: 13,
          fontWeight: 'var(--lp-weight-medium)',
          cursor: 'pointer',
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Show, hide and reorder the dashboard bricks"
      >
        <LayoutDashboard className="h-4 w-4" aria-hidden />
        Customize{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
      </button>

      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            role="dialog"
            aria-label="Customize dashboard"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, width: 320,
              background: 'var(--lp-panel)', border: '1px solid var(--lp-border)',
              borderRadius: 'var(--lp-radius-md)', boxShadow: 'var(--lp-shadow-lg, 0 8px 24px rgba(0,0,0,0.3))',
              padding: 'var(--lp-space-4, 12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
                Dashboard bricks
              </span>
              <button
                type="button"
                onClick={() => onChange(structuredClone(DEFAULT_DASHBOARD_CONFIG))}
                className="btn-transition inline-flex items-center gap-1"
                style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--lp-text-secondary)' }}
                title="Restore the default layout"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Reset
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {config.bricks.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== b.id) reorder(dragId, b.id); }}
                  onDragEnd={() => setDragId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                    borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)',
                    background: dragId === b.id ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'transparent',
                    cursor: 'grab', opacity: b.show ? 1 : 0.55,
                  }}
                >
                  <GripVertical className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)', flex: '0 0 auto' }} aria-hidden />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--lp-text)' }}>{DASHBOARD_BRICK_LABELS[b.id]}</span>
                  <button
                    type="button" onClick={() => toggle(b.id)} className="btn-transition"
                    aria-label={b.show ? 'Hide brick' : 'Show brick'} aria-pressed={b.show}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: b.show ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)', padding: 2 }}
                  >
                    {b.show ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginTop: 8 }}>
              Drag to reorder · eye to show/hide. Layout resets on reload (saved layouts come in Phase 2).
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
