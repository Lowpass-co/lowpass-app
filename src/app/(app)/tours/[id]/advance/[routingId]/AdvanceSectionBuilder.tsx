'use client';

/* ============================================
   LOWPASS — Advance Section Builder

   SETUP: two-panel section picker + reorder. FILL: accordion form with fields.
   ============================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
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
} from 'lucide-react';
import { parseRoutingDate, getDayTypeLabel, getDayTypeColor, getAdvanceStatusInfo, cn } from '@/lib/utils';
import { SlidingToggle } from '@/components/ui/SlidingToggle';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useAuth } from '@/hooks/useAuth';

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

const STATUS_ORDER = ['not_started', 'in_progress', 'complete', 'needs_review'] as const;

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  clipboard: ClipboardList,
  speaker: Speaker,
  utensils: UtensilsCrossed,
  clock: Clock,
  truck: Truck,
  user: Users,
  users: Users,
  file: FileText,
  filetext: FileText,
  music: Music,
  mappin: MapPin,
  map: MapPin,
  wifi: Wifi,
  car: Car,
  building: Building2,
  bed: Bed,
  plane: Plane,
  'shopping-bag': ShoppingBag,
  shoppingbag: ShoppingBag,
  shield: ShieldCheck,
  'shield-check': ShieldCheck,
  shieldcheck: ShieldCheck,
  banknote: Banknote,
  star: Star,
  heart: Heart,
  flag: Flag,
  zap: Zap,
  tool: Wrench,
  wrench: Wrench,
  camera: Camera,
  mic: Mic,
  headphones: Headphones,
  globe: Globe,
  coffee: Coffee,
  gift: Gift,
  award: Award,
  bookmark: Bookmark,
  tag: Tag,
  hash: Hash,
  link: Link,
  paperclip: Paperclip,
  folder: Folder,
};

const CUSTOM_SECTION_ICONS = [
  'clipboard', 'file-text', 'star', 'heart', 'flag', 'zap', 'tool', 'music',
  'camera', 'mic', 'headphones', 'globe', 'coffee', 'gift', 'award', 'bookmark',
  'tag', 'hash', 'link', 'paperclip', 'folder',
] as const;

function SectionIcon({ icon }: { icon?: string }) {
  const name = (icon ?? 'clipboard').toLowerCase().replace(/-/g, '');
  const Comp = ICON_MAP[name] ?? ClipboardList;
  return <Comp className="text-lp-text-secondary" size={18} />;
}

const FIELD_TYPE_ICONS: Record<string, string> = {
  text: 'Aa',
  textarea: '¶',
  select: '▼',
  time: '🕐',
  currency: '£',
  boolean: '⬡',
  contact: '👤',
  url: '🔗',
  number: '#',
  date: '📅',
  file: '📎',
  slider: '⋮⋮',
};

const FIELD_TYPE_OPTIONS: { id: string; label: string; description: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'text', label: 'Text', description: 'Single line input', Icon: Type },
  { id: 'textarea', label: 'Long text', description: 'Multi-line text area', Icon: AlignLeft },
  { id: 'select', label: 'Dropdown', description: 'Choose from options', Icon: ChevronDownIcon },
  { id: 'number', label: 'Number', description: 'Numeric input', Icon: Hash },
  { id: 'currency', label: 'Currency', description: 'Amount with currency', Icon: Banknote },
  { id: 'date', label: 'Date', description: 'Date picker', Icon: Calendar },
  { id: 'time', label: 'Time', description: 'Time picker', Icon: Clock },
  { id: 'boolean', label: 'Yes/No', description: 'Boolean toggle', Icon: ToggleLeft },
  { id: 'file', label: 'File upload', description: 'PDF, images up to 10MB', Icon: Upload },
  { id: 'contact', label: 'Contact', description: 'Name, phone, email', Icon: User },
  { id: 'url', label: 'URL', description: 'URL with validation', Icon: LinkIcon },
  { id: 'slider', label: 'Slider', description: 'Range with min/max/step', Icon: Sliders },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'field';
}

function FieldTypeIcon({ type }: { type: string }) {
  const char = FIELD_TYPE_ICONS[type] ?? '?';
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-lp-border bg-lp-bg-secondary text-xs font-medium text-lp-text-secondary">
      {char}
    </span>
  );
}

function setDragGhost(e: React.DragEvent, label: string) {
  const el = document.createElement('div');
  el.textContent = label;
  el.style.cssText = 'position:absolute;top:-9999px;left:-9999px;padding:8px 12px;background:var(--lp-surface, #1a1a1a);border:1px solid var(--lp-border, #333);border-radius:8px;font-size:14px;opacity:0.85;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:var(--lp-text, #eee);';
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 12, 16);
  setTimeout(() => el.remove(), 0);
}

// ----- Types -----

type FieldDef = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  [key: string]: unknown;
};

type SectionDef = {
  template_id: string;
  label: string;
  fields: FieldDef[];
  order: number;
};

export type ContactRow = {
  id?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  role: string;
  venue_name?: string;
  notes?: string;
};

const KEY_CONTACTS_LABEL = 'Key Contacts';

const CONTACT_ROLES = [
  'Promoter',
  'Venue Rep',
  'Production Manager',
  'Tour Manager',
  'Security',
  'Hospitality',
  'Transport',
  'Other',
] as const;

type ApiTemplate = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  fields: FieldDef[];
  suggested_for_day_types?: string[];
  workspace_id?: string | null;
};

type AdvanceData = Record<string, Record<string, unknown>>;
type SectionStatuses = Record<string, { status: string; assigned_to?: string }>;

export type AdvanceFlag = {
  id: string;
  section_id: string;
  type: 'issue' | 'question' | 'blocker';
  message: string;
  created_by: string;
  created_at: string;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
};

// ----- Data shape from GET /api/tours/[id]/advance/[routingId] -----

type PageData = {
  routing: { id: string; date: string; venue_name: string | null; city: string; day_type: string; address?: string | null; venue_website?: string | null; venue_phone?: string | null; venue_capacity?: number | null; latitude?: number | null; longitude?: number | null };
  tour: { currency: string };
  advance: {
    instance_id: string;
    status: string;
    section_statuses: SectionStatuses;
    data: AdvanceData;
    sections: SectionDef[];
    flags: AdvanceFlag[];
  } | null;
};

type AdvanceComment = {
  id: string;
  section_id: string;
  author_id: string;
  author_name: string;
  content: string;
  thread_id: string | null;
  created_at: string;
};

export function AdvanceSectionBuilder({
  tourId,
  routingId,
}: {
  tourId: string;
  routingId: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tours/${tourId}/advance/${routingId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tourId, routingId]);

  const hasSections = data?.advance?.sections?.length ? true : false;
  const showSetup = setupMode || !hasSections;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-lp-text-tertiary" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center">
        <p className="text-lp-text-secondary">Advance not found.</p>
        <Link href={`/tours/${tourId}/advance`} className="mt-4 inline-block text-sm text-lp-orange hover:text-lp-orange-hover">
          Back to advance overview
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        tourId={tourId}
        routing={data.routing}
        advance={data.advance}
        saving={saving}
        onSave={async () => {
          if (!data.advance) return;
          setSaving(true);
          try {
            await fetch(`/api/tours/${tourId}/advance/${routingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                data: data.advance.data,
                section_statuses: data.advance.section_statuses,
                status: data.advance.status,
              }),
            });
          } finally {
            setSaving(false);
          }
        }}
        showSaveButton={!showSetup && !!data.advance}
      />
      {showSetup ? (
        <SetupMode
          tourId={tourId}
          routingId={routingId}
          currentSections={data.advance?.sections ?? []}
          defaultAdvanceTemplateId={(data.tour as { default_advance_template_id?: string })?.default_advance_template_id ?? null}
          onSaved={async () => {
            const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`);
            if (res.ok) {
              const d = await res.json();
              setData(d);
              setSetupMode(false);
            }
          }}
          onCancel={() => hasSections && setSetupMode(false)}
        />
      ) : (
        <FillMode
          tourId={tourId}
          routingId={routingId}
          currentUserId={user?.id ?? null}
          currency={data.tour.currency}
          venueName={data.routing.venue_name ?? null}
          venueLat={data.routing.latitude ?? undefined}
          venueLng={data.routing.longitude ?? undefined}
          advance={data.advance!}
          onUpdate={(patch) => {
            setData((prev) => {
              if (!prev?.advance) return prev;
              return {
                ...prev,
                advance: {
                  ...prev.advance,
                  ...patch,
                },
              };
            });
          }}
          onEditSections={() => setSetupMode(true)}
          onCopyToOther={() => router.push(`/tours/${tourId}/advance?copy=${routingId}`)}
          onRemoveSection={async (templateId) => {
            const sections = (data.advance?.sections ?? []).filter((s) => s.template_id !== templateId);
            const res = await fetch(`/api/tours/${tourId}/advance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ routing_id: routingId, sections }),
            });
            if (res.ok) {
              const advanceRes = await fetch(`/api/tours/${tourId}/advance/${routingId}`);
              const d = await advanceRes.json();
              setData(d);
            }
          }}
        />
      )}
    </div>
  );
}

function Header({
  tourId,
  routing,
  advance,
  saving,
  onSave,
  showSaveButton,
}: {
  tourId: string;
  routing: PageData['routing'];
  advance: PageData['advance'];
  saving: boolean;
  onSave: () => void;
  showSaveButton?: boolean;
}) {
  const dateLabel = parseRoutingDate(routing.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const dayColors = routing.day_type ? getDayTypeColor(routing.day_type) : null;
  const statusInfo = getAdvanceStatusInfo(advance?.status ?? 'not_started');

  return (
    <>
      <div className="flex items-center gap-4">
        <Link
          href={`/tours/${tourId}/advance`}
          className="flex items-center gap-1 text-sm text-lp-text-secondary hover:text-lp-text"
        >
          <ArrowLeft size={16} />
          Back to advance overview
        </Link>
      </div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-lp-border bg-lp-surface/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-lp-text">{dateLabel}</span>
          {dayColors && (
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', dayColors.bg, dayColors.text)}>
              {getDayTypeLabel(routing.day_type)}
            </span>
          )}
          <span className="text-lp-text-secondary">—</span>
          <span className="text-lp-text">{routing.venue_name || '—'}</span>
          <span className="text-sm text-lp-text-tertiary">{routing.city || ''}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusInfo.bg, statusInfo.color)}>
            {statusInfo.label}
          </span>
        </div>
        {showSaveButton && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-transition btn-primary-press flex items-center gap-2 rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save
          </button>
        )}
      </div>
    </>
  );
}

// ----- SETUP MODE (split-panel question-level builder) -----

const CUSTOM_SECTION_ID = '__custom__';

function SetupMode({
  tourId,
  routingId,
  currentSections,
  defaultAdvanceTemplateId,
  onSaved,
  onCancel,
}: {
  tourId: string;
  routingId: string;
  currentSections: SectionDef[];
  defaultAdvanceTemplateId: string | null;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [sections, setSections] = useState<SectionDef[]>(currentSections);
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
  const [templateToDelete, setTemplateToDelete] = useState<ApiTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [dragState, setDragState] = useState<{ type: 'section' | 'field'; sectionIndex?: number; fieldIndex?: number; templateId?: string; field?: FieldDef } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sectionIndex: number; fieldIndex: number } | { sectionIndex: number } | null>(null);
  const [removingField, setRemovingField] = useState<string | null>(null);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);

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
        if (t?.sections?.length) setSections(t.sections.map((s, i) => ({ ...s, order: i })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [defaultAdvanceTemplateId, currentSections.length]);

  const isFieldAdded = useCallback((templateId: string, fieldId: string) => {
    return sections.some((s) => s.template_id === templateId && (s.fields ?? []).some((f) => f.id === fieldId));
  }, [sections]);

  const isSectionFullyAdded = useCallback((t: ApiTemplate) => {
    const fields = t.fields ?? [];
    if (fields.length === 0) return false;
    return fields.every((f) => isFieldAdded(t.id, f.id));
  }, [isFieldAdded]);

  const addField = useCallback((t: ApiTemplate, field: FieldDef) => {
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
    const res = await fetch(`/api/tours/${tourId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_template: true, template_label: templateName.trim(), sections }),
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
    if (template.sections?.length) setSections(template.sections.map((s, i) => ({ ...s, order: i })));
    setApplyTemplateOpen(false);
  };

  const handleAddCustomField = async (field: FieldDef) => {
    const templateId = customFieldContext === 'standalone' ? CUSTOM_SECTION_ID : (customFieldContext?.templateId ?? CUSTOM_SECTION_ID);
    const templateName = customFieldContext === 'standalone' ? 'Custom' : (customFieldContext?.templateName ?? 'Custom');
    setSections((prev) => {
      const existing = prev.findIndex((s) => s.template_id === templateId);
      const clone = { ...field };
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
        fetchTemplates();
        setTemplateToDelete(null);
      }
    } finally {
      setDeletingTemplate(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT — Template Library */}
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
                    <div className="flex items-center gap-2 bg-lp-bg-secondary px-3 py-2">
                      <button type="button" onClick={() => setExpandedLibrary((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} className="shrink-0 text-lp-text-tertiary hover:text-lp-text">
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <SectionIcon icon={t.icon} />
                      <span className="flex-1 text-sm font-medium text-lp-text">{t.name}</span>
                      <button type="button" onClick={() => addAllFields(t)} disabled={fields.length === 0} className="shrink-0 rounded p-1.5 text-lp-text hover:bg-lp-surface-hover disabled:opacity-50" title="Add all questions">
                        <Plus size={16} />
                      </button>
                      {allAdded && <Check size={16} className="shrink-0 text-[#FF4500]" />}
                    </div>
                    {expanded && (
                      <ul className="border-t border-lp-border bg-lp-surface py-1">
                        {(fields as FieldDef[]).map((f) => {
                          const added = isFieldAdded(t.id, f.id);
                          return (
                            <li key={f.id} className="group">
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ templateId: t.id, field: f })); e.dataTransfer.effectAllowed = 'copy'; setDragGhost(e, f.label); setDragState({ type: 'field', templateId: t.id, field: f }); }}
                                onDragEnd={() => setDragState(null)}
                                onClick={() => { if (!added) { addField(t, f); setLastAddedKey(`${t.id}-${f.id}`); setTimeout(() => setLastAddedKey(null), 200); } }}
                                className={cn(
                                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                                  added ? 'bg-[#FF4500]/10 text-lp-text border-l border-[#FF4500]' : 'hover:bg-lp-surface-hover text-lp-text',
                                  !added && 'cursor-pointer'
                                )}
                              >
                                <FieldTypeIcon type={f.type} />
                                <span className="flex-1 truncate">{f.label}</span>
                                {added && <Check size={14} className="shrink-0 text-[#FF4500]" />}
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
                    )}
                  </li>
                );
              })}
              <li className="pt-2">
                <p className="mb-1.5 px-1 text-xs font-medium text-lp-text-tertiary">Custom</p>
                {templates.filter((t) => t.workspace_id).map((t) => {
                  const expanded = expandedLibrary.has(t.id);
                  const allAdded = isSectionFullyAdded(t);
                  const fields = t.fields ?? [];
                  return (
                    <li key={t.id} className="rounded-lg border border-lp-border overflow-hidden mb-1">
                      <div className="flex items-center gap-2 bg-lp-bg-secondary px-3 py-2">
                        <button type="button" onClick={() => setExpandedLibrary((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} className="shrink-0 text-lp-text-tertiary hover:text-lp-text">
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <SectionIcon icon={t.icon} />
                        <span className="flex-1 text-sm font-medium text-lp-text">{t.name}</span>
                        <button type="button" onClick={() => addAllFields(t)} disabled={fields.length === 0} className="shrink-0 rounded p-1.5 text-lp-text hover:bg-lp-surface-hover disabled:opacity-50" title="Add all questions">
                          <Plus size={16} />
                        </button>
                        {allAdded && <Check size={16} className="shrink-0 text-[#FF4500]" />}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setTemplateToDelete(t); }} className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500" title="Delete section">
                          <X size={16} />
                        </button>
                      </div>
                      {expanded && (
                        <ul className="border-t border-lp-border bg-lp-surface py-1">
                          {(fields as FieldDef[]).map((f) => {
                            const added = isFieldAdded(t.id, f.id);
                            return (
                              <li key={f.id} className="group">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ templateId: t.id, field: f })); e.dataTransfer.effectAllowed = 'copy'; setDragGhost(e, f.label); setDragState({ type: 'field', templateId: t.id, field: f }); }}
                                  onDragEnd={() => setDragState(null)}
                                  onClick={() => { if (!added) { addField(t, f); setLastAddedKey(`${t.id}-${f.id}`); setTimeout(() => setLastAddedKey(null), 200); } }}
                                  className={cn(
                                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                                    added ? 'bg-[#FF4500]/10 text-lp-text border-l border-[#FF4500]' : 'hover:bg-lp-surface-hover text-lp-text',
                                    !added && 'cursor-pointer'
                                  )}
                                >
                                  <FieldTypeIcon type={f.type} />
                                  <span className="flex-1 truncate">{f.label}</span>
                                  {added && <Check size={14} className="shrink-0 text-[#FF4500]" />}
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
                      )}
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

      {/* RIGHT — This Show's Advance */}
      <div className="flex flex-col rounded-xl border border-lp-border bg-lp-surface">
        <h3 className="border-b border-lp-border px-4 py-3 text-sm font-semibold text-lp-text">This show&apos;s advance</h3>
        <div
          className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('application/json');
            if (!raw) return;
            try {
              const data = JSON.parse(raw);
              if (data.templateId && data.field) {
                const t = templates.find((x) => x.id === data.templateId);
                if (t) { addField(t, data.field); setLastAddedKey(`${t.id}-${data.field.id}`); setTimeout(() => setLastAddedKey(null), 200); }
              }
            } catch (_) { /* ignore */ }
            setDragState(null);
            setDropTarget(null);
          }}
        >
          {sections.map((sec, secIdx) => {
            const expanded = expandedRight.has(secIdx);
            const template = templates.find((t) => t.id === sec.template_id);
            const fields = sec.fields ?? [];
            return (
              <div
                key={`${sec.template_id}-${secIdx}`}
                className="rounded-lg border border-lp-border overflow-hidden transition-transform duration-200 ease-out relative"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'section', sectionIndex: secIdx })); setDragGhost(e, sec.label); setDragState({ type: 'section', sectionIndex: secIdx }); }}
                onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragState?.type === 'section' && dragState.sectionIndex !== secIdx) setDropTarget({ sectionIndex: secIdx }); }}
                onDragLeave={() => setDropTarget((t) => (t && !('fieldIndex' in t) && t.sectionIndex === secIdx ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const raw = e.dataTransfer.getData('application/json');
                  if (!raw) return;
                  try {
                    const data = JSON.parse(raw);
                    if (data.type === 'section' && typeof data.sectionIndex === 'number') moveSectionOrder(data.sectionIndex, secIdx);
                  } catch (_) { /* ignore */ }
                  setDragState(null);
                  setDropTarget(null);
                }}
              >
                {dropTarget && dragState?.type === 'section' && typeof dropTarget === 'object' && !('fieldIndex' in dropTarget) && dropTarget.sectionIndex === secIdx && (
                  <div className="absolute left-0 right-0 top-0 h-0.5 bg-[#FF4500] opacity-80 z-10 rounded-t-lg" />
                )}
                <div className="flex items-center gap-2 bg-lp-bg-secondary px-3 py-2">
                  <button type="button" onClick={() => setExpandedRight((s) => { const n = new Set(s); if (n.has(secIdx)) n.delete(secIdx); else n.add(secIdx); return n; })} className="shrink-0 text-lp-text-tertiary hover:text-lp-text">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <GripVertical className="shrink-0 cursor-grab text-lp-text-tertiary active:cursor-grabbing" />
                  <SectionIcon icon={template?.icon ?? sec.template_id === CUSTOM_SECTION_ID ? 'clipboard' : undefined} />
                  <span className="flex-1 text-sm font-medium text-lp-text">{sec.label}</span>
                </div>
                {expanded && (
                  <ul className="border-t border-lp-border bg-lp-surface py-1">
                    {fields.map((f, fieldIdx) => (
                      <li
                        key={f.id}
                        className={cn('relative flex items-center gap-2 px-3 py-2 group transition-all duration-200', removingField === `${secIdx}-${fieldIdx}` && 'opacity-0', lastAddedKey === `${sec.template_id}-${f.id}` && 'bg-[#FF4500]/25')}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('application/json', JSON.stringify({ type: 'field', sectionIndex: secIdx, fieldIndex: fieldIdx })); setDragGhost(e, f.label); setDragState({ type: 'field', sectionIndex: secIdx, fieldIndex: fieldIdx, field: f }); }}
                        onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragState?.type === 'field' && (dragState.sectionIndex !== secIdx || dragState.fieldIndex !== fieldIdx)) setDropTarget({ sectionIndex: secIdx, fieldIndex: fieldIdx }); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const raw = e.dataTransfer.getData('application/json');
                          if (!raw) return;
                          try {
                            const data = JSON.parse(raw);
                            if (data.type === 'field' && data.sectionIndex === secIdx && typeof data.fieldIndex === 'number') moveFieldOrder(secIdx, data.fieldIndex, fieldIdx);
                          } catch (_) { /* ignore */ }
                          setDragState(null);
                          setDropTarget(null);
                        }}
                      >
                        {dropTarget && 'fieldIndex' in dropTarget && dropTarget.sectionIndex === secIdx && dropTarget.fieldIndex === fieldIdx && (
                          <div className="absolute left-0 right-0 top-0 h-0.5 bg-[#FF4500] opacity-80 z-10" />
                        )}
                        <GripVertical className="shrink-0 cursor-grab text-lp-text-tertiary active:cursor-grabbing" />
                        <FieldTypeIcon type={f.type} />
                        <span className="flex-1 truncate text-sm text-lp-text">{f.label}</span>
                        <button type="button" onClick={() => removeField(secIdx, fieldIdx)} className="shrink-0 rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {sections.length === 0 && (
            <p className="py-8 text-center text-sm text-lp-text-tertiary">Add questions from the Template Library (left).</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={() => setApplyTemplateOpen(false)}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={() => setSaveAsTemplateOpen(false)}>
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

      {/* Custom field modal */}
      {customFieldOpen && (
        <CustomFieldModal
          onClose={() => { setCustomFieldOpen(false); setCustomFieldContext(null); }}
          onAdd={handleAddCustomField}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={() => setTemplateToDelete(null)}>
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
    </div>
  );
}

function CustomFieldModal({ onClose, onAdd }: { onClose: () => void; onAdd: (field: FieldDef) => void | Promise<void> }) {
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

  const selectedOption = FIELD_TYPE_OPTIONS.find((o) => o.id === type) ?? FIELD_TYPE_OPTIONS[0];

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={onClose}>
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
              {FIELD_TYPE_OPTIONS.map((opt) => (
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
        <div className="mt-3 flex items-center gap-2">
          <SlidingToggle value={required ? 'true' : 'false'} onChange={(v) => setRequired(v === 'true')} options={['false', 'true']} labels={['Optional', 'Required']} className="w-28" />
          <span className="text-xs text-lp-text-tertiary">Required</span>
        </div>
        {type === 'select' && (
          <>
            <label className="mt-3 block text-xs font-medium text-lp-text-tertiary">Options</label>
            <input type="text" value={optionsStr} onChange={(e) => setOptionsStr(e.target.value)} placeholder="Comma-separated values" className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20" />
          </>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150" onClick={onClose}>
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

function FillMode({
  tourId,
  routingId,
  currentUserId,
  currency,
  venueName,
  venueLat,
  venueLng,
  advance,
  onUpdate,
  onEditSections,
  onCopyToOther,
  onRemoveSection,
}: {
  tourId: string;
  routingId: string;
  currentUserId: string | null;
  currency: string;
  venueName: string | null;
  venueLat?: number;
  venueLng?: number;
  advance: NonNullable<PageData['advance']>;
  onUpdate: (patch: Partial<NonNullable<PageData['advance']>>) => void;
  onEditSections: () => void;
  onCopyToOther: () => void;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const patchRef = useRef<{ data?: AdvanceData; section_statuses?: SectionStatuses; status?: string; flags?: AdvanceFlag[] }>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flags = advance.flags ?? [];

  const toggleSection = (templateId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  const setSectionStatus = (templateId: string, status: string) => {
    const next = { ...advance.section_statuses, [templateId]: { ...advance.section_statuses[templateId], status } };
    onUpdate({ section_statuses: next });
    flushPatch({ section_statuses: next });
  };

  const flushPatch = useCallback((override?: { data?: AdvanceData; section_statuses?: SectionStatuses; status?: string; flags?: AdvanceFlag[] }) => {
    const payload = { ...patchRef.current, ...override };
    if (Object.keys(payload).length === 0) return;
    patchRef.current = {};
    fetch(`/api/tours/${tourId}/advance/${routingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(() => { /* optional: toast */ });
  }, [tourId, routingId]);

  const updateFlags = useCallback((nextFlags: AdvanceFlag[]) => {
    onUpdate({ flags: nextFlags });
    patchRef.current = { ...patchRef.current, flags: nextFlags };
    flushPatch({ flags: nextFlags });
  }, [onUpdate, flushPatch]);

  const debouncedFlush = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      flushPatch();
    }, 400);
  }, [flushPatch]);

  const contactsList = (advance.data as Record<string, unknown>).contacts as ContactRow[] | undefined;
  const contacts = Array.isArray(contactsList) ? contactsList : [];

  const setContacts = useCallback(
    (nextContacts: ContactRow[]) => {
      const nextData = { ...advance.data, contacts: nextContacts };
      onUpdate({ data: nextData });
      patchRef.current = { ...patchRef.current, data: nextData };
      debouncedFlush();
    },
    [advance.data, onUpdate, debouncedFlush]
  );

  const setFieldValue = (templateId: string, fieldId: string, value: unknown) => {
    const sectionData = { ...(advance.data[templateId] ?? {}) };
    sectionData[fieldId] = value;
    const nextData = { ...advance.data, [templateId]: sectionData };

    let nextSectionStatuses = advance.section_statuses;
    const currentSectionStatus = advance.section_statuses[templateId]?.status ?? 'not_started';
    if (currentSectionStatus === 'not_started') {
      nextSectionStatuses = { ...advance.section_statuses, [templateId]: { ...advance.section_statuses[templateId], status: 'in_progress' } };
    }

    let nextOverallStatus = advance.status;
    if (advance.status === 'not_started') {
      nextOverallStatus = 'in_progress';
    }

    const payload: { data: AdvanceData; section_statuses?: SectionStatuses; status?: string } = { data: nextData };
    if (nextSectionStatuses !== advance.section_statuses) payload.section_statuses = nextSectionStatuses;
    if (nextOverallStatus !== advance.status) payload.status = nextOverallStatus;

    onUpdate(payload);
    patchRef.current = { ...patchRef.current, ...payload };
    debouncedFlush();
  };

  const sortedSections = [...advance.sections].sort((a, b) => {
    const aFirst = a.label === KEY_CONTACTS_LABEL ? -1 : 0;
    const bFirst = b.label === KEY_CONTACTS_LABEL ? -1 : 0;
    return aFirst - bFirst;
  });

  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-4">
        {sortedSections.map((section, index) => (
          <div key={section.template_id} className="animate-slide-up" style={{ animationDelay: `${index * 30}ms` }}>
          {section.label === KEY_CONTACTS_LABEL ? (
            <KeyContactsCard
              section={section}
              contacts={contacts}
              venueName={venueName}
              sectionStatus={advance.section_statuses[section.template_id]?.status ?? 'not_started'}
              sectionFlags={flags.filter((f) => f.section_id === section.template_id && !f.resolved)}
              expanded={expandedIds.has(section.template_id)}
              onToggle={() => toggleSection(section.template_id)}
              onSetSectionStatus={(status) => setSectionStatus(section.template_id, status)}
              onContactsChange={setContacts}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
            />
          ) : (
            <SectionCard
              key={section.template_id}
              instanceId={advance.instance_id}
              section={section}
              data={advance.data[section.template_id] ?? {}}
              sectionStatus={advance.section_statuses[section.template_id]?.status ?? 'not_started'}
              sectionFlags={flags.filter((f) => f.section_id === section.template_id && !f.resolved)}
              currency={currency}
              expanded={expandedIds.has(section.template_id)}
              onToggle={() => toggleSection(section.template_id)}
              onSetSectionStatus={(status) => setSectionStatus(section.template_id, status)}
              onFieldChange={(fieldId, value) => setFieldValue(section.template_id, fieldId, value)}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
              venueLat={venueLat}
              venueLng={venueLng}
            />
          )}
          </div>
        ))}
      </div>

      <aside className="w-56 shrink-0">
        <div className="sticky top-24 rounded-xl border border-lp-border bg-lp-surface p-4">
          <p className="mb-3 text-xs font-medium text-lp-text-tertiary">Sections</p>
          <ul className="space-y-1.5">
            {advance.sections.map((sec) => {
              const status = advance.section_statuses[sec.template_id]?.status ?? 'not_started';
              const dot = status === 'complete' ? 'bg-emerald-500' : status === 'in_progress' ? 'bg-blue-500' : status === 'needs_review' ? 'bg-amber-500' : 'bg-gray-500';
              return (
                <li key={sec.template_id}>
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.template_id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                    <span className="truncate">{sec.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 space-y-2 border-t border-lp-border pt-4">
            <button
              type="button"
              onClick={onEditSections}
              className="flex w-full items-center gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              <LayoutTemplate size={16} />
              Edit sections
            </button>
            <button
              type="button"
              onClick={onCopyToOther}
              className="flex w-full items-center gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              <Copy size={16} />
              Copy to other dates...
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', dot: 'bg-gray-500' },
  { value: 'in_progress', label: 'In Progress', dot: 'bg-blue-500' },
  { value: 'complete', label: 'Complete', dot: 'bg-emerald-500' },
  { value: 'needs_review', label: 'Needs Review', dot: 'bg-amber-500' },
] as const;

// ----- Key Contacts section (dynamic contact list) -----

function KeyContactsCard({
  section,
  contacts,
  venueName,
  sectionStatus,
  sectionFlags,
  expanded,
  onToggle,
  onSetSectionStatus,
  onContactsChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
}: {
  section: SectionDef;
  contacts: ContactRow[];
  venueName: string | null;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  expanded: boolean;
  onToggle: () => void;
  onSetSectionStatus: (status: string) => void;
  onContactsChange: (contacts: ContactRow[]) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
}) {
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const menuItems = [
    { label: 'Mark section complete', icon: CheckCircle2, onClick: () => onSetSectionStatus('complete') },
    { label: 'Assign to...', icon: UserPlus, onClick: () => {} },
    ...(onRemoveSection ? [{ label: 'Remove section', icon: Trash2, variant: 'danger' as const, onClick: () => setRemoveConfirmOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof CheckCircle2; onClick: () => void; variant?: 'danger' }[];

  const addRow = () => {
    onContactsChange([
      ...contacts,
      { first_name: '', last_name: '', role: '', venue_name: venueName ?? undefined },
    ]);
  };
  const removeRow = (index: number) => {
    onContactsChange(contacts.filter((_, i) => i !== index));
  };
  const updateRow = (index: number, patch: Partial<ContactRow>) => {
    const next = contacts.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onContactsChange(next);
  };
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-100"
      >
        <SectionIcon icon="users" />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={menuItems} align="right" />
        </div>
        <StatusDropdown
          sectionStatus={sectionStatus}
          onSelectStatus={onSetSectionStatus}
          onClick={(e) => e.stopPropagation()}
        />
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            {contacts.map((row, index) => (
              <KeyContactRow
                key={index}
                row={row}
                venueName={venueName}
                onUpdate={(patch) => updateRow(index, patch)}
                onRemove={() => removeRow(index)}
              />
            ))}
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 rounded-lg border border-dashed border-lp-border px-4 py-2.5 text-sm font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
            >
              <Plus size={16} />
              Add contact
            </button>
          </div>
        </div>
      </div>
      {onRemoveSection && (
        <DeleteConfirmationModal
          open={removeConfirmOpen}
          itemName={section.label}
          onClose={() => setRemoveConfirmOpen(false)}
          onConfirm={async () => {
            await onRemoveSection(section.template_id);
            setRemoveConfirmOpen(false);
          }}
        />
      )}
    </div>
  );
}

function KeyContactRow({
  row,
  venueName,
  onUpdate,
  onRemove,
}: {
  row: ContactRow;
  venueName: string | null;
  onUpdate: (patch: Partial<ContactRow>) => void;
  onRemove: () => void;
}) {
  const [nameQuery, setNameQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ContactRow[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nameQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/contacts?search=${encodeURIComponent(nameQuery.trim())}`)
        .then((r) => r.ok ? r.json() : { contacts: [] })
        .then((j) => setSuggestions((j.contacts ?? []).slice(0, 8)))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [nameQuery]);

  useEffect(() => {
    if (!suggestOpen) return;
    const close = (e: MouseEvent) => {
      if (suggestRef.current?.contains(e.target as Node)) return;
      setSuggestOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [suggestOpen]);

  const displayName = [row.first_name, row.last_name].filter(Boolean).join(' ') || '';
  return (
    <div className="rounded-lg border border-lp-border bg-lp-bg-secondary p-3 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative flex-1 min-w-[180px]" ref={suggestRef}>
          <input
            type="text"
            value={displayName || nameQuery}
            onChange={(e) => {
              const v = e.target.value;
              setNameQuery(v);
              setSuggestOpen(true);
              const parts = v.trim().split(/\s+/);
              onUpdate({ first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') ?? '' });
            }}
            onFocus={() => nameQuery && setSuggestOpen(true)}
            placeholder="Name (type to search contact book)"
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg">
              {suggestions.map((c) => (
                <li key={c.id ?? c.first_name + c.last_name}>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdate({
                        id: c.id,
                        first_name: c.first_name ?? '',
                        last_name: c.last_name ?? '',
                        phone: c.phone,
                        email: c.email,
                        role: c.role ?? '',
                        venue_name: row.venue_name ?? c.venue_name ?? venueName ?? undefined,
                      });
                      setNameQuery('');
                      setSuggestOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
                  >
                    {[c.first_name, c.last_name].filter(Boolean).join(' ')} {c.role ? `· ${c.role}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          type="text"
          value={row.phone ?? ''}
          onChange={(e) => onUpdate({ phone: e.target.value })}
          placeholder="Phone"
          className="w-36 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
        />
        <input
          type="text"
          value={row.email ?? ''}
          onChange={(e) => onUpdate({ email: e.target.value })}
          placeholder="Email"
          className="flex-1 min-w-[140px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
        />
        <select
          value={row.role}
          onChange={(e) => onUpdate({ role: e.target.value })}
          className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none min-w-[140px]"
        >
          <option value="">Role</option>
          {CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          type="text"
          value={row.venue_name ?? venueName ?? ''}
          onChange={(e) => onUpdate({ venue_name: e.target.value })}
          placeholder="Venue"
          className="flex-1 min-w-[120px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-2 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-red-500"
          aria-label="Remove contact"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function StatusDropdown({
  sectionStatus,
  onSelectStatus,
  onClick,
}: {
  sectionStatus: string;
  onSelectStatus: (status: string) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const statusInfo = getAdvanceStatusInfo(sectionStatus);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref} onClick={onClick}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors',
          statusInfo.bg,
          statusInfo.color,
          'hover:opacity-90'
        )}
      >
        <span>{statusInfo.label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectStatus(opt.value); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', opt.dot)} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  instanceId,
  section,
  data,
  sectionStatus,
  sectionFlags,
  currency,
  expanded,
  onToggle,
  onSetSectionStatus,
  onFieldChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
  venueLat,
  venueLng,
}: {
  instanceId: string;
  section: SectionDef;
  data: Record<string, unknown>;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  onSetSectionStatus: (status: string) => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
  venueLat?: number;
  venueLng?: number;
}) {
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);
  const [flagTypeInput, setFlagTypeInput] = useState<'issue' | 'question' | 'blocker' | null>(null);
  const [flagMessage, setFlagMessage] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const flagDropdownRef = useRef<HTMLDivElement>(null);

  const isLocalInfo = section.label === 'Local Info';
  const searchableLocalType = (id: string): 'hospital' | 'pharmacy' | 'laundromat' | 'gym' | null => {
    if (!isLocalInfo) return null;
    if (id === 'nearest_hospital') return 'hospital';
    if (id === 'nearest_pharmacy') return 'pharmacy';
    if (id === 'laundromat') return 'laundromat';
    if (id === 'gym_nearby') return 'gym';
    return null;
  };

  const menuItems = [
    { label: 'Mark section complete', icon: CheckCircle2, onClick: () => onSetSectionStatus('complete') },
    { label: 'Assign to...', icon: UserPlus, onClick: () => {} },
    ...(onRemoveSection ? [{ label: 'Remove section', icon: Trash2, variant: 'danger' as const, onClick: () => setRemoveConfirmOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof CheckCircle2; onClick: () => void; variant?: 'danger' }[];

  useEffect(() => {
    if (!flagDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (flagDropdownRef.current?.contains(e.target as Node)) return;
      setFlagDropdownOpen(false);
      setFlagTypeInput(null);
      setFlagMessage('');
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [flagDropdownOpen]);

  const addFlag = (type: 'issue' | 'question' | 'blocker') => {
    if (!currentUserId || !flagMessage.trim()) return;
    const next: AdvanceFlag = {
      id: crypto.randomUUID(),
      section_id: section.template_id,
      type,
      message: flagMessage.trim(),
      created_by: currentUserId,
      created_at: new Date().toISOString(),
      resolved: false,
    };
    onFlagsChange([...allFlags, next]);
    setFlagMessage('');
    setFlagTypeInput(null);
    setFlagDropdownOpen(false);
  };

  const resolveFlag = (flagId: string) => {
    if (!currentUserId) return;
    const next = allFlags.map((f) =>
      f.id === flagId ? { ...f, resolved: true, resolved_by: currentUserId, resolved_at: new Date().toISOString() } : f
    );
    onFlagsChange(next);
  };

  const flagBadgeClass = (type: string) =>
    type === 'blocker' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : type === 'question' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400';

  return (
    <>
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-100"
      >
        <SectionIcon />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        {sectionFlags.length > 0 && (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {sectionFlags.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); resolveFlag(f.id); }}
                title={`${f.type}: ${f.message} (click to resolve)`}
                className={cn('rounded-full px-2 py-0.5 text-xs font-medium', flagBadgeClass(f.type))}
              >
                {f.type === 'blocker' ? 'Blocker' : f.type === 'question' ? 'Question' : 'Issue'}
              </button>
            ))}
          </div>
        )}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={menuItems} align="right" />
        </div>
        <div className="relative z-[100]" ref={flagDropdownRef} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFlagDropdownOpen((o) => !o); }}
            className="flex items-center gap-1 rounded-lg border border-lp-border px-2.5 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover"
          >
            <Flag size={14} />
            <ChevronDown size={14} className={cn('transition-transform', flagDropdownOpen && 'rotate-180')} />
          </button>
          {flagDropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-lp-border bg-lp-surface py-2 shadow-lg">
              {!flagTypeInput ? (
                <>
                  <button type="button" onClick={() => setFlagTypeInput('issue')} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                    Report issue
                  </button>
                  <button type="button" onClick={() => setFlagTypeInput('question')} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-500/10">
                    Ask question
                  </button>
                  <button type="button" onClick={() => setFlagTypeInput('blocker')} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10">
                    Mark as blocker
                  </button>
                </>
              ) : (
                <div className="px-4 py-2">
                  <input
                    type="text"
                    value={flagMessage}
                    onChange={(e) => setFlagMessage(e.target.value)}
                    placeholder="Message..."
                    className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { setFlagTypeInput(null); setFlagMessage(''); }} className="text-sm text-lp-text-tertiary hover:text-lp-text">
                      Back
                    </button>
                    <button type="button" onClick={() => flagTypeInput && addFlag(flagTypeInput)} disabled={!flagMessage.trim()} className="rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <StatusDropdown
          sectionStatus={sectionStatus}
          onSelectStatus={onSetSectionStatus}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="text-sm text-lp-text-tertiary">Unassigned</span>
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            {(section.fields ?? []).map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={data[field.id]}
                currency={currency}
                onChange={(v) => onFieldChange(field.id, v)}
                onAuxChange={(auxId, v) => onFieldChange(auxId, v)}
                venueLat={venueLat}
                venueLng={venueLng}
                searchableLocalType={searchableLocalType(field.id)}
                instanceId={instanceId}
              />
            ))}
            {section.label === 'Merch' && (data['merch_table_provided'] === true || data['merch_table_provided'] === 'Yes') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-lp-text">Table/Display Details</label>
                <textarea
                  rows={2}
                  value={(data['merch_table_display_details'] as string) ?? ''}
                  onChange={(e) => onFieldChange('merch_table_display_details', e.target.value)}
                  placeholder="Dimensions, location, setup notes..."
                  className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0 border-t border-lp-border px-4 py-3">
            <button
              type="button"
              onClick={() => setCommentsOpen((o) => !o)}
              className="flex w-fit items-center gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              <MessageSquarePlus size={14} />
              {commentsOpen ? 'Hide comments' : 'Add comment'}
            </button>
            {commentsOpen && (
              <SectionComments
                instanceId={instanceId}
                sectionId={section.template_id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
    {onRemoveSection && (
      <DeleteConfirmationModal
        open={removeConfirmOpen}
        itemName={section.label}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={async () => {
          await onRemoveSection(section.template_id);
          setRemoveConfirmOpen(false);
        }}
      />
    )}
    </>
  );
}

function SectionComments({ instanceId, sectionId }: { instanceId: string; sectionId: string }) {
  const [comments, setComments] = useState<AdvanceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/advance/${instanceId}/comments`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const bySection = (j.comments ?? {})[sectionId] ?? [];
          setComments(bySection);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [instanceId, sectionId]);

  const postComment = async (threadId?: string) => {
    if (!newContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/advance/${instanceId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: sectionId, content: newContent.trim(), thread_id: threadId ?? undefined }),
      });
      const created = res.ok ? await res.json() : null;
      if (created) {
        setComments((prev) => [created, ...prev]);
        setNewContent('');
        setReplyToId(null);
      }
    } finally {
      setPosting(false);
    }
  };

  const topLevel = comments.filter((c) => !c.thread_id);
  const byThread = new Map<string, AdvanceComment[]>();
  for (const c of comments) {
    if (c.thread_id) {
      const list = byThread.get(c.thread_id) ?? [];
      list.push(c);
      byThread.set(c.thread_id, list);
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-lp-border bg-lp-bg-secondary p-4">
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-lp-text-tertiary" />
      ) : (
        <>
          <div className="space-y-3">
            {topLevel.map((c) => (
              <div key={c.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-lp-text">{c.author_name}</span>
                    <span className="ml-2 text-xs text-lp-text-tertiary">{relativeTime(c.created_at)}</span>
                  </div>
                  <button type="button" onClick={() => setReplyToId(replyToId === c.id ? null : c.id)} className="text-xs text-lp-orange hover:text-lp-orange-hover flex items-center gap-1">
                    <Reply size={12} />
                    Reply
                  </button>
                </div>
                <p className="mt-0.5 text-sm text-lp-text">{c.content}</p>
                {(byThread.get(c.id) ?? []).map((r) => (
                  <div key={r.id} className="ml-4 mt-2 border-l-2 border-lp-border pl-3">
                    <span className="text-sm font-medium text-lp-text">{r.author_name}</span>
                    <span className="ml-2 text-xs text-lp-text-tertiary">{relativeTime(r.created_at)}</span>
                    <p className="mt-0.5 text-sm text-lp-text">{r.content}</p>
                  </div>
                ))}
                {replyToId === c.id && (
                  <div className="ml-4 mt-2 flex gap-2">
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="Write a reply..."
                      rows={2}
                      className="min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
                    />
                    <button type="button" onClick={() => postComment(c.id)} disabled={posting || !newContent.trim()} className="shrink-0 rounded-lg bg-lp-orange px-3 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50 flex items-center gap-1">
                      <Send size={14} />
                      Post
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-lp-border">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
            />
            <button type="button" onClick={() => postComment()} disabled={posting || !newContent.trim()} className="shrink-0 rounded-lg bg-lp-orange px-3 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50 flex items-center gap-1">
              <Send size={14} />
              Post
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

function LocalSearchableField({
  field,
  value,
  label,
  inputClass,
  searchType,
  venueLat,
  venueLng,
  onChange,
  onAuxChange,
}: {
  field: FieldDef;
  value: string;
  label: React.ReactNode;
  inputClass: string;
  searchType: 'hospital' | 'pharmacy' | 'laundromat' | 'gym';
  venueLat: number;
  venueLng: number;
  onChange: (v: unknown) => void;
  onAuxChange?: (fieldId: string, value: unknown) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; address: string; mapsUri?: string; distance?: number }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const runSearch = () => {
    setLoading(true);
    setDropdownOpen(false);
    fetch(`/api/places/nearby?lat=${encodeURIComponent(venueLat)}&lng=${encodeURIComponent(venueLng)}&type=${encodeURIComponent(searchType)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? []);
        setDropdownOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const selectResult = (name: string, address: string, mapsUri?: string) => {
    const display = address ? `${name} — ${address}` : name;
    onChange(display);
    if (onAuxChange && mapsUri) onAuxChange(field.id + '_maps_uri', mapsUri);
    setDropdownOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {label}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value)}
          placeholder={field.placeholder as string}
          className={cn(inputClass, 'pr-10')}
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text disabled:opacity-50"
          title="Search nearby"
          aria-label="Search nearby"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </div>
      {dropdownOpen && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectResult(r.name, r.address, r.mapsUri)}
                className="w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
              >
                <span className="block font-medium">{r.name}</span>
                {r.address && <span className="block truncate text-xs text-lp-text-secondary">{r.address}</span>}
                {r.distance != null && <span className="block text-xs text-lp-text-tertiary">{formatDistance(r.distance)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACCEPT_FILE = '.pdf,.jpg,.jpeg,.png,.gif';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function FileUploadField({
  value,
  onChange,
  instanceId,
  fieldId,
}: {
  value: string;
  onChange: (v: unknown) => void;
  instanceId: string;
  fieldId: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage = /\.(jpg|jpeg|png|gif)$/i.test(value);
  const isPdf = /\.pdf$/i.test(value);
  const lastSegment = value ? value.split('/').pop() : null;
  const fileName = lastSegment ? lastSegment.split('?')[0] ?? '' : '';

  const handleFile = async (file: File | null) => {
    if (!file || !instanceId) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('File too large (max 10MB)');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext ?? '')) {
      setError('Allowed: PDF, JPEG, PNG, GIF');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('advance_instance_id', instanceId);
      form.append('field_id', fieldId);
      const res = await fetch('/api/upload/advance-file', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-lp-border bg-lp-surface p-3">
        {isImage ? (
          <img src={value} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover border border-lp-border" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-lp-border bg-lp-bg-secondary">
            <FileText size={24} className="text-lp-text-tertiary" />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-lp-text">{fileName || 'File'}</span>
        <button
          type="button"
          onClick={() => onChange('')}
          className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500"
          aria-label="Remove file"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={`file-${fieldId}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors cursor-pointer',
          dragging ? 'border-lp-orange bg-lp-orange/5' : 'border-lp-border hover:border-lp-text-tertiary hover:bg-lp-surface-hover'
        )}
      >
        <input
          type="file"
          accept={ACCEPT_FILE}
          onChange={onInputChange}
          disabled={uploading}
          className="sr-only"
          id={`file-${fieldId}`}
        />
        {uploading ? <Loader2 size={28} className="animate-spin text-lp-text-tertiary" /> : <Upload size={28} className="text-lp-text-tertiary" />}
        <span className="mt-2 text-sm font-medium text-lp-text">Click or drag file here</span>
        <span className="text-xs text-lp-text-tertiary">PDF, JPEG, PNG, GIF — max 10MB</span>
      </label>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  currency,
  onChange,
  onAuxChange,
  venueLat,
  venueLng,
  searchableLocalType,
  instanceId,
}: {
  field: FieldDef;
  value: unknown;
  currency: string;
  onChange: (v: unknown) => void;
  onAuxChange?: (fieldId: string, value: unknown) => void;
  venueLat?: number;
  venueLng?: number;
  searchableLocalType?: 'hospital' | 'pharmacy' | 'laundromat' | 'gym' | null;
  instanceId?: string;
}) {
  const required = field.required ?? false;
  const strVal = value != null ? String(value) : '';
  const hasError = required && !strVal.trim();
  const inputClass = cn(
    'w-full rounded-xl border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:ring-2 focus:ring-lp-orange/20',
    hasError ? 'border-red-500/50 focus:border-red-500' : 'border-lp-border focus:border-lp-orange'
  );

  const label = (
    <label className="mb-1 block text-sm font-medium text-lp-text">
      {field.label}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );

  switch (field.type) {
    case 'text':
      if (searchableLocalType && venueLat != null && venueLng != null) {
        return (
          <LocalSearchableField
            field={field}
            value={strVal}
            label={label}
            inputClass={inputClass}
            searchType={searchableLocalType}
            venueLat={venueLat}
            venueLng={venueLng}
            onChange={onChange}
            onAuxChange={onAuxChange}
          />
        );
      }
      return (
        <div>
          {label}
          <input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            placeholder={field.placeholder as string}
            className={inputClass}
          />
        </div>
      );
    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            rows={3}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            placeholder={field.placeholder as string}
            className={inputClass}
          />
        </div>
      );
    case 'select':
      return (
        <div>
          {label}
          <select
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Select...</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    case 'time':
      return (
        <div>
          {label}
          <input
            type="time"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </div>
      );
    case 'date':
      return (
        <div>
          {label}
          <input
            type="date"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </div>
      );
    case 'currency':
      return (
        <div>
          {label}
          <div className="flex items-center rounded-xl border border-lp-border bg-lp-surface focus-within:ring-2 focus-within:ring-lp-orange/20">
            <span className="pl-3 text-sm text-lp-text-tertiary">{({ GBP: '£', USD: '$', EUR: '€', AUD: 'A$' } as Record<string, string>)[currency] ?? currency}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value != null && value !== '' ? Number(value) : ''}
              onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
              className={cn('min-w-0 flex-1 border-0 bg-transparent py-2 pr-3 text-sm text-lp-text focus:ring-0', hasError && 'rounded-xl border-red-500/50')}
            />
          </div>
        </div>
      );
    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-4">
          {label}
          <SlidingToggle
            value={strVal === 'true' || strVal === 'Yes' ? 'true' : 'false'}
            onChange={(v) => onChange(v === 'true' ? 'Yes' : 'No')}
            options={['false', 'true']}
            labels={['No', 'Yes']}
            className="w-24"
          />
        </div>
      );
    case 'contact': {
      const obj = (value as Record<string, string>) ?? {};
      const name = obj.name ?? '';
      const phone = obj.phone ?? '';
      const email = obj.email ?? '';
      return (
        <div className="space-y-2">
          {label}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => onChange({ ...obj, name: e.target.value })}
              onBlur={(e) => onChange({ ...obj, name: e.target.value })}
              className={inputClass}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => onChange({ ...obj, phone: e.target.value })}
              onBlur={(e) => onChange({ ...obj, phone: e.target.value })}
              className={inputClass}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => onChange({ ...obj, email: e.target.value })}
              onBlur={(e) => onChange({ ...obj, email: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      );
    }
    case 'url':
      return (
        <div>
          {label}
          <input
            type="url"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            placeholder={field.placeholder as string}
            className={inputClass}
          />
        </div>
      );
    case 'number':
      return (
        <div>
          {label}
          <input
            type="number"
            value={value != null && value !== '' ? Number(value) : ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            className={inputClass}
          />
        </div>
      );
    case 'file':
      return (
        <div>
          {label}
          <FileUploadField
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
            instanceId={instanceId ?? ''}
            fieldId={field.id}
          />
        </div>
      );
    case 'slider': {
      const min = typeof field.min === 'number' ? field.min : 0;
      const max = typeof field.max === 'number' ? field.max : 100;
      const step = typeof field.step === 'number' ? field.step : 1;
      const numVal = value != null && value !== '' ? Number(value) : min;
      return (
        <div>
          {label}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={numVal}
              onChange={(e) => onChange(Number(e.target.value))}
              className="h-2 flex-1 accent-lp-orange"
            />
            <span className="w-10 text-sm text-lp-text-secondary tabular-nums">{numVal}</span>
          </div>
        </div>
      );
    }
    default:
      return (
        <div>
          {label}
          <input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </div>
      );
  }
}
