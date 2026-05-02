'use client';

/**
 * AdvanceShowReadView
 * -------------------
 * Clean display-mode view of a show's advance data.
 * Default experience when opening a show — write once, read many.
 *
 * Renders filled sections as readable content cards.
 * Empty fields are hidden. Edit button per section drops into form mode.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Pencil, FileText, Phone, Mail, Globe,
  AlertCircle, ChevronRight,
  Paperclip, User, ExternalLink, Flag, Printer,
  Copy, Loader2,
} from 'lucide-react';
import { cn, parseRoutingDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { FieldTypeIcon, isMonoFieldType } from './FieldTypeIcon';

// ─── Types ───────────────────────────────────────────────────────────────────

type FieldDef = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  [key: string]: unknown;
};

type SectionDef = {
  template_id: string;
  label: string;
  fields: FieldDef[];
  order: number;
  tm_only?: boolean;
};

type ContactRow = {
  id?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  role: string;
  venue_name?: string;
  notes?: string;
};

type AdvanceDocument = {
  id: string;
  url: string;
  filename: string;
  size?: number;
  content_type?: string;
  uploaded_at: string;
};

type SectionStatus = {
  status: 'not_started' | 'in_progress' | 'complete' | 'needs_review';
  assigned_to?: string;
};

type AdvanceFlag = {
  id: string;
  section_id: string;
  type: 'issue' | 'question' | 'blocker';
  message: string;
  resolved: boolean;
};

type PageData = {
  routing: {
    id: string;
    date: string;
    venue_name: string | null;
    city: string;
    day_type: string;
    address?: string | null;
    venue_website?: string | null;
    venue_phone?: string | null;
  };
  tour: { currency: string; artist_name?: string | null };
  advance: {
    instance_id: string;
    status: string;
    section_statuses: Record<string, SectionStatus>;
    data: Record<string, Record<string, unknown>>;
    sections: SectionDef[];
    flags: AdvanceFlag[];
    last_updated_at?: string | null;
    last_updated_by_name?: string | null;
  } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function dayTypeLabel(t: string) {
  const map: Record<string, string> = {
    show: 'Show Day', festival: 'Festival', off: 'Day Off',
    travel: 'Travel Day', rehearsal: 'Rehearsal', press: 'Press Day',
  };
  return map[t] ?? t;
}

function dayTypeClass(t: string) {
  if (t === 'show' || t === 'festival') return 'bg-lp-orange/15 text-lp-orange';
  if (t === 'off') return 'bg-lp-surface text-lp-text-tertiary';
  return 'bg-blue-500/15 text-blue-400';
}

function shouldShowSectionInReadView(section: SectionDef): boolean {
  const lab = section.label.toLowerCase();
  if (lab.includes('settlement')) return false;
  if (section.fields.length === 0) return true;
  const allCurrency = section.fields.every((f) => f.type === 'currency');
  if (!allCurrency) return true;
  const prodTech = ['production', 'tech', 'audio', 'stage', 'lighting', 'backline', 'crew', 'sound', 'video', 'monitor', 'foh', 'rigging'];
  return prodTech.some((k) => lab.includes(k));
}


const PRINT_HIDE_CSS = `
@media print {
  aside, header, nav { display: none !important; }
  button { display: none !important; }
  .advance-read-no-print { display: none !important; }
  body { margin: 0; }
  .advance-read-view { padding: 0 !important; }
}
/* UX17 §5.2 — public share view hides authenticated nav (edit / overview
   buttons, slide-over openers) using the same affordance markers that the
   print stylesheet uses. Public viewers get a clean read-only document. */
.advance-read-view.is-public-readonly .advance-read-no-print { display: none !important; }
`;

type SectionStatusKey = 'complete' | 'in_progress' | 'needs_review' | 'not_started';

/**
 * Convert a free-form section label into a stable DOM id slug. Matches the
 * `advance-{slug}` convention so the page's DocumentCanvas IntersectionObserver
 * can pick it up alongside the canonical 8 ids when labels match
 * (Overview / Travel / Hotel / Venue / Schedule / Tech / Catering / Settlement).
 */
function sectionAnchorId(label: string | null | undefined): string {
  const slug = (label ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `advance-${slug}` : 'advance-section';
}

/**
 * UX22 phase 3 — token-aligned status colour. Returns the canonical
 * `--color-lp-status-*` CSS variable for a given status key (Phase 1 used
 * the same mapping in the overview's StatusPill; keeping them in sync so
 * the per-show card and the overview row pill read identically).
 */
const STATUS_TOKEN: Record<SectionStatusKey, string> = {
  not_started: 'var(--color-lp-status-not-started)',
  in_progress: 'var(--color-lp-status-in-progress)',
  needs_review: 'var(--color-lp-status-needs-review)',
  complete: 'var(--color-lp-status-complete)',
};

const STATUS_LABEL: Record<SectionStatusKey, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  complete: 'Complete',
};

/** Read view status pill — tinted bg + matching dot. needs_review → in_progress visual. */
function SectionReadStatusBadge({ status }: { status: string }) {
  const sk = status as SectionStatusKey;
  const key: SectionStatusKey =
    sk === 'complete' || sk === 'in_progress' || sk === 'needs_review' || sk === 'not_started'
      ? sk
      : 'not_started';
  // needs_review collapses into an in_progress visual treatment for the read
  // surface — same as the previous implementation.
  const visualKey: SectionStatusKey = key === 'needs_review' ? 'in_progress' : key;
  const colour = STATUS_TOKEN[visualKey];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
        color: colour,
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colour }} />
      {STATUS_LABEL[visualKey]}
    </span>
  );
}

// ─── Field value renderer ─────────────────────────────────────────────────────

function isBlank(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (typeof val === 'boolean') return false;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') {
    // Contact: check if name exists
    const c = val as Record<string, unknown>;
    return !c.first_name && !c.last_name;
  }
  return false;
}

function FieldValue({ field, value }: { field: FieldDef; value: unknown }) {
  if (isBlank(value)) return null;

  // File / document
  if (field.type === 'file') {
    const docs = Array.isArray(value) ? value as AdvanceDocument[] : [value as AdvanceDocument];
    return (
      <div className="flex flex-col gap-1.5">
        {docs.filter(Boolean).map((doc, i) => (
          <a
            key={doc?.id ?? i}
            href={doc?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-[12px] text-lp-text hover:border-lp-orange hover:text-lp-orange transition-colors group"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-lp-text-tertiary group-hover:text-lp-orange" />
            <span className="truncate">{doc?.filename}</span>
            {doc?.size && <span className="text-lp-text-tertiary shrink-0">{formatFileSize(doc.size)}</span>}
            <ExternalLink className="h-3 w-3 shrink-0 ml-auto text-lp-text-tertiary group-hover:text-lp-orange" />
          </a>
        ))}
      </div>
    );
  }

  // Contact
  if (field.type === 'contact') {
    const contacts = Array.isArray(value) ? value as ContactRow[] : [value as ContactRow];
    return (
      <div className="flex flex-col gap-2">
        {contacts.filter(c => c && (c.first_name || c.last_name)).map((c, i) => (
          <div key={i} className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-lp-text-tertiary" />
                  <span className="text-[13px] font-medium text-lp-text">
                    {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                  </span>
                  {c.role && (
                    <span className="text-[11px] text-lp-text-tertiary">{c.role}</span>
                  )}
                </div>
                {c.venue_name && (
                  <div className="mt-0.5 ml-5 text-[11px] text-lp-text-tertiary">{c.venue_name}</div>
                )}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 ml-5">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-[12px] text-lp-text-secondary hover:text-lp-orange">
                  <Phone className="h-3 w-3" /> {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-[12px] text-lp-text-secondary hover:text-lp-orange">
                  <Mail className="h-3 w-3" /> {c.email}
                </a>
              )}
            </div>
            {c.notes && (
              <p className="mt-1.5 ml-5 text-[11px] text-lp-text-tertiary italic">{c.notes}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Boolean
  if (field.type === 'boolean') {
    const v = value === true || value === 'true' || value === 1;
    return (
      <span className={cn('text-[13px] font-medium', v ? 'text-emerald-500' : 'text-lp-text-tertiary')}>
        {v ? '✓ Yes' : '✗ No'}
      </span>
    );
  }

  // URL
  if (field.type === 'url') {
    const url = String(value);
    return (
      <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[13px] text-blue-400 hover:text-lp-orange">
        <Globe className="h-3.5 w-3.5" />
        {url}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  // Textarea / long text
  if (field.type === 'textarea') {
    return (
      <p className="text-[13px] text-lp-text whitespace-pre-line leading-relaxed">{String(value)}</p>
    );
  }

  // Currency
  if (field.type === 'currency' || field.type === 'number') {
    const n = Number(value);
    if (isNaN(n)) return <span className="text-[13px] text-lp-text">{String(value)}</span>;
    if (field.type === 'currency') {
      return <span className="text-[13px] font-medium text-lp-text tabular-nums">
        {n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>;
    }
    return <span className="text-[13px] text-lp-text tabular-nums">{n.toLocaleString()}</span>;
  }

  // Default — plain text
  return <span className="text-[13px] text-lp-text">{String(value)}</span>;
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  section,
  sectionData,
  status,
  flags,
  editHref,
  tourId,
  routingId,
  fullData,
  allowCopy,
  onCopied,
}: {
  section: SectionDef;
  sectionData: Record<string, unknown>;
  status: SectionStatus | undefined;
  flags: AdvanceFlag[];
  editHref: string;
  tourId: string;
  routingId: string;
  fullData: Record<string, Record<string, unknown> | undefined>;
  allowCopy: boolean;
  onCopied: () => void;
}) {
  const statusKey = (status?.status ?? 'not_started') as SectionStatusKey;

  // Filter to fields that have actual values
  const filledFields = section.fields.filter(f => !isBlank(sectionData[f.id]));
  const fileFields = filledFields.filter(f => f.type === 'file');
  const contactFields = filledFields.filter(f => f.type === 'contact');
  const otherFields = filledFields.filter(f => f.type !== 'file' && f.type !== 'contact');

  const activeFlags = flags.filter(f => !f.resolved);
  const isEmpty = filledFields.length === 0;

  // UX22 §7.1 — when a section has no filled fields and no active flags,
  // show a thin empty-state card with a "copy from previous show" CTA
  // instead of swallowing the section entirely. Public-share viewers
  // (allowCopy=false) still get nothing rendered — they shouldn't trigger
  // authenticated PATCHes from a public surface.
  if (isEmpty && activeFlags.length === 0) {
    if (!allowCopy) return null;
    return (
      <EmptySectionCTA
        section={section}
        editHref={editHref}
        tourId={tourId}
        routingId={routingId}
        fullData={fullData}
        onCopied={onCopied}
      />
    );
  }

  // UX22 phase 3 — section anchor for the day rail / DocumentCanvas
  // IntersectionObserver scroll-spy. `scroll-mt-32` offsets a hash jump
  // by ~96px so the anchor lands below the sticky AdvanceShowContextBar.
  const anchorId = sectionAnchorId(section.label);

  return (
    <section
      id={anchorId}
      data-section-template-id={section.template_id}
      className="scroll-mt-32 overflow-hidden rounded-xl border border-lp-border bg-lp-surface"
    >
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 border-b border-lp-border bg-lp-surface/60 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2
            className="min-w-0 truncate"
            style={{
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-xl, 1.25rem)',
              fontWeight: 600,
              lineHeight: 'var(--lp-leading-snug, 1.3)',
            }}
          >
            {section.label}
          </h2>
          {activeFlags.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-[#EF4444]">
              <Flag className="h-2.5 w-2.5" />
              {activeFlags.length} {activeFlags.length === 1 ? 'flag' : 'flags'}
            </span>
          )}
        </div>
        <div className="advance-read-no-print flex shrink-0 items-center gap-3">
          <SectionReadStatusBadge status={statusKey} />
          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-2.5 py-1 text-[11px] font-semibold text-lp-text-secondary transition-colors hover:border-lp-orange hover:text-lp-orange"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Link>
        </div>
      </div>

      {/* Flags */}
      {activeFlags.map(flag => (
        <div key={flag.id} className={cn(
          'flex items-start gap-2 border-b border-lp-border px-5 py-2 text-[12px]',
          flag.type === 'blocker' ? 'bg-red-500/10 text-red-400' :
          flag.type === 'issue' ? 'bg-amber-500/10 text-amber-400' :
          'bg-blue-500/10 text-blue-400'
        )}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{flag.message}</span>
        </div>
      ))}

      {(otherFields.length > 0 || contactFields.length > 0 || fileFields.length > 0) && (
        <div className="space-y-4 px-5 py-5">
          {/* Regular fields — Phase 2 §B: dense field-table style.
              Each row has a field-type icon, label, then value. Numeric /
              date / time / currency / slider values pick up .lp-mono.
              Textareas + long values still span both columns. */}
          {otherFields.length > 0 && (
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {otherFields.map(field => {
                const val = sectionData[field.id];
                const isLong = field.type === 'textarea' || String(val ?? '').length > 60;
                const useMono = isMonoFieldType(field.type);
                return (
                  <div
                    key={field.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md',
                      isLong && 'sm:col-span-2',
                    )}
                  >
                    <FieldTypeIcon type={field.type} />
                    <div className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                        {field.label}
                      </span>
                      <div
                        className={cn(useMono && 'lp-mono')}
                        style={{ fontSize: '14px' }}
                      >
                        <FieldValue field={field} value={val} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Contacts */}
          {contactFields.length > 0 && (
            <div className="space-y-2">
              {contactFields.map(field => (
                <div key={field.id}>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary mb-1.5">
                    {field.label}
                  </span>
                  <FieldValue field={field} value={sectionData[field.id]} />
                </div>
              ))}
            </div>
          )}

          {/* Files — always at the bottom (UX22 phase 3: this is the
              section's "attachments rail"; styling stays minimal so prose
              fields read first). */}
          {fileFields.length > 0 && (
            <div className="space-y-2 border-t border-lp-border pt-1">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                Documents
              </span>
              {fileFields.map(field => (
                <FieldValue key={field.id} field={field} value={sectionData[field.id]} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── UX22 §7.1 — empty-section "copy from previous show" CTA ─────────────────

type PreviousShowOption = {
  routingId: string;
  date: string;
  venueName: string | null;
  city: string | null;
  data: Record<string, unknown>;
};

/**
 * Thin empty-state card replacing the previous "render nothing if empty"
 * behaviour. Heading + Not started pill + a single CTA that lazy-fetches
 * sibling shows on this tour with non-empty data for the same section
 * template_id, then PATCHes this show's `data` map with the picked source's
 * section slice. Section anchor + scroll-mt match the filled SectionCard
 * so the day rail's IntersectionObserver still tracks the section in scroll.
 */
function EmptySectionCTA({
  section,
  editHref,
  tourId,
  routingId,
  fullData,
  onCopied,
}: {
  section: SectionDef;
  editHref: string;
  tourId: string;
  routingId: string;
  fullData: Record<string, Record<string, unknown> | undefined>;
  onCopied: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOptions, setPickerOptions] = useState<PreviousShowOption[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const anchorId = sectionAnchorId(section.label);
  const templateId = section.template_id;

  const openPicker = () => {
    setPickerOpen(true);
    if (pickerOptions.length > 0 || pickerLoading) return;
    setPickerLoading(true);
    setPickerError(null);
    fetch(`/api/tours/${tourId}/advance?all=true`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j) => {
        const dates = (j?.dates ?? []) as Array<{
          routing_id: string;
          date: string;
          venue_name: string | null;
          city: string | null;
          advance: { data?: Record<string, Record<string, unknown> | undefined> | null } | null;
        }>;
        const candidates: PreviousShowOption[] = dates
          .filter((d) => d.routing_id !== routingId)
          .map((d): PreviousShowOption | null => {
            const sectionSlice = d.advance?.data?.[templateId];
            if (!sectionSlice || typeof sectionSlice !== 'object') return null;
            const hasAnyValue = Object.values(sectionSlice).some((v) => !isBlank(v));
            if (!hasAnyValue) return null;
            return {
              routingId: d.routing_id,
              date: d.date,
              venueName: d.venue_name,
              city: d.city,
              data: sectionSlice as Record<string, unknown>,
            };
          })
          .filter((x): x is PreviousShowOption => x !== null)
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        setPickerOptions(candidates);
      })
      .catch((e) => {
        setPickerError(e instanceof Error ? e.message : 'Could not load other shows');
      })
      .finally(() => setPickerLoading(false));
  };

  const applyCopy = async (source: PreviousShowOption) => {
    setApplyingId(source.routingId);
    setPickerError(null);
    try {
      const nextData = { ...fullData, [templateId]: source.data };
      const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: nextData }),
      });
      if (!res.ok) {
        throw new Error(`Failed to copy (${res.status})`);
      }
      setPickerOpen(false);
      onCopied();
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : 'Could not copy');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <section
      id={anchorId}
      data-section-template-id={section.template_id}
      data-empty-section
      className="scroll-mt-32 overflow-hidden rounded-xl border border-dashed border-lp-border bg-lp-surface/50"
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2
            className="min-w-0 truncate"
            style={{
              color: 'var(--lp-text-secondary)',
              fontSize: 'var(--lp-text-xl, 1.25rem)',
              fontWeight: 600,
              lineHeight: 'var(--lp-leading-snug, 1.3)',
            }}
          >
            {section.label}
          </h2>
        </div>
        <div className="advance-read-no-print flex shrink-0 items-center gap-3">
          <SectionReadStatusBadge status="not_started" />
          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-2.5 py-1 text-[11px] font-semibold text-lp-text-secondary transition-colors hover:border-lp-orange hover:text-lp-orange"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Link>
        </div>
      </div>
      <div className="advance-read-no-print border-t border-dashed border-lp-border px-5 py-3">
        {!pickerOpen ? (
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-xs font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy this section&apos;s content from a previous show
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                Pick a source show
              </span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                disabled={applyingId !== null}
                className="text-xs text-lp-text-tertiary hover:text-lp-text disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {pickerLoading ? (
              <p className="px-1 py-2 text-xs text-lp-text-tertiary">Loading…</p>
            ) : pickerOptions.length === 0 ? (
              <p className="px-1 py-2 text-xs text-lp-text-tertiary">
                No other show on this tour has content for this section yet.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-lp-border bg-lp-bg-secondary p-1">
                {pickerOptions.map((opt) => {
                  const dateLabel = parseRoutingDate(opt.date).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  });
                  const busy = applyingId === opt.routingId;
                  return (
                    <li key={opt.routingId}>
                      <button
                        type="button"
                        disabled={applyingId !== null}
                        onClick={() => applyCopy(opt)}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-lp-surface disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate text-lp-text">
                          <span className="font-medium">{dateLabel}</span>
                          <span className="ml-2 text-lp-text-secondary">
                            {opt.venueName || opt.city || '—'}
                          </span>
                        </span>
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-lp-text-tertiary" />
                        ) : (
                          <span
                            aria-hidden
                            className="text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-lp-orange)' }}
                          >
                            Copy
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {pickerError ? (
              <p className="text-xs text-red-500">{pickerError}</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Important Documents section ──────────────────────────────────────────────

function DocumentsSection({ docs, editHref }: {
  docs: AdvanceDocument[];
  editHref: string;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-lp-border bg-lp-surface/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-lp-text-tertiary" />
          <h2 className="text-lp-text">Important Documents</h2>
        </div>
        <Link
          href={editHref}
          className="advance-read-no-print inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-2.5 py-1 text-[11px] font-semibold text-lp-text-secondary transition-colors hover:border-lp-orange hover:text-lp-orange"
        >
          <Pencil className="h-3 w-3" /> Edit
        </Link>
      </div>
      <div className="flex flex-col gap-2 px-5 py-5">
        {docs.map((doc, i) => (
          <a key={doc?.id ?? i} href={doc?.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-[12px] text-lp-text hover:border-lp-orange hover:text-lp-orange transition-colors group">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-lp-text-tertiary group-hover:text-lp-orange" />
            <span className="truncate">{doc?.filename}</span>
            {doc?.size && <span className="text-lp-text-tertiary shrink-0 text-[10px]">{formatFileSize(doc.size)}</span>}
            <ExternalLink className="h-3 w-3 shrink-0 ml-auto text-lp-text-tertiary group-hover:text-lp-orange" />
          </a>
        ))}
      </div>
    </div>
  );
}

function AdvanceReadStickyHeader({
  overviewHref,
  editHref,
  routing,
  headerLoading,
}: {
  overviewHref: string;
  editHref: string;
  routing: PageData['routing'] | null;
  headerLoading: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-lp-border bg-lp-bg/95 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-8 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="advance-read-no-print flex shrink-0 items-center gap-2">
            <Link href={overviewHref} className="lp-meta transition-colors hover:text-lp-orange">
              ← Advance
            </Link>
            <span className="text-lp-border">|</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {headerLoading || !routing ? (
              <>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="hidden h-5 max-w-[min(280px,45vw)] flex-1 sm:block" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <span className="font-semibold text-lp-text">{formatDate(routing.date)}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider', dayTypeClass(routing.day_type))}>
                  {dayTypeLabel(routing.day_type)}
                </span>
                {routing.venue_name && (
                  <>
                    <span className="hidden lp-meta sm:inline">—</span>
                    <span className="truncate text-lp-text">{routing.venue_name}</span>
                  </>
                )}
                {routing.city && <span className="shrink-0 lp-meta">{routing.city}</span>}
              </>
            )}
          </div>
        </div>
        <div className="advance-read-no-print flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-2.5 py-1.5 font-medium text-lp-text-secondary transition-colors hover:border-lp-orange hover:text-lp-orange"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" />
            Print
          </button>
          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lp-orange px-3 py-1.5 font-medium text-white transition-colors hover:bg-lp-orange/90"
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" />
            Edit advance
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdvanceReadLoadingSkeleton() {
  return (
    <div className="space-y-4 px-8 py-6">
      <div>
        <p className="lp-label-caps mb-2 text-lp-text-tertiary">Key Info</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[120px] w-full rounded-lg" />
          <Skeleton className="h-[120px] w-full rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdvanceShowReadView({
  tourId,
  routingId,
  publicReadOnly = false,
  serverInitialJson,
}: {
  tourId: string;
  routingId: string;
  /**
   * UX17 §5.2 — when true, the public share consumer is rendering this view.
   * Hides authenticated nav (edit / overview buttons) and skips the
   * /api/tours fetch in favour of `serverInitialJson` from the share token
   * route, which has its own security boundary. EntityChip neutering is a
   * follow-up TODO.
   */
  publicReadOnly?: boolean;
  /** Pre-fetched advance bundle from the share-route loader. */
  serverInitialJson?: unknown;
}) {
  const [pageData, setPageData] = useState<PageData | null>(
    serverInitialJson ? (serverInitialJson as PageData) : null,
  );
  const [loading, setLoading] = useState(!serverInitialJson);
  const [error, setError] = useState<string | null>(null);

  const editHref = `/advance/${tourId}/${routingId}?mode=edit`;
  const overviewHref = `/advance/${tourId}`;

  const load = useCallback(() => {
    // Public share: bundle is already in pageData via serverInitialJson; do
    // NOT call the auth-gated /api/tours endpoint.
    if (publicReadOnly) return;
    setLoading(true);
    setError(null);
    setPageData(null);
    fetch(`/api/tours/${tourId}/advance/${routingId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(d => setPageData(d))
      .catch(e => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId, routingId, publicReadOnly]);

  useEffect(() => { load(); }, [load]);

  if (error && !loading) {
    return (
      <div className="p-8 text-sm text-[#EF4444]">
        Failed to load: {error}
      </div>
    );
  }

  const routing = pageData?.routing ?? null;
  const headerLoading = loading || !routing;

  return (
    <div className={`advance-read-view space-y-0${publicReadOnly ? ' is-public-readonly' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_HIDE_CSS }} />

      <AdvanceReadStickyHeader
        overviewHref={overviewHref}
        editHref={editHref}
        routing={routing}
        headerLoading={headerLoading}
      />

      {loading ? (
        <AdvanceReadLoadingSkeleton />
      ) : pageData ? (
        <AdvanceReadLoadedBody
          pageData={pageData}
          editHref={editHref}
          tourId={tourId}
          routingId={routingId}
          allowCopy={!publicReadOnly}
          onCopied={load}
        />
      ) : null}
    </div>
  );
}

function AdvanceReadLoadedBody({
  pageData,
  editHref,
  tourId,
  routingId,
  allowCopy,
  onCopied,
}: {
  pageData: PageData;
  editHref: string;
  tourId: string;
  routingId: string;
  /** UX22 §7.1 — when false (public share view), empty-section cards render
   *  without the "copy from previous show" CTA so a public viewer never
   *  triggers an authenticated PATCH. */
  allowCopy: boolean;
  onCopied: () => void;
}) {
  const { tour, advance } = pageData;
  const sections = advance?.sections ?? [];
  const data = advance?.data ?? {};
  const sectionStatuses = advance?.section_statuses ?? {};
  const flags = advance?.flags ?? [];

  const topLevelDocs: AdvanceDocument[] = [];

  const visibleSections = sections
    .filter(shouldShowSectionInReadView)
    .sort((a, b) => a.order - b.order);

  // Hotel + key-contact digest moved to AdvanceShowRightRail
  // (Variant parity §B). The read view is just sections now.

  const hasNoSections = sections.length === 0;

  return (
    <div className="space-y-4 px-8 py-6">
      {hasNoSections && (
        <div className="rounded-xl border border-dashed border-lp-border p-8 text-center">
          <p className="mb-3 lp-meta">No sections set up for this show yet.</p>
          <Link
            href={editHref}
            className="advance-read-no-print inline-flex items-center gap-1.5 rounded-lg bg-lp-orange px-4 py-2 font-medium text-white hover:bg-lp-orange/90"
          >
            Set up advance <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {topLevelDocs.length > 0 && (
        <DocumentsSection docs={topLevelDocs} editHref={editHref} />
      )}

      {visibleSections.map((section) => (
        <SectionCard
          key={section.template_id}
          section={section}
          sectionData={data[section.template_id] ?? {}}
          status={sectionStatuses[section.template_id]}
          flags={flags.filter((f) => f.section_id === section.template_id)}
          editHref={editHref}
          tourId={tourId}
          routingId={routingId}
          fullData={data}
          allowCopy={allowCopy}
          onCopied={onCopied}
        />
      ))}

      {advance?.last_updated_at && (
        <p className="advance-read-no-print pt-2 text-center lp-meta">
          Last updated{' '}
          {new Date(advance.last_updated_at).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {advance.last_updated_by_name && ` by ${advance.last_updated_by_name}`}
        </p>
      )}
    </div>
  );
}
