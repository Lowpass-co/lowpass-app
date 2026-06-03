/* ============================================
   LOWPASS — Rider · Section Builder (§RA7a)

   The accordion canvas at the centre of the builder shell. Slimmer
   mirror of src/components/advance/AdvanceSectionBuilder.tsx (6046 LOC)
   — target <2000 LOC, dropping the FillMode/SetupMode split, the date
   strip, conflict detection, and the specialised section cards that
   bloat the original.

   §RA7a scope (this commit): fetch the pack's sections, render each as
   an expand/collapse accordion card, drag-reorder sections, inline
   title edit, delete. Mirrors Advance's section card + native HTML5
   drag (AdvanceSectionBuilder.tsx:5026-5124 header/body; 1760-1835
   section reorder — native drag, MIME-gated, NOT dnd-kit; persists via
   per-row sort_order).

   Deferred to later sub-phases (placeholders / no-ops until then):
   - §RA7b: field rows inside the body + field drag-reorder + type picker
   - §RA7c: add section (blank + template fork via rider:section-drop),
     add custom field, and the snapshot/auto-save system. Until §RA7c
     the shell's drop zone dispatches rider:section-drop into the void.

   Rider adaptations (data-shape):
   - Sections come from rider_sections (getPackRaw → {pack, sections}),
     keyed by section_key, fields is a JSONB Field[] (9 real field
     types, not Advance's 12). rich_text / channel_list / advance_summary
     are SECTION types whose body lives in metadata, so the body shows a
     type label rather than a field list for those.
   - Status pill is deferred to §RA11 (the rider_sections.status column
     exists but the PATCH allow-list doesn't expose it yet).
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getPackRaw, updateSection, deleteSection } from '@/lib/rider-packs/client';
import type { RiderSection, SectionType } from '@/lib/rider-packs/types';

/** Native-drag MIME for SECTION reorder. Distinct from the library's
 *  add MIME (application/x-lp-rider-section-id) so a library card drop
 *  never reads as a reorder and vice-versa. */
const SECTION_REORDER_MIME = 'application/x-lp-rider-section-reorder';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  fields: 'fields',
  channel_list: 'channel list',
  rich_text: 'rich text',
  advance_summary: 'advance summary',
};

export function RiderSectionBuilder({ packId }: { packId: string }) {
  const [sections, setSections] = useState<RiderSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>('idle');

  // --- load -----------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    getPackRaw(packId)
      .then(({ sections }) => {
        if (!alive) return;
        const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
        setSections(sorted);
      })
      .catch((e: Error) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [packId]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // --- persist sort_order for rows whose index changed ----------------------
  const persistOrder = useCallback(
    async (next: RiderSection[], prevById: Map<string, number>) => {
      // `next` is already renumbered (sort_order === index), so only the
      // rows whose index moved need a PATCH and sort_order is authoritative.
      const changed = next.filter((s, i) => prevById.get(s.id) !== i);
      if (changed.length === 0) return;
      setSave('saving');
      try {
        await Promise.all(changed.map((s) => updateSection(packId, s.id, { sort_order: s.sort_order })));
        setSave('saved');
      } catch {
        setSave('error');
      }
    },
    [packId],
  );

  const moveSection = useCallback(
    (from: number, to: number) => {
      setSections((prev) => {
        if (!prev || from === to) return prev;
        const prevById = new Map(prev.map((s, i) => [s.id, i]));
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const renumbered = next.map((s, i) => ({ ...s, sort_order: i }));
        void persistOrder(renumbered, prevById);
        return renumbered;
      });
    },
    [persistOrder],
  );

  // --- title edit (onBlur PATCH) --------------------------------------------
  const renameSection = useCallback(
    async (id: string, title: string) => {
      const current = sections?.find((s) => s.id === id);
      if (!current || current.title === title || !title.trim()) return;
      setSections((prev) => prev?.map((s) => (s.id === id ? { ...s, title } : s)) ?? prev);
      setSave('saving');
      try {
        await updateSection(packId, id, { title });
        setSave('saved');
      } catch {
        setSave('error');
      }
    },
    [packId, sections],
  );

  // --- delete ---------------------------------------------------------------
  const removeSection = useCallback(
    async (id: string) => {
      const target = sections?.find((s) => s.id === id);
      if (!target) return;
      if (!window.confirm(`Delete section “${target.title}”? This can't be undone.`)) return;
      setSections((prev) => prev?.filter((s) => s.id !== id) ?? prev);
      setSave('saving');
      try {
        await deleteSection(packId, id);
        setSave('saved');
      } catch {
        setSave('error');
      }
    },
    [packId, sections],
  );

  // --- render ---------------------------------------------------------------
  if (loadError) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border p-4"
        style={{ borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', fontSize: '13px' }}
      >
        <AlertCircle className="h-4 w-4" />
        Couldn’t load sections: {loadError}
      </div>
    );
  }

  if (sections === null) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-xl border p-8"
        style={{ borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', fontSize: '13px' }}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sections…
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-xl border text-center"
        style={{ minHeight: 200, borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', padding: 32 }}
      >
        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--lp-text-secondary)' }}>No sections yet</p>
        <p style={{ fontSize: '12px' }}>Drag a section from the library, or use “Blank custom section”. (Add lands in §RA7c.)</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end" style={{ height: 16 }}>
        <SavePill state={save} />
      </div>
      {sections.map((section, i) => (
        <SectionCard
          key={section.id}
          section={section}
          expanded={expanded.has(section.id)}
          isDragging={dragIndex === i}
          isDropTarget={dropIndex === i && dragIndex !== null && dragIndex !== i}
          onToggle={() => toggle(section.id)}
          onRename={(t) => renameSection(section.id, t)}
          onDelete={() => removeSection(section.id)}
          onDragStart={(e) => {
            e.dataTransfer.setData(SECTION_REORDER_MIME, String(i));
            e.dataTransfer.effectAllowed = 'move';
            setDragIndex(i);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(SECTION_REORDER_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropIndex !== i) setDropIndex(i);
            }
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes(SECTION_REORDER_MIME)) return;
            e.preventDefault();
            const from = Number(e.dataTransfer.getData(SECTION_REORDER_MIME));
            if (!Number.isNaN(from)) moveSection(from, i);
            setDragIndex(null);
            setDropIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setDropIndex(null);
          }}
        />
      ))}
    </div>
  );
}

function SavePill({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map = {
    saving: { text: 'Saving…', color: 'var(--lp-text-tertiary)' },
    saved: { text: 'Saved', color: 'var(--color-lp-status-needs-review)' },
    error: { text: 'Save failed', color: 'var(--color-lp-status-needs-review)' },
  } as const;
  const v = state === 'saved' ? map.saved : state === 'error' ? map.error : map.saving;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: '11px', color: v.color }}>
      {state === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {state === 'saved' ? 'Saved' : v.text}
    </span>
  );
}

interface SectionCardProps {
  section: RiderSection;
  expanded: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SectionCard({
  section,
  expanded,
  isDragging,
  isDropTarget,
  onToggle,
  onRename,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: SectionCardProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const sectionType: SectionType = section.section_type ?? 'fields';
  const isFieldType = sectionType === 'fields';
  const count = section.fields?.length ?? 0;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="advance-builder-section rounded-xl border"
      style={{
        borderColor: isDropTarget ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)',
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDropTarget
          ? '0 0 0 1px color-mix(in srgb, var(--color-lp-orange) 40%, transparent)'
          : undefined,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2" style={{ padding: '10px 12px' }}>
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label="Drag to reorder section"
          className="flex shrink-0 items-center justify-center"
          style={{ width: 24, height: 24, cursor: 'grab', background: 'transparent', border: 'none', color: 'var(--lp-text-tertiary)' }}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse section' : 'Expand section'}
          aria-expanded={expanded}
          className="flex shrink-0 items-center justify-center"
          style={{ width: 24, height: 24, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--lp-text-secondary)' }}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <input
          ref={titleRef}
          defaultValue={section.title}
          onBlur={(e) => onRename(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') titleRef.current?.blur();
          }}
          aria-label="Section title"
          className="min-w-0 flex-1 bg-transparent outline-none"
          style={{ fontSize: '14px', fontWeight: 600, color: 'var(--lp-text)', padding: '2px 4px', borderRadius: 2 }}
        />

        <span className="shrink-0 lp-mono" style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>
          {isFieldType ? `${count} ${count === 1 ? 'field' : 'fields'}` : SECTION_TYPE_LABEL[sectionType]}
        </span>

        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete section"
          className="btn-transition flex shrink-0 items-center justify-center"
          style={{ width: 24, height: 24, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--lp-text-tertiary)', borderRadius: 2 }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body — CSS-grid collapse (mirrors AdvanceSectionBuilder:5122). */}
      <div
        className="grid"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms var(--lp-ease-standard, ease)',
        }}
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{ borderTop: '1px solid var(--lp-border-subtle)', padding: '12px' }}>
            {isFieldType ? (
              <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
                Field rows + type picker land in §RA7b.
              </p>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
                {SECTION_TYPE_LABEL[sectionType]} section — edited in its dedicated surface.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
