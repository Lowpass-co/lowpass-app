/* ============================================
   LOWPASS — Rider · Section Builder (§RA7a + §RA7b + §RA7c)

   The accordion canvas at the centre of the builder shell. Slimmer
   mirror of src/components/advance/AdvanceSectionBuilder.tsx (6046 LOC)
   — target <2000 LOC, dropping the FillMode/SetupMode split, the date
   strip, conflict detection, and the specialised section cards that
   bloat the original.

   §RA7a: fetch sections, accordion expand/collapse, drag-reorder
   sections, inline title edit, delete.
   §RA7b (this commit): field rows inside the section body, drag-reorder
   fields within a section, click-to-select a field (dispatches
   rider:field-selected for the §RA8 properties panel), delete field, and
   a field type picker that appends a new field. Mirrors
   AdvanceSectionBuilder.tsx:1857-1991 (field rows + native field
   reorder, MIME-gated) and :2327-2359 (type picker dropdown) — native
   HTML5 drag, NOT dnd-kit.

   §RA7c (this commit): add SECTION via rider:section-drop (blank +
   template-seeded), the rider:field-add listener (single field from the
   library palette), and the rider:field-updated listener (label edits
   from the §RA8 properties panel). Section-template seed field types are
   a SUPERSET (textarea/boolean) of the 9 real rider types, so
   templateFieldToRiderField maps them (textarea→text, boolean→
   checkbox_list). All mutations persist with direct create/updateSection
   calls (the per-mutation persist IS the auto-save — the builder has no
   Cancel, so no snapshot is needed).

   Still deferred (reported follow-up, needs new mutation API):
   - workspace template FORK on custom-field add (POST/PATCH
     /api/rider-section-templates) — §RA7c-fork.

   Rider adaptations (data-shape):
   - 9 real Field types (text/table/contact/asset/time/currency/number/
     checkbox_list/url) — NOT Advance's 12. No `required` slot on rider
     fields, so rows omit the Required/Optional badge Advance shows.
   - rich_text/channel_list/advance_summary are SECTION types whose body
     lives in metadata → those cards show a type label, not a field list.
   - Status pill deferred to §RA11 (column exists; PATCH allow-list
     doesn't expose it yet).
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  AlertCircle,
  Plus,
  Type as TypeIcon,
  Table as TableIcon,
  User,
  Paperclip,
  Clock,
  DollarSign,
  Hash,
  ListChecks,
  Link2,
  type LucideIcon,
} from 'lucide-react';
import { getPackRaw, createSection, updateSection, deleteSection } from '@/lib/rider-packs/client';
import { useToast } from '@/components/ui/Toast';
import type { Field, FieldType, RiderSection, SectionType } from '@/lib/rider-packs/types';
import {
  RIDER_GROUPS,
  DEFAULT_GROUP_ID,
  sectionGroupId,
  templateGroupId,
  groupLabel,
} from '@/lib/rider-packs/groups';

/** Native-drag MIMEs. Distinct from the library's add MIME
 *  (application/x-lp-rider-section-id) so a library card drop never
 *  reads as a reorder. */
const SECTION_REORDER_MIME = 'application/x-lp-rider-section-reorder';
const FIELD_REORDER_MIME = 'application/x-lp-rider-field-reorder';

/** Matches RIDER_FIELD_SELECTED_EVENT in RiderBuilderShellClient. Kept
 *  as a literal here to avoid a circular import (the shell imports this
 *  builder). */
const FIELD_SELECTED_EVENT = 'rider:field-selected';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  fields: 'fields',
  channel_list: 'channel list',
  rich_text: 'rich text',
  advance_summary: 'advance summary',
};

/** Rider field-type metadata for the row icon + picker. Covers all 9
 *  real Field types (FieldTypeIcon from Advance only knows its own set,
 *  so the rider types table/asset/checkbox_list would fall back). */
export const RIDER_FIELD_META: Record<FieldType, { label: string; Icon: LucideIcon }> = {
  text: { label: 'Text', Icon: TypeIcon },
  table: { label: 'Table', Icon: TableIcon },
  contact: { label: 'Contact', Icon: User },
  asset: { label: 'Asset', Icon: Paperclip },
  time: { label: 'Time', Icon: Clock },
  currency: { label: 'Currency', Icon: DollarSign },
  number: { label: 'Number', Icon: Hash },
  checkbox_list: { label: 'Checklist', Icon: ListChecks },
  url: { label: 'URL', Icon: Link2 },
};

export const FIELD_TYPE_ORDER: FieldType[] = [
  'text',
  'table',
  'contact',
  'asset',
  'time',
  'currency',
  'number',
  'checkbox_list',
  'url',
];

function newKey(type: FieldType): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${type}_${rand}`;
}

/** Default-shaped Field for a freshly added field of a given type. */
function makeField(type: FieldType): Field {
  const key = newKey(type);
  const label = `New ${RIDER_FIELD_META[type].label.toLowerCase()}`;
  switch (type) {
    case 'text':
      return { type, key, label, value: '' };
    case 'table':
      return { type, key, label, columns: [{ key: 'c1', label: 'Column 1' }], rows: [] };
    case 'contact':
      return { type, key, label, entries: [] };
    case 'asset':
      return { type, key, label, asset_id: '' };
    case 'time':
      return { type, key, label, value: '' };
    case 'currency':
      return { type, key, label, amount: 0, currency: 'USD' };
    case 'number':
      return { type, key, label, value: 0 };
    case 'checkbox_list':
      return { type, key, label, items: [] };
    case 'url':
      return { type, key, label, href: '' };
  }
}

/** Subset of GET /api/rider-section-templates rows needed to seed a
 *  section. Field descriptors are the template shape ({id,label,type}),
 *  NOT rider Field objects. */
type TemplateLite = {
  id: string;
  name: string;
  /** B2 — maps the template into a builder group (see groups.ts). */
  template_type?: string;
  fields: Array<{ id?: string; label?: string; type?: string; required?: boolean }>;
};

/** Section-template seed field types are a SUPERSET (textarea/boolean) of
 *  the 9 real rider Field types — map to the nearest rider type. (§RA7c
 *  adaptation; flagged: migration 111 seeds use textarea/boolean.) */
function toRiderFieldType(t: string | undefined): FieldType {
  switch (t) {
    case 'textarea':
      return 'text';
    case 'boolean':
      return 'checkbox_list';
    case 'text':
    case 'table':
    case 'contact':
    case 'asset':
    case 'time':
    case 'currency':
    case 'number':
    case 'checkbox_list':
    case 'url':
      return t;
    default:
      return 'text';
  }
}

/** Build a rider Field from a template field descriptor. */
function templateFieldToRiderField(tf: { id?: string; label?: string; type?: string }): Field {
  const f = makeField(toRiderFieldType(tf.type));
  if (tf.label) f.label = tf.label;
  if (tf.type === 'boolean' && f.type === 'checkbox_list') {
    f.items = [{ key: 'yes', label: f.label ?? 'Yes', checked: false }];
  }
  return f;
}

/** Unique section_key derived from a title. */
function slugKey(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'section';
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 6)
      : Math.random().toString(36).slice(2, 8);
  return `${base}_${rand}`;
}

export function RiderSectionBuilder({ packId }: { packId: string }) {
  const [sections, setSections] = useState<RiderSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* B2 — accordion expansion retired: the canvas renders exactly one section,
     open. Rail selection replaced the expanded-set. */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const { showToast } = useToast();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [fieldDrag, setFieldDrag] = useState<{ sectionId: string; index: number } | null>(null);
  const [fieldDrop, setFieldDrop] = useState<{ sectionId: string; index: number } | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  /* B2 — the grouped builder: fixed tabs + curated adds (session-local until a
     section lands in them), one active group, one section on the canvas. */
  const [activeGroup, setActiveGroup] = useState<string>(DEFAULT_GROUP_ID);
  const [addedGroups, setAddedGroups] = useState<Set<string>>(new Set());
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 2026-08-07 — the add-section menu renders through a PORTAL at a fixed
  // position (Adam: "stuck under a small canvas so the drop down doesn't drop
  // correctly") — the rail's scroll container was clipping it.
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [addMenuPos, setAddMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateLite[] | null>(null);
  /* 2026-08-06 (Adam) — "I don't want to insert all 15 fields if I only want
     one or two": picking a template opens a FIELD CHECKLIST (all pre-checked)
     instead of dumping the whole template. */
  const [pickingTemplate, setPickingTemplate] = useState<TemplateLite | null>(null);
  const [checkedFields, setCheckedFields] = useState<Set<number>>(new Set());

  // Refs mirror the latest state so the window CustomEvent listeners can
  // be stable ([] deps) yet always read current values (no stale closures).
  const sectionsRef = useRef<RiderSection[] | null>(null);
  const activeSectionIdRef = useRef<string | null>(null);
  const templatesRef = useRef<TemplateLite[] | null>(null);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  useEffect(() => {
    activeSectionIdRef.current = activeSectionId;
  }, [activeSectionId]);

  // --- load -----------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    getPackRaw(packId)
      .then(({ sections }) => {
        if (!alive) return;
        const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
        setSections(sorted);
        /* B2 — curated groups that already hold sections open as tabs. */
        const present = new Set<string>();
        for (const s of sorted) present.add(sectionGroupId(s.metadata));
        setAddedGroups(new Set(RIDER_GROUPS.filter((g) => !g.fixed && present.has(g.id)).map((g) => g.id)));
      })
      .catch((e: Error) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [packId]);

  // --- persist section sort_order for rows whose index moved ----------------
  const persistOrder = useCallback(
    async (next: RiderSection[], prevById: Map<string, number>) => {
      const changed = next.filter((s, i) => prevById.get(s.id) !== i);
      if (changed.length === 0) return;
      setSave('saving');
      try {
        await Promise.all(changed.map((s) => updateSection(packId, s.id, { sort_order: s.sort_order })));
        setSave('saved');
      } catch (e) {
        setSave('error');
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [packId, showToast],
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

  const renameSection = useCallback(
    async (id: string, title: string) => {
      const current = sections?.find((s) => s.id === id);
      if (!current || current.title === title || !title.trim()) return;
      setSections((prev) => prev?.map((s) => (s.id === id ? { ...s, title } : s)) ?? prev);
      setSave('saving');
      try {
        await updateSection(packId, id, { title });
        setSave('saved');
      } catch (e) {
        setSave('error');
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [packId, sections, showToast],
  );

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
      } catch (e) {
        setSave('error');
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [packId, sections, showToast],
  );

  // --- field mutations (persist via updateSection({fields})) ----------------
  const persistFields = useCallback(
    async (sectionId: string, fields: Field[]) => {
      setSections((prev) => prev?.map((s) => (s.id === sectionId ? { ...s, fields } : s)) ?? prev);
      setSave('saving');
      try {
        await updateSection(packId, sectionId, { fields });
        setSave('saved');
      } catch (e) {
        setSave('error');
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [packId, showToast],
  );

  const addField = useCallback(
    (sectionId: string, type: FieldType) => {
      setPickerFor(null);
      const section = sections?.find((s) => s.id === sectionId);
      if (!section) return;
      void persistFields(sectionId, [...(section.fields ?? []), makeField(type)]);
    },
    [sections, persistFields],
  );

  const deleteField = useCallback(
    (sectionId: string, key: string) => {
      const section = sections?.find((s) => s.id === sectionId);
      if (!section) return;
      if (selectedKey === key) setSelectedKey(null);
      void persistFields(sectionId, (section.fields ?? []).filter((f) => f.key !== key));
    },
    [sections, persistFields, selectedKey],
  );

  const moveField = useCallback(
    (sectionId: string, from: number, to: number) => {
      if (from === to) return;
      const section = sections?.find((s) => s.id === sectionId);
      if (!section) return;
      const next = [...(section.fields ?? [])];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      void persistFields(sectionId, next);
    },
    [sections, persistFields],
  );

  const selectField = useCallback((field: Field, sectionId: string) => {
    setSelectedKey(field.key);
    setActiveSectionId(sectionId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(FIELD_SELECTED_EVENT, {
          detail: { id: field.key, type: field.type, label: field.label ?? '', required: false },
        }),
      );
    }
  }, []);

  // --- §RA7c: create section + library wiring -------------------------------
  const loadTemplates = useCallback(async () => {
    if (templatesRef.current) return templatesRef.current;
    try {
      const res = await fetch('/api/rider-section-templates');
      const j = res.ok ? await res.json() : { templates: [] };
      templatesRef.current = (j.templates ?? []) as TemplateLite[];
    } catch {
      templatesRef.current = [];
    }
    setTemplates(templatesRef.current); // B2 — the add-section menu renders from state
    return templatesRef.current;
  }, []);

  /* B2 — sections are born INTO the active group (metadata.group rides on the
     create), so a section added from the Technical tab lands in Technical. */
  const activeGroupRef = useRef(activeGroup);
  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  const appendSection = useCallback(
    async (title: string, fields: Field[], group?: string) => {
      setSave('saving');
      try {
        const created = await createSection(packId, {
          section_key: slugKey(title),
          title,
          fields,
          sort_order: (sectionsRef.current ?? []).length,
          section_type: 'fields',
          metadata: { group: group ?? activeGroupRef.current },
        });
        setSections((prev) => [...(prev ?? []), created]);
        setActiveSectionId(created.id);
        setSave('saved');
      } catch (e) {
        setSave('error');
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [packId, showToast],
  );

  /* B2 — move a section between groups (metadata merge; other keys kept). */
  const setSectionGroup = useCallback(
    async (id: string, group: string) => {
      const section = sectionsRef.current?.find((s) => s.id === id);
      if (!section || sectionGroupId(section.metadata) === group) return;
      const metadata = { ...((section.metadata as Record<string, unknown> | null) ?? {}), group };
      setSections((prev) => prev?.map((s) => (s.id === id ? { ...s, metadata } : s)) ?? prev);
      setAddedGroups((prev) => {
        const g = RIDER_GROUPS.find((x) => x.id === group);
        if (!g || g.fixed || prev.has(group)) return prev;
        const next = new Set(prev);
        next.add(group);
        return next;
      });
      setSave('saving');
      try {
        await updateSection(packId, id, { metadata });
        setSave('saved');
      } catch (e) {
        setSave('error');
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [packId, showToast],
  );

  // Single field dropped/clicked in the library → add to the active
  // section (the one last expanded/selected), else the last section.
  const addLibraryField = useCallback(
    (tf: { id?: string; label?: string; type?: string }) => {
      const list = sectionsRef.current ?? [];
      if (list.length === 0) return;
      const active = activeSectionIdRef.current;
      const targetId = active && list.some((s) => s.id === active) ? active : list[list.length - 1].id;
      const target = list.find((s) => s.id === targetId);
      if (!target) return;
      void persistFields(targetId, [...(target.fields ?? []), templateFieldToRiderField(tf)]);
    },
    [persistFields],
  );

  // Label / type edit streaming back from the §RA8 properties panel.
  // A type change re-shapes the field via makeField (preserving key +
  // label) — there's no user value to lose while editing structure.
  const patchField = useCallback(
    (key: string, patch: { label?: string; type?: FieldType }) => {
      const list = sectionsRef.current ?? [];
      const section = list.find((s) => (s.fields ?? []).some((f) => f.key === key));
      if (!section) return;
      const fields = (section.fields ?? []).map((f) => {
        if (f.key !== key) return f;
        if (patch.type && patch.type !== f.type) {
          const reshaped = makeField(patch.type);
          reshaped.key = key;
          reshaped.label = patch.label ?? f.label ?? reshaped.label;
          return reshaped;
        }
        return patch.label !== undefined ? { ...f, label: patch.label } : f;
      });
      void persistFields(section.id, fields);
    },
    [persistFields],
  );

  // Delete from the properties panel (knows only the field key).
  const deleteFieldByKey = useCallback(
    (key: string) => {
      const list = sectionsRef.current ?? [];
      const section = list.find((s) => (s.fields ?? []).some((f) => f.key === key));
      if (!section) return;
      if (selectedKey === key) setSelectedKey(null);
      void persistFields(section.id, (section.fields ?? []).filter((f) => f.key !== key));
    },
    [persistFields, selectedKey],
  );

  useEffect(() => {
    function onSectionDrop(e: Event) {
      const d = (e as CustomEvent).detail ?? {};
      void (async () => {
        if (!d.templateId || d.templateId === '__blank__') {
          await appendSection(d.label || 'Custom section', []);
          return;
        }
        const tmpls = await loadTemplates();
        const t = tmpls.find((x) => x.id === d.templateId);
        const fields = (t?.fields ?? []).map(templateFieldToRiderField);
        await appendSection(t?.name || d.label || 'Section', fields);
      })();
    }
    function onFieldAdd(e: Event) {
      const d = (e as CustomEvent).detail ?? {};
      if (d.field) addLibraryField(d.field);
    }
    function onFieldUpdated(e: Event) {
      const d = (e as CustomEvent).detail ?? {};
      if (d.id && d.patch) patchField(d.id, d.patch);
    }
    function onFieldDelete(e: Event) {
      const d = (e as CustomEvent).detail ?? {};
      if (d.id) deleteFieldByKey(d.id);
    }
    window.addEventListener('rider:section-drop', onSectionDrop);
    window.addEventListener('rider:field-add', onFieldAdd);
    window.addEventListener('rider:field-updated', onFieldUpdated);
    window.addEventListener('rider:field-delete', onFieldDelete);
    return () => {
      window.removeEventListener('rider:section-drop', onSectionDrop);
      window.removeEventListener('rider:field-add', onFieldAdd);
      window.removeEventListener('rider:field-updated', onFieldUpdated);
      window.removeEventListener('rider:field-delete', onFieldDelete);
    };
  }, [appendSection, loadTemplates, addLibraryField, patchField, deleteFieldByKey]);

  // --- render ---------------------------------------------------------------
  if (loadError) {
    return (
      <Notice icon={<AlertCircle className="h-4 w-4" />}>Couldn’t load sections: {loadError}</Notice>
    );
  }
  if (sections === null) {
    return (
      <Notice icon={<Loader2 className="h-4 w-4 animate-spin" />} center>
        Loading sections…
      </Notice>
    );
  }
  /* ── B2 · the grouped builder ────────────────────────────────────────────
     [group tabs — fixed four + added curated + "+ Add group"]
     [rail: the ACTIVE group's sections + "Add section"] [canvas: ONE section]
     The accordion is retired: the rail is the overview, the canvas is the
     work surface, and expansion state is meaningless when exactly one
     section renders (it renders open). */
  const visible = sections.filter((s) => sectionGroupId(s.metadata) === activeGroup);
  const activeSection = visible.find((s) => s.id === activeSectionId) ?? visible[0] ?? null;
  const activeGlobalIndex = activeSection ? sections.findIndex((s) => s.id === activeSection.id) : -1;
  const visibleTabs = RIDER_GROUPS.filter((g) => g.fixed || addedGroups.has(g.id));
  const addableGroups = RIDER_GROUPS.filter((g) => !g.fixed && !addedGroups.has(g.id));
  const groupTemplates = (templates ?? []).filter((t) => {
    const g = templateGroupId(t.template_type);
    return g === null || g === activeGroup;
  });

  const tabButton = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setActiveGroup(id);
        setAddMenuOpen(false);
        setGroupMenuOpen(false);
      }}
      className="btn-transition"
      /* 2026-08-06 punch-up — "much more obvious": bigger tabs, a hard
         orange underline on the active group, no more whisper-pills. */
      style={{
        padding: '10px 16px',
        borderRadius: '8px 8px 0 0',
        border: 'none',
        borderBottom: activeGroup === id ? '2px solid var(--lp-orange)' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: 'var(--lp-text-sm)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: activeGroup === id ? 'color-mix(in srgb, var(--lp-orange) 10%, transparent)' : 'transparent',
        color: activeGroup === id ? 'var(--lp-orange)' : 'var(--lp-text-secondary)',
      }}
    >
      {label}
      <span className="lp-mono" style={{ marginLeft: 6, fontSize: '10px', color: 'var(--lp-text-tertiary)' }}>
        {sections.filter((s) => sectionGroupId(s.metadata) === id).length || ''}
      </span>
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Group tab bar — the mode-pill grammar from TopBarV3, builder-local. */}
      <div
        className="flex items-center gap-1"
        style={{ borderBottom: '1px solid var(--lp-border-subtle)', paddingBottom: 8, flexWrap: 'wrap' }}
      >
        {visibleTabs.map((g) => tabButton(g.id, g.label))}
        {addableGroups.length > 0 ? (
          <span style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setGroupMenuOpen((v) => !v)}
              className="btn-transition"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px dashed var(--lp-border-strong)', background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)', fontWeight: 600 }}
              title="Add a group from the curated list — sections within a group stay fully customisable"
            >
              + Add group
            </button>
            {groupMenuOpen ? (
              <div
                style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, minWidth: 180, borderRadius: 8, border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow-lg, 0 8px 24px rgba(0,0,0,0.35))', padding: 4 }}
              >
                {addableGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setAddedGroups((prev) => new Set(prev).add(g.id));
                      setActiveGroup(g.id);
                      setGroupMenuOpen(false);
                    }}
                    className="btn-transition block w-full text-left"
                    style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--lp-text)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)' }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            ) : null}
          </span>
        ) : null}
        <span style={{ marginLeft: 'auto' }}>
          <SavePill state={save} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Rail — the active group's sections. Drag to reorder (indices map to
            the GLOBAL list, so cross-group ordering is preserved). 2026-08-06
            punch-up: the rail is a real PANEL now (surface + border), not
            floating buttons lost against the hashed canvas. */}
        <aside
          className="flex shrink-0 flex-col rounded-xl border p-2"
          style={{ width: 248, borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)', alignSelf: 'flex-start' }}
        >
          <ul className="flex flex-col gap-0.5">
            {visible.map((s) => {
              const gi = sections.findIndex((x) => x.id === s.id);
              const isActive = activeSection?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    draggable
                    onClick={() => setActiveSectionId(s.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(SECTION_REORDER_MIME, String(gi));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragIndex(gi);
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes(SECTION_REORDER_MIME)) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dropIndex !== gi) setDropIndex(gi);
                      }
                    }}
                    onDrop={(e) => {
                      if (!e.dataTransfer.types.includes(SECTION_REORDER_MIME)) return;
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData(SECTION_REORDER_MIME));
                      if (!Number.isNaN(from)) moveSection(from, gi);
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    className="btn-transition flex w-full items-center justify-between gap-2 text-left"
                    style={{
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      borderLeft: `3px solid ${isActive ? 'var(--lp-orange)' : 'transparent'}`,
                      background:
                        dropIndex === gi && dragIndex !== null && dragIndex !== gi
                          ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)'
                          : isActive
                            ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)'
                            : 'transparent',
                      color: isActive ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                      fontSize: 'var(--lp-text-sm)',
                      fontWeight: isActive ? 600 : 400,
                      opacity: dragIndex === gi ? 0.5 : 1,
                    }}
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="lp-mono shrink-0" style={{ fontSize: '10px', color: 'var(--lp-text-tertiary)' }}>
                      {(s.section_type ?? 'fields') === 'fields'
                        ? s.fields?.length ?? 0
                        : SECTION_TYPE_LABEL[s.section_type ?? 'fields']}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Add section — templates for THIS group + blank. */}
          <span style={{ position: 'relative', marginTop: 6 }}>
            <button
              type="button"
              ref={addBtnRef}
              onClick={() => {
                const r = addBtnRef.current?.getBoundingClientRect();
                if (r) {
                  // Open above the button when the viewport below is tight.
                  const below = window.innerHeight - r.bottom;
                  setAddMenuPos({ top: below < 300 ? Math.max(12, r.top - 292) : r.bottom + 4, left: r.left });
                }
                setAddMenuOpen((v) => !v);
                setPickingTemplate(null);
                void loadTemplates();
              }}
              className="btn-transition flex w-full items-center gap-1.5"
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px dashed var(--lp-border-strong)', background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)', fontWeight: 500 }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add section
            </button>
            {addMenuOpen && addMenuPos ? (
              createPortal(
              <div
                style={{ position: 'fixed', top: addMenuPos.top, left: addMenuPos.left, zIndex: 90, width: 260, maxHeight: 288, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow-lg, 0 8px 24px rgba(0,0,0,0.35))', padding: 4 }}
              >
                {templates === null ? (
                  <p style={{ padding: '8px 10px', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>Loading templates…</p>
                ) : pickingTemplate ? (
                  /* Step 2 — the field checklist. All pre-checked; untick what
                     you don't want; "Add" inserts only the checked ones. */
                  <>
                    <div className="flex items-center justify-between" style={{ padding: '4px 6px 6px' }}>
                      <button
                        type="button"
                        onClick={() => setPickingTemplate(null)}
                        className="btn-transition"
                        style={{ border: 'none', background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)' }}
                      >
                        ← Templates
                      </button>
                      <span style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 600, color: 'var(--lp-text)' }}>{pickingTemplate.name}</span>
                    </div>
                    {(pickingTemplate.fields ?? []).map((f, i) => (
                      <label
                        key={f.id ?? i}
                        className="btn-transition flex w-full cursor-pointer items-center gap-2"
                        style={{ padding: '5px 10px', borderRadius: 6, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)' }}
                      >
                        <input
                          type="checkbox"
                          checked={checkedFields.has(i)}
                          onChange={() =>
                            setCheckedFields((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                        />
                        <span className="truncate">{f.label ?? f.id}</span>
                      </label>
                    ))}
                    <div className="flex items-center gap-2" style={{ padding: '8px 6px 4px', borderTop: '1px solid var(--lp-border-subtle)' }}>
                      <button
                        type="button"
                        disabled={checkedFields.size === 0}
                        onClick={() => {
                          const t = pickingTemplate;
                          const fields = (t.fields ?? []).filter((_, i) => checkedFields.has(i)).map(templateFieldToRiderField);
                          setAddMenuOpen(false);
                          setPickingTemplate(null);
                          void appendSection(t.name, fields);
                        }}
                        className="btn-transition flex-1 rounded-md px-3 py-1.5"
                        style={{ border: 'none', background: 'var(--lp-orange)', color: '#fff', fontSize: 'var(--lp-text-xs)', fontWeight: 600, cursor: 'pointer', opacity: checkedFields.size === 0 ? 0.5 : 1 }}
                      >
                        Add {checkedFields.size} {checkedFields.size === 1 ? 'field' : 'fields'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCheckedFields((prev) =>
                            prev.size === (pickingTemplate.fields ?? []).length
                              ? new Set()
                              : new Set((pickingTemplate.fields ?? []).map((_, i) => i)),
                          )
                        }
                        className="btn-transition rounded-md px-2 py-1.5"
                        style={{ border: '1px solid var(--lp-border)', background: 'transparent', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-2xs)', cursor: 'pointer' }}
                      >
                        {checkedFields.size === (pickingTemplate.fields ?? []).length ? 'None' : 'All'}
                      </button>
                    </div>
                  </>
                ) : (
                  /* Step 1 — pick a template (opens its field checklist). */
                  <>
                    {groupTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setPickingTemplate(t);
                          setCheckedFields(new Set((t.fields ?? []).map((_, i) => i)));
                        }}
                        className="btn-transition block w-full text-left"
                        style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--lp-text)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)' }}
                      >
                        {t.name}
                        <span style={{ display: 'block', fontSize: '10px', color: 'var(--lp-text-tertiary)' }}>
                          {(t.fields ?? []).length} fields — pick which ›
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        void appendSection('Custom section', []);
                      }}
                      className="btn-transition block w-full text-left"
                      style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--lp-text-secondary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)', borderTop: '1px solid var(--lp-border-subtle)' }}
                    >
                      Blank section
                    </button>
                  </>
                )}
              </div>,
              document.body)
            ) : null}
          </span>
        </aside>

        {/* Canvas — the selected section, open. */}
        <div className="min-w-0 flex-1">
          {activeSection ? (
            <SectionCard
              key={activeSection.id}
              section={activeSection}
              expanded
              alwaysExpanded
              isDragging={false}
              isDropTarget={false}
              selectedKey={selectedKey}
              pickerOpen={pickerFor === activeSection.id}
              fieldDrag={fieldDrag}
              fieldDrop={fieldDrop}
              headerExtra={
                <select
                  value={activeGroup}
                  onChange={(e) => void setSectionGroup(activeSection.id, e.target.value)}
                  title="Move this section to another group"
                  className="shrink-0"
                  style={{ fontSize: '11px', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', cursor: 'pointer' }}
                >
                  {RIDER_GROUPS.filter((g) => g.fixed || addedGroups.has(g.id)).map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              }
              onToggle={() => {}}
              onRename={(t) => renameSection(activeSection.id, t)}
              onDelete={() => removeSection(activeSection.id)}
              onTogglePicker={() => setPickerFor((cur) => (cur === activeSection.id ? null : activeSection.id))}
              onAddField={(type) => addField(activeSection.id, type)}
              onSelectField={(f) => selectField(f, activeSection.id)}
              onDeleteField={(key) => deleteField(activeSection.id, key)}
              onFieldDragStart={(index) => setFieldDrag({ sectionId: activeSection.id, index })}
              onFieldDragOver={(index) => setFieldDrop({ sectionId: activeSection.id, index })}
              onFieldDrop={(index) => {
                if (fieldDrag && fieldDrag.sectionId === activeSection.id) moveField(activeSection.id, fieldDrag.index, index);
                setFieldDrag(null);
                setFieldDrop(null);
              }}
              onFieldDragEnd={() => {
                setFieldDrag(null);
                setFieldDrop(null);
              }}
              onDragStart={(e) => {
                if (activeGlobalIndex < 0) return;
                e.dataTransfer.setData(SECTION_REORDER_MIME, String(activeGlobalIndex));
                e.dataTransfer.effectAllowed = 'move';
                setDragIndex(activeGlobalIndex);
              }}
              onDragOver={() => {}}
              onDrop={() => {}}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-xl border text-center"
              style={{ minHeight: 200, borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', padding: 32 }}
            >
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--lp-text-secondary)' }}>
                Nothing in {groupLabel(activeGroup)} yet
              </p>
              <p style={{ fontSize: '12px' }}>Use “Add section” on the left — templates for this group, or a blank.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({ icon, center, children }: { icon: React.ReactNode; center?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-4 ${center ? 'justify-center p-8' : ''}`}
      style={{ borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', fontSize: '13px' }}
    >
      {icon}
      {children}
    </div>
  );
}

function SavePill({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save failed';
  const color = state === 'saving' ? 'var(--lp-text-tertiary)' : 'var(--color-lp-status-needs-review)';
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: '11px', color }}>
      {state === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {text}
    </span>
  );
}

interface SectionCardProps {
  section: RiderSection;
  expanded: boolean;
  /** B2 — the single-section canvas: hide the collapse chevron, render open. */
  alwaysExpanded?: boolean;
  /** B2 — extra header control (the move-to-group select). */
  headerExtra?: React.ReactNode;
  isDragging: boolean;
  isDropTarget: boolean;
  selectedKey: string | null;
  pickerOpen: boolean;
  fieldDrag: { sectionId: string; index: number } | null;
  fieldDrop: { sectionId: string; index: number } | null;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onTogglePicker: () => void;
  onAddField: (type: FieldType) => void;
  onSelectField: (field: Field) => void;
  onDeleteField: (key: string) => void;
  onFieldDragStart: (index: number) => void;
  onFieldDragOver: (index: number) => void;
  onFieldDrop: (index: number) => void;
  onFieldDragEnd: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SectionCard(props: SectionCardProps) {
  const { section, expanded, isDragging, isDropTarget, onToggle, onRename, onDelete } = props;
  const titleRef = useRef<HTMLInputElement>(null);
  const sectionType: SectionType = section.section_type ?? 'fields';
  const isFieldType = sectionType === 'fields';
  const count = section.fields?.length ?? 0;

  return (
    <div
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
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
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          aria-label="Drag to reorder section"
          className="flex shrink-0 items-center justify-center"
          style={{ width: 24, height: 24, cursor: 'grab', background: 'transparent', border: 'none', color: 'var(--lp-text-tertiary)' }}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {!props.alwaysExpanded ? (
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
        ) : null}

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

        {props.headerExtra ?? null}

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
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr', transition: 'grid-template-rows 200ms var(--lp-ease-standard, ease)' }}
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{ borderTop: '1px solid var(--lp-border-subtle)', padding: '12px' }}>
            {isFieldType ? (
              <FieldList {...props} />
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

function FieldList(props: SectionCardProps) {
  const { section, selectedKey, pickerOpen, fieldDrag, fieldDrop } = props;
  const fields = section.fields ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {fields.length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic', marginBottom: 4 }}>
          No fields yet.
        </p>
      ) : (
        /* 2026-08-07 (Adam: "we stack every rider item even though we could
           fit some of them side by side") — compact fields flow 2-up on wide
           canvases; long-form fields span the full row (FieldRow sets its own
           gridColumn). */
        <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
          {fields.map((f, idx) => (
            <FieldRow
              key={f.key}
              field={f}
              selected={selectedKey === f.key}
              isDropTarget={
                fieldDrop?.sectionId === section.id &&
                fieldDrop.index === idx &&
                fieldDrag?.sectionId === section.id &&
                fieldDrag.index !== idx
              }
              onSelect={() => props.onSelectField(f)}
              onDelete={() => props.onDeleteField(f.key)}
              onDragStart={(e) => {
                e.dataTransfer.setData(FIELD_REORDER_MIME, JSON.stringify({ sectionId: section.id, index: idx }));
                e.dataTransfer.effectAllowed = 'move';
                props.onFieldDragStart(idx);
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(FIELD_REORDER_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  props.onFieldDragOver(idx);
                }
              }}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(FIELD_REORDER_MIME)) return;
                e.preventDefault();
                props.onFieldDrop(idx);
              }}
              onDragEnd={props.onFieldDragEnd}
            />
          ))}
        </ul>
      )}

      {/* Add field — type picker */}
      <div className="relative" style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={props.onTogglePicker}
          aria-expanded={pickerOpen}
          className="btn-transition inline-flex items-center gap-1.5"
          style={{
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--lp-text-secondary)',
            background: 'var(--lp-bg-deep)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add field
        </button>
        {pickerOpen ? <FieldTypePicker onPick={props.onAddField} /> : null}
      </div>
    </div>
  );
}

function FieldTypePicker({ onPick }: { onPick: (type: FieldType) => void }) {
  return (
    <div
      role="menu"
      aria-label="Field type"
      className="absolute left-0 z-20 grid"
      style={{
        top: 'calc(100% + 4px)',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 4,
        padding: 6,
        width: 264,
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 6,
        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      }}
    >
      {FIELD_TYPE_ORDER.map((type) => {
        const { label, Icon } = RIDER_FIELD_META[type];
        return (
          <button
            key={type}
            type="button"
            role="menuitem"
            onClick={() => onPick(type)}
            className="btn-transition flex flex-col items-center justify-center gap-1"
            style={{
              padding: '8px 4px',
              background: 'var(--lp-bg-deep)',
              border: '1px solid var(--lp-border-subtle)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--lp-text-secondary)',
            }}
          >
            <Icon className="h-4 w-4" style={{ color: 'var(--color-lp-orange)' }} />
            <span style={{ fontSize: '11px', color: 'var(--lp-text)' }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface FieldRowProps {
  field: Field;
  selected: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function FieldRow({ field, selected, isDropTarget, onSelect, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: FieldRowProps) {
  const { Icon, label: typeLabel } = RIDER_FIELD_META[field.type];
  return (
    <li
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="group flex items-center gap-2 rounded"
      style={{
        padding: '5px 6px',
        background: selected ? 'color-mix(in srgb, var(--color-lp-orange) 8%, var(--lp-bg-deep))' : 'var(--lp-bg-deep)',
        border: `1px solid ${selected || isDropTarget ? 'var(--color-lp-orange)' : 'var(--lp-border-subtle)'}`,
      }}
    >
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-label="Drag to reorder field"
        className="flex shrink-0 items-center justify-center"
        style={{ width: 20, height: 20, cursor: 'grab', color: 'var(--lp-text-tertiary)' }}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden />
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left"
        style={{ fontSize: '13px', color: 'var(--lp-text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        title={`${typeLabel} field`}
      >
        {field.label || field.key}
      </button>
      <span className="lp-mono shrink-0" style={{ fontSize: '10px', color: 'var(--lp-text-tertiary)' }}>
        {typeLabel}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete field"
        className="btn-transition flex shrink-0 items-center justify-center opacity-0 group-hover:opacity-100"
        style={{ width: 20, height: 20, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--lp-text-tertiary)', borderRadius: 2 }}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}
