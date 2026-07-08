'use client';

/* Advance/Fill surface (FillMode + section cards) — extracted from AdvanceSectionBuilder.tsx during P3 decomposition (B1). */

import { useState, useEffect, useCallback, useRef, Fragment, createContext, useContext } from 'react';
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
import { buildFillPayload } from '../parts/payloads';

// ----- FILL MODE -----

function formatAdvanceDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function FillMode({
  tourId,
  routingId,
  artistName = null,
  currentUserId,
  currency,
  tourPersonnelCounts,
  venueName,
  venueLat,
  venueLng,
  advance,
  initialLastUpdatedAt,
  onAutosaveStatusChange,
  onConflictWarning,
  autosaveRetryRef,
  onUpdate,
  onEditSections,
  onCopyToOther,
  onRemoveSection,
}: {
  tourId: string;
  routingId: string;
  artistName?: string | null;
  currentUserId: string | null;
  currency: string;
  tourPersonnelCounts?: { principal_count: number; band_count: number; crew_count: number };
  venueName: string | null;
  venueLat?: number;
  venueLng?: number;
  advance: NonNullable<PageData['advance']>;
  initialLastUpdatedAt?: string | null;
  onAutosaveStatusChange?: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  onConflictWarning?: (msg: string | null) => void;
  autosaveRetryRef?: React.MutableRefObject<(() => void) | null>;
  onUpdate: (patch: Partial<NonNullable<PageData['advance']>>) => void;
  onEditSections: () => void;
  onCopyToOther: () => void;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const patchRef = useRef<{ data?: AdvanceData; section_statuses?: SectionStatuses; status?: string; flags?: AdvanceFlag[] }>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<{ id: string; name: string | null; avatar_url?: string | null }[]>([]);
  const initialLastUpdatedAtRef = useRef(initialLastUpdatedAt ?? null);
  if (initialLastUpdatedAt != null) initialLastUpdatedAtRef.current = initialLastUpdatedAt;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/workspace/members')
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((j) => { if (!cancelled) setWorkspaceMembers(j.members ?? []); })
      .catch(() => { if (!cancelled) setWorkspaceMembers([]); });
    return () => { cancelled = true; };
  }, []);

  // Cleanup debounce timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const flags = advance.flags ?? [];

  const toggleSection = (templateId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  // Expand section when navigating with hash #section-<template_id> (e.g. from Needs Attention)
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    const match = hash.match(/^section-(.+)$/);
    if (!match) return;
    const sectionId = match[1];
    const exists = advance.sections.some((s) => s.template_id === sectionId);
    if (!exists) return;
    setExpandedIds((prev) => new Set(prev).add(sectionId));
    requestAnimationFrame(() => {
      const el = document.getElementById(`section-${sectionId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [advance.sections]);

  const setSectionStatus = (templateId: string, status: string) => {
    const next = { ...advance.section_statuses, [templateId]: { ...advance.section_statuses[templateId], status } };
    onUpdate({ section_statuses: next });
    flushPatch({ section_statuses: next });
  };

  const setSectionAssigned = (templateId: string, userId: string | null) => {
    const next = { ...advance.section_statuses, [templateId]: { ...advance.section_statuses[templateId], assigned_to: userId ?? undefined } };
    onUpdate({ section_statuses: next });
    flushPatch({ section_statuses: next });
  };

  const flushPatch = useCallback((override?: { data?: AdvanceData; section_statuses?: SectionStatuses; status?: string; flags?: AdvanceFlag[] }) => {
    const payload = buildFillPayload({ ...patchRef.current, ...override });
    if (Object.keys(payload).length === 0) return;
    patchRef.current = {};
    onAutosaveStatusChange?.('saving');
    fetch(`/api/tours/${tourId}/advance/${routingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          onAutosaveStatusChange?.('error');
          return;
        }
        const body = await res.json().catch(() => ({}));
        onAutosaveStatusChange?.('saved');
        const serverUpdated = body.last_updated_at as string | undefined;
        const initial = initialLastUpdatedAtRef.current;
        if (serverUpdated && initial && serverUpdated > initial) {
          const name = body.last_updated_by_name ?? 'someone';
          const time = formatAdvanceDateTime(serverUpdated);
          onConflictWarning?.(`This advance was updated by ${name} at ${time}`);
        }
        if (override?.section_statuses !== undefined) {
          router.refresh();
        }
        setTimeout(() => onAutosaveStatusChange?.('idle'), 3000);
      })
      .catch(() => onAutosaveStatusChange?.('error'));
  }, [tourId, routingId, onAutosaveStatusChange, onConflictWarning, router]);

  if (autosaveRetryRef) autosaveRetryRef.current = () => flushPatch();

  /* B1 — fill autosave now runs on a useAutoSave instance (2000ms), used purely
     as the debounce engine: onSave calls the existing flushPatch, which still
     owns the PATCH to /api/tours/[id]/advance/[routingId], the patchRef
     accumulator, conflict detection, and router.refresh. The immediate-flush
     subset (status / assignee / flags) still calls flushPatch() directly, so
     endpoint + timing + immediate subset are unchanged (map §5). */
  const fillAutosave = useAutoSave<{ tick: number }>({
    initialState: { tick: 0 },
    debounceMs: 2000,
    onSave: async () => {
      flushPatch();
    },
  });

  const updateFlags = useCallback((nextFlags: AdvanceFlag[]) => {
    onUpdate({ flags: nextFlags });
    patchRef.current = { ...patchRef.current, flags: nextFlags };
    flushPatch({ flags: nextFlags });
  }, [onUpdate, flushPatch]);

  const debouncedFlush = useCallback(() => {
    // Feeds the 2000ms useAutoSave debounce engine (set is stable; each call
    // reschedules, matching the old clearTimeout+setTimeout behaviour).
    fillAutosave.set({ tick: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getSectionContacts = useCallback((templateId: string): ContactRow[] => {
    const sectionData = advance.data[templateId] as Record<string, unknown> | undefined;
    const list = sectionData?.contacts;
    return Array.isArray(list) ? (list as ContactRow[]) : [];
  }, [advance.data]);

  const setSectionContacts = useCallback(
    (templateId: string, nextContacts: ContactRow[]) => {
      const current = (advance.data[templateId] ?? {}) as Record<string, unknown>;
      const nextData = { ...advance.data, [templateId]: { ...current, contacts: nextContacts } } as unknown as AdvanceData;
      onUpdate({ data: nextData });
      patchRef.current = { ...patchRef.current, data: nextData };
      debouncedFlush();
    },
    [advance.data, onUpdate, debouncedFlush]
  );

  const setFieldValue = (templateId: string, fieldId: string, value: unknown) => {
    setSectionFieldBatch(templateId, { [fieldId]: value });
  };

  /** One atomic section update (avoids losing the first of two in-flight field updates, e.g. drive distance + source). */
  const setSectionFieldBatch = (templateId: string, updates: Record<string, unknown>) => {
    const sectionData = { ...(advance.data[templateId] ?? {}), ...updates };
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

  const setSectionData = useCallback(
    (templateId: string, newData: Record<string, unknown>) => {
      const nextData = { ...advance.data, [templateId]: newData };
      onUpdate({ data: nextData });
      patchRef.current = { ...patchRef.current, data: nextData };
      flushPatch({ data: nextData });
    },
    [advance.data, onUpdate, flushPatch]
  );

  const mainSections = advance.sections.filter((s) => s.label !== SETTLEMENT_LABEL);
  const sortedSections = [...mainSections].sort((a, b) => {
    if (a.label === KEY_CONTACTS_LABEL) return -1;
    if (b.label === KEY_CONTACTS_LABEL) return 1;
    if (a.label === RIDER_LABEL) return -1;
    if (b.label === RIDER_LABEL) return 1;
    return 0;
  });

  const importantDocuments = (() => {
    const data = advance.data[IMPORTANT_DOCUMENTS_KEY] as { documents?: AdvanceDocument[] } | undefined;
    return Array.isArray(data?.documents) ? data.documents : [];
  })();
  const setImportantDocuments = (docs: AdvanceDocument[]) => {
    if (docs.length >= 1 && importantDocuments.length === 0) {
      const hasImportant = advance.sections.some((s) => s.label === 'Important Documents' || s.template_id === IMPORTANT_DOCUMENTS_KEY);
      if (!hasImportant) {
        const newSection = { template_id: IMPORTANT_DOCUMENTS_KEY, label: 'Important Documents', fields: [] as FieldDef[], order: advance.sections.length };
        const updatedSections = [...advance.sections.map((s, i) => ({ ...s, order: i })), newSection];
        onUpdate({ sections: updatedSections });
        fetch(`/api/tours/${tourId}/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: routingId, sections: updatedSections }),
        }).catch((err) => {
          console.error('Failed to persist Important Documents section:', err);
        });
      }
    }
    setFieldValue(IMPORTANT_DOCUMENTS_KEY, 'documents', docs);
  };

  return (
    <AdvanceDropdownZProvider>
    {/* UX22 cleanup P1 — outer flex + floating <aside> retired. Section
        nav now lives in the LeftRail's docSections variant (see
        page.tsx). The remaining content is a single space-y-4 column
        that fills PageShell width. */}
    <div className="space-y-4">
        <ImportantDocumentsCard
          instanceId={advance.instance_id}
          documents={importantDocuments}
          onDocumentsChange={setImportantDocuments}
          currentUserId={currentUserId}
        />
        {sortedSections.map((section, index) => (
          <div key={section.template_id} id={`section-${section.template_id}`} className="animate-slide-up scroll-mt-24" style={{ animationDelay: `${index * 30}ms` }}>
          {section.label === RIDER_LABEL ? (
            <RiderCard
              section={section}
              data={advance.data[section.template_id] ?? {}}
              sectionStatus={advance.section_statuses[section.template_id]?.status ?? 'not_started'}
              sectionFlags={flags.filter((f) => f.section_id === section.template_id && !f.resolved)}
              expanded={expandedIds.has(section.template_id)}
              onToggle={() => toggleSection(section.template_id)}
              onSetSectionStatus={(status) => setSectionStatus(section.template_id, status)}
              onSetSectionAssigned={(userId) => setSectionAssigned(section.template_id, userId)}
              onFieldChange={(fieldId, value) => setFieldValue(section.template_id, fieldId, value)}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
              assignedTo={advance.section_statuses[section.template_id]?.assigned_to}
              workspaceMembers={workspaceMembers}
              currency={currency}
            />
          ) : section.label === FLIGHTS_LABEL ? (
            <FlightsSectionCard
              instanceId={advance.instance_id}
              section={section}
              data={advance.data[section.template_id] ?? {}}
              sectionStatus={advance.section_statuses[section.template_id]?.status ?? 'not_started'}
              sectionFlags={flags.filter((f) => f.section_id === section.template_id && !f.resolved)}
              expanded={expandedIds.has(section.template_id)}
              onToggle={() => toggleSection(section.template_id)}
              onSetSectionStatus={(status) => setSectionStatus(section.template_id, status)}
              onSetSectionAssigned={(userId) => setSectionAssigned(section.template_id, userId)}
              onFlightsChange={(flights) => setFieldValue(section.template_id, 'flights', flights)}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
              assignedTo={advance.section_statuses[section.template_id]?.assigned_to}
              workspaceMembers={workspaceMembers}
              tourPersonnelCounts={tourPersonnelCounts}
            />
          ) : section.label === PARKING_ACCESS_LABEL ? (
            <ParkingAccessCard
              instanceId={advance.instance_id}
              section={section}
              data={advance.data[section.template_id] ?? {}}
              sectionStatus={advance.section_statuses[section.template_id]?.status ?? 'not_started'}
              sectionFlags={flags.filter((f) => f.section_id === section.template_id && !f.resolved)}
              expanded={expandedIds.has(section.template_id)}
              onToggle={() => toggleSection(section.template_id)}
              onSetSectionStatus={(status) => setSectionStatus(section.template_id, status)}
              onSetSectionAssigned={(userId) => setSectionAssigned(section.template_id, userId)}
              onFieldChange={(fieldId, value) => setFieldValue(section.template_id, fieldId, value)}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
              assignedTo={advance.section_statuses[section.template_id]?.assigned_to}
              workspaceMembers={workspaceMembers}
            />
          ) : section.label === KEY_CONTACTS_LABEL ? (
            <KeyContactsCard
              section={section}
              contacts={getSectionContacts(section.template_id)}
              venueName={venueName}
              sectionStatus={advance.section_statuses[section.template_id]?.status ?? 'not_started'}
              sectionFlags={flags.filter((f) => f.section_id === section.template_id && !f.resolved)}
              expanded={expandedIds.has(section.template_id)}
              onToggle={() => toggleSection(section.template_id)}
              onSetSectionStatus={(status) => setSectionStatus(section.template_id, status)}
              onSetSectionAssigned={(userId) => setSectionAssigned(section.template_id, userId)}
              onContactsChange={(next) => setSectionContacts(section.template_id, next)}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
              contactRoles={getContactRolesForSection(section.label)}
              assignedTo={advance.section_statuses[section.template_id]?.assigned_to}
              workspaceMembers={workspaceMembers}
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
              onSetSectionAssigned={(userId) => setSectionAssigned(section.template_id, userId)}
              onFieldChange={(fieldId, value) => setFieldValue(section.template_id, fieldId, value)}
              onFieldsBatchChange={(updates) => setSectionFieldBatch(section.template_id, updates)}
              onFlagsChange={updateFlags}
              allFlags={flags}
              currentUserId={currentUserId}
              onRemoveSection={onRemoveSection}
              venueLat={venueLat}
              venueLng={venueLng}
              venueName={venueName}
              sectionContacts={getSectionContacts(section.template_id)}
              onSectionContactsChange={(next) => setSectionContacts(section.template_id, next)}
              sectionContactRoles={getContactRolesForSection(section.label)}
              assignedTo={advance.section_statuses[section.template_id]?.assigned_to}
              workspaceMembers={workspaceMembers}
              artistName={artistName}
              tourId={tourId}
              routingId={routingId}
              onReplaceSectionData={setSectionData}
            />
          )}
          </div>
        ))}

      {/* UX22 cleanup P1 — section-nav <ul> retired (now in LeftRail's
          docSections variant). The two existing actions stay as a slim
          row at the BOTTOM of the body so they're always reachable
          without scrolling back up; the rail handles "where am I". */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onEditSections}
          className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-3 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover"
        >
          <LayoutTemplate size={16} />
          Edit sections
        </button>
        <button
          type="button"
          onClick={onCopyToOther}
          className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-3 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover"
        >
          <Copy size={16} />
          Copy to other dates…
        </button>
      </div>
    </div>
    </AdvanceDropdownZProvider>
  );
}

// Salvage #6 — status dots use the --color-lp-status-* tokens (design-token
// rule: no hardcoded Tailwind palette colours in component code). `dot` holds
// the CSS var; the render site applies it as an inline background.
const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', dot: 'var(--color-lp-status-not-started)' },
  { value: 'in_progress', label: 'In Progress', dot: 'var(--color-lp-status-in-progress)' },
  { value: 'complete', label: 'Complete', dot: 'var(--color-lp-status-complete)' },
  { value: 'needs_review', label: 'Needs Review', dot: 'var(--color-lp-status-needs-review)' },
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
  onSetSectionAssigned,
  onContactsChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
  contactRoles,
  assignedTo,
  workspaceMembers = [],
}: {
  section: SectionDef;
  contacts: ContactRow[];
  venueName: string | null;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  expanded: boolean;
  onToggle: () => void;
  onSetSectionStatus: (status: string) => void;
  onSetSectionAssigned?: (userId: string | null) => void;
  onContactsChange: (contacts: ContactRow[]) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
  contactRoles?: string[];
  assignedTo?: string;
  workspaceMembers?: WorkspaceMember[];
}) {
  const roles = contactRoles ?? [...CONTACT_ROLES];
  const backfilledIds = useRef(false);
  useEffect(() => {
    if (contacts.length === 0) {
      backfilledIds.current = false;
    }
  }, [contacts.length]);
  useEffect(() => {
    if (backfilledIds.current) return;
    if (contacts.length === 0) return;
    if (contacts.every((c) => c.id)) {
      backfilledIds.current = true;
      return;
    }
    backfilledIds.current = true;
    onContactsChange(
      contacts.map((c) => (c.id ? c : { ...c, id: crypto.randomUUID() })),
    );
  }, [contacts, onContactsChange]);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const menuItems = [
    { label: 'Mark section complete', icon: CheckCircle2, onClick: () => onSetSectionStatus('complete') },
    ...(onRemoveSection ? [{ label: 'Remove section', icon: Trash2, variant: 'danger' as const, onClick: () => setRemoveConfirmOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof CheckCircle2; onClick: () => void; variant?: 'danger' }[];

  const defaultRole = section.label.replace(/\s+Contact$/i, '') || section.label;
  const addRow = () => {
    onContactsChange([
      ...contacts,
      {
        id: crypto.randomUUID(),
        first_name: '',
        last_name: '',
        role: defaultRole,
        phone: '',
        email: '',
        venue_name: venueName ?? undefined,
        notes: '',
      },
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
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-100"
      >
        <SectionIcon icon="users" />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        <div className="shrink-0" onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
          <ContextMenu items={menuItems} align="right" onBeforeOpen={() => { if (!expanded) onToggle(); }} />
        </div>
        <StatusDropdown
          sectionStatus={sectionStatus}
          onSelectStatus={onSetSectionStatus}
          onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}
        />
        {onSetSectionAssigned && workspaceMembers.length > 0 ? (
          <AssignDropdown
            assignedTo={assignedTo}
            members={workspaceMembers}
            onSelect={onSetSectionAssigned}
            onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}
          />
        ) : assignedTo ? (
          <span className="text-sm text-lp-text-tertiary truncate max-w-[120px]">{workspaceMembers.find((m) => m.id === assignedTo)?.name ?? 'Assigned'}</span>
        ) : null}
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            {contacts.map((row, index) => (
              <KeyContactRow
                key={row.id ?? `contact-fallback-${index}`}
                row={row}
                venueName={venueName}
                onUpdate={(patch) => updateRow(index, patch)}
                onRemove={() => removeRow(index)}
                contactRoles={roles}
                defaultRole={defaultRole}
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

// ----- Rider section (at top, type dropdown + status) -----

const RIDER_TYPES = ['Technical Rider', 'Hospitality Rider', 'Hotel Rider'] as const;
const RIDER_STATUSES = ['Sent', 'Received', 'Confirmed'] as const;

function RiderCard({
  section,
  data,
  sectionStatus,
  sectionFlags,
  expanded,
  onToggle,
  onSetSectionStatus,
  onSetSectionAssigned,
  onFieldChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
  assignedTo,
  workspaceMembers = [],
  currency = 'GBP',
}: {
  section: SectionDef;
  data: Record<string, unknown>;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  expanded: boolean;
  onToggle: () => void;
  onSetSectionStatus: (status: string) => void;
  onSetSectionAssigned?: (userId: string | null) => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
  assignedTo?: string;
  workspaceMembers?: WorkspaceMember[];
  currency?: string;
}) {
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const riderType = (data.rider_type as string) || RIDER_TYPES[0];
  const riderStatus = (data.rider_status as string) || '';
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!typeDropdownOpen) return;
    const close = (e: MouseEvent) => { if (typeRef.current?.contains(e.target as Node)) return; setTypeDropdownOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [typeDropdownOpen]);
  useEffect(() => {
    if (!statusDropdownOpen) return;
    const close = (e: MouseEvent) => { if (statusRef.current?.contains(e.target as Node)) return; setStatusDropdownOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [statusDropdownOpen]);
  const menuItems = [
    { label: 'Mark section complete', icon: CheckCircle2, onClick: () => onSetSectionStatus('complete') },
    ...(onRemoveSection ? [{ label: 'Remove section', icon: Trash2, variant: 'danger' as const, onClick: () => setRemoveConfirmOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof CheckCircle2; onClick: () => void; variant?: 'danger' }[];
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <FileText size={20} className="text-lp-text-tertiary shrink-0" />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        <div className="shrink-0" onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
          <ContextMenu items={menuItems} align="right" onBeforeOpen={() => { if (!expanded) onToggle(); }} />
        </div>
        <StatusDropdown sectionStatus={sectionStatus} onSelectStatus={onSetSectionStatus} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }} />
        {onSetSectionAssigned && workspaceMembers.length > 0 ? (
          <AssignDropdown assignedTo={assignedTo} members={workspaceMembers} onSelect={onSetSectionAssigned} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }} />
        ) : assignedTo ? (
          <span className="text-sm text-lp-text-tertiary truncate max-w-[120px]">{workspaceMembers.find((m) => m.id === assignedTo)?.name ?? 'Assigned'}</span>
        ) : null}
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative z-[100]" ref={typeRef}>
                <span className="mb-1 block text-sm font-medium text-lp-text">Rider type</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setTypeDropdownOpen((o) => !o); }}
                  className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover min-w-[180px]"
                >
                  <span className="flex-1 text-left">{riderType}</span>
                  <ChevronDown size={16} className={cn('shrink-0 transition-transform', typeDropdownOpen && 'rotate-180')} />
                </button>
                {typeDropdownOpen && (
                  <div className="absolute left-0 top-full z-[100] mt-1 min-w-[180px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
                    {RIDER_TYPES.map((t) => (
                      <button key={t} type="button" onClick={() => { onFieldChange('rider_type', t); setTypeDropdownOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative z-[100]" ref={statusRef}>
                <span className="mb-1 block text-sm font-medium text-lp-text">Status</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen((o) => !o); }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium min-w-[140px] transition-colors',
                    riderStatus === 'Confirmed' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    riderStatus === 'Received' ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    riderStatus === 'Sent' ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                    'border-lp-border bg-lp-surface text-lp-text hover:bg-lp-surface-hover'
                  )}
                >
                  <span className="flex-1 text-left">{riderStatus || 'Not set'}</span>
                  <ChevronDown size={16} className={cn('shrink-0 transition-transform', statusDropdownOpen && 'rotate-180')} />
                </button>
                {statusDropdownOpen && (
                  <div className="absolute left-0 top-full z-[100] mt-1 min-w-[140px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
                    {RIDER_STATUSES.map((s) => (
                      <button key={s} type="button" onClick={() => { onFieldChange('rider_status', s); setStatusDropdownOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {sortFieldsContactsFirst(section.fields ?? []).map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={data[field.id]}
                currency={currency}
                onChange={(v) => onFieldChange(field.id, v)}
                instanceId={undefined}
              />
            ))}
          </div>
        </div>
      </div>
      {onRemoveSection && (
        <DeleteConfirmationModal open={removeConfirmOpen} itemName={section.label} onClose={() => setRemoveConfirmOpen(false)} onConfirm={async () => { await onRemoveSection(section.template_id); setRemoveConfirmOpen(false); }} />
      )}
    </div>
  );
}

// ----- Flights section (multiple flight cards) -----

export type FlightEntry = {
  id: string;
  departure_city: string;
  arrival_city: string;
  date: string;
  time: string;
  airline: string;
  flight_number: string;
  confirmation_code: string;
  personnel_ids: string[];
};

function buildTourPersonnelList(counts: { principal_count: number; band_count: number; crew_count: number }): { id: string; label: string }[] {
  const list: { id: string; label: string }[] = [];
  let i = 0;
  for (let p = 0; p < (counts.principal_count ?? 0); p++) {
    i++;
    list.push({ id: `principal_${i}`, label: `Principal ${i}` });
  }
  for (let b = 0; b < (counts.band_count ?? 0); b++) {
    i++;
    list.push({ id: `band_${i}`, label: `Band ${i}` });
  }
  for (let c = 0; c < (counts.crew_count ?? 0); c++) {
    i++;
    list.push({ id: `crew_${i}`, label: `Crew ${i}` });
  }
  return list;
}

/** Legacy Flights section stored flat text fields; structured UI uses `flights` array. */
function flightRowsFromLegacyData(data: Record<string, unknown>): (Partial<FlightEntry> & { id?: string })[] | null {
  const fromArr = data.flights;
  if (Array.isArray(fromArr) && fromArr.length > 0) return null;
  const ob = String(data.flight_outbound ?? '').trim();
  const ib = String(data.flight_inbound ?? '').trim();
  const al = String(data.airline ?? '').trim();
  const br = String(data.booking_ref ?? data.booking_reference ?? '').trim();
  if (!ob && !ib && !al && !br) return null;
  const rows: (Partial<FlightEntry> & { id?: string })[] = [];
  if (ob || al || br) {
    rows.push({
      id: 'legacy-outbound',
      departure_city: ob,
      arrival_city: '',
      date: '',
      time: '',
      airline: al,
      flight_number: '',
      confirmation_code: br,
    });
  }
  if (ib) {
    rows.push({
      id: 'legacy-inbound',
      departure_city: '',
      arrival_city: ib,
      date: '',
      time: '',
      airline: al,
      flight_number: '',
      confirmation_code: br,
    });
  }
  return rows.length > 0 ? rows : null;
}

function FlightsSectionCard({
  instanceId,
  section,
  data,
  sectionStatus,
  sectionFlags,
  expanded,
  onToggle,
  onSetSectionStatus,
  onSetSectionAssigned,
  onFlightsChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
  assignedTo,
  workspaceMembers = [],
  tourPersonnelCounts,
}: {
  instanceId: string;
  section: SectionDef;
  data: Record<string, unknown>;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  expanded: boolean;
  onToggle: () => void;
  onSetSectionStatus: (status: string) => void;
  onSetSectionAssigned?: (userId: string | null) => void;
  onFlightsChange: (flights: FlightEntry[]) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
  assignedTo?: string;
  workspaceMembers?: WorkspaceMember[];
  tourPersonnelCounts?: { principal_count: number; band_count: number; crew_count: number };
}) {
  const fromStorage = Array.isArray(data.flights) ? (data.flights as (Partial<FlightEntry> & { id?: string })[]) : [];
  const legacyRows = fromStorage.length > 0 ? null : flightRowsFromLegacyData(data);
  const rawFlights: (Partial<FlightEntry> & { id?: string })[] = fromStorage.length > 0 ? fromStorage : (legacyRows ?? []);
  const flights: FlightEntry[] = rawFlights.map((f, i) => ({
    id: (f.id && String(f.id)) || `row-${i}`,
    departure_city: f.departure_city ?? '',
    arrival_city: f.arrival_city ?? '',
    date: f.date ?? '',
    time: f.time ?? '',
    airline: f.airline ?? '',
    flight_number: f.flight_number ?? '',
    confirmation_code: f.confirmation_code ?? '',
    personnel_ids: Array.isArray(f.personnel_ids) ? f.personnel_ids : [],
  }));
  const personnelOptions = buildTourPersonnelList(tourPersonnelCounts ?? { principal_count: 0, band_count: 0, crew_count: 0 });
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState<string | null>(null);

  const EMPTY_FLIGHT: FlightEntry = { id: '', departure_city: '', arrival_city: '', date: '', time: '', airline: '', flight_number: '', confirmation_code: '', personnel_ids: [] };
  const hasKeyFlightFields = (f: FlightEntry) =>
    !!(
      f.departure_city?.trim() ||
      f.arrival_city?.trim() ||
      f.airline?.trim() ||
      f.flight_number?.trim() ||
      f.confirmation_code?.trim() ||
      f.date?.trim() ||
      f.time?.trim() ||
      (f.personnel_ids && f.personnel_ids.length > 0)
    );
  const displayFlights = flights.length > 0 ? flights : [EMPTY_FLIGHT];
  const showAddFlightButton = displayFlights.some(hasKeyFlightFields);

  const addFlight = () => {
    onFlightsChange([
      ...flights,
      { id: crypto.randomUUID(), departure_city: '', arrival_city: '', date: '', time: '', airline: '', flight_number: '', confirmation_code: '', personnel_ids: [] },
    ]);
  };
  const updateFlight = (index: number, patch: Partial<FlightEntry>) => {
    if (flights.length === 0 && index === 0) {
      onFlightsChange([{ ...EMPTY_FLIGHT, id: crypto.randomUUID(), ...patch }]);
      return;
    }
    const next = flights.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onFlightsChange(next);
  };
  const removeFlight = (index: number) => {
    if (flights.length <= 1) {
      onFlightsChange([]);
      return;
    }
    onFlightsChange(flights.filter((_, i) => i !== index));
  };
  const menuItems = [
    { label: 'Mark section complete', icon: CheckCircle2, onClick: () => onSetSectionStatus('complete') },
    ...(onRemoveSection ? [{ label: 'Remove section', icon: Trash2, variant: 'danger' as const, onClick: () => setRemoveConfirmOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof CheckCircle2; onClick: () => void; variant?: 'danger' }[];
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Plane size={20} className="text-lp-text-tertiary shrink-0" />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        <div className="shrink-0" onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
          <ContextMenu items={menuItems} align="right" onBeforeOpen={() => { if (!expanded) onToggle(); }} />
        </div>
        <StatusDropdown sectionStatus={sectionStatus} onSelectStatus={onSetSectionStatus} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }} />
        {onSetSectionAssigned && workspaceMembers.length > 0 ? (
          <AssignDropdown assignedTo={assignedTo} members={workspaceMembers} onSelect={onSetSectionAssigned} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }} />
        ) : null}
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            {displayFlights.map((flight, index) => (
              <div key={flight.id || 'draft'} className="rounded-xl border border-lp-border bg-lp-surface-hover/50 p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-lp-text-tertiary">Flight {index + 1}</span>
                  {flights.length > 0 && (
                    <button type="button" onClick={() => removeFlight(index)} className="rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500" aria-label="Remove flight"><X size={18} /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Departure city</label>
                    <input type="text" value={flight.departure_city} onChange={(e) => updateFlight(index, { departure_city: e.target.value })} placeholder="City" className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Arrival city</label>
                    <input type="text" value={flight.arrival_city} onChange={(e) => updateFlight(index, { arrival_city: e.target.value })} placeholder="City" className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Date</label>
                    <input type="date" value={flight.date} onChange={(e) => updateFlight(index, { date: e.target.value })} className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Time</label>
                    <input type="time" value={flight.time} onChange={(e) => updateFlight(index, { time: e.target.value })} className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Airline</label>
                    <input type="text" value={flight.airline} onChange={(e) => updateFlight(index, { airline: e.target.value })} placeholder="Airline" className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Flight number</label>
                    <input type="text" value={flight.flight_number} onChange={(e) => updateFlight(index, { flight_number: e.target.value })} placeholder="e.g. BA123" className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-lp-text-tertiary">Confirmation code</label>
                    <input type="text" value={flight.confirmation_code} onChange={(e) => updateFlight(index, { confirmation_code: e.target.value })} placeholder="Booking ref" className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none" />
                  </div>
                </div>
                <div className="relative z-[100]">
                  <span className="mb-1 block text-xs font-medium text-lp-text-tertiary">Personnel on this flight</span>
                  <PersonnelMultiSelect
                    options={personnelOptions}
                    selectedIds={flight.personnel_ids ?? []}
                    onChange={(ids) => updateFlight(index, { personnel_ids: ids })}
                    openKey={personnelDropdownOpen}
                    onOpenChange={setPersonnelDropdownOpen}
                    instanceId={flight.id || 'draft'}
                  />
                </div>
              </div>
            ))}
            {showAddFlightButton && (
              <button type="button" onClick={addFlight} className="flex items-center gap-2 rounded-lg border border-dashed border-lp-border px-4 py-2.5 text-sm font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text transition-colors duration-200" style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <Plus size={16} />
                {flights.length === 0 ? 'Add flight' : 'Add another flight'}
              </button>
            )}
          </div>
        </div>
      </div>
      {onRemoveSection && (
        <DeleteConfirmationModal open={removeConfirmOpen} itemName={section.label} onClose={() => setRemoveConfirmOpen(false)} onConfirm={async () => { await onRemoveSection(section.template_id); setRemoveConfirmOpen(false); }} />
      )}
    </div>
  );
}

function PersonnelMultiSelect({
  options,
  selectedIds,
  onChange,
  openKey,
  onOpenChange,
  instanceId,
}: {
  options: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  openKey: string | null;
  onOpenChange: (id: string | null) => void;
  instanceId: string;
}) {
  const open = openKey === instanceId;
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; onOpenChange(null); setSearch(''); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onOpenChange]);
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };
  const searchLower = search.trim().toLowerCase();
  const filteredOptions = searchLower
    ? options.filter((o) => o.label.toLowerCase().includes(searchLower))
    : options;
  const selectedLabels = selectedIds.map((id) => options.find((o) => o.id === id)?.label ?? id);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(open ? null : instanceId)}
        className={cn(
          'flex min-h-[42px] w-full flex-wrap items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover focus:outline-none focus:ring-2 focus:ring-lp-orange/20',
          !selectedIds.length && 'text-lp-text-tertiary'
        )}
      >
        {selectedIds.length > 0 ? (
          <>
            {selectedLabels.map((label, i) => (
              <span
                key={selectedIds[i]}
                className="inline-flex items-center gap-1 rounded-full bg-lp-orange/15 px-2.5 py-0.5 text-xs font-medium text-lp-orange"
              >
                {label}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange(selectedIds.filter((_, j) => j !== i)); }}
                  className="rounded-full hover:bg-lp-orange/30 p-0.5"
                  aria-label="Remove"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </>
        ) : (
          <span>Select personnel...</span>
        )}
        <ChevronDown size={16} className={cn('ml-auto shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[5000] mt-1 max-h-56 overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-lg">
          <div className="border-b border-lp-border p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-lg border border-lp-border bg-lp-bg-secondary px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
            />
          </div>
          <div className="max-h-40 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-lp-text-tertiary">No matches</p>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-lp-surface-hover">
                  <input type="checkbox" checked={selectedIds.includes(opt.id)} onChange={() => toggle(opt.id)} className="lp-checkbox" />
                  <span className="text-sm text-lp-text">{opt.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Deal Info: Upload deal memo + AI extract + review -----

const DEAL_MEMO_DOC_TYPES = ['Deal Memo', 'Tech Rider', 'Flight Ticket', 'Hotel Confirmation', 'Other'] as const;

function DealInfoUploadBlock({
  onFieldChange,
  tourId,
}: {
  onFieldChange: (fieldId: string, value: unknown) => void;
  /* Sprint 12 §SAFE — server validates the tour belongs to
     the user's workspace before billing the AI key. */
  tourId?: string;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [documentType, setDocumentType] = useState<string>(DEAL_MEMO_DOC_TYPES[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onExtract = async () => {
    if (files.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      if (!tourId) {
        setError('Tour context missing — reload and try again.');
        return;
      }
      const form = new FormData();
      form.set('document_type', documentType);
      /* Sprint 12 §SAFE — server validates the tour belongs to
         the user's workspace before billing the AI key. */
      form.set('tour_id', tourId);
      files.forEach((f) => form.append('files', f));
      const res = await fetch('/api/advance/extract-deal-memo', { method: 'POST', body: form });
      const cap = await detectAiCap(res);
      if (cap) {
        showToast(aiCapMessage(cap), 'error');
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? 'Extraction failed');
        return;
      }
      const ext = (j.extracted ?? {}) as Record<string, string | null | undefined>;
      setReview({
        guarantee: ext.guarantee ?? '',
        guest_list: ext.guest_list ?? '',
        transport_from_promoter: ext.transport_from_promoter ?? '',
        backline_provisions: ext.backline_provisions ?? '',
        deal_notes: [ext.notes, ext.key_contacts, ext.show_date, ext.venue].filter(Boolean).join('\n\n'),
      });
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const onApply = () => {
    Object.entries(review).forEach(([id, value]) => onFieldChange(id, value || undefined));
    setOpen(false);
    setStep(1);
    setFiles([]);
    setReview({});
  };

  const onClose = () => {
    setOpen(false);
    setStep(1);
    setFiles([]);
    setError(null);
    setReview({});
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
      >
        <Upload size={16} />
        Upload deal memo
      </button>
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
          <div className="w-full max-w-lg rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">
              {step === 1 ? 'Upload deal memo' : 'Review extracted data'}
            </h3>
            {step === 1 && (
              <>
                <p className="mt-1 text-sm text-lp-text-secondary">Choose document type and add file(s). All files in this batch must be the same type.</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-lp-text-tertiary mb-1">Document type</label>
                    <BrandedSelect
                      value={documentType}
                      onChange={setDocumentType}
                      options={DEAL_MEMO_DOC_TYPES.map((t) => ({ value: t, label: t }))}
                      ariaLabel="Document type"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-lp-text-tertiary mb-1">Files (PDF or image)</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                      className="w-full text-sm text-lp-text"
                    />
                    {files.length > 0 && <p className="mt-1 text-xs text-lp-text-tertiary">{files.length} file(s) selected</p>}
                  </div>
                </div>
                {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={onClose} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
                  <button type="button" onClick={onExtract} disabled={loading || files.length === 0} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">
                    {loading ? 'Extracting…' : 'Extract'}
                  </button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <p className="mt-1 text-sm text-lp-text-secondary">Edit below and apply to fill the Deal Info section.</p>
                <div className="mt-4 space-y-3">
                  {(['guarantee', 'guest_list', 'transport_from_promoter', 'backline_provisions', 'deal_notes'] as const).map((id) => (
                    <div key={id}>
                      <label className="block text-xs font-medium text-lp-text-tertiary mb-1">{id.replace(/_/g, ' ')}</label>
                      <textarea
                        value={review[id] ?? ''}
                        onChange={(e) => setReview((r) => ({ ...r, [id]: e.target.value }))}
                        rows={id === 'deal_notes' ? 3 : 1}
                        className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Back</button>
                  <button type="button" onClick={onApply} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover">Apply to form</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ----- Settlement (collapsible block with Deal Memo) -----

function SettlementBlock({
  section,
  data,
  instanceId,
  currency = 'GBP',
  onFieldChange,
}: {
  section: SectionDef;
  data: Record<string, unknown>;
  instanceId: string;
  currency?: string;
  onFieldChange: (fieldId: string, value: unknown) => void;
}) {
  const dealMemoFile = data.deal_memo_file as string | undefined;
  const dealMemoText = (data.deal_memo_text as string) ?? '';
  return (
    <div className="space-y-4 rounded-xl border border-lp-border bg-lp-surface p-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-lp-text">Deal Memo</label>
        <p className="mb-2 text-xs text-lp-text-tertiary">Upload a file or paste text below.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <FileUploadField value={dealMemoFile ?? ''} onChange={(v) => onFieldChange('deal_memo_file', v)} instanceId={instanceId} fieldId="deal_memo_file" />
          <div className="min-w-0 flex-1">
            <textarea
              value={dealMemoText}
              onChange={(e) => onFieldChange('deal_memo_text', e.target.value)}
              placeholder="Or paste deal memo text here..."
              rows={4}
              className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
            />
          </div>
        </div>
        {dealMemoFile && (
          <p className="mt-2 text-sm text-lp-text-secondary">
            File attached. <a href={dealMemoFile} target="_blank" rel="noopener noreferrer" className="text-lp-orange hover:underline">View file</a>
          </p>
        )}
      </div>
      {sortFieldsContactsFirst((section.fields ?? []).filter((f) => f.id !== 'deal_memo_file' && f.id !== 'deal_memo_text')).map((field) => (
        <FieldRenderer key={field.id} field={field} value={data[field.id]} currency={currency} onChange={(v) => onFieldChange(field.id, v)} instanceId={instanceId} />
      ))}
    </div>
  );
}

// ----- Parking & Access (under Transport in template) -----

function ParkingAccessCard({
  instanceId,
  section,
  data,
  sectionStatus,
  sectionFlags,
  expanded,
  onToggle,
  onSetSectionStatus,
  onSetSectionAssigned,
  onFieldChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
  assignedTo,
  workspaceMembers = [],
}: {
  instanceId: string;
  section: SectionDef;
  data: Record<string, unknown>;
  sectionStatus: string;
  sectionFlags: AdvanceFlag[];
  expanded: boolean;
  onToggle: () => void;
  onSetSectionStatus: (status: string) => void;
  onSetSectionAssigned?: (userId: string | null) => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
  assignedTo?: string;
  workspaceMembers?: WorkspaceMember[];
}) {
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const parkingLocation = (data.parking_location as string) ?? '';
  const parkingInstructions = (data.parking_instructions as string) ?? '';
  const accessNotes = (data.access_notes as string) ?? '';
  const parkingMapUrl = (data.parking_map as string) ?? '';
  const parkingMapContentType = (data.parking_map_content_type as string) ?? '';
  const isPdf = parkingMapContentType === 'application/pdf' || (parkingMapUrl && parkingMapUrl.toLowerCase().endsWith('.pdf'));
  const menuItems = [
    { label: 'Mark section complete', icon: CheckCircle2, onClick: () => onSetSectionStatus('complete') },
    ...(onRemoveSection ? [{ label: 'Remove section', icon: Trash2, variant: 'danger' as const, onClick: () => setRemoveConfirmOpen(true) }] : []),
  ].filter(Boolean) as { label: string; icon: typeof CheckCircle2; onClick: () => void; variant?: 'danger' }[];
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Car size={20} className="text-lp-text-tertiary shrink-0" />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        <div className="shrink-0" onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
          <ContextMenu items={menuItems} align="right" onBeforeOpen={() => { if (!expanded) onToggle(); }} />
        </div>
        <StatusDropdown sectionStatus={sectionStatus} onSelectStatus={onSetSectionStatus} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }} />
        {onSetSectionAssigned && workspaceMembers.length > 0 ? (
          <AssignDropdown assignedTo={assignedTo} members={workspaceMembers} onSelect={onSetSectionAssigned} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }} />
        ) : null}
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            <div>
              <label className="mb-1 block text-sm font-medium text-lp-text">Parking location</label>
              <input
                type="text"
                value={parkingLocation}
                onChange={(e) => onFieldChange('parking_location', e.target.value)}
                placeholder="Address or description"
                className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-lp-text">Parking instructions</label>
              <textarea
                rows={3}
                value={parkingInstructions}
                onChange={(e) => onFieldChange('parking_instructions', e.target.value)}
                placeholder="Where to park, load-in route..."
                className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-lp-text">Access notes</label>
              <textarea
                rows={2}
                value={accessNotes}
                onChange={(e) => onFieldChange('access_notes', e.target.value)}
                placeholder="Gate codes, access times..."
                className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-lp-text">Parking map</label>
              <p className="mb-2 text-xs text-lp-text-tertiary">Upload image or PDF. Images display inline; PDFs show a thumbnail you can click to open.</p>
              <FileUploadField
                value={parkingMapUrl}
                onChange={(v) => onFieldChange('parking_map', v)}
                instanceId={instanceId}
                fieldId="parking_map"
              />
              {parkingMapUrl && (
                <div className="mt-3">
                  {isPdf ? (
                    <a href={parkingMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface-hover px-4 py-2 text-sm text-lp-text hover:bg-lp-surface">
                      <FileText size={18} />
                      Parking map (PDF) — click to open
                    </a>
                  ) : (
                    <div className="relative max-w-md rounded-lg border border-lp-border overflow-hidden bg-lp-bg-secondary">
                      <img src={parkingMapUrl} alt="Parking map" className="w-full h-auto object-contain max-h-80" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {onRemoveSection && (
        <DeleteConfirmationModal open={removeConfirmOpen} itemName={section.label} onClose={() => setRemoveConfirmOpen(false)} onConfirm={async () => { await onRemoveSection(section.template_id); setRemoveConfirmOpen(false); }} />
      )}
    </div>
  );
}

// ----- Important Documents (always at top) -----

function ImportantDocumentsCard({
  instanceId,
  documents,
  onDocumentsChange,
  currentUserId,
}: {
  instanceId: string;
  documents: AdvanceDocument[];
  onDocumentsChange: (docs: AdvanceDocument[]) => void;
  currentUserId: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<AdvanceDocument | null>(null);
  const [manageAccessDoc, setManageAccessDoc] = useState<AdvanceDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storageFiles, setStorageFiles] = useState<{ path: string; name: string; created_at: string | null; url: string }[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/upload/advance-file?advance_instance_id=${encodeURIComponent(instanceId)}`)
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j) => {
        if (!cancelled) setStorageFiles(j.files ?? []);
      })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [instanceId]);

  const displayDocs = (() => {
    const byPath = new Map(documents.filter((d) => d.path).map((d) => [d.path!, d]));
    const byUrl = new Map(documents.map((d) => [d.url, d]));
    return storageFiles.map((f) => {
      const existing = byPath.get(f.path) ?? byUrl.get(f.url);
      const uploadedAt = existing?.uploaded_at ?? f.created_at ?? new Date().toISOString();
      const filename = existing?.filename ?? f.name;
      return {
        id: existing?.id ?? f.path,
        path: f.path,
        url: f.url,
        filename,
        content_type: existing?.content_type,
        uploaded_at: uploadedAt,
        uploaded_by: existing?.uploaded_by,
        visible_to: existing?.visible_to,
      } as AdvanceDocument;
    });
  })();

  const uploadFile = async (file: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
    if (!allowed.includes(file.type)) return;
    if (file.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('advance_instance_id', instanceId);
      form.set('field_id', 'documents');
      const res = await fetch('/api/upload/advance-file', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      const { url, path } = await res.json();
      const base = file.name.replace(/\.[^.]+$/, '');
      const safeName = (pendingFileName || '').trim() || base || 'File';
      const doc: AdvanceDocument = {
        id: crypto.randomUUID(),
        url,
        path: path ?? undefined,
        filename: safeName,
        size: file.size,
        type: file.type,
        content_type: file.type,
        uploaded_at: new Date().toISOString(),
        uploaded_by: currentUserId ?? undefined,
        visible_to: [],
      };
      onDocumentsChange([...documents, doc]);
      setStorageFiles((prev) => [...prev, { path: path ?? '', name: safeName, created_at: doc.uploaded_at, url }]);
      setPendingFileName('');
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (doc: AdvanceDocument) => {
    if (doc.path) {
      try {
        await fetch('/api/upload/advance-file', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: doc.path }) });
      } catch (_) { /* ignore */ }
      setStorageFiles((prev) => prev.filter((f) => f.path !== doc.path));
    }
    onDocumentsChange(documents.filter((d) => d.id !== doc.id && d.url !== doc.url));
    if (viewerDoc?.id === doc.id || viewerDoc?.url === doc.url) setViewerDoc(null);
    if (manageAccessDoc?.id === doc.id || manageAccessDoc?.url === doc.url) setManageAccessDoc(null);
  };

  const updateDoc = (id: string, patch: Partial<AdvanceDocument>) => {
    onDocumentsChange(documents.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    if (manageAccessDoc?.id === id) setManageAccessDoc((d) => (d ? { ...d, ...patch } : null));
  };

  const docIcon = (doc: AdvanceDocument) => {
    const t = doc.content_type ?? '';
    if (t.includes('pdf')) return <FileText size={18} className="shrink-0 text-red-500" />;
    if (t.includes('image')) return <FileText size={18} className="shrink-0 text-blue-500" />;
    return <FileText size={18} className="shrink-0 text-lp-text-secondary" />;
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatBytes = (bytes?: number) => {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b <= 0) return '';
    const kb = b / 1024;
    const mb = kb / 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    if (kb >= 1) return `${kb.toFixed(1)} KB`;
    return `${b.toFixed(0)} B`;
  };

  return (
    <div className="rounded-xl border border-lp-border border-l-4 border-l-[var(--color-lp-success)] bg-lp-surface overflow-hidden card-hover">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-lp-border">
        <Folder size={20} className="text-lp-text-secondary shrink-0" />
        <span className="font-medium text-lp-text">Important Documents</span>
      </div>
      <div className="p-4 space-y-4">
        <input
          type="text"
          placeholder="File name (optional)"
          value={pendingFileName}
          onChange={(e) => setPendingFileName(e.target.value)}
          className="w-full rounded-md border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:ring-1 focus:ring-lp-orange"
        />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) uploadFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'rounded-xl border-2 border-dashed border-lp-border p-6 text-center transition-all cursor-pointer',
            dragOver && 'border-lp-accent bg-lp-accent/5',
            uploading && 'opacity-60 pointer-events-none'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadFile(f); e.target.value = ''; } }}
          />
          {uploading ? (
            <p className="text-sm text-lp-text-secondary flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Uploading…</p>
          ) : (
            <p className="text-sm text-lp-text-secondary">Drag and drop or click to upload (PDF, JPEG, PNG, GIF — max 10MB)</p>
          )}
        </div>
        {loadingList ? (
          <p className="text-sm text-lp-text-tertiary flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading documents…</p>
        ) : displayDocs.length > 0 ? (
          <ul className="space-y-2">
            {displayDocs.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-lp-border bg-lp-surface/50 px-3 py-2 flex items-center gap-3">
                {docIcon(doc)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-lp-text truncate">{doc.filename}</p>
                  <p className="text-xs text-lp-text-tertiary">
                    {[formatBytes(doc.size), formatDate(doc.uploaded_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <a href={doc.url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-lp-orange hover:text-lp-orange-hover">Download</a>
                <button type="button" onClick={() => removeDoc(doc)} className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                <ContextMenu
                  items={[
                    { label: 'View', icon: FileText, onClick: () => setViewerDoc(doc) },
                    { label: 'Manage Access', icon: UserPlus, onClick: () => setManageAccessDoc(doc) },
                  ]}
                  align="right"
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {viewerDoc && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onClick={() => setViewerDoc(null)}>
          <div className="bg-lp-surface rounded-xl border border-lp-border max-w-4xl max-h-[90vh] w-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-lp-border">
              <span className="font-medium text-lp-text truncate">{viewerDoc.filename}</span>
              <button type="button" onClick={() => setViewerDoc(null)} className="rounded p-1 text-lp-text-tertiary hover:bg-lp-surface-hover"><X size={20} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {viewerDoc.content_type?.startsWith('image/') ? (
                <img src={viewerDoc.url} alt={viewerDoc.filename} className="max-w-full h-auto" />
              ) : viewerDoc.content_type === 'application/pdf' ? (
                <iframe src={viewerDoc.url} title={viewerDoc.filename} className="w-full h-[80vh] rounded-lg border border-lp-border" />
              ) : (
                <a href={viewerDoc.url} target="_blank" rel="noreferrer" className="text-lp-accent hover:underline">Download file</a>
              )}
            </div>
          </div>
        </div>
      )}
      {manageAccessDoc && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onClick={() => setManageAccessDoc(null)}>
          <div className="bg-lp-surface rounded-xl border border-lp-border max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lp-text">Manage Access</h3>
            <p className="text-sm text-lp-text-secondary mt-1">Visible to all by default. Assign roles or people to restrict.</p>
            <p className="text-xs text-lp-text-tertiary mt-2">Coming soon: role/person picker.</p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setManageAccessDoc(null)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleDropdown({
  value,
  options,
  placeholder,
  onChange,
  className = '',
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelZ, setPanelZ] = useState(1000);
  const ref = useRef<HTMLDivElement>(null);
  const getZIndex = useContext(AdvanceDropdownZContext);
  const displayVal = value || placeholder;
  useEffect(() => {
    if (open) setPanelZ(getZIndex());
  }, [open, getZIndex]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className={cn('relative', className)} ref={ref} style={{ zIndex: open ? panelZ : undefined }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover transition-colors duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <span className={cn('truncate', !value && 'text-lp-text-tertiary')}>{displayVal}</span>
        <ChevronDown size={14} className={cn('shrink-0 ml-1 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg" style={{ zIndex: panelZ }}>
          {options.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { onChange(r === 'Custom Contact' ? '' : r); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectDropdown({
  value,
  options,
  placeholder,
  onChange,
  className = '',
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelZ, setPanelZ] = useState(1000);
  const ref = useRef<HTMLDivElement>(null);
  const getZIndex = useContext(AdvanceDropdownZContext);
  const displayVal = value || placeholder;
  useEffect(() => {
    if (open) setPanelZ(getZIndex());
  }, [open, getZIndex]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className={cn('relative', className)} ref={ref} style={{ zIndex: open ? panelZ : undefined }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('flex w-full items-center justify-between rounded-xl border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover transition-colors duration-200 border-lp-border focus:outline-none focus:ring-2 focus:ring-lp-orange/20', !value && 'text-lp-text-tertiary')}
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <span className="truncate">{displayVal}</span>
        <ChevronDown size={14} className={cn('shrink-0 ml-1 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg" style={{ zIndex: panelZ }}>
          <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text-tertiary hover:bg-lp-surface-hover">
            {placeholder}
          </button>
          {options.map((opt) => (
            <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Dropdown with "+ Add option" and user-wide options from API; each option has ✕ delete (with confirm). */
function AddableSelectDropdown({
  kind,
  value,
  defaultOptions,
  onChange,
  className = '',
}: {
  kind: string;
  value: string;
  defaultOptions: string[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelZ, setPanelZ] = useState(1000);
  const [addInput, setAddInput] = useState('');
  const [userOptions, setUserOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionToDelete, setOptionToDelete] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const getZIndex = useContext(AdvanceDropdownZContext);

  const fetchOptions = useCallback(() => {
    setLoading(true);
    fetch(`/api/advance/options?kind=${encodeURIComponent(kind)}`)
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((j) => setUserOptions(j.options ?? []))
      .finally(() => setLoading(false));
  }, [kind]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; setOpen(false); setAddInput(''); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const allLabels = [...defaultOptions];
  const seen = new Set(defaultOptions.map((s) => s.toLowerCase()));
  userOptions.forEach((o) => {
    if (!seen.has(o.label.toLowerCase())) {
      seen.add(o.label.toLowerCase());
      allLabels.push(o.label);
    }
  });

  const displayVal = value || '+ Add option';

  const addOption = async () => {
    const label = addInput.trim();
    if (!label) return;
    setLoading(true);
    try {
      const res = await fetch('/api/advance/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, label }),
      });
      if (res.ok) {
        const created = await res.json();
        setUserOptions((prev) => [...prev, { id: created.id, label: created.label }]);
        onChange(created.label);
        setAddInput('');
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteOption = async () => {
    if (!optionToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/advance/options/${optionToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUserOptions((prev) => prev.filter((o) => o.id !== optionToDelete.id));
        if (value === optionToDelete.label) onChange('');
        setOptionToDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const isUserOption = (label: string) => userOptions.some((o) => o.label === label);
  const getUserOptionId = (label: string) => userOptions.find((o) => o.label === label)?.id;
  useEffect(() => {
    if (open) setPanelZ(getZIndex());
  }, [open, getZIndex]);

  return (
    <div className={cn('relative', className)} ref={ref} style={{ zIndex: open ? panelZ : undefined }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('flex w-full items-center justify-between rounded-xl border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover transition-colors duration-200 border-lp-border focus:outline-none focus:ring-2 focus:ring-lp-orange/20', !value && 'text-lp-text-tertiary')}
      >
        <span className="truncate">{displayVal}</span>
        <ChevronDown size={14} className={cn('shrink-0 ml-1 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 min-w-[200px] max-h-64 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg" style={{ zIndex: panelZ }}>
          <div className="px-2 pb-1 border-b border-lp-border">
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Type new option..."
              className="w-full rounded-lg border border-lp-border bg-lp-bg-secondary px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
              autoFocus
            />
            <button type="button" onClick={addOption} disabled={!addInput.trim() || loading} className="mt-1.5 w-full rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">
              Add
            </button>
          </div>
          <div className="py-1">
            {allLabels.map((label) => (
              <div key={label} className="flex items-center gap-1 group">
                <button
                  type="button"
                  onClick={() => { onChange(label); setOpen(false); }}
                  className="flex-1 min-w-0 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover truncate"
                >
                  {label}
                </button>
                {isUserOption(label) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOptionToDelete({ id: getUserOptionId(label)!, label }); }}
                    className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    title="Delete this option"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {optionToDelete && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={() => setOptionToDelete(null)}>
          <div className="w-full max-w-sm rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-lp-text">Delete this option?</h3>
            <p className="mt-1 text-sm text-lp-text-secondary">&quot;{optionToDelete.label}&quot; will be removed from the list.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOptionToDelete(null)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
              <button type="button" onClick={deleteOption} disabled={deleting} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MEAL_TYPE_PRESETS = ['Breakfast', 'Lunch', 'Dinner', 'Catering', 'Buyout'] as const;

function MealTimesBlock({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (meals: { id: string; type: string; time: string }[]) => void;
}) {
  const parsed = (() => {
    if (Array.isArray(value)) return value as { id?: string; type?: string; time?: string }[];
    if (typeof value === 'string' && value.trim()) return [];
    return [];
  })();
  const meals = parsed.map((m) => ({
    id: typeof m.id === 'string' ? m.id : crypto.randomUUID(),
    type: typeof m.type === 'string' ? m.type : '',
    time: typeof m.time === 'string' ? m.time : '',
  }));

  const setMeals = (next: { id: string; type: string; time: string }[]) => {
    onChange(next);
  };

  const addMeal = () => {
    setMeals([...meals, { id: crypto.randomUUID(), type: '', time: '' }]);
  };

  const updateMeal = (index: number, patch: Partial<{ type: string; time: string }>) => {
    setMeals(meals.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const removeMeal = (index: number) => {
    setMeals(meals.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-lp-text">Meal times</label>
      <p className="mb-2 text-xs text-lp-text-tertiary">Meals can be used in the show schedule.</p>
      <div className="space-y-2">
        {meals.map((m, index) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2">
            <div className="min-w-[140px] flex-1">
              <AddableSelectDropdown
                kind="meal_type"
                value={m.type}
                defaultOptions={[...MEAL_TYPE_PRESETS]}
                onChange={(v) => updateMeal(index, { type: v })}
                className="w-full"
              />
            </div>
            <input
              type="time"
              value={m.time}
              onChange={(e) => updateMeal(index, { time: e.target.value })}
              className="rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
            />
            <button type="button" onClick={() => removeMeal(index)} className="shrink-0 rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-500" title="Remove meal">
              <X size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={addMeal} className="flex items-center gap-2 rounded-lg border border-dashed border-lp-border px-3 py-2 text-sm font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text">
          <Plus size={16} />
          Add meal
        </button>
      </div>
    </div>
  );
}

/** Role input with free text + autocomplete from workspace contact_role options; saves new roles to API. */
function RoleCombobox({
  value,
  onChange,
  defaultRole,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  defaultRole?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelZ, setPanelZ] = useState(1000);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const displayValue = value || defaultRole || '';

  useEffect(() => {
    fetch('/api/advance/options?kind=contact_role')
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((j) => setRoleOptions((j.options ?? []).map((o: { label: string }) => o.label)));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const saveNewRole = (label: string) => {
    if (!label.trim() || roleOptions.includes(label.trim())) return;
    fetch('/api/advance/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'contact_role', label: label.trim() }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((created) => { if (created?.label) setRoleOptions((prev) => [...prev, created.label]); });
  };

  const filtered = displayValue.trim()
    ? roleOptions.filter((r) => r.toLowerCase().includes(displayValue.toLowerCase()))
    : roleOptions;
  const getZIndex = useContext(AdvanceDropdownZContext);
  useEffect(() => {
    if (open) setPanelZ(getZIndex());
  }, [open, getZIndex]);

  return (
    <div className={cn('relative isolate', className)} ref={ref} style={{ zIndex: open ? panelZ : undefined }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (value.trim() && !roleOptions.includes(value.trim())) saveNewRole(value.trim()); setTimeout(() => setOpen(false), 150); }}
        placeholder={defaultRole ? `Role (e.g. ${defaultRole})` : 'Role'}
        className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
      />
      {open && (filtered.length > 0 || value.trim()) && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-40 overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg" style={{ zIndex: panelZ }}>
          {value.trim() && !roleOptions.includes(value.trim()) && (
            <button
              type="button"
              onClick={() => { onChange(value.trim()); saveNewRole(value.trim()); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-lp-orange hover:bg-lp-surface-hover"
            >
              Use &quot;{value.trim()}&quot;
            </button>
          )}
          {filtered.map((r) => (
            <button key={r} type="button" onClick={() => { onChange(r); setOpen(false); }} className="w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover">
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyContactRow({
  row,
  venueName,
  onUpdate,
  onRemove,
  contactRoles = [...CONTACT_ROLES],
  defaultRole,
}: {
  row: ContactRow;
  venueName: string | null;
  onUpdate: (patch: Partial<ContactRow>) => void;
  onRemove: () => void;
  contactRoles?: string[];
  /** Pre-fill role when contact is in a section (e.g. "Hospitality" from "Hospitality Contact"). Editable. */
  defaultRole?: string;
}) {
  const [nameQuery, setNameQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ContactRow[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [savingToBook, setSavingToBook] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nameQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/contacts/search?q=${encodeURIComponent(nameQuery)}`)
        .then((r) => r.ok ? r.json() : { contacts: [] })
        .then((j) => setSuggestions((j.contacts ?? []).slice(0, 8)))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [nameQuery]);

  const saveToContactBook = async () => {
    if (!(row.first_name ?? '').trim()) return;
    setSavingToBook(true);
    try {
      if (row.id) {
        const res = await fetch('/api/contacts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: row.id,
            first_name: row.first_name ?? '',
            last_name: row.last_name ?? '',
            phone: row.phone ?? undefined,
            email: row.email ?? undefined,
            role: row.role ?? undefined,
            venue_name: row.venue_name ?? undefined,
            notes: row.notes ?? undefined,
          }),
        });
        if (res.ok) {
          const contact = await res.json();
          onUpdate({ ...contact });
        }
      } else {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: (row.first_name ?? '').trim(),
            last_name: (row.last_name ?? '').trim(),
            phone: row.phone ?? undefined,
            email: row.email ?? undefined,
            role: row.role ?? undefined,
            venue_name: row.venue_name ?? undefined,
            notes: row.notes ?? undefined,
          }),
        });
        if (res.ok) {
          const contact = await res.json();
          onUpdate({ id: contact.id, ...contact });
        }
      }
    } finally {
      setSavingToBook(false);
    }
  };

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
            value={nameQuery !== '' ? nameQuery : displayName}
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
          inputMode="tel"
          value={row.phone ?? ''}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d\s+\-()]/g, '');
            onUpdate({ phone: v });
          }}
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
        <div className="flex items-center gap-2 min-w-0 flex-1 min-w-[140px]">
          <RoleCombobox
            value={row.role ?? ''}
            onChange={(v) => onUpdate({ role: v })}
            defaultRole={defaultRole}
            className="min-w-[140px] flex-1"
          />
        </div>
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
      <input
        type="text"
        value={row.notes ?? ''}
        onChange={(e) => onUpdate({ notes: e.target.value })}
        placeholder="Notes"
        className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={saveToContactBook}
          disabled={savingToBook || !(row.first_name ?? '').trim()}
          className="rounded-lg border border-lp-border px-3 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
        >
          {savingToBook ? 'Saving…' : row.id ? 'Update in contact book' : 'Save to contact book'}
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
  const [panelZ, setPanelZ] = useState(1000);
  const ref = useRef<HTMLDivElement>(null);
  const getZIndex = useContext(AdvanceDropdownZContext);
  const statusInfo = getAdvanceStatusInfo(sectionStatus);

  useEffect(() => {
    if (open) setPanelZ(getZIndex());
  }, [open, getZIndex]);
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
    <div className="relative" ref={ref} onClick={onClick} style={{ zIndex: open ? panelZ : undefined }}>
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
        <div className="absolute left-0 top-full mt-1 min-w-[140px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg" style={{ zIndex: panelZ }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectStatus(opt.value); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: opt.dot }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type WorkspaceMember = { id: string; name: string | null; avatar_url?: string | null };

function AssignDropdown({
  assignedTo,
  members,
  onSelect,
  onClick,
}: {
  assignedTo: string | undefined;
  members: WorkspaceMember[];
  onSelect: (userId: string | null) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelZ, setPanelZ] = useState(1000);
  const ref = useRef<HTMLDivElement>(null);
  const getZIndex = useContext(AdvanceDropdownZContext);
  const assigned = members.find((m) => m.id === assignedTo);
  useEffect(() => {
    if (open) setPanelZ(getZIndex());
  }, [open, getZIndex]);
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
    <div className="relative" ref={ref} onClick={onClick} style={{ zIndex: open ? panelZ : undefined }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="flex items-center gap-2 rounded-lg border border-lp-border px-2.5 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover transition-colors duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {assigned ? (
          <>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lp-orange/20 text-xs font-medium text-lp-orange">
              {(assigned.name ?? '?').charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[100px] truncate">{assigned.name ?? 'Unknown'}</span>
            <ChevronDown size={14} className="shrink-0 text-lp-text-tertiary" />
          </>
        ) : (
          <>
            <span className="text-lp-text-tertiary">Assign</span>
            <span className="text-lp-orange">→</span>
          </>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[180px] max-h-[240px] overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg" style={{ zIndex: panelZ }}>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(m.id); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lp-orange/20 text-xs font-medium text-lp-orange">
                {(m.name ?? '?').charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{m.name ?? 'Unknown'}</span>
            </button>
          ))}
          {assignedTo && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(null); setOpen(false); }}
              className="flex w-full items-center gap-2 border-t border-lp-border px-3 py-2 text-left text-sm text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
            >
              Unassign
            </button>
          )}
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
  onSetSectionAssigned,
  onFieldChange,
  onFieldsBatchChange,
  onFlagsChange,
  allFlags,
  currentUserId,
  onRemoveSection,
  venueLat,
  venueLng,
  venueName = null,
  sectionContacts = [],
  onSectionContactsChange,
  sectionContactRoles = [...DEFAULT_CONTACT_ROLES, 'Custom Contact'],
  assignedTo,
  workspaceMembers = [],
  artistName = null,
  tourId,
  routingId,
  onReplaceSectionData,
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
  onSetSectionAssigned?: (userId: string | null) => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onFieldsBatchChange?: (updates: Record<string, unknown>) => void;
  onFlagsChange: (nextFlags: AdvanceFlag[]) => void;
  allFlags: AdvanceFlag[];
  currentUserId: string | null;
  onRemoveSection?: (templateId: string) => void | Promise<void>;
  venueLat?: number;
  venueLng?: number;
  venueName?: string | null;
  sectionContacts?: ContactRow[];
  onSectionContactsChange?: (contacts: ContactRow[]) => void;
  sectionContactRoles?: string[];
  assignedTo?: string;
  workspaceMembers?: WorkspaceMember[];
  artistName?: string | null;
  tourId?: string;
  routingId?: string;
  onReplaceSectionData?: (templateId: string, data: Record<string, unknown>) => void;
}) {
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);
  const [scheduleTemplates, setScheduleTemplates] = useState<{ id: string; name: string; scope: 'user' | 'tour'; items: Record<string, unknown> }[]>([]);
  const [scheduleLoadOpen, setScheduleLoadOpen] = useState(false);
  const [scheduleSaveOpen, setScheduleSaveOpen] = useState(false);
  const [scheduleSaveName, setScheduleSaveName] = useState('');
  const [scheduleSaveScope, setScheduleSaveScope] = useState<'user' | 'tour'>('user');
  const scheduleLoadRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (section.label !== 'Schedule' || !tourId) return;
    fetch(`/api/advance/schedule-templates?tourId=${encodeURIComponent(tourId)}`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setScheduleTemplates((j.templates ?? []).map((t: { id: string; name: string; scope: string; items?: Record<string, unknown> }) => ({ id: t.id, name: t.name, scope: t.scope === 'tour' ? 'tour' as const : 'user' as const, items: t.items ?? {} }))));
  }, [section.label, tourId]);

  useEffect(() => {
    if (!scheduleLoadOpen) return;
    const close = (e: MouseEvent) => {
      if (scheduleLoadRef.current?.contains(e.target as Node)) return;
      setScheduleLoadOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [scheduleLoadOpen]);

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
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-visible card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-lp-surface-hover cursor-pointer transition-colors duration-100"
      >
        <SectionIcon />
        <span className="flex-1 font-medium text-lp-text">{section.label}</span>
        {section.tm_only && (
          <span className="shrink-0 text-lp-text-tertiary" title="TM view only">
            <Lock className="h-4 w-4" />
          </span>
        )}
        {sectionFlags.length > 0 && (
          <div className="flex items-center gap-1.5" onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
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
        <div className="shrink-0" onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
          <ContextMenu items={menuItems} align="right" onBeforeOpen={() => { if (!expanded) onToggle(); }} />
        </div>
        <div className="relative z-[200]" ref={flagDropdownRef} onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFlagDropdownOpen((o) => !o); }}
            className="flex items-center gap-1 rounded-lg border border-lp-border px-2.5 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover"
            aria-label="Flag this field"
            title="Flag a field as an issue, blocker or question — it surfaces in the section header and the review queue for you or an assignee to resolve."
          >
            <Flag size={14} />
            <ChevronDown size={14} className={cn('transition-transform', flagDropdownOpen && 'rotate-180')} />
          </button>
          {flagDropdownOpen && (
            <div className="absolute right-0 top-full z-[200] mt-1 w-56 rounded-xl border border-lp-border bg-lp-surface py-2 shadow-lg">
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
          onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}
        />
        {onSetSectionAssigned && workspaceMembers.length > 0 ? (
          <AssignDropdown
            assignedTo={assignedTo}
            members={workspaceMembers}
            onSelect={onSetSectionAssigned}
            onClick={(e) => { e.stopPropagation(); if (!expanded) onToggle(); }}
          />
        ) : assignedTo ? (
          <span className="text-sm text-lp-text-tertiary truncate max-w-[120px]">{workspaceMembers.find((m) => m.id === assignedTo)?.name ?? 'Assigned'}</span>
        ) : (
          <span className="text-sm text-lp-text-tertiary">Unassigned</span>
        )}
        {expanded ? <ChevronDown size={18} className="text-lp-text-tertiary shrink-0" /> : <ChevronRight size={18} className="text-lp-text-tertiary shrink-0" />}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className={cn('border-t border-lp-border px-4 py-4 space-y-4 transition-opacity duration-200', expanded ? 'opacity-100 delay-50' : 'opacity-0 delay-0')}>
            {section.label === 'Schedule' && tourId && (
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-lp-border">
                <div className="relative" ref={scheduleLoadRef}>
                  <button
                    type="button"
                    onClick={() => setScheduleLoadOpen((o) => !o)}
                    className="flex items-center gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
                  >
                    Load template
                    <ChevronDown size={14} className={cn('transition-transform', scheduleLoadOpen && 'rotate-180')} />
                  </button>
                  {scheduleLoadOpen && (
                    <ul className="absolute left-0 top-full z-[200] mt-1 min-w-[200px] max-h-56 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
                      {scheduleTemplates.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-lp-text-tertiary">No templates saved</li>
                      ) : (
                        scheduleTemplates.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                onReplaceSectionData?.(section.template_id, t.items);
                                setScheduleLoadOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{t.name}</span>
                              <span className="shrink-0 text-xs text-lp-text-tertiary">{t.scope === 'tour' ? 'This tour' : 'All tours'}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setScheduleSaveOpen(true); setScheduleSaveName(''); setScheduleSaveScope('user'); }}
                  className="flex items-center gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
                >
                  <LayoutTemplate size={14} />
                  Save as template
                </button>
              </div>
            )}
            {section.label === 'Deal Info' && (
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-lp-border">
                <DealInfoUploadBlock
                  onFieldChange={(fieldId, value) => onFieldChange(fieldId, value)}
                  tourId={tourId}
                />
              </div>
            )}
            {scheduleSaveOpen && section.label === 'Schedule' && (
              <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={() => setScheduleSaveOpen(false)}>
                <div className="w-full max-w-sm rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-semibold text-lp-text">Save schedule as template</h3>
                  <input
                    type="text"
                    value={scheduleSaveName}
                    onChange={(e) => setScheduleSaveName(e.target.value)}
                    placeholder="Template name"
                    className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleSaveScope('user')}
                      className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium', scheduleSaveScope === 'user' ? 'border-lp-orange bg-lp-orange/10 text-lp-orange' : 'border-lp-border text-lp-text hover:bg-lp-surface-hover')}
                    >
                      All tours
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleSaveScope('tour')}
                      className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium', scheduleSaveScope === 'tour' ? 'border-lp-orange bg-lp-orange/10 text-lp-orange' : 'border-lp-border text-lp-text hover:bg-lp-surface-hover')}
                    >
                      This tour only
                    </button>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setScheduleSaveOpen(false)} className="rounded-xl border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">Cancel</button>
                    <button
                      type="button"
                      disabled={!scheduleSaveName.trim()}
                      onClick={async () => {
                        if (!scheduleSaveName.trim()) return;
                        const res = await fetch('/api/advance/schedule-templates', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: scheduleSaveName.trim(),
                            scope: scheduleSaveScope,
                            tourId: scheduleSaveScope === 'tour' ? tourId : undefined,
                            sectionTemplateId: section.template_id,
                            items: data,
                          }),
                        });
                        if (res.ok) {
                          const j = await res.json();
                          setScheduleTemplates((prev) => [...prev, { id: j.id, name: j.name, scope: j.scope, items: j.items ?? {} }]);
                          setScheduleSaveOpen(false);
                        }
                      }}
                      className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
            {(section.label === 'Hospitality' ? sortHospitalityFieldsFirst(section.fields ?? []) : sortFieldsContactsFirst(section.fields ?? [])).map((field) =>
              section.label === 'Hospitality' && field.id === 'meal_times' ? (
                <MealTimesBlock
                  key={field.id}
                  value={data[field.id]}
                  onChange={(meals) => onFieldChange(field.id, meals)}
                />
              ) : section.label === 'Transport' && field.id === 'drive_distance' ? (
                <div key={field.id}>
                  <label className="mb-1 block text-sm font-medium text-lp-text">Drive Distance</label>
                  <input
                    type="text"
                    value={(data.drive_distance as string) ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (onFieldsBatchChange) {
                        onFieldsBatchChange({ drive_distance: v, drive_distance_source: 'custom' });
                      } else {
                        onFieldChange('drive_distance', v);
                        onFieldChange('drive_distance_source', 'custom');
                      }
                    }}
                    placeholder="e.g. 245 miles / 4h 15m"
                    className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                  />
                  <p className="mt-1 text-xs text-lp-text-tertiary">
                    {data.drive_distance_source === 'routing' ? 'From routing' : 'Custom'}
                  </p>
                </div>
              ) : (
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
                  overrideLabel={
                    section.label === 'Hospitality' && field.id === 'rider_status'
                      ? 'Hospitality Rider Status'
                      : section.label === 'Schedule' && field.id === 'headliner_soundcheck' && artistName
                        ? `${artistName} Soundcheck`
                        : section.label === 'Schedule' && field.id === 'headliner_set' && artistName
                          ? `${artistName} Set`
                          : undefined
                  }
                  labelIcon={section.label === 'Schedule' && field.id === 'changeover' ? <Clock size={18} className="text-lp-text-tertiary shrink-0" /> : undefined}
                  hideRequiredIndicator={section.label === 'Schedule' || (section.label === 'Production' && field.id === 'production_contact')}
                />
              )
            )}
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
            {onSectionContactsChange && (
              <div className="border-t border-lp-border pt-4 mt-2">
                <h4 className="text-sm font-medium text-lp-text mb-3">Key Contacts</h4>
                <div className="space-y-3">
                  {sectionContacts.map((row, index) => (
                    <KeyContactRow
                      key={index}
                      row={row}
                      venueName={venueName}
                      onUpdate={(patch) => {
                        const next = sectionContacts.map((c, i) => (i === index ? { ...c, ...patch } : c));
                        onSectionContactsChange(next);
                      }}
                      onRemove={() => onSectionContactsChange(sectionContacts.filter((_, i) => i !== index))}
                      contactRoles={sectionContactRoles}
                      defaultRole={section.label.replace(/\s+Contact$/i, '') || section.label}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onSectionContactsChange([...sectionContacts, { first_name: '', last_name: '', role: section.label.replace(/\s+Contact$/i, '') || section.label, phone: '', email: '', venue_name: venueName ?? undefined, notes: '' }])}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-lp-border px-4 py-2.5 text-sm font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
                  >
                    <Plus size={16} />
                    Add contact
                  </button>
                </div>
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
  const [badgePopoverOpen, setBadgePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; address: string; mapsUri?: string; distance?: number }>>([]);
  const [autoFilledFromGoogle, setAutoFilledFromGoogle] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setBadgePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const runSearch = () => {
    setLoading(true);
    setDropdownOpen(false);
    setBadgePopoverOpen(false);
    fetch(`/api/places/nearby?lat=${encodeURIComponent(venueLat)}&lng=${encodeURIComponent(venueLng)}&type=${encodeURIComponent(searchType)}`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.results ?? [];
        setResults(list);
        if (list.length > 0) {
          const first = list[0];
          const display = first.address ? `${first.name} — ${first.address}` : first.name;
          selectingRef.current = true;
          onChange(display);
          if (onAuxChange && first.mapsUri) onAuxChange(field.id + '_maps_uri', first.mapsUri);
          setAutoFilledFromGoogle(true);
          setDropdownOpen(false);
        } else {
          setDropdownOpen(true);
        }
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const selectResult = (name: string, address: string, mapsUri?: string) => {
    const display = address ? `${name} — ${address}` : name;
    selectingRef.current = true;
    onChange(display);
    if (onAuxChange && mapsUri) onAuxChange(field.id + '_maps_uri', mapsUri);
    setDropdownOpen(false);
    setBadgePopoverOpen(false);
  };

  const handleInputChange = (v: string) => {
    setAutoFilledFromGoogle(false);
    onChange(v);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (selectingRef.current) {
      selectingRef.current = false;
      return;
    }
    onChange(e.target.value);
  };

  return (
    <div ref={containerRef} className="relative">
      {label}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onBlur={handleBlur}
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
        {autoFilledFromGoogle && results.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setBadgePopoverOpen((o) => !o)}
              className="rounded-md border border-lp-border bg-lp-bg-secondary px-2 py-1 text-xs font-medium text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
            >
              Auto-filled from Google
            </button>
            {badgePopoverOpen && (
              <ul className="absolute left-0 top-full z-[300] mt-1 min-w-[220px] max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
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
        )}
      </div>
      {dropdownOpen && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-[300] mt-1 max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
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
  overrideLabel,
  labelIcon,
  hideRequiredIndicator,
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
  overrideLabel?: string;
  /** When set (e.g. Schedule changeover), show icon instead of text label. */
  labelIcon?: React.ReactNode;
  /** When true (e.g. Schedule section), do not show required asterisk. */
  hideRequiredIndicator?: boolean;
}) {
  const required = field.required ?? false;
  const strVal = value != null ? String(value) : '';
  const hasError = required && !strVal.trim();
  const inputClass = cn(
    'w-full rounded-xl border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:ring-2 focus:ring-lp-orange/20',
    hasError ? 'border-red-500/50 focus:border-red-500' : 'border-lp-border focus:border-lp-orange'
  );

  const displayLabel = overrideLabel ?? field.label;
  const label = (
    <label className="mb-1 flex items-center gap-2 text-sm font-medium text-lp-text" aria-label={typeof displayLabel === 'string' ? displayLabel : field.label}>
      {labelIcon ?? displayLabel}
      {!hideRequiredIndicator && required && <span className="text-red-500"> *</span>}
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
    case 'select': {
      const options = (field.options ?? []) as string[];
      const useAddable = field.id === 'catering_buyout' || field.id === 'rider_status';
      return (
        <div>
          {label}
          {useAddable ? (
            <AddableSelectDropdown
              kind={field.id}
              value={strVal}
              defaultOptions={options}
              onChange={(v) => onChange(v)}
              className="w-full"
            />
          ) : (
            <SelectDropdown
              value={strVal}
              options={options}
              placeholder="Select..."
              onChange={(v) => onChange(v)}
              className="w-full"
            />
          )}
        </div>
      );
    }
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
      const obj = (value as Record<string, string | undefined>) ?? {};
      const first_name = obj.first_name ?? '';
      const last_name = obj.last_name ?? '';
      const role = obj.role ?? '';
      const phone = obj.phone ?? '';
      const email = obj.email ?? '';
      const venue_name = obj.venue_name ?? '';
      const notes = obj.notes ?? '';
      return (
        <div className="space-y-2">
          {label}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="text" placeholder="First name" value={first_name} onChange={(e) => onChange({ ...obj, first_name: e.target.value })} onBlur={(e) => onChange({ ...obj, first_name: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Last name" value={last_name} onChange={(e) => onChange({ ...obj, last_name: e.target.value })} onBlur={(e) => onChange({ ...obj, last_name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="relative z-[100]">
              <RoleDropdown value={role} options={[...DEFAULT_CONTACT_ROLES, 'Custom Contact']} placeholder="Role" onChange={(v) => onChange({ ...obj, role: v })} />
            </div>
            <input type="tel" placeholder="Phone" value={phone} onChange={(e) => { const v = e.target.value.replace(/[^0-9+\-() ]/g, ''); onChange({ ...obj, phone: v }); }} onBlur={(e) => { const v = e.target.value.replace(/[^0-9+\-() ]/g, ''); onChange({ ...obj, phone: v }); }} className={inputClass} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => onChange({ ...obj, email: e.target.value })} onBlur={(e) => onChange({ ...obj, email: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Venue name" value={venue_name} onChange={(e) => onChange({ ...obj, venue_name: e.target.value })} onBlur={(e) => onChange({ ...obj, venue_name: e.target.value })} className={inputClass} />
          </div>
          <textarea rows={2} placeholder="Notes" value={notes} onChange={(e) => onChange({ ...obj, notes: e.target.value })} onBlur={(e) => onChange({ ...obj, notes: e.target.value })} className={inputClass} />
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

export { FillMode };
