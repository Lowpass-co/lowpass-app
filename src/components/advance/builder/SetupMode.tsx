'use client';

/* Build surface (SetupMode + modals) — extracted from AdvanceSectionBuilder.tsx during P3 decomposition (B1). */

import { useState, useEffect, useCallback, useMemo, useRef, Fragment, createContext, useContext } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  X,
  Save,
  Copy,
  LayoutTemplate,
  MessageSquarePlus,
  Flag,
  Loader2,
  ClipboardList,
  Speaker,
  UtensilsCrossed,
  Clock,
  Truck,
  Users,
  FileText,
  Music,
  MapPin,
  Wifi,
  Car,
  Building2,
  Reply,
  Send,
  Bed,
  Plane,
  ShoppingBag,
  ShieldCheck,
  Banknote,
  Check,
  CheckCircle2,
  Trash2,
  UserPlus,
  Search,
  Star,
  Heart,
  Zap,
  Wrench,
  Camera,
  Mic,
  Headphones,
  Globe,
  Coffee,
  Gift,
  Award,
  Bookmark,
  Tag,
  Hash,
  Link as LinkIcon,
  Paperclip,
  Folder,
  Type,
  AlignLeft,
  ChevronDown as ChevronDownIcon,
  Calendar,
  ToggleLeft,
  Upload,
  User,
  Sliders,
  Lock,
} from 'lucide-react';
import { parseRoutingDate, getDayTypeColor, getAdvanceStatusInfo, firstDayType, dayTypesInclude, cn } from '@/lib/utils';
import { SlidingToggle } from '@/components/ui/SlidingToggle';
import { useToast } from '@/components/ui/Toast';
import { detectAiCap, aiCapMessage } from '@/lib/ai/client';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { useAuth } from '@/hooks/useAuth';
import { AddPlatformFieldModal } from '../AddPlatformFieldModal';

import {
  relativeTime, STATUS_ORDER, ICON_MAP, CUSTOM_SECTION_ICONS, SectionIcon, FIELD_TYPE_ICONS, FIELD_TYPE_OPTIONS, slugify, FieldTypeIcon, setDragGhost, FieldDef, SectionDef, sortFieldsContactsFirst, sortHospitalityFieldsFirst, ContactRow, AdvanceDocument, KEY_CONTACTS_LABEL, IMPORTANT_DOCUMENTS_KEY, RIDER_LABEL, FLIGHTS_LABEL, SETTLEMENT_LABEL, PARKING_ACCESS_LABEL, SECTION_CONTACT_ROLES, DEFAULT_CONTACT_ROLES, getContactRolesForSection, CONTACT_ROLES, ApiTemplate, AdvanceData, SectionStatuses, AdvanceFlag, AdvanceDateItem, PageData, AdvanceComment, AdvanceDropdownZContext, AdvanceDropdownZProvider,
} from '../parts/model';
import { useAutoSave } from '@/lib/forms/useAutoSave';
import { buildStructurePayload } from '../parts/payloads';
import { uniquifyFieldIds } from '../parts/uniquifyFieldIds';

// ----- SETUP MODE (split-panel question-level builder) -----

const CUSTOM_SECTION_ID = '__custom__';

/* VIS-AB-05 — a venue can fill a field on the intake form only when it isn't
   tm_only and its type is answerable (file + contact are TM-entered — mirrors
   buildIntakeFormSchema). */
const VENUE_NON_FILLABLE_TYPES = new Set(['file', 'contact']);
function venueFillableCount(fields: FieldDef[] | undefined): number {
  return (fields ?? []).filter(
    (f) => !f.tm_only && !VENUE_NON_FILLABLE_TYPES.has(f.type),
  ).length;
}

function SetupMode({
  tourId,
  routingId,
  currentSections,
  defaultAdvanceTemplateId,
  wrappedInShell = false,
  onSaved,
  onCancel,
}: {
  tourId: string;
  routingId: string;
  currentSections: SectionDef[];
  defaultAdvanceTemplateId: string | null;
  /** Hotfix 3 §2 — see AdvanceSectionBuilder's prop comment.
   *  When true, the outer 2-col grid collapses to 1-col and the
   *  internal Template Library column is suppressed (the shell
   *  already mounts its own AdvanceSectionLibrary on the left). */
  wrappedInShell?: boolean;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  // VIS-AB-02 — uniquify field ids on load so key={f.id} reconciles reorders
  // (see uniquifyFieldIds). No-dup sections are returned unchanged, so the
  // autosave baseline (JSON of the original) still matches → no spurious POST.
  const [sections, setSections] = useState<SectionDef[]>(() => uniquifyFieldIds(currentSections));
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [layoutTemplates, setLayoutTemplates] = useState<{ id: string; name: string; sections: SectionDef[] }[]>([]);
  const [layoutTemplatesLoading, setLayoutTemplatesLoading] = useState(false);
  const [expandedLibrary, setExpandedLibrary] = useState<Set<string>>(new Set());
  const [expandedRight, setExpandedRight] = useState<Set<number>>(new Set());
  const [customSectionOpen, setCustomSectionOpen] = useState(false);
  const [customFieldOpen, setCustomFieldOpen] = useState(false);
  const [customFieldContext, setCustomFieldContext] = useState<{ templateId: string; templateName: string } | 'standalone' | null>(null);
  /* Sprint 8.6 §6 — "+ Add custom field" pinned at the bottom
     of every section card forks the section's platform template
     into a workspace-scoped copy. Setting this state opens the
     <AddPlatformFieldModal>; null when the modal is closed. */
  const [platformFieldTarget, setPlatformFieldTarget] = useState<{
    templateId: string;
    sectionName: string;
  } | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<ApiTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [fieldToDeleteFromLibrary, setFieldToDeleteFromLibrary] = useState<{ template: ApiTemplate; field: FieldDef } | null>(null);
  const [deletingFieldFromLibrary, setDeletingFieldFromLibrary] = useState(false);
  const [dragState, setDragState] = useState<{ type: 'section' | 'field'; sectionIndex?: number; fieldIndex?: number; templateId?: string; field?: FieldDef } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sectionIndex: number; fieldIndex: number } | { sectionIndex: number } | null>(null);
  const [libraryDragId, setLibraryDragId] = useState<string | null>(null);
  const [libraryDropIndex, setLibraryDropIndex] = useState<number | null>(null);
  const [removingField, setRemovingField] = useState<string | null>(null);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const [lastAddedTemplateId, setLastAddedTemplateId] = useState<string | null>(null);
  /** G.4 — selected field-def for the right-rail Field Properties panel.
   *  Click a row → dispatches ADVANCE_FIELD_SELECTED so the shell client
   *  populates the panel. Click anywhere else → setSelectedFieldId(null)
   *  via the canvas blank-space onClick lower down. */
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const fetchTemplates = useCallback(() => {
    fetch('/api/advance/templates')
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (currentSections.length > 0 || !defaultAdvanceTemplateId) return;
    let cancelled = false;
    fetch('/api/advance/layout-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => {
        if (cancelled) return;
        const list = (j.templates ?? []) as { id: string; name: string; sections: SectionDef[] }[];
        const t = list.find((x) => x.id === defaultAdvanceTemplateId);
        if (t?.sections?.length) {
          const seeded = uniquifyFieldIds(t.sections.map((s, i) => ({ ...s, order: i })));
          setSections(seeded);
          // Sprint 8.5 §6c — update the autosave baseline so this
          // server-driven seed doesn't trigger a redundant POST.
          lastSavedSectionsRef.current = JSON.stringify(seeded);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [defaultAdvanceTemplateId, currentSections.length]);

  /* ============================================
     Sprint 8.5 §6c — sections autosave.

     Adam's smoke against Sprint 8.4: "drag-reorder doesn't
     persist." Root cause: the `sections` array is only saved
     by the manual Save Layout button; setSections updates
     local state but no PATCH/POST fires. The data autosave
     (flushPatch) PATCHes /api/tours/[id]/advance/[routingId]
     but its body schema doesn't accept `sections`.

     Fix: 800ms debounced POST to /api/tours/[id]/advance
     whenever sections changes vs the last-saved baseline.
     The baseline is initialised to JSON.stringify(currentSections)
     on mount + updated by the layout-template seed effect above
     + updated by every successful save. JSON.stringify-based
     equality keeps the per-call-site dirty tracking out of
     individual setSections call sites — works for ALL setters
     (moveSectionOrder, moveFieldOrder, addSectionFromDrop,
     addField, removeField, etc.) without per-touch
     instrumentation.

     Manual Save Layout button (line 1011, saveLayout) stays
     for users who want immediate save / explicit confirmation.
     Both paths POST the same payload to the same endpoint.
     ============================================ */
  const lastSavedSectionsRef = useRef<string>(
    JSON.stringify(currentSections),
  );

  /* B1 — structure autosave now runs on a useAutoSave instance (800ms). onSave
     POSTs buildStructurePayload to /api/tours/[id]/advance; the bridge effect
     below feeds `sections` changes through it. The JSON.stringify dirty check
     (skip no-ops) and retry-on-failure baseline semantics of the original are
     preserved: the baseline advances only after a 200. Endpoint + payload +
     debounce are byte-identical to pre-split (map §5). */
  const structAutosave = useAutoSave<{ sections: SectionDef[] }>({
    initialState: { sections: currentSections },
    debounceMs: 800,
    onSave: async ({ sections: s }) => {
      const res = await fetch(`/api/tours/${tourId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildStructurePayload(routingId, s)),
      });
      if (!res.ok) throw new Error(`Advance structure POST failed: ${res.status}`);
      lastSavedSectionsRef.current = JSON.stringify(s);
    },
  });

  useEffect(() => {
    const current = JSON.stringify(sections);
    if (current === lastSavedSectionsRef.current) return;
    structAutosave.set({ sections });
    // structAutosave.set is stable (useCallback); depending on `sections` is
    // sufficient to feed every setter (moveSectionOrder/addField/…) into save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, tourId, routingId]);

  // VIS-AB-02 — the canvas renders from this uniquified view so key={f.id} is
  // always collision-free (belt-and-suspenders over the load-time uniquify:
  // covers any mid-session dup, e.g. a custom field slugified to an existing
  // id). Same order/indices as `sections`, so index-based reorder handlers stay
  // correct; no-dup sections are returned by-ref (no extra render churn).
  const renderSections = useMemo(() => uniquifyFieldIds(sections), [sections]);

  useEffect(() => {
    if (!lastAddedTemplateId) return;
    const idx = sections.findIndex((s) => s.template_id === lastAddedTemplateId);
    if (idx >= 0) setExpandedRight(new Set([idx]));
    const t = setTimeout(() => setLastAddedTemplateId(null), 150);
    return () => clearTimeout(t);
  }, [sections, lastAddedTemplateId]);

  const isFieldAdded = useCallback((templateId: string, fieldId: string) => {
    return sections.some((s) => s.template_id === templateId && (s.fields ?? []).some((f) => f.id === fieldId));
  }, [sections]);

  const isSectionFullyAdded = useCallback((t: ApiTemplate) => {
    const fields = t.fields ?? [];
    if (fields.length === 0) return false;
    return fields.every((f) => isFieldAdded(t.id, f.id));
  }, [isFieldAdded]);

  const addField = useCallback((t: ApiTemplate, field: FieldDef) => {
    setLastAddedTemplateId(t.id);
    setSections((prev) => {
      const existing = prev.findIndex((s) => s.template_id === t.id);
      const clone = { ...field };
      if (existing >= 0) {
        const next = prev.map((s, i) =>
          i === existing ? { ...s, fields: [...(s.fields ?? []), clone] } : s
        );
        return next.map((sec, i) => ({ ...sec, order: i }));
      }
      return [...prev.map((s, i) => ({ ...s, order: i })), { template_id: t.id, label: t.name, fields: [clone], order: prev.length }];
    });
  }, []);

  const addAllFields = useCallback((t: ApiTemplate) => {
    const fields = (t.fields ?? []).map((f) => ({ ...f }));
    if (fields.length === 0) return;
    setLastAddedTemplateId(t.id);
    setSections((prev) => {
      const existing = prev.findIndex((s) => s.template_id === t.id);
      if (existing >= 0) {
        const existingFields = prev[existing].fields ?? [];
        const merged = [...existingFields];
        fields.forEach((f) => {
          if (!merged.some((x) => x.id === f.id)) merged.push(f);
        });
        const next = prev.map((s, i) => (i === existing ? { ...s, fields: merged } : s));
        return next.map((sec, i) => ({ ...sec, order: i }));
      }
      return [...prev.map((s, i) => ({ ...s, order: i })), { template_id: t.id, label: t.name, fields, order: prev.length }];
    });
  }, []);

  const removeAllFields = useCallback((t: ApiTemplate) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.template_id === t.id);
      if (idx < 0) return prev;
      return prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const removeFieldByTemplateAndFieldId = useCallback((templateId: string, fieldId: string) => {
    setSections((prev) => {
      const secIdx = prev.findIndex((s) => s.template_id === templateId);
      if (secIdx < 0) return prev;
      const sec = prev[secIdx];
      const fieldIdx = (sec.fields ?? []).findIndex((f) => f.id === fieldId);
      if (fieldIdx < 0) return prev;
      const newFields = (sec.fields ?? []).filter((_, i) => i !== fieldIdx);
      if (newFields.length === 0) {
        return prev.filter((_, i) => i !== secIdx).map((s, i) => ({ ...s, order: i }));
      }
      return prev.map((s, i) => (i === secIdx ? { ...s, fields: newFields } : s)).map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const removeField = useCallback((sectionIndex: number, fieldIndex: number) => {
    const key = `${sectionIndex}-${fieldIndex}`;
    setRemovingField(key);
    setTimeout(() => {
      setSections((prev) => {
        const sec = prev[sectionIndex];
        if (!sec) return prev;
        const newFields = (sec.fields ?? []).filter((_, i) => i !== fieldIndex);
        if (newFields.length === 0) {
          return prev.filter((_, i) => i !== sectionIndex).map((s, i) => ({ ...s, order: i }));
        }
        return prev.map((s, i) => (i === sectionIndex ? { ...s, fields: newFields } : s)).map((s, i) => ({ ...s, order: i }));
      });
      setRemovingField(null);
    }, 150);
  }, []);

  /** G.4 — apply a partial patch to a field-def by id. Used by the
   *  window-level ADVANCE_FIELD_UPDATED listener (panel → canvas wire). */
  const patchFieldById = useCallback(
    (
      fieldId: string,
      patch: Partial<FieldDef>,
    ) => {
      setSections((prev) =>
        prev.map((sec) => {
          const fieldIdx = (sec.fields ?? []).findIndex((f) => f.id === fieldId);
          if (fieldIdx < 0) return sec;
          const next = [...sec.fields];
          next[fieldIdx] = { ...next[fieldIdx], ...patch };
          return { ...sec, fields: next };
        }),
      );
    },
    [],
  );

  // Listen for panel-driven field edits (G.4 wire from
  // AdvanceFieldPropertiesPanel → AdvanceBuilderShellClient → canvas).
  useEffect(() => {
    function onFieldUpdated(e: Event) {
      const ce = e as CustomEvent<{
        fieldId: string;
        patch: Partial<FieldDef>;
      } | null>;
      if (!ce.detail) return;
      patchFieldById(ce.detail.fieldId, ce.detail.patch);
    }
    window.addEventListener('advance:field-updated', onFieldUpdated);
    return () => window.removeEventListener('advance:field-updated', onFieldUpdated);
  }, [patchFieldById]);

  /** G.3 — add a section by id (Sprint 8.5 §6b: AdvanceSectionLibrary
   *  now passes the template's UUID as seedId) OR by label (legacy
   *  callers / fallback) OR as a blank custom section if seedId
   *  is '__blank__' or no template match.
   *
   *  Sprint 8.5 §6b — Adam's smoke against 8.4: "adding section
   *  adds only header (no fields)." Root cause was that the
   *  hardcoded library labels didn't match the seeded template
   *  names ("Technical & Power" ≠ "Production"), so the name
   *  lookup failed and the handler fell through to the empty-
   *  fields path. Now seedId is a real template UUID; we match
   *  by ID first for an unambiguous lookup, then by name for any
   *  legacy caller that still passes a slug. */
  const addSectionFromDrop = useCallback(
    (seedId: string, label: string) => {
      const trimmedLabel = label.trim() || 'Custom Section';
      let match: ApiTemplate | undefined;
      if (seedId !== '__blank__') {
        // Sprint 8.5 §6b — match by id first (8.5 §6a passes
        // template UUIDs; the lookup is unambiguous).
        match = templates.find((t) => t.id === seedId);
        if (!match) {
          // Fallback for any legacy caller that passes a name/slug.
          match = templates.find(
            (t) =>
              (t.name ?? '').trim().toLowerCase() ===
              trimmedLabel.toLowerCase(),
          );
        }
      }
      if (match) {
        addAllFields(match);
        return;
      }
      // No template match → create a blank section. The seed becomes
      // a new template_id (synthesised) with no fields. Autosave picks
      // it up; user can add fields via the existing in-canvas controls.
      const syntheticId = `${seedId === '__blank__' ? 'custom' : 'orphan'}_${Date.now().toString(36)}`;
      setSections((prev) => [
        ...prev,
        {
          template_id: syntheticId,
          label: trimmedLabel,
          fields: [],
          order: prev.length,
        },
      ]);
      setLastAddedTemplateId(syntheticId);
    },
    [templates, addAllFields],
  );

  // Listen for library drop events (G.3 wire from AdvanceSectionLibrary
  // → SectionDropZone → AdvanceBuilderShellClient → canvas).
  useEffect(() => {
    function onSectionDrop(e: Event) {
      const ce = e as CustomEvent<{ seedId: string; label: string } | null>;
      if (!ce.detail) return;
      addSectionFromDrop(ce.detail.seedId, ce.detail.label);
    }
    window.addEventListener('advance:section-drop', onSectionDrop);
    return () => window.removeEventListener('advance:section-drop', onSectionDrop);
  }, [addSectionFromDrop]);

  // advance-builder-fixes §1 — field-level palette. A single field
  // clicked/dragged from the library (vs a whole group) lands here. It
  // appends to the matching template's section, creating that section if
  // it isn't on the canvas yet; de-dupes by field id so re-adding the
  // same field is a no-op rather than a duplicate.
  const addFieldFromLibrary = useCallback(
    (templateId: string, label: string, field: FieldDef) => {
      const clone: FieldDef = { ...field };
      setSections((prev) => {
        const idx = prev.findIndex((s) => s.template_id === templateId);
        if (idx >= 0) {
          if ((prev[idx].fields ?? []).some((f) => f.id === clone.id)) {
            return prev;
          }
          const next = prev.map((s, i) =>
            i === idx ? { ...s, fields: [...(s.fields ?? []), clone] } : s,
          );
          return next.map((s, i) => ({ ...s, order: i }));
        }
        return [
          ...prev.map((s, i) => ({ ...s, order: i })),
          {
            template_id: templateId,
            label: label || 'Section',
            fields: [clone],
            order: prev.length,
          },
        ];
      });
      setLastAddedTemplateId(templateId);
    },
    [],
  );

  useEffect(() => {
    function onFieldAdd(e: Event) {
      const ce = e as CustomEvent<{
        templateId: string;
        label: string;
        field: FieldDef;
      } | null>;
      if (!ce.detail) return;
      addFieldFromLibrary(ce.detail.templateId, ce.detail.label, ce.detail.field);
    }
    window.addEventListener('advance:field-add', onFieldAdd);
    return () => window.removeEventListener('advance:field-add', onFieldAdd);
  }, [addFieldFromLibrary]);

  const moveSectionOrder = useCallback((from: number, to: number) => {
    if (from === to || to < 0 || to > sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setDragState(null);
    setDropTarget(null);
  }, [sections.length]);

  const moveFieldOrder = useCallback((sectionIndex: number, from: number, to: number) => {
    // VIS-AB-02 — field ids are uniquified on load + in renderSections, so the
    // duplicate-key reconciliation failure this used to diagnose can't occur;
    // the diagnostic logs (and the dup-detection console.error) are removed.
    setSections((prev) => {
      const sec = prev[sectionIndex];
      if (!sec || from === to) return prev;
      const fields = [...(sec.fields ?? [])];
      const [item] = fields.splice(from, 1);
      fields.splice(to, 0, item);
      return prev.map((s, i) => (i === sectionIndex ? { ...s, fields } : s));
    });
    setDragState(null);
    setDropTarget(null);
  }, []);

  const saveLayout = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_id: routingId, sections }),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    const res = await fetch('/api/advance/layout-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_label: templateName.trim(), sections }),
    });
    if (res.ok) {
      setSaveAsTemplateOpen(false);
      setTemplateName('');
    }
  };

  const openApplyTemplate = () => {
    setApplyTemplateOpen(true);
    setLayoutTemplatesLoading(true);
    fetch('/api/advance/layout-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setLayoutTemplates(j.templates ?? []))
      .catch(() => setLayoutTemplates([]))
      .finally(() => setLayoutTemplatesLoading(false));
  };

  const applyLayoutTemplate = (template: { id: string; name: string; sections: SectionDef[] }) => {
    if (template.sections?.length) setSections(uniquifyFieldIds(template.sections.map((s, i) => ({ ...s, order: i }))));
    setApplyTemplateOpen(false);
  };

  const handleAddCustomField = async (field: FieldDef) => {
    const clone = { ...field };
    if (customFieldContext === 'standalone') {
      try {
        const res = await fetch('/api/advance/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Custom', icon: 'clipboard', description: '', fields: [clone] }),
        });
        if (!res.ok) return;
        const created = await res.json();
        const newId = created.id ?? created.template_id;
        if (newId) {
          setSections((prev) => [...prev.map((s, i) => ({ ...s, order: i })), { template_id: newId, label: 'Custom', fields: [clone], order: prev.length }]);
          fetchTemplates();
        }
      } catch (_) { /* ignore */ }
      setCustomFieldOpen(false);
      setCustomFieldContext(null);
      return;
    }
    const templateId = customFieldContext?.templateId ?? CUSTOM_SECTION_ID;
    const templateName = customFieldContext?.templateName ?? 'Custom';
    setSections((prev) => {
      const existing = prev.findIndex((s) => s.template_id === templateId);
      if (existing >= 0) {
        const next = prev.map((s, i) => (i === existing ? { ...s, fields: [...(s.fields ?? []), clone] } : s));
        return next.map((sec, i) => ({ ...sec, order: i }));
      }
      return [...prev.map((s, i) => ({ ...s, order: i })), { template_id: templateId, label: templateName, fields: [clone], order: prev.length }];
    });
    if (templateId !== CUSTOM_SECTION_ID) {
      const t = templates.find((x) => x.id === templateId);
      if (t?.workspace_id) {
        const currentFields = (t.fields ?? []) as FieldDef[];
        const updatedFields = [...currentFields, field];
        try {
          await fetch(`/api/advance/templates/${templateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: updatedFields }),
          });
        } catch (_) { /* ignore */ }
      }
    }
    setCustomFieldOpen(false);
    setCustomFieldContext(null);
  };

  const handleDeleteFieldFromLibrary = async () => {
    if (!fieldToDeleteFromLibrary) return;
    const { template: t, field: f } = fieldToDeleteFromLibrary;
    setDeletingFieldFromLibrary(true);
    try {
      const currentFields = (t.fields ?? []) as FieldDef[];
      const updatedFields = currentFields.filter((x) => x.id !== f.id);
      const res = await fetch(`/api/advance/templates/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: updatedFields }),
      });
      if (res.ok) {
        removeFieldByTemplateAndFieldId(t.id, f.id);
        fetchTemplates();
        setFieldToDeleteFromLibrary(null);
      }
    } finally {
      setDeletingFieldFromLibrary(false);
    }
  };

  const handleAddCustomSection = async (name: string, icon: string, description: string) => {
    const res = await fetch('/api/advance/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), icon, description: description.trim(), fields: [] }),
    });
    if (res.ok) {
      fetchTemplates();
      setCustomSectionOpen(false);
    }
  };

  const handleDeleteCustomSection = async () => {
    if (!templateToDelete) return;
    setDeletingTemplate(true);
    try {
      const res = await fetch(`/api/advance/templates/${templateToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSections((prev) => prev.filter((s) => s.template_id !== templateToDelete.id));
        fetchTemplates();
        setTemplateToDelete(null);
      } else {
        // Fail loudly. Migration 059 added the missing at_delete RLS
        // policy; before that landed, default-deny made this silently
        // no-op (modal closed, section reappeared on refetch). Surface
        // any future regression instead of repeating that ghost-bug.
        const body = await res.json().catch(() => ({}));
        const detail = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
        console.error('[advance] template delete failed', { status: res.status, body });
        window.alert(`Couldn't delete this section. ${detail}`);
      }
    } finally {
      setDeletingTemplate(false);
    }
  };

  const workspaceTemplates = templates.filter((t) => t.workspace_id);
  const handleLibraryReorder = useCallback(async (dragId: string, dropIndex: number) => {
    const from = workspaceTemplates.findIndex((t) => t.id === dragId);
    if (from < 0 || from === dropIndex) return;
    const reordered = [...workspaceTemplates];
    const [removed] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, removed);
    const order = reordered.map((t) => t.id);
    const res = await fetch('/api/advance/templates/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    if (res.ok) fetchTemplates();
  }, [workspaceTemplates, fetchTemplates]);

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6',
        // Hotfix 3 §2 — drop the lg:2-col grid when the builder is
        // mounted inside the AdvanceBuilderShellClient three-pane
        // shell. The shell renders its own Library on the left;
        // this internal Library is suppressed below for the same
        // reason, so the grid only needs one column for the canvas.
        wrappedInShell ? 'lg:grid-cols-1' : 'lg:grid-cols-2',
      )}
    >
      {/* LEFT — Template Library — suppressed when wrappedInShell. */}
      {!wrappedInShell && (
      <div className="flex flex-col rounded-xl border border-lp-border bg-lp-surface">
        <h3 className="border-b border-lp-border px-4 py-3 text-sm font-semibold text-lp-text">Template Library</h3>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-lp-text-tertiary" /></div>
          ) : (
            <ul className="space-y-1">
              {templates.filter((t) => !t.workspace_id).map((t) => {
                const expanded = expandedLibrary.has(t.id);
                const allAdded = isSectionFullyAdded(t);
                const fields = t.fields ?? [];
                return (
                  <li key={t.id} className="rounded-lg border border-lp-border overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedLibrary((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedLibrary((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); } }}
                      className="flex items-center gap-2 bg-lp-bg-secondary px-3 py-2 cursor-pointer hover:bg-lp-bg-tertiary transition-colors"
                    >
                      <span className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-200', expanded && 'rotate-180')}>
                        <ChevronDown size={16} />
                      </span>
                      <SectionIcon icon={t.icon} />
                      <span className="flex-1 text-sm font-medium text-lp-text">{t.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (allAdded) removeAllFields(t); else addAllFields(t); }}
                        disabled={fields.length === 0}
                        className="relative shrink-0 h-7 w-7 rounded p-1.5 text-lp-text hover:bg-lp-surface-hover disabled:opacity-50 flex items-center justify-center"
                        title={allAdded ? 'Remove all from advance' : 'Add all questions'}
                      >
                        <span className={cn('absolute inset-0 flex items-center justify-center transition-all duration-200', allAdded ? 'opacity-0 scale-75' : 'opacity-100 scale-100')}>
                          <Plus size={16} />
                        </span>
                        <span className={cn('absolute inset-0 flex items-center justify-center transition-all duration-200 text-lp-accent', allAdded ? 'opacity-100 scale-100' : 'opacity-0 scale-75')}>
                          <Check size={16} />
                        </span>
                      </button>
                    </div>
                    <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
                      <div className="min-h-0 overflow-hidden">
                        <ul className="border-t border-lp-border bg-lp-surface py-1">
                          {(fields as FieldDef[]).map((f) => {
                            const added = isFieldAdded(t.id, f.id);
                            return (
                              <li key={f.id} className="group">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(e) => { e.dataTransfer.setData('application/x-lowpass-library', ''); e.dataTransfer.setData('application/json', JSON.stringify({ templateId: t.id, field: f })); e.dataTransfer.effectAllowed = 'copy'; setDragGhost(e, f.label); setDragState({ type: 'field', templateId: t.id, field: f }); }}
                                  onDragEnd={() => setDragState(null)}
                                  onClick={() => {
                                    if (added) removeFieldByTemplateAndFieldId(t.id, f.id);
                                    else { addField(t, f); setLastAddedKey(`${t.id}-${f.id}`); setTimeout(() => setLastAddedKey(null), 200); }
                                  }}
                                  className={cn(
                                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                    added ? 'bg-lp-accent/10 text-lp-accent border-l-2 border-lp-accent' : 'hover:bg-lp-surface-hover text-lp-text',
                                  )}
                                >
                                    <FieldTypeIcon type={f.type} />
                                    <span className="flex-1 truncate">{f.label}</span>
                                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', (f.required ?? false) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'text-lp-text-tertiary')}>{(f.required ?? false) ? 'Required' : 'Optional'}</span>
                                    {added && <Check size={14} className="shrink-0 text-lp-accent" />}
                                  </button>
                                </li>
                              );
                            })}
                            <li>
                              <button type="button" onClick={() => { setCustomFieldContext({ templateId: t.id, templateName: t.name }); setCustomFieldOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-dashed border-lp-border text-xs">+</span>
                                Custom field
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
              <li className="pt-2">
                <p className="mb-1.5 px-1 text-xs font-medium text-lp-text-tertiary">Custom</p>
                {workspaceTemplates.map((t, libIdx) => {
                  const expanded = expandedLibrary.has(t.id);
                  const allAdded = isSectionFullyAdded(t);
                  const fields = t.fields ?? [];
                  const isDraggingLib = libraryDragId === t.id;
                  const isDropTarget = libraryDropIndex === libIdx;
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        'rounded-lg border border-lp-border overflow-hidden mb-1 transition-all duration-200',
                        isDraggingLib && 'opacity-60 scale-[0.98]',
                        isDropTarget && libraryDragId && libraryDragId !== t.id && 'ring-2 ring-lp-orange ring-inset',
                      )}
                      onDragOver={(e) => { e.preventDefault(); if (libraryDragId && libraryDragId !== t.id) setLibraryDropIndex(libIdx); }}
                      onDragLeave={() => setLibraryDropIndex(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (libraryDragId && libraryDropIndex !== null) handleLibraryReorder(libraryDragId, libraryDropIndex);
                        setLibraryDragId(null);
                        setLibraryDropIndex(null);
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedLibrary((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedLibrary((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); } }}
                        className="flex items-center gap-2 bg-lp-bg-secondary px-3 py-2 cursor-pointer hover:bg-lp-bg-tertiary transition-colors"
                      >
                        <span
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setLibraryDragId(t.id); setLibraryDropIndex(null); }}
                          onDragEnd={() => { setLibraryDragId(null); setLibraryDropIndex(null); }}
                          className="shrink-0 cursor-grab active:cursor-grabbing text-lp-text-tertiary hover:text-lp-text touch-none"
                          title="Drag to reorder"
                        >
                          <GripVertical size={16} />
                        </span>
                        <span className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-200', expanded && 'rotate-180')}>
                          <ChevronDown size={16} />
                        </span>
                        <SectionIcon icon={t.icon} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-lp-text">{t.name}</span>
                          {(t.description as string | undefined)?.trim() && (
                            <p className="mt-0.5 text-xs text-lp-text-tertiary line-clamp-1">{t.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (allAdded) removeAllFields(t); else addAllFields(t); }}
                          disabled={fields.length === 0}
                          className="relative shrink-0 h-7 w-7 rounded p-1.5 text-lp-text hover:bg-lp-surface-hover disabled:opacity-50 flex items-center justify-center"
                          title={allAdded ? 'Remove all from advance' : 'Add all questions'}
                        >
                          <span className={cn('absolute inset-0 flex items-center justify-center transition-all duration-200', allAdded ? 'opacity-0 scale-75' : 'opacity-100 scale-100')}>
                            <Plus size={16} />
                          </span>
                          <span className={cn('absolute inset-0 flex items-center justify-center transition-all duration-200 text-lp-accent', allAdded ? 'opacity-100 scale-100' : 'opacity-0 scale-75')}>
                            <Check size={16} />
                          </span>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setTemplateToDelete(t); }} className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500" title="Delete section">
                          <X size={16} />
                        </button>
                      </div>
                      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
                        <div className="min-h-0 overflow-hidden">
                          <ul className="border-t border-lp-border bg-lp-surface py-1">
                            {(fields as FieldDef[]).map((f) => {
                              const added = isFieldAdded(t.id, f.id);
                              return (
                                <li key={f.id} className="group flex items-center gap-0">
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('application/x-lowpass-library', ''); e.dataTransfer.setData('application/json', JSON.stringify({ templateId: t.id, field: f })); e.dataTransfer.effectAllowed = 'copy'; setDragGhost(e, f.label); setDragState({ type: 'field', templateId: t.id, field: f }); }}
                                    onDragEnd={() => setDragState(null)}
                                    onClick={() => {
                                      if (added) removeFieldByTemplateAndFieldId(t.id, f.id);
                                      else { addField(t, f); setLastAddedKey(`${t.id}-${f.id}`); setTimeout(() => setLastAddedKey(null), 200); }
                                    }}
                                    className={cn(
                                      'flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                      added ? 'bg-lp-accent/10 text-lp-accent border-l-2 border-lp-accent' : 'hover:bg-lp-surface-hover text-lp-text',
                                    )}
                                  >
                                    <FieldTypeIcon type={f.type} />
                                    <span className="flex-1 truncate">{f.label}</span>
                                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', (f.required ?? false) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'text-lp-text-tertiary')}>{(f.required ?? false) ? 'Required' : 'Optional'}</span>
                                    {added ? <Check size={14} className="shrink-0 text-lp-accent" /> : null}
                                  </button>
                                  {t.workspace_id && !added && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setFieldToDeleteFromLibrary({ template: t, field: f }); }}
                                      className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500"
                                      title="Delete this advance field?"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                            <li>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setCustomFieldContext({ templateId: t.id, templateName: t.name }); setCustomFieldOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-dashed border-lp-border text-xs">+</span>
                                Custom field
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
                <button type="button" onClick={() => setCustomSectionOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-lp-border px-3 py-2.5 text-sm font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text mt-1">
                  <Plus size={16} /> Custom Section
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
      )}

      {/* RIGHT — This Show's Advance */}
      <div className="flex flex-col rounded-xl border border-lp-border bg-lp-surface">
        <h3 className="border-b border-lp-border px-4 py-3 text-sm font-semibold text-lp-text">This show&apos;s advance</h3>
        <div
          className={cn('advance-builder-canvas min-h-0 flex-1 overflow-y-auto p-3 space-y-3 transition-colors duration-150', dragState?.type === 'field' && 'bg-lp-orange/5')}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(e) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('application/json');
            if (!raw) return;
            try {
              const data = JSON.parse(raw);
              // Sprint 8.6.3 §B — section drops landing in the
              // canvas gap (between section cards) used to be
              // swallowed silently here because the only branch
              // handled `data.templateId && data.field` (library
              // drops). The user would see "headers flash, types
              // nothing" because the dropTarget orange bar showed
              // during hover and disappeared at release. Now the
              // canvas onDrop also delegates section moves —
              // using the last-hovered section card's index from
              // dropTarget if available, else appending to end.
              if (data.type === 'section' && typeof data.sectionIndex === 'number') {
                const targetIdx =
                  dropTarget && !('fieldIndex' in dropTarget)
                    ? dropTarget.sectionIndex
                    : sections.length - 1;
                                moveSectionOrder(data.sectionIndex, targetIdx);
              } else if (data.type === 'field' && typeof data.sectionIndex === 'number' && typeof data.fieldIndex === 'number') {
                // Sprint 8.6.4 §1 — field drop bubbled to canvas
                // because the section onDragOver no longer accepts
                // field drags (gated to type === 'section'). The
                // user dropped a field on section dead space —
                // header, gap above first field, "+ Add custom
                // field" button area, etc. Use the last-hovered
                // field row from dropTarget for placement; if
                // none, log + no-op so at least the failure is
                // visible instead of silent.
                if (dropTarget && 'fieldIndex' in dropTarget) {
                  if (dropTarget.sectionIndex === data.sectionIndex) {
                                        moveFieldOrder(dropTarget.sectionIndex, data.fieldIndex, dropTarget.fieldIndex);
                  } else {
                    // Cross-section field drop. moveFieldOrder is
                    // within-section only; warn so we know if
                    // Adam's UX expects this (next sprint).
                                      }
                } else {
                                  }
              } else if (data.templateId && data.field) {
                const t = templates.find((x) => x.id === data.templateId);
                if (t) {
                  addField(t, data.field);
                  setLastAddedKey(`${t.id}-${data.field.id}`);
                  setTimeout(() => setLastAddedKey(null), 200);
                  // Auto-expand the target section and collapse others (same as click-add)
                  setTimeout(() => {
                    setSections((cur) => {
                      const idx = cur.findIndex((s) => s.template_id === t.id);
                      if (idx >= 0) setExpandedRight(new Set([idx]));
                      return cur;
                    });
                  }, 50);
                }
              } else {
                // Sprint 8.6.3 §B — surface unhandled drops on
                // canvas so we don't silently swallow them again.
                              }
            } catch (err) {
              // Sprint 8.6.3 §B — un-silenced from `catch (_)`.
              console.error('[advance-builder] canvas drop parse failed', err, { raw });
            }
            setDragState(null);
            setDropTarget(null);
          }}
        >
          {renderSections.map((sec, secIdx) => {
            const expanded = expandedRight.has(secIdx);
            const template = templates.find((t) => t.id === sec.template_id);
            const fields = sec.fields ?? [];
            const isDraggingSection = dragState?.type === 'section' && dragState.sectionIndex === secIdx;
            const isSectionDropTarget = dropTarget && !('fieldIndex' in dropTarget) && dropTarget.sectionIndex === secIdx;
            return (
              // G1-A #3 — key by the section's stable template_id ONLY (never the
              // index): including secIdx meant a reordered section changed key →
              // React tore down + rebuilt the row instead of moving it, so section
              // drag glitched (fields already got this via VIS-AB-02). template_id
              // is unique per section (addSection merges dups; customs get a
              // synthetic id).
              <Fragment key={sec.template_id}>
                {isSectionDropTarget && (
                  <div
                    className="rounded-lg border-2 border-dashed border-lp-orange bg-lp-orange/10 min-h-[52px] flex items-center justify-center my-0.5 transition-all duration-200"
                    aria-hidden
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      // Sprint 8.6 patch — the section drop indicator
                      // displaces the target section card down by 52px+
                      // when it renders, so the user's cursor lands on
                      // the indicator (not the real card). Without its
                      // own onDrop, the event bubbled to canvas onDrop
                      // and hit the wrong-type guard. Mirror the section
                      // card's onDrop here so drops on the indicator
                      // resolve to the correct target index.
                      e.preventDefault();
                      e.stopPropagation();
                      const raw = e.dataTransfer.getData('application/json');
                      if (!raw) return;
                      try {
                        const data = JSON.parse(raw);
                        if (data.type === 'section' && typeof data.sectionIndex === 'number') {
                          moveSectionOrder(data.sectionIndex, secIdx);
                        }
                      } catch (err) {
                        console.error('[advance-builder] section indicator drop parse failed', err, { raw });
                      }
                      setDragState(null);
                      setDropTarget(null);
                    }}
                  />
                )}
              <div
                data-active={fields.some((f) => f.id === selectedFieldId)}
                className={cn(
                  'advance-builder-section rounded-xl border border-lp-border overflow-hidden relative transition-all duration-200 ease-out',
                  isDraggingSection && 'scale-[1.02] shadow-lg opacity-90 z-20'
                )}
                draggable
                onDragStart={(e) => {
                  // Sprint 8.6.3 §B — log section dragstart so
                  // we can confirm it fires (parallel to the
                  // existing field/section onDrop logs). When
                  // §4's onDrop log was missing for sections,
                  // we needed to know whether dragstart even
                  // fired before chasing drop-side culprits.
                                    // Sprint 8.6.5 — marker MIME for the dragOver gate
                  // on every drop target. dataTransfer.types is set
                  // synchronously at dragstart and visible in every
                  // subsequent dragover, unlike React state which
                  // lags one render behind. The 8.6.4 fix gated on
                  // dragState.type but the first dragover events
                  // after dragstart fired before the re-render
                  // propagated → dragState was still null in the
                  // closure → gate rejected → section never became
                  // a drop target. Marker MIME fixes that without
                  // any state plumbing.
                  e.dataTransfer.setData('application/x-lowpass-section', '');
                  e.dataTransfer.setData('application/json', JSON.stringify({ type: 'section', sectionIndex: secIdx }));
                  setDragGhost(e, sec.label);
                  setDragState({ type: 'section', sectionIndex: secIdx });
                }}
                onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                onDragOver={(e) => {
                  // Sprint 8.6.5 — gate on dataTransfer.types (sync
                  // at dragstart) instead of dragState.type (React
                  // state, async). Field drags don't carry the
                  // section marker so the section card refuses to
                  // accept them, bubbling field drops to canvas as
                  // intended by 8.6.4 §1's separation-of-concerns.
                  if (!e.dataTransfer.types.includes('application/x-lowpass-section')) {
                    e.dataTransfer.dropEffect = 'none';
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragState?.type === 'section' && dragState.sectionIndex !== secIdx) {
                    setDropTarget({ sectionIndex: secIdx });
                  }
                }}
                onDragLeave={() => setDropTarget((t) => (t && !('fieldIndex' in t) && t.sectionIndex === secIdx ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const raw = e.dataTransfer.getData('application/json');
                  // Sprint 8.6 §4 — un-silence the catch so drop
                  // failures surface in console instead of being
                  // swallowed. Adam's smoke against 8.5 §6c:
                  // "drag-reorder doesn't persist" — the silent
                  // catch may have been hiding a parse error.
                  if (!raw) {
                                        return;
                  }
                  try {
                    const data = JSON.parse(raw);
                    // Sprint 8.6.4 §1 — defensive: if a non-section
                    // payload reaches us anyway (e.g. browser fired
                    // drop here despite onDragOver returning early),
                    // stay silent and don't claim ownership. The
                    // canvas onDrop fallback handles field/library
                    // drops; warning here would just be noise.
                    if (data.type !== 'section' || typeof data.sectionIndex !== 'number') {
                      return;
                    }
                                        moveSectionOrder(data.sectionIndex, secIdx);
                  } catch (err) {
                    console.error('[advance-builder] section drop parse failed', err, { raw });
                  }
                  setDragState(null);
                  setDropTarget(null);
                }}
              >
                {dropTarget && dragState?.type === 'section' && typeof dropTarget === 'object' && !('fieldIndex' in dropTarget) && dropTarget.sectionIndex === secIdx && (
                  <div className="absolute left-0 right-0 top-0 h-1 bg-lp-orange rounded-t-lg z-10 shadow-sm" aria-hidden />
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedRight((s) => { const n = new Set(s); if (n.has(secIdx)) n.delete(secIdx); else n.add(secIdx); return n; })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedRight((s) => { const n = new Set(s); if (n.has(secIdx)) n.delete(secIdx); else n.add(secIdx); return n; }); } }}
                  className="flex items-center gap-2 bg-lp-bg-secondary px-3 py-2 cursor-pointer hover:bg-lp-bg-tertiary transition-colors"
                >
                  <span className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-200', expanded && 'rotate-180')}>
                    <ChevronDown size={16} />
                  </span>
                  <GripVertical className="shrink-0 cursor-grab text-lp-text-tertiary active:cursor-grabbing" />
                  <SectionIcon icon={template?.icon ?? sec.template_id === CUSTOM_SECTION_ID ? 'clipboard' : undefined} />
                  <span className="flex-1 text-sm font-medium text-lp-text">{sec.label}</span>
                  {/* VIS-AB-05 — "Venue can fill x of y" while building. */}
                  {(sec.fields ?? []).length > 0 ? (
                    <span
                      className="shrink-0 text-lp-text-tertiary"
                      style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                      title="Fields the venue can fill on the intake form (excludes TM-only + file / contact)"
                    >
                      Venue can fill{' '}
                      <span className="lp-mono text-lp-text-secondary">{venueFillableCount(sec.fields)}</span>
                      {' '}of{' '}
                      <span className="lp-mono text-lp-text-secondary">{(sec.fields ?? []).length}</span>
                    </span>
                  ) : null}
                </div>
                <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
                  <div className="min-h-0 overflow-hidden">
                    <ul className="border-t border-lp-border bg-lp-surface py-1 transition-all duration-200">
                      {fields.map((f, fieldIdx) => {
                        const isDraggingField = dragState?.type === 'field' && dragState.sectionIndex === secIdx && dragState.fieldIndex === fieldIdx;
                        const isDropTarget = dropTarget && 'fieldIndex' in dropTarget && dropTarget.sectionIndex === secIdx && dropTarget.fieldIndex === fieldIdx;
                        return (
                          <Fragment key={f.id}>
                            {isDropTarget && (
                              <li
                                className="mx-2 my-0.5 h-10 rounded border-2 border-dashed border-lp-orange bg-lp-orange/10 flex items-center px-3 transition-all duration-200"
                                aria-hidden
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => {
                                  // Sprint 8.6 patch — the field drop indicator
                                  // displaces the target field li down by ~40px
                                  // when it renders, so the user's cursor lands
                                  // on the indicator. Without its own onDrop,
                                  // the event bubbled past the field row's
                                  // stopPropagation, up to the section card's
                                  // onDrop, where data.type === 'field' bailed
                                  // with "payload not a section move". Mirror
                                  // the real field li's onDrop logic here.
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const raw = e.dataTransfer.getData('application/json');
                                  if (!raw) return;
                                  try {
                                    const data = JSON.parse(raw);
                                    if (data.type === 'field' && data.sectionIndex === secIdx && typeof data.fieldIndex === 'number') {
                                      moveFieldOrder(secIdx, data.fieldIndex, fieldIdx);
                                    }
                                  } catch (err) {
                                    console.error('[advance-builder] field indicator drop parse failed', err, { raw });
                                  }
                                  setDragState(null);
                                  setDropTarget(null);
                                }}
                              />
                            )}
                            <li
                              className={cn(
                                'relative flex items-center gap-2 px-3 py-2 group transition-all duration-200 ease-out cursor-pointer',
                                removingField === `${secIdx}-${fieldIdx}` && 'opacity-0',
                                lastAddedKey === `${sec.template_id}-${f.id}` && 'bg-lp-accent/25',
                                isDraggingField && 'scale-105 shadow-md opacity-90 z-10 rounded-md',
                              )}
                              style={
                                selectedFieldId === f.id
                                  ? {
                                      borderLeft: '2px solid var(--color-lp-orange)',
                                      background:
                                        'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)',
                                      paddingLeft: 10 /* compensate for the 2px border */,
                                    }
                                  : undefined
                              }
                              onClick={(e) => {
                                // Don't intercept clicks on internal controls
                                // (drag handle, delete X, etc.).
                                const target = e.target as HTMLElement;
                                if (target.closest('button, input, select, textarea')) return;
                                setSelectedFieldId(f.id);
                                if (typeof window !== 'undefined') {
                                  window.dispatchEvent(
                                    new CustomEvent('advance:field-selected', {
                                      detail: {
                                        id: f.id,
                                        // VIS-AB-03 — real type (any of the 12), plus tm_only +
                                        // help/placeholder so the inspector exposes them all.
                                        type: f.type,
                                        label: f.label,
                                        required: f.required ?? false,
                                        tmOnly: f.tm_only ?? false,
                                        placeholder: typeof f.placeholder === 'string' ? f.placeholder : undefined,
                                        helpText: typeof f.helpText === 'string' ? f.helpText : undefined,
                                      },
                                    }),
                                  );
                                }
                              }}
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('application/x-lowpass-field', ''); e.dataTransfer.setData('application/json', JSON.stringify({ type: 'field', sectionIndex: secIdx, fieldIndex: fieldIdx })); setDragGhost(e, f.label); setDragState({ type: 'field', sectionIndex: secIdx, fieldIndex: fieldIdx, field: f }); }}
                              onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragState?.type === 'field' && (dragState.sectionIndex !== secIdx || dragState.fieldIndex !== fieldIdx)) setDropTarget({ sectionIndex: secIdx, fieldIndex: fieldIdx }); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const raw = e.dataTransfer.getData('application/json');
                                if (!raw) {
                                                                    return;
                                }
                                try {
                                  const data = JSON.parse(raw);
                                                                    if (data.type === 'field' && data.sectionIndex === secIdx && typeof data.fieldIndex === 'number') {
                                    moveFieldOrder(secIdx, data.fieldIndex, fieldIdx);
                                  } else if (data.type === 'section' && typeof data.sectionIndex === 'number') {
                                    // Sprint 8.6.3 §B — section drag landing
                                    // on a field row (drop target inside an
                                    // expanded section card) used to be
                                    // silently swallowed because field's
                                    // stopPropagation blocked the section
                                    // card's onDrop. Treat the parent
                                    // section's index as the destination so
                                    // the user's intent (drop section on/in
                                    // section X) lands correctly.
                                                                        moveSectionOrder(data.sectionIndex, secIdx);
                                  } else if (data.type === 'field' && data.sectionIndex !== secIdx) {
                                    // Sprint 8.6.3 §A — log the cross-section
                                    // field drop case (unsupported today) so
                                    // we know if Adam is doing this and the
                                    // silent-no-op explains "didn't reorder".
                                                                      }
                                } catch (err) {
                                  // Sprint 8.6 §4 — un-silenced from `catch (_)` so failures surface.
                                  console.error('[advance-builder] field drop parse failed', err, { raw });
                                }
                                setDragState(null);
                                setDropTarget(null);
                              }}
                            >
                              <GripVertical className="shrink-0 cursor-grab text-lp-text-tertiary active:cursor-grabbing" />
                              <FieldTypeIcon type={f.type} />
                              <span className="flex-1 truncate text-sm text-lp-text">{f.label}</span>
                              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', (f.required ?? false) ? 'advance-req-badge' : 'advance-opt-badge')}>{(f.required ?? false) ? 'Required' : 'Optional'}</span>
                              <button type="button" onClick={() => removeField(secIdx, fieldIdx)} className="shrink-0 rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <X size={14} />
                              </button>
                            </li>
                          </Fragment>
                        );
                      })}
                    </ul>
                    {/* Sprint 8.6 §6 — "+ Add custom field" pinned at
                        the bottom of every section card. Forks the
                        section's template into a workspace-scoped copy
                        with the new field appended; future tours that
                        drag this section from the library inherit the
                        customization. Existing tours' sections are NOT
                        retroactively updated (Adam's UX guarantee). */}
                    <div className="border-t border-lp-border px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPlatformFieldTarget({
                            templateId: sec.template_id,
                            sectionName: sec.label,
                          });
                        }}
                        className="btn-transition flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-lp-border px-3 py-1.5 text-xs font-medium text-lp-text-secondary hover:border-lp-orange hover:text-lp-orange"
                      >
                        <Plus size={12} />
                        Add custom field
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              </Fragment>
            );
          })}
          {sections.length === 0 && !dragState?.type && (
            <p className="py-8 text-center text-sm text-lp-text-tertiary">Add questions from the Template Library (left).</p>
          )}
          {dragState?.type === 'field' && (
            <div className="rounded-xl border-2 border-dashed border-lp-orange bg-lp-orange/10 py-6 text-center text-sm font-medium text-lp-orange">
              Drop here to add to this show&apos;s advance
            </div>
          )}
        </div>
        <div className="border-t border-lp-border p-3 flex flex-wrap gap-2">
          <button type="button" onClick={saveLayout} disabled={sections.length === 0 || saving} className="btn-transition btn-primary-press rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">
            {saving ? 'Saving...' : 'Save layout'}
          </button>
          <button type="button" onClick={openApplyTemplate} className="flex items-center gap-2 rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover">
            <LayoutTemplate size={16} /> Apply template
          </button>
          <button type="button" onClick={() => setSaveAsTemplateOpen(true)} disabled={sections.length === 0} className="flex items-center gap-2 rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50">
            <LayoutTemplate size={16} /> Save as template
          </button>
          {currentSections.length > 0 && (
            <button type="button" onClick={onCancel} className="rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover">Cancel</button>
          )}
        </div>
      </div>

      {/* Modals: Apply template, Save as template */}
      {applyTemplateOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={() => setApplyTemplateOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Apply template</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">Replace this show&apos;s sections with a saved layout.</p>
            {currentSections.length > 0 && <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Current sections will be replaced.</p>}
            {layoutTemplatesLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-lp-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <ul className="mt-4 max-h-60 overflow-y-auto space-y-2">
                {layoutTemplates.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-lp-border p-3">
                    <div>
                      <p className="font-medium text-lp-text">{t.name}</p>
                      <p className="text-xs text-lp-text-tertiary">{(t.sections?.length ?? 0)} sections</p>
                    </div>
                    <button type="button" onClick={() => applyLayoutTemplate(t)} className="shrink-0 rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover">Apply</button>
                  </li>
                ))}
              </ul>
            )}
            {!layoutTemplatesLoading && layoutTemplates.length === 0 && <p className="mt-4 text-sm text-lp-text-tertiary">No saved templates.</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setApplyTemplateOpen(false)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {saveAsTemplateOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={() => setSaveAsTemplateOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Save as template</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">Give this layout a name to reuse on other shows.</p>
            <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Festival, Club, Headline" className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveAsTemplateOpen(false)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
              <button type="button" onClick={saveAsTemplate} disabled={!templateName.trim()} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Sprint 8.6 §6 — Platform-template "+ Add custom field"
          modal. Forks the section's library template into a
          workspace-scoped copy with the new field appended.
          Existing per-show advance_form_configs sections are
          NOT retroactively updated — only the library entry is
          customized. The modal's warning text makes that
          guarantee explicit. */}
      {platformFieldTarget && (
        <AddPlatformFieldModal
          open
          templateId={platformFieldTarget.templateId}
          sectionName={platformFieldTarget.sectionName}
          onClose={() => setPlatformFieldTarget(null)}
          onFielded={(template) => {
            // Refresh the library so future renders pick up
            // the workspace fork (and the platform original is
            // filtered out per the GET handler dedup logic).
            fetchTemplates();
            // Append the newly added field to the current
            // section's fields locally so the canvas reflects
            // the change immediately. The fork API appends to
            // the end, so the new field is the last element.
            const newField = template.fields[template.fields.length - 1];
            if (newField) {
              setSections((prev) =>
                prev.map((s) =>
                  s.template_id === platformFieldTarget.templateId
                    ? {
                        ...s,
                        // Re-point at the workspace fork so any
                        // future "+ Add custom field" on this
                        // section hits the extend path.
                        template_id: template.id,
                        fields: [...(s.fields ?? []), newField as FieldDef],
                      }
                    : s,
                ),
              );
            }
          }}
        />
      )}

      {/* Custom field modal */}
      {customFieldOpen && (
        <CustomFieldModal
          onClose={() => { setCustomFieldOpen(false); setCustomFieldContext(null); }}
          onAdd={handleAddCustomField}
          /* Sprint 8.6 §5 — restrict 'contact' field type to
             the Key Contacts section. The migration enforces
             this server-side via CHECK; the modal hides it
             from the picker so the user never tries. */
          targetSectionLabel={
            customFieldContext === 'standalone' || customFieldContext === null
              ? null
              : customFieldContext.templateName
          }
        />
      )}

      {/* Custom section modal */}
      {customSectionOpen && (
        <CustomSectionModal
          onClose={() => setCustomSectionOpen(false)}
          onAdd={handleAddCustomSection}
        />
      )}

      {/* Delete custom section confirmation */}
      {templateToDelete && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={() => setTemplateToDelete(null)}>
          <div className="w-full max-w-sm rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Delete section?</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">Delete section &quot;{templateToDelete.name}&quot;? This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTemplateToDelete(null)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
              <button type="button" onClick={handleDeleteCustomSection} disabled={deletingTemplate} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {deletingTemplate && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {fieldToDeleteFromLibrary && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={() => setFieldToDeleteFromLibrary(null)}>
          <div className="w-full max-w-sm rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Delete this advance field?</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">Remove &quot;{fieldToDeleteFromLibrary.field.label}&quot; from the library and from this show&apos;s advance.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFieldToDeleteFromLibrary(null)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
              <button type="button" onClick={handleDeleteFieldFromLibrary} disabled={deletingFieldFromLibrary} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {deletingFieldFromLibrary && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownOptionsEditor({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const parts = value ? value.split(',').map((s) => s.trim()) : [];
  const rows = parts.length && parts[parts.length - 1] === '' ? parts : [...parts, ''];
  const update = (next: string[]) => {
    onChange(next.join(', '));
  };
  const setRow = (index: number, v: string) => {
    const next = [...rows];
    next[index] = v;
    if (index === rows.length - 1 && v.trim() !== '') next.push('');
    update(next);
  };
  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    update(next.length ? next : ['']);
  };
  const addRow = () => {
    update([...rows, '']);
  };
  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium text-lp-text-tertiary">Options</label>
      <div className="rounded-lg border border-lp-border bg-lp-surface overflow-hidden">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2 border-b border-lp-border last:border-b-0 px-2 py-1.5">
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-lp-text-tertiary" />
            <input
              type="text"
              value={row}
              onChange={(e) => setRow(index, e.target.value)}
              placeholder="Option value"
              className="flex-1 min-w-0 rounded-md border border-lp-border bg-lp-surface px-2.5 py-1.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-red-500"
              aria-label="Remove option"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="p-2">
          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-lp-border py-2 text-sm font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
          >
            <Plus size={14} />
            Add option
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomFieldModal({
  onClose,
  onAdd,
  targetSectionLabel,
}: {
  onClose: () => void;
  onAdd: (field: FieldDef) => void | Promise<void>;
  /** Sprint 8.6 §5 — when present and not "Key Contacts",
   *  the 'contact' field type is hidden from the picker. */
  targetSectionLabel?: string | null;
}) {
  // Sprint 8.6 §5 — filter 'contact' out of the picker when
  // adding to a non-Key-Contacts section. Adam's call: contact
  // fields ONLY allowed in Key Contacts.
  const fieldTypeOptions = targetSectionLabel === 'Key Contacts' || targetSectionLabel == null
    ? FIELD_TYPE_OPTIONS
    : FIELD_TYPE_OPTIONS.filter((o) => o.id !== 'contact');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [required, setRequired] = useState(false);
  const [optionsStr, setOptionsStr] = useState('');
  const [sliderMin, setSliderMin] = useState('0');
  const [sliderMax, setSliderMax] = useState('100');
  const [sliderStep, setSliderStep] = useState('1');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (typeDropdownRef.current?.contains(e.target as Node)) return;
      setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [typeDropdownOpen]);

  const selectedOption = fieldTypeOptions.find((o) => o.id === type) ?? fieldTypeOptions[0];

  const handleSubmit = () => {
    if (!label.trim()) return;
    const id = `${slugify(label)}-${Math.random().toString(36).slice(2, 8)}`;
    const field: FieldDef = { id, label: label.trim(), type, required };
    if (type === 'select' && optionsStr.trim()) {
      field.options = optionsStr.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (type === 'slider') {
      const min = Number(sliderMin);
      const max = Number(sliderMax);
      const step = Number(sliderStep);
      if (!Number.isNaN(min)) field.min = min;
      if (!Number.isNaN(max)) field.max = max;
      if (!Number.isNaN(step)) field.step = step;
    }
    onAdd(field);
    setLabel('');
    setType('text');
    setRequired(false);
    setOptionsStr('');
    setSliderMin('0');
    setSliderMax('100');
    setSliderStep('1');
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-lp-text">Custom field</h3>
        <p className="mt-1 text-sm text-lp-text-secondary">Field label, type, and options.</p>
        <label className="mt-4 block text-xs font-medium text-lp-text-tertiary">Field label</label>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Field label" className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20" />
        <label className="mt-3 block text-xs font-medium text-lp-text-tertiary">Field type</label>
        <div className="relative mt-1" ref={typeDropdownRef}>
          <button
            type="button"
            onClick={() => setTypeDropdownOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5 text-left text-sm text-lp-text hover:bg-lp-surface-hover focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
          >
            <selectedOption.Icon size={16} className="shrink-0 text-lp-text-secondary" />
            <span className="flex-1">{selectedOption.label}</span>
            <ChevronDown size={16} className="shrink-0 text-lp-text-tertiary" />
          </button>
          {typeDropdownOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-xl context-menu-dropdown">
              {fieldTypeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setType(opt.id); setTypeDropdownOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                    type === opt.id ? 'border-l-2 border-lp-orange bg-lp-orange/5 text-lp-text' : 'hover:bg-lp-surface-hover text-lp-text'
                  )}
                >
                  <opt.Icon size={16} className="shrink-0 text-lp-text-secondary" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{opt.label}</span>
                    <p className="text-xs text-lp-text-muted truncate">{opt.description}</p>
                  </div>
                  {type === opt.id && <Check size={16} className="shrink-0 text-lp-orange" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-lp-text-tertiary">Required</p>
          <div className="inline-flex rounded-lg border border-lp-border bg-lp-bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => setRequired(false)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                !required ? 'bg-lp-orange text-white' : 'text-lp-text-secondary hover:text-lp-text'
              )}
            >
              Optional
            </button>
            <button
              type="button"
              onClick={() => setRequired(true)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                required ? 'bg-lp-orange text-white' : 'text-lp-text-secondary hover:text-lp-text'
              )}
            >
              Required
            </button>
          </div>
        </div>
        {type === 'select' && (
          <DropdownOptionsEditor value={optionsStr} onChange={setOptionsStr} />
        )}
        {type === 'slider' && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-lp-text-tertiary">Min</label>
              <input type="number" value={sliderMin} onChange={(e) => setSliderMin(e.target.value)} className="mt-1 w-full rounded-lg border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text" />
            </div>
            <div>
              <label className="block text-xs font-medium text-lp-text-tertiary">Max</label>
              <input type="number" value={sliderMax} onChange={(e) => setSliderMax(e.target.value)} className="mt-1 w-full rounded-lg border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text" />
            </div>
            <div>
              <label className="block text-xs font-medium text-lp-text-tertiary">Step</label>
              <input type="number" value={sliderStep} onChange={(e) => setSliderStep(e.target.value)} className="mt-1 w-full rounded-lg border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text" />
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!label.trim()} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}

function CustomSectionModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, icon: string, description: string) => void | Promise<void> }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(CUSTOM_SECTION_ICONS[0] ?? 'clipboard');
  const [description, setDescription] = useState('');
  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), icon, description.trim());
    setName('');
    setDescription('');
  };
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-lp-text">Custom section</h3>
        <p className="mt-1 text-sm text-lp-text-secondary">Section name, icon, and optional description.</p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Section name" className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20" />
        <p className="mt-3 text-xs font-medium text-lp-text-tertiary">Icon</p>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5 sm:grid-cols-8">
          {CUSTOM_SECTION_ICONS.map((i) => {
            const IconComp = ICON_MAP[i.replace(/-/g, '')] ?? ICON_MAP[i] ?? ClipboardList;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg border text-lp-text-tertiary transition-colors hover:bg-lp-surface-hover hover:text-lp-text',
                  icon === i ? 'border-lp-orange bg-lp-orange/10 text-lp-orange' : 'border-lp-border'
                )}
                title={i}
              >
                <IconComp size={18} />
              </button>
            );
          })}
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="mt-3 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!name.trim()} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}

// ----- FILL MODE -----


export { SetupMode };
