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
  Loader2, Pencil, FileText, Phone, Mail, Globe,
  AlertCircle, CheckCircle2, Clock, ChevronRight,
  Paperclip, User, MapPin, ExternalLink, Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

const STATUS_META = {
  complete:     { label: 'Complete',     icon: CheckCircle2, cls: 'text-emerald-500' },
  in_progress:  { label: 'In Progress',  icon: Clock,        cls: 'text-amber-500' },
  needs_review: { label: 'Needs Review', icon: AlertCircle,  cls: 'text-red-500' },
  not_started:  { label: 'Not Started',  icon: Clock,        cls: 'text-lp-text-tertiary' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.not_started;
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', meta.cls)}>
      <Icon className="h-3 w-3" />
      {meta.label}
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
  currency,
}: {
  section: SectionDef;
  sectionData: Record<string, unknown>;
  status: SectionStatus | undefined;
  flags: AdvanceFlag[];
  editHref: string;
  currency: string;
}) {
  const statusKey = (status?.status ?? 'not_started') as keyof typeof STATUS_META;

  // Filter to fields that have actual values
  const filledFields = section.fields.filter(f => !isBlank(sectionData[f.id]));
  const fileFields = filledFields.filter(f => f.type === 'file');
  const contactFields = filledFields.filter(f => f.type === 'contact');
  const otherFields = filledFields.filter(f => f.type !== 'file' && f.type !== 'contact');

  const activeFlags = flags.filter(f => !f.resolved);
  const isEmpty = filledFields.length === 0;

  const borderColor = statusKey === 'complete' ? 'border-emerald-500/30'
    : statusKey === 'in_progress' ? 'border-amber-500/30'
    : statusKey === 'needs_review' ? 'border-red-500/30'
    : 'border-lp-border/60';

  return (
    <div className={cn('rounded-xl border bg-lp-surface overflow-hidden', borderColor)}>
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-lp-border/40 bg-lp-surface/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[14px] font-semibold text-lp-text">{section.label}</span>
          {activeFlags.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
              <Flag className="h-2.5 w-2.5" />
              {activeFlags.length} {activeFlags.length === 1 ? 'flag' : 'flags'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={statusKey} />
          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-2.5 py-1 text-[11px] font-medium text-lp-text-secondary hover:border-lp-orange hover:text-lp-orange transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Link>
        </div>
      </div>

      {/* Flags */}
      {activeFlags.map(flag => (
        <div key={flag.id} className={cn(
          'flex items-start gap-2 px-4 py-2 text-[12px] border-b border-lp-border/30',
          flag.type === 'blocker' ? 'bg-red-500/10 text-red-400' :
          flag.type === 'issue' ? 'bg-amber-500/10 text-amber-400' :
          'bg-blue-500/10 text-blue-400'
        )}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{flag.message}</span>
        </div>
      ))}

      {/* Empty state */}
      {isEmpty ? (
        <div className="px-4 py-5 flex items-center justify-between">
          <span className="text-[12px] text-lp-text-tertiary italic">No data entered yet</span>
          <Link
            href={editHref}
            className="text-[12px] text-lp-orange hover:underline font-medium"
          >
            Fill in →
          </Link>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-4">
          {/* Regular fields — 2-col grid for short values */}
          {otherFields.length > 0 && (
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {otherFields.map(field => {
                const val = sectionData[field.id];
                const isLong = field.type === 'textarea' || String(val ?? '').length > 60;
                return (
                  <div key={field.id} className={cn('flex flex-col gap-0.5', isLong && 'sm:col-span-2')}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                      {field.label}
                    </span>
                    <FieldValue field={field} value={val} />
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

          {/* Files — always at the bottom */}
          {fileFields.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-lp-border/30">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary mb-1.5">
                Documents
              </span>
              {fileFields.map(field => (
                <FieldValue key={field.id} field={field} value={sectionData[field.id]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Important Documents section ──────────────────────────────────────────────

function DocumentsSection({ docs, editHref }: {
  docs: AdvanceDocument[];
  editHref: string;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="rounded-xl border border-lp-border/60 bg-lp-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-lp-border/40 bg-lp-surface/60">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-lp-text-tertiary" />
          <span className="text-[14px] font-semibold text-lp-text">Important Documents</span>
        </div>
        <Link href={editHref} className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border px-2.5 py-1 text-[11px] font-medium text-lp-text-secondary hover:border-lp-orange hover:text-lp-orange transition-colors">
          <Pencil className="h-3 w-3" /> Edit
        </Link>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2">
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

// ─── Main component ───────────────────────────────────────────────────────────

export function AdvanceShowReadView({
  tourId,
  routingId,
}: {
  tourId: string;
  routingId: string;
}) {
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const editHref = `/tours/${tourId}/advance/${routingId}?mode=edit`;
  const overviewHref = `/tours/${tourId}/advance`;

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/tours/${tourId}/advance/${routingId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(d => setPageData(d))
      .catch(e => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId, routingId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 p-8 text-lp-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading advance…
    </div>
  );

  if (error || !pageData) return (
    <div className="p-8 text-red-500 text-sm">Failed to load: {error}</div>
  );

  const { routing, tour, advance } = pageData;
  const sections = advance?.sections ?? [];
  const data = advance?.data ?? {};
  const sectionStatuses = advance?.section_statuses ?? {};
  const flags = advance?.flags ?? [];

  // Extract top-level documents (stored at a special section or data key)
  const topLevelDocs: AdvanceDocument[] = [];

  // Completed vs total sections count
  const completed = sections.filter(s =>
    sectionStatuses[s.template_id]?.status === 'complete'
  ).length;

  const hasNoSections = sections.length === 0;

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="sticky top-0 z-20 border-b border-lp-border/60 bg-lp-bg/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={overviewHref} className="text-[12px] text-lp-text-tertiary hover:text-lp-orange transition-colors shrink-0">
              ← Advance
            </Link>
            <span className="text-lp-border/60">|</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-semibold text-lp-text">{formatDate(routing.date)}</span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', dayTypeClass(routing.day_type))}>
                {dayTypeLabel(routing.day_type)}
              </span>
              {routing.venue_name && (
                <>
                  <span className="text-lp-text-tertiary">—</span>
                  <span className="text-[13px] text-lp-text truncate">{routing.venue_name}</span>
                </>
              )}
              {routing.city && (
                <span className="text-[12px] text-lp-text-tertiary shrink-0">{routing.city}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {sections.length > 0 && (
              <span className="text-[11px] text-lp-text-tertiary">
                {completed}/{sections.length} sections complete
              </span>
            )}
            <Link
              href={editHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-lp-orange px-3 py-1.5 text-[12px] font-medium text-white hover:bg-lp-orange/90 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Advance
            </Link>
          </div>
        </div>

        {/* Venue details sub-row */}
        {(routing.address || routing.venue_phone || routing.venue_website) && (
          <div className="flex items-center gap-4 px-6 pb-2 text-[11px] text-lp-text-tertiary">
            {routing.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {routing.address}
              </span>
            )}
            {routing.venue_phone && (
              <a href={`tel:${routing.venue_phone}`} className="flex items-center gap-1 hover:text-lp-orange">
                <Phone className="h-3 w-3" /> {routing.venue_phone}
              </a>
            )}
            {routing.venue_website && (
              <a href={routing.venue_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-lp-orange">
                <Globe className="h-3 w-3" /> Venue website
              </a>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-4">
        {/* No sections yet */}
        {hasNoSections && (
          <div className="rounded-xl border border-dashed border-lp-border p-8 text-center">
            <p className="text-[13px] text-lp-text-tertiary mb-3">No sections set up for this show yet.</p>
            <Link href={editHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-lp-orange px-4 py-2 text-[13px] font-medium text-white hover:bg-lp-orange/90">
              Set up advance <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Top-level documents */}
        {topLevelDocs.length > 0 && (
          <DocumentsSection docs={topLevelDocs} editHref={editHref} />
        )}

        {/* Section cards */}
        {sections
          .sort((a, b) => a.order - b.order)
          .map(section => (
            <SectionCard
              key={section.template_id}
              section={section}
              sectionData={data[section.template_id] ?? {}}
              status={sectionStatuses[section.template_id]}
              flags={flags.filter(f => f.section_id === section.template_id)}
              editHref={editHref}
              currency={tour.currency}
            />
          ))}

        {/* Last updated */}
        {advance?.last_updated_at && (
          <p className="text-center text-[11px] text-lp-text-tertiary pt-2">
            Last updated {new Date(advance.last_updated_at).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
            {advance.last_updated_by_name && ` by ${advance.last_updated_by_name}`}
          </p>
        )}
      </div>
    </div>
  );
}
