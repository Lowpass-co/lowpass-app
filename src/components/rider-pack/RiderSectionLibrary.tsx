/* ============================================
   LOWPASS — Rider · Section Library (§RA5)

   280px left rail in builder mode: search + scrollable list of
   draggable, click-to-expand section template cards + a blank-section
   CTA. Ports src/components/advance/AdvanceSectionLibrary.tsx:120-555
   (fetch → platform/custom split → LibraryCard drag-source + expand →
   per-field drag + add-event → bottom CTA).

   Rider deviations (data-shape justified):
   - Fetches GET /api/rider-section-templates (table seeded in 111).
   - Icon map covers the rider seed icons.
   - Drag payload keys + the field-add CustomEvent are rider-namespaced
     (rider:field-add); §RA6 shell + §RA7 canvas listen for them.
   - Contacts leads naturally via sort_order (no "Key Contacts" pin).
   Reuses FieldTypeIcon as-is.
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  GripVertical,
  Plus,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Users,
  Clock,
  Mic,
  Headphones,
  Lightbulb,
  Guitar,
  Square,
  ShieldCheck,
  Coffee,
  UtensilsCrossed,
  Truck,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { FieldTypeIcon } from '@/components/advance/FieldTypeIcon';

type FieldDef = { id: string; label: string; type: string; required?: boolean };

type ApiTemplate = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  fields: FieldDef[];
  workspace_id: string | null;
  sort_order: number | null;
};

const ICON_BY_NAME: Record<string, LucideIcon> = {
  users: Users,
  'users-2': Users,
  clock: Clock,
  mic: Mic,
  headphones: Headphones,
  lightbulb: Lightbulb,
  guitar: Guitar,
  square: Square,
  shield: ShieldCheck,
  coffee: Coffee,
  utensils: UtensilsCrossed,
  truck: Truck,
  'shopping-bag': ShoppingBag,
};

/** Drag payload keys (rider-namespaced). Section card carries the
 *  template UUID; a single field carries a JSON field payload. */
export const RIDER_SECTION_DRAG_TYPE = 'application/x-lp-rider-section-id';
export const RIDER_FIELD_DRAG_TYPE = 'application/x-lp-rider-field';

/** "Add this single field" intent — the §RA7 canvas listens on window. */
function dispatchFieldAdd(templateId: string, templateLabel: string, field: FieldDef) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('rider:field-add', {
      detail: {
        templateId,
        label: templateLabel,
        field: { id: field.id, label: field.label, type: field.type, required: field.required ?? false },
      },
    }),
  );
}

export function RiderSectionLibrary({ onAddBlank }: { onAddBlank?: () => void }) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/rider-section-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j: { templates?: ApiTemplate[] }) => {
        if (cancelled) return;
        setTemplates(j.templates ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTemplates([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => (t.name ?? '').toLowerCase().includes(q));
  }, [templates, query]);

  const platform = useMemo(() => filtered.filter((t) => t.workspace_id == null), [filtered]);
  const custom = useMemo(() => filtered.filter((t) => t.workspace_id != null), [filtered]);

  return (
    <aside
      className="advance-read-no-print flex shrink-0 flex-col"
      style={{ width: 280, borderRight: '1px solid var(--lp-border-strong)', background: 'var(--lp-panel)' }}
    >
      {/* Search */}
      <div className="shrink-0" style={{ padding: 12, borderBottom: '1px solid var(--lp-border-subtle)' }}>
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{ width: 14, height: 14, color: 'var(--lp-text-tertiary)', pointerEvents: 'none' }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sections…"
            aria-label="Filter sections"
            style={{
              width: '100%',
              padding: '6px 8px 6px 26px',
              fontSize: '13px',
              background: 'var(--lp-bg-deep)',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 2,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: 12, fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
            Loading templates…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 12, fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
            {query.trim() ? 'No matches.' : 'No templates available.'}
          </div>
        ) : (
          <>
            {platform.length > 0 ? <SectionDivider label="Platform" first /> : null}
            <ul className="flex flex-col" style={{ gap: 6 }}>
              {platform.map((t) => (
                <li key={t.id}>
                  <LibraryCard template={t} expanded={expandedId === t.id} onToggle={() => setExpandedId((c) => (c === t.id ? null : t.id))} />
                </li>
              ))}
            </ul>
            {custom.length > 0 ? <SectionDivider label="Custom" /> : null}
            <ul className="flex flex-col" style={{ gap: 6 }}>
              {custom.map((t) => (
                <li key={t.id}>
                  <LibraryCard template={t} expanded={expandedId === t.id} onToggle={() => setExpandedId((c) => (c === t.id ? null : t.id))} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Bottom CTA — blank custom section */}
      <div className="shrink-0" style={{ padding: 12, borderTop: '1px solid var(--lp-border-subtle)' }}>
        <button
          type="button"
          onClick={onAddBlank}
          className="btn-transition flex w-full items-center justify-center gap-1.5"
          style={{
            height: 36,
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--lp-text-secondary)',
            background: 'transparent',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Blank custom section
        </button>
      </div>
    </aside>
  );
}

function SectionDivider({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <div className="lp-label-caps" style={{ marginTop: first ? 0 : 12, marginBottom: 6, padding: '0 4px', color: 'var(--lp-text-tertiary)' }}>
      {label}
    </div>
  );
}

function LibraryCard({ template, expanded, onToggle }: { template: ApiTemplate; expanded: boolean; onToggle: () => void }) {
  const Icon = template.icon ? (ICON_BY_NAME[template.icon] ?? ClipboardList) : ClipboardList;
  const fieldCount = template.fields?.length ?? 0;

  return (
    <div
      className="btn-transition"
      style={{
        background: expanded ? 'color-mix(in srgb, var(--color-lp-orange) 6%, var(--lp-bg-deep))' : 'var(--lp-bg-deep)',
        border: `1px solid ${expanded ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(RIDER_SECTION_DRAG_TYPE, template.id);
          e.dataTransfer.setData('text/plain', template.name);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        className="flex items-center"
        style={{ gap: 8, padding: '8px 10px', cursor: 'grab' }}
      >
        <GripVertical className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} aria-hidden />
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: 28, height: 28, background: 'var(--lp-surface)', color: 'var(--color-lp-orange)', borderRadius: 4 }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--lp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {template.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>
            <span className="lp-mono">{fieldCount}</span> {fieldCount === 1 ? 'field' : 'fields'}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={expanded ? 'Collapse fields' : 'Expand fields'}
          aria-expanded={expanded}
          className="flex shrink-0 items-center justify-center"
          style={{ width: 24, height: 24, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--lp-text-tertiary)', borderRadius: 2 }}
        >
          {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
      </div>

      {expanded ? (
        <div style={{ borderTop: '1px solid var(--lp-border-subtle)', background: 'var(--lp-panel)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldCount === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>No fields defined.</div>
          ) : (
            template.fields.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData(
                    RIDER_FIELD_DRAG_TYPE,
                    JSON.stringify({ templateId: template.id, label: template.name, field: { id: f.id, label: f.label, type: f.type, required: f.required ?? false } }),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => dispatchFieldAdd(template.id, template.name, f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    dispatchFieldAdd(template.id, template.name, f);
                  }
                }}
                className="group flex cursor-grab items-center rounded"
                style={{ gap: 8, padding: '3px 4px' }}
                title="Click or drag to add this field"
              >
                <FieldTypeIcon type={f.type} size={12} />
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: '12px', color: 'var(--lp-text)' }}>
                  {f.label}
                </span>
                {f.required ? (
                  <span aria-label="Required" title="Required" style={{ fontSize: '10px', color: 'var(--color-lp-orange)' }}>
                    *
                  </span>
                ) : null}
                <Plus size={12} aria-hidden className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--color-lp-orange)' }} />
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
