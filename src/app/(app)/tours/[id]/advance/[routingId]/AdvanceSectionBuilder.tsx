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
} from 'lucide-react';
import { parseRoutingDate, getDayTypeLabel, getDayTypeColor, getAdvanceStatusInfo, cn } from '@/lib/utils';
import { SlidingToggle } from '@/components/ui/SlidingToggle';
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
};

function SectionIcon({ icon }: { icon?: string }) {
  const name = (icon ?? 'clipboard').toLowerCase().replace(/-/g, '');
  const Comp = ICON_MAP[name] ?? ClipboardList;
  return <Comp className="text-lp-text-secondary" size={18} />;
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

type ApiTemplate = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  fields: FieldDef[];
  suggested_for_day_types?: string[];
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
  routing: { id: string; date: string; venue_name: string | null; city: string; day_type: string };
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
            className="flex items-center gap-2 rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save
          </button>
        )}
      </div>
    </>
  );
}

// ----- SETUP MODE -----

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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [layoutTemplates, setLayoutTemplates] = useState<{ id: string; name: string; sections: SectionDef[] }[]>([]);
  const [layoutTemplatesLoading, setLayoutTemplatesLoading] = useState(false);

  useEffect(() => {
    fetch('/api/advance/templates')
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .finally(() => setLoadingTemplates(false));
  }, []);

  // Auto-populate sections from tour default template when current sections are empty
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
          setSections(t.sections.map((s, i) => ({ ...s, order: i })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [defaultAdvanceTemplateId, currentSections.length]);

  const addedIds = new Set(sections.map((s) => s.template_id));

  const addSection = (t: ApiTemplate) => {
    if (addedIds.has(t.id)) return;
    setSections((prev) => [
      ...prev,
      {
        template_id: t.id,
        label: t.name,
        fields: t.fields ?? [],
        order: prev.length,
      },
    ]);
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  };

  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    if (draggedIndex === index) return;
    moveSection(draggedIndex, index);
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);

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
      body: JSON.stringify({
        is_template: true,
        template_label: templateName.trim(),
        sections,
      }),
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
    if (template.sections?.length) {
      setSections(template.sections.map((s, i) => ({ ...s, order: i })));
    }
    setApplyTemplateOpen(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-lp-border bg-lp-surface">
        <h3 className="border-b border-lp-border px-4 py-3 text-sm font-semibold text-lp-text">Available sections</h3>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loadingTemplates ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-lp-text-tertiary" />
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border border-lp-border p-3',
                    addedIds.has(t.id) && 'opacity-50'
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <SectionIcon icon={t.icon} />
                    <div className="min-w-0">
                      <p className="font-medium text-lp-text">{t.name}</p>
                      <p className="truncate text-xs text-lp-text-tertiary">{t.description}</p>
                      <p className="text-xs text-lp-text-tertiary">{t.fields?.length ?? 0} fields</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addSection(t)}
                    disabled={addedIds.has(t.id)}
                    className="shrink-0 rounded-lg border border-lp-border p-2 text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
                  >
                    <Plus size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface">
        <h3 className="border-b border-lp-border px-4 py-3 text-sm font-semibold text-lp-text">This show&apos;s sections</h3>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <ul className="space-y-2">
            {sections.map((s, i) => (
              <li
                key={`${s.template_id}-${i}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 rounded-lg border border-lp-border bg-lp-bg-secondary p-3"
              >
                <GripVertical className="shrink-0 cursor-grab text-lp-text-tertiary active:cursor-grabbing" />
                <SectionIcon icon={(templates.find((t) => t.id === s.template_id))?.icon} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-lp-text">{s.label}</p>
                  <p className="text-xs text-lp-text-tertiary">{s.fields?.length ?? 0} fields</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveLayout}
              disabled={sections.length === 0 || saving}
              className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save layout'}
            </button>
            <button
              type="button"
              onClick={openApplyTemplate}
              className="flex items-center gap-2 rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
            >
              <LayoutTemplate size={16} />
              Apply template
            </button>
            <button
              type="button"
              onClick={() => setSaveAsTemplateOpen(true)}
              disabled={sections.length === 0}
              className="flex items-center gap-2 rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
            >
              <LayoutTemplate size={16} />
              Save as template
            </button>
            {currentSections.length > 0 && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {applyTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setApplyTemplateOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Apply template</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">Replace this show&apos;s sections with a saved layout.</p>
            {currentSections.length > 0 && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Current sections will be replaced.</p>
            )}
            {layoutTemplatesLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-lp-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates…
              </div>
            ) : (
              <ul className="mt-4 max-h-60 overflow-y-auto space-y-2">
                {layoutTemplates.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-lp-border p-3">
                    <div>
                      <p className="font-medium text-lp-text">{t.name}</p>
                      <p className="text-xs text-lp-text-tertiary">
                        {(t.sections?.length ?? 0)} sections
                        {t.sections?.length ? `: ${t.sections.map((s) => s.label).filter(Boolean).join(', ') || '—'}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyLayoutTemplate(t)}
                      className="shrink-0 rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover"
                    >
                      Apply
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!layoutTemplatesLoading && layoutTemplates.length === 0 && (
              <p className="mt-4 text-sm text-lp-text-tertiary">No saved templates. Save a layout as a template first.</p>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setApplyTemplateOpen(false)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {saveAsTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSaveAsTemplateOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Save as template</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">Give this layout a name to reuse on other shows.</p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Festival, Club, Headline"
              className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveAsTemplateOpen(false)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
                Cancel
              </button>
              <button type="button" onClick={saveAsTemplate} disabled={!templateName.trim()} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- FILL MODE -----

function FillMode({
  tourId,
  routingId,
  currentUserId,
  currency,
  advance,
  onUpdate,
  onEditSections,
  onCopyToOther,
}: {
  tourId: string;
  routingId: string;
  currentUserId: string | null;
  currency: string;
  advance: NonNullable<PageData['advance']>;
  onUpdate: (patch: Partial<NonNullable<PageData['advance']>>) => void;
  onEditSections: () => void;
  onCopyToOther: () => void;
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

  const cycleSectionStatus = (templateId: string) => {
    const current = advance.section_statuses[templateId]?.status ?? 'not_started';
    const idx = STATUS_ORDER.indexOf(current as (typeof STATUS_ORDER)[number]);
    const nextStatus = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    const next = { ...advance.section_statuses, [templateId]: { ...advance.section_statuses[templateId], status: nextStatus } };
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

  const setFieldValue = (templateId: string, fieldId: string, value: unknown) => {
    const sectionData = { ...(advance.data[templateId] ?? {}) };
    sectionData[fieldId] = value;
    const nextData = { ...advance.data, [templateId]: sectionData };
    onUpdate({ data: nextData });
    patchRef.current = { ...patchRef.current, data: nextData };
    debouncedFlush();
  };

  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-4">
        {advance.sections.map((section) => (
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
            onCycleStatus={() => cycleSectionStatus(section.template_id)}
            onFieldChange={(fieldId, value) => setFieldValue(section.template_id, fieldId, value)}
            onFlagsChange={updateFlags}
            allFlags={flags}
            currentUserId={currentUserId}
          />
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

function SectionCard({
  instanceId,
  section,
  data,
  sectionStatus,
  sectionFlags,
  currency,
  expanded,
  onToggle,
  onCycleStatus,
  onFieldChange,
  onFlagsChange,
  allFlags,
  currentUserId,
}: {
  instanceId: string;
  section: SectionDef;
  data: Record<string, unknown>;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  onCycleStatus: () => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
}) {
  const statusInfo = getAdvanceStatusInfo(sectionStatus);
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);
  const [flagTypeInput, setFlagTypeInput] = useState<'issue' | 'question' | 'blocker' | null>(null);
  const [flagMessage, setFlagMessage] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const flagDropdownRef = useRef<HTMLDivElement>(null);

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
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover"
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
        <div className="relative" ref={flagDropdownRef} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setFlagDropdownOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg border border-lp-border px-2.5 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover"
          >
            <Flag size={14} />
            <ChevronDown size={14} className={cn('transition-transform', flagDropdownOpen && 'rotate-180')} />
          </button>
          {flagDropdownOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl border border-lp-border bg-lp-surface py-2 shadow-lg">
              {!flagTypeInput ? (
                <>
                  <button type="button" onClick={() => setFlagTypeInput('issue')} className="block w-full px-4 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
                    Report issue
                  </button>
                  <button type="button" onClick={() => setFlagTypeInput('question')} className="block w-full px-4 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
                    Ask question
                  </button>
                  <button type="button" onClick={() => setFlagTypeInput('blocker')} className="block w-full px-4 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
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
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCycleStatus(); }}
          className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusInfo.bg, statusInfo.color)}
        >
          {statusInfo.label}
        </button>
        <span className="text-sm text-lp-text-tertiary">Unassigned</span>
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary" /> : <ChevronRight size={18} className="text-lp-text-tertiary" />}
      </button>
      {expanded && (
        <>
          <div className="border-t border-lp-border px-4 py-4 space-y-4">
            {(section.fields ?? []).map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={data[field.id]}
                currency={currency}
                onChange={(v) => onFieldChange(field.id, v)}
              />
            ))}
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
        </>
      )}
    </div>
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

function FieldRenderer({
  field,
  value,
  currency,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  currency: string;
  onChange: (v: unknown) => void;
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
