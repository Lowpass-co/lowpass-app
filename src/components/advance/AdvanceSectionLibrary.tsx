/* ============================================
   LOWPASS — Advance · Section Library (Variant parity §D)
                 Sprint 8.5 §6a — fetch + expand rewrite

   280px left rail in builder mode. Search input + scrollable list
   of LibraryCards (drag-source, click-to-expand) + bottom CTA for
   blank custom sections.

   Sprint 8.5 §6a — replaces the hardcoded LIBRARY_SEEDS array
   with a fetch from GET /api/advance/templates, which returns
   both platform-wide seeded templates (workspace_id IS NULL —
   from migration 003_seed_advance_templates.sql) AND workspace-
   custom templates created via "Save as template." Each card
   maps to a real template object — clicking the card expands it
   to show the section's actual field list (label + type icon).

   Sprint 8.5 §6b — drag payload now carries the template's UUID
   (was hardcoded slug like "hospitality"). The receiver
   (AdvanceSectionBuilder.addSectionFromDrop) matches by ID first
   for an unambiguous lookup, then falls back to name-match for
   safety.

   Drag mechanism: cards expose draggable="true" + write the
   template id into the dataTransfer payload. The SectionDropZone
   sibling reads it on drop.
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
  Speaker,
  UtensilsCrossed,
  Clock,
  Truck,
  Bed,
  Plane,
  Building,
  ShoppingBag,
  ShieldCheck,
  MapPin,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import { FieldTypeIcon } from './FieldTypeIcon';

type FieldDef = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
};

type ApiTemplate = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  fields: FieldDef[];
  workspace_id: string | null;
  sort_order: number | null;
  tm_only?: boolean;
};

/** Map the seed migration's `icon` string → lucide component.
 *  Unknown icons fall back to ClipboardList. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  speaker: Speaker,
  utensils: UtensilsCrossed,
  clock: Clock,
  truck: Truck,
  bed: Bed,
  plane: Plane,
  building: Building,
  'shopping-bag': ShoppingBag,
  shield: ShieldCheck,
  'map-pin': MapPin,
  banknote: Banknote,
};

/** dataTransfer key. Sprint 8.5 §6 keeps the same key but the
 *  value is now a template UUID (not a hardcoded slug). */
export const SECTION_LIBRARY_DRAG_TYPE = 'application/x-lp-section-library-id';

export function AdvanceSectionLibrary({
  onAddBlank,
}: {
  /** Optional: invoked when the user clicks "+ Blank Custom Section". */
  onAddBlank?: () => void;
}) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch on mount. /api/advance/templates returns platform-wide
  // (workspace_id IS NULL) + workspace-custom templates in one
  // payload, ordered platform-first then by sort_order/name.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/advance/templates')
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
    return templates.filter((t) =>
      (t.name ?? '').toLowerCase().includes(q),
    );
  }, [templates, query]);

  // Sprint 8.5 §6a — split into platform vs custom for the
  // micro-label dividers Adam approved. workspace_id IS NULL ⇒
  // platform; non-null ⇒ workspace custom.
  const platform = useMemo(
    () => filtered.filter((t) => t.workspace_id == null),
    [filtered],
  );
  const custom = useMemo(
    () => filtered.filter((t) => t.workspace_id != null),
    [filtered],
  );

  return (
    <aside
      className="advance-read-no-print flex shrink-0 flex-col"
      style={{
        width: 280,
        borderRight: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-panel)',
      }}
    >
      {/* Search */}
      <div
        className="shrink-0"
        style={{
          padding: 12,
          borderBottom: '1px solid var(--lp-border-subtle)',
        }}
      >
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{
              width: 14,
              height: 14,
              color: 'var(--lp-text-tertiary)',
              pointerEvents: 'none',
            }}
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

      {/* Scrollable library list */}
      <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        {loading ? (
          <div
            style={{
              padding: 12,
              fontSize: '12px',
              color: 'var(--lp-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Loading templates…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: '12px',
              color: 'var(--lp-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            {query.trim() ? 'No matches.' : 'No templates available.'}
          </div>
        ) : (
          <>
            {platform.length > 0 ? (
              <SectionDivider label="Platform" first />
            ) : null}
            <ul className="flex flex-col" style={{ gap: 6 }}>
              {platform.map((t) => (
                <li key={t.id}>
                  <LibraryCard
                    template={t}
                    expanded={expandedId === t.id}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === t.id ? null : t.id))
                    }
                  />
                </li>
              ))}
            </ul>
            {custom.length > 0 ? <SectionDivider label="Custom" /> : null}
            <ul className="flex flex-col" style={{ gap: 6 }}>
              {custom.map((t) => (
                <li key={t.id}>
                  <LibraryCard
                    template={t}
                    expanded={expandedId === t.id}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === t.id ? null : t.id))
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Bottom CTA — blank custom section */}
      <div
        className="shrink-0"
        style={{
          padding: 12,
          borderTop: '1px solid var(--lp-border-subtle)',
        }}
      >
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

function SectionDivider({
  label,
  first = false,
}: {
  label: string;
  first?: boolean;
}) {
  return (
    <div
      className="lp-label-caps"
      style={{
        marginTop: first ? 0 : 12,
        marginBottom: 6,
        padding: '0 4px',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {label}
    </div>
  );
}

function LibraryCard({
  template,
  expanded,
  onToggle,
}: {
  template: ApiTemplate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = template.icon
    ? (ICON_BY_NAME[template.icon] ?? ClipboardList)
    : ClipboardList;
  const fieldCount = template.fields?.length ?? 0;

  return (
    <div
      className="btn-transition"
      style={{
        background: 'var(--lp-bg-deep)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Header row — drag-source + click to expand. The whole
          row is draggable so the user can grab anywhere; the
          click-to-expand is wired to a button (so screen readers
          announce the expanded state) but mousedown inside the
          card still initiates a drag. */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SECTION_LIBRARY_DRAG_TYPE, template.id);
          e.dataTransfer.setData('text/plain', template.name);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        className="flex items-center"
        style={{
          gap: 8,
          padding: '8px 10px',
          cursor: 'grab',
        }}
      >
        <GripVertical
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--color-lp-orange)' }}
          aria-hidden
        />
        <span
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: 'var(--lp-surface)',
            color: 'var(--color-lp-orange)',
            borderRadius: 4,
          }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--lp-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {template.name}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            <span className="lp-mono">{fieldCount}</span>{' '}
            {fieldCount === 1 ? 'field' : 'fields'}
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
          style={{
            width: 24,
            height: 24,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--lp-text-tertiary)',
            borderRadius: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--lp-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--lp-text-tertiary)';
          }}
        >
          {expanded ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
        </button>
      </div>

      {/* Expanded field list — full labels + type icons. */}
      {expanded ? (
        <div
          style={{
            borderTop: '1px solid var(--lp-border-subtle)',
            background: 'var(--lp-panel)',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {fieldCount === 0 ? (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--lp-text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              No fields defined.
            </div>
          ) : (
            template.fields.map((f) => (
              <div
                key={f.id}
                className="flex items-center"
                style={{ gap: 8 }}
              >
                <FieldTypeIcon type={f.type} size={12} />
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{
                    fontSize: '12px',
                    color: 'var(--lp-text)',
                  }}
                >
                  {f.label}
                </span>
                {f.required ? (
                  <span
                    aria-label="Required"
                    title="Required"
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-lp-orange)',
                    }}
                  >
                    *
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
