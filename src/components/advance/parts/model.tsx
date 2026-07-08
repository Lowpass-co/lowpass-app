'use client';

/* ============================================================
   LOWPASS — Advance builder shared model (B1 extraction)

   Constants, types, and small presentational helpers shared by the Build
   (SetupMode) and Advance (FillMode) surfaces + the shell. Sliced verbatim
   from AdvanceSectionBuilder.tsx lines 85-401 during the P3 decomposition.
   ============================================================ */

import React, { createContext, useContext, useRef, useCallback } from 'react';
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

export function relativeTime(iso: string): string {
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

export const STATUS_ORDER = ['not_started', 'in_progress', 'complete', 'needs_review'] as const;

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
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
  link: LinkIcon,
  paperclip: Paperclip,
  folder: Folder,
};

export const CUSTOM_SECTION_ICONS = [
  'clipboard', 'file-text', 'star', 'heart', 'flag', 'zap', 'tool', 'music',
  'camera', 'mic', 'headphones', 'globe', 'coffee', 'gift', 'award', 'bookmark',
  'tag', 'hash', 'link', 'paperclip', 'folder',
] as const;

export function SectionIcon({ icon }: { icon?: string }) {
  const name = (icon ?? 'clipboard').toLowerCase().replace(/-/g, '');
  const Comp = ICON_MAP[name] ?? ClipboardList;
  return <Comp className="text-lp-text-secondary" size={18} />;
}

/* Phase 2 §B — character glyphs retired in favour of the lucide
   components from FIELD_TYPE_OPTIONS below. The map stays for
   any caller that still passes through, falling back to a glyph
   shape rather than emoji. */
export const FIELD_TYPE_ICONS: Record<string, string> = {
  text: 'Aa',
  textarea: '¶',
  select: '▼',
  time: 'T',
  currency: '£',
  boolean: 'Y',
  contact: '@',
  url: '/',
  number: '#',
  date: 'D',
  file: 'F',
  slider: '⋮',
};

export const FIELD_TYPE_OPTIONS: { id: string; label: string; description: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
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

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'field';
}

export function FieldTypeIcon({ type }: { type: string }) {
  // Phase 2 §B — render the actual lucide glyph for each field type
  // (matches FIELD_TYPE_OPTIONS used in the field-type picker).
  // Falls back to the character map for unknown types.
  const opt = FIELD_TYPE_OPTIONS.find((o) => o.id === type);
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border"
      style={{
        borderColor: 'var(--lp-border-subtle, var(--lp-border))',
        background: 'var(--lp-bg-deep, var(--lp-bg-secondary))',
        color: 'var(--lp-text-secondary)',
      }}
      aria-label={opt?.label ?? type}
      title={opt?.label ?? type}
    >
      {opt ? (
        <opt.Icon size={13} />
      ) : (
        <span style={{ fontSize: '11px', fontWeight: 500 }}>
          {FIELD_TYPE_ICONS[type] ?? '?'}
        </span>
      )}
    </span>
  );
}

export function setDragGhost(e: React.DragEvent, label: string) {
  const el = document.createElement('div');
  el.textContent = label;
  el.style.cssText = 'position:absolute;top:-9999px;left:-9999px;padding:8px 12px;background:var(--lp-surface, #1a1a1a);border:1px solid var(--lp-border, #333);border-radius:8px;font-size:14px;opacity:0.85;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:var(--lp-text, #eee);';
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 12, 16);
  setTimeout(() => el.remove(), 0);
}

// ----- Types -----

export type FieldDef = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  [key: string]: unknown;
};

export type SectionDef = {
  template_id: string;
  label: string;
  fields: FieldDef[];
  order: number;
  tm_only?: boolean;
};

/** Sort fields so contact-type fields appear first (for display order only). */
export function sortFieldsContactsFirst(fields: FieldDef[]): FieldDef[] {
  return [...fields].sort((a, b) =>
    a.type === 'contact' ? (b.type === 'contact' ? 0 : -1) : b.type === 'contact' ? 1 : 0
  );
}

/** For Hospitality section: contacts first, then rider_status (Hospitality Rider Status), then rest. */
export function sortHospitalityFieldsFirst(fields: FieldDef[]): FieldDef[] {
  return [...fields].sort((a, b) => {
    if (a.type === 'contact') return b.type === 'contact' ? 0 : -1;
    if (b.type === 'contact') return 1;
    if (a.id === 'rider_status') return b.id === 'rider_status' ? 0 : -1;
    if (b.id === 'rider_status') return 1;
    return 0;
  });
}

/** VIS-AB-02 drag-reorder fix — see ./uniquifyFieldIds (kept in a pure .ts so a
 *  node type-strip test can import it; re-exported here for the builder). */
export { uniquifyFieldIds } from './uniquifyFieldIds';

export type ContactRow = {
  /** Stable id for list identity (persisted; generated client-side for new rows). */
  id?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  role: string;
  venue_name?: string;
  notes?: string;
};

export type AdvanceDocument = {
  id: string;
  url: string;
  path?: string;
  filename: string;
  size?: number;
  type?: string;
  content_type?: string;
  uploaded_at: string;
  uploaded_by?: string;
  visible_to?: string[];
};

export const KEY_CONTACTS_LABEL = 'Key Contacts';
export const IMPORTANT_DOCUMENTS_KEY = 'important_documents';
export const RIDER_LABEL = 'Rider';
export const FLIGHTS_LABEL = 'Flights';
export const SETTLEMENT_LABEL = 'Settlement';
export const PARKING_ACCESS_LABEL = 'Parking & Access';

/** Section-specific contact role presets. Plus "Custom Contact" in UI for free text. */
export const SECTION_CONTACT_ROLES: Record<string, string[]> = {
  'Production': ['Production Manager', 'Stage Manager', 'Head of Audio', 'Head of Lighting', 'Head of Video', 'Backline Tech'],
  'Catering': ['Catering Manager', 'Dietary Contact'],
  'Transport': ['Transport Coordinator', 'Driver', 'Flight Coordinator'],
  'Venue': ['Venue Manager', 'Box Office', 'Security Chief', 'Promoter Rep'],
  'Hospitality': ['Hotel Contact', 'Runner'],
};
export const DEFAULT_CONTACT_ROLES = ['Promoter', 'Venue Rep', 'Production Manager', 'Tour Manager', 'Security', 'Hospitality', 'Transport', 'Other'];

export function getContactRolesForSection(sectionLabel: string): string[] {
  const roles = SECTION_CONTACT_ROLES[sectionLabel];
  if (roles) return [...roles, 'Custom Contact'];
  return [...DEFAULT_CONTACT_ROLES, 'Custom Contact'];
}

export const CONTACT_ROLES = [
  'Promoter',
  'Venue Rep',
  'Production Manager',
  'Tour Manager',
  'Security',
  'Hospitality',
  'Transport',
  'Other',
] as const;

export type ApiTemplate = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  fields: FieldDef[];
  suggested_for_day_types?: string[];
  workspace_id?: string | null;
  sort_order?: number;
};

export type AdvanceData = Record<string, Record<string, unknown>>;
export type SectionStatuses = Record<string, { status: string; assigned_to?: string }>;

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

// ----- Date strip item (from GET /api/tours/[id]/advance?all=true) -----
export type AdvanceDateItem = {
  routing_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
};

// ----- Data shape from GET /api/tours/[id]/advance/[routingId] -----

export type PageData = {
  routing: { id: string; date: string; venue_name: string | null; city: string; day_type: string; address?: string | null; venue_website?: string | null; venue_phone?: string | null; venue_capacity?: number | null; latitude?: number | null; longitude?: number | null };
  tour: { currency: string; principal_count?: number; band_count?: number; crew_count?: number };
  advance: {
    instance_id: string;
    status: string;
    section_statuses: SectionStatuses;
    data: AdvanceData;
    sections: SectionDef[];
    flags: AdvanceFlag[];
  } | null;
};

export type AdvanceComment = {
  id: string;
  section_id: string;
  author_id: string;
  author_name: string;
  content: string;
  thread_id: string | null;
  created_at: string;
};

/** Used so the most recently opened dropdown in the advance form renders on top. */
export const AdvanceDropdownZContext = createContext<() => number>(() => 1000);
export function AdvanceDropdownZProvider({ children }: { children: React.ReactNode }) {
  const nextRef = useRef(1000);
  const getZIndex = useCallback(() => {
    nextRef.current += 1;
    return nextRef.current;
  }, []);
  return <AdvanceDropdownZContext.Provider value={getZIndex}>{children}</AdvanceDropdownZContext.Provider>;
}

