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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

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

function sectionsForKeyInfoExtraction(sections: SectionDef[]): SectionDef[] {
  return sections.filter((s) => !s.label.toLowerCase().includes('settlement'));
}

type HotelKeyInfo = { name?: string; address?: string; checkIn?: string; checkOut?: string; notes?: string };
type KeyContactCard = { name: string; role: string; phone?: string; email?: string };

function normalizeContactRows(value: unknown): ContactRow[] {
  if (value == null) return [];
  if (Array.isArray(value)) return (value as ContactRow[]).filter(Boolean);
  return [value as ContactRow];
}

function extractHotelKeyInfo(
  sections: SectionDef[],
  data: Record<string, Record<string, unknown>>
): HotelKeyInfo | null {
  const pool = sectionsForKeyInfoExtraction(sections);
  const hotelSection = pool.find((s) => {
    const l = s.label.toLowerCase();
    return l.includes('hotel') || l.includes('accommodation');
  });
  if (!hotelSection) return null;
  const secData = data[hotelSection.template_id] ?? {};
  const out: HotelKeyInfo = {};
  const noteParts: string[] = [];
  for (const f of hotelSection.fields) {
    const lab = f.label.toLowerCase();
    const v = secData[f.id];
    if (isBlank(v)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) continue;
    const str = String(v).trim();
    if (!str) continue;
    if (lab.includes('hotel name') || lab.includes('property name')) out.name = str;
    else if (lab.includes('address')) out.address = str;
    else if (lab.includes('check in') || lab.includes('check-in')) out.checkIn = str;
    else if (lab.includes('check out') || lab.includes('check-out')) out.checkOut = str;
    else if (lab.includes('notes') || lab.includes('parking')) noteParts.push(str);
  }
  if (noteParts.length) out.notes = noteParts.join('\n\n');
  if (!out.name && !out.address && !out.checkIn && !out.checkOut && !out.notes) return null;
  return out;
}

function contactMatchPriority(roleLower: string): number {
  if (roleLower.includes('promoter')) return 0;
  if (roleLower.includes('venue') || roleLower.includes('production')) return 1;
  if (roleLower.includes('tour manager') || /\btm\b/i.test(roleLower)) return 2;
  return 99;
}

function extractKeyContacts(
  sections: SectionDef[],
  data: Record<string, Record<string, unknown>>
): KeyContactCard[] {
  const pool = sectionsForKeyInfoExtraction(sections);
  const out: KeyContactCard[] = [];
  const seen = new Set<string>();
  for (const section of pool) {
    for (const field of section.fields) {
      if (field.type !== 'contact') continue;
      const rows = normalizeContactRows(data[section.template_id]?.[field.id]);
      for (const c of rows) {
        if (!c || (!c.first_name && !c.last_name)) continue;
        const roleLower = (c.role ?? '').toLowerCase();
        const match =
          roleLower.includes('promoter') ||
          roleLower.includes('venue') ||
          roleLower.includes('production') ||
          roleLower.includes('tour manager') ||
          /\btm\b/i.test(roleLower);
        if (!match) continue;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
        if (!name) continue;
        const key = `${name.toLowerCase()}|${(c.email ?? '').toLowerCase()}|${(c.phone ?? '').trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name,
          role: (c.role ?? '').trim() || 'Contact',
          phone: c.phone?.trim() || undefined,
          email: c.email?.trim() || undefined,
        });
      }
    }
  }
  out.sort((a, b) => {
    const pa = contactMatchPriority(a.role.toLowerCase());
    const pb = contactMatchPriority(b.role.toLowerCase());
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function KeyInfoBlock({ hotel, contacts }: { hotel: HotelKeyInfo | null; contacts: KeyContactCard[] }) {
  if (!hotel && contacts.length === 0) return null;
  return (
    <div className="mb-1">
      <p className="lp-label-caps mb-2 text-lp-text-tertiary">Key Info</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hotel && (
          <div className="rounded-lg border border-lp-border bg-lp-surface p-5">
            <h3 className="mb-3 text-[12px] font-semibold text-lp-text">Hotel</h3>
            <dl className="space-y-2 text-[13px]">
              {hotel.name && (
                <div>
                  <dt className="lp-label-caps text-lp-text-tertiary">Name</dt>
                  <dd className="text-lp-text">{hotel.name}</dd>
                </div>
              )}
              {hotel.address && (
                <div>
                  <dt className="lp-label-caps text-lp-text-tertiary">Address</dt>
                  <dd className="text-lp-text whitespace-pre-line">{hotel.address}</dd>
                </div>
              )}
              {(hotel.checkIn || hotel.checkOut) && (
                <div className="flex flex-wrap gap-4">
                  {hotel.checkIn && (
                    <div>
                      <dt className="lp-label-caps text-lp-text-tertiary">Check-in</dt>
                      <dd className="text-lp-text">{hotel.checkIn}</dd>
                    </div>
                  )}
                  {hotel.checkOut && (
                    <div>
                      <dt className="lp-label-caps text-lp-text-tertiary">Check-out</dt>
                      <dd className="text-lp-text">{hotel.checkOut}</dd>
                    </div>
                  )}
                </div>
              )}
              {hotel.notes && (
                <div>
                  <dt className="lp-label-caps text-lp-text-tertiary">Notes</dt>
                  <dd className="text-lp-text whitespace-pre-line text-[12px] leading-relaxed">{hotel.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
        {contacts.length > 0 && (
          <div className="flex flex-col gap-3">
            {contacts.map((c, i) => (
              <div key={`${c.name}-${c.email}-${i}`} className="rounded-lg border border-lp-border bg-lp-surface p-5">
                <p className="text-[13px] font-bold text-lp-text">{c.name}</p>
                <p className="mt-0.5 text-[11px] text-lp-text-tertiary">{c.role}</p>
                <div className="mt-2 flex flex-col gap-1">
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex w-fit items-center gap-1 text-[12px] text-lp-text-secondary hover:text-lp-orange">
                      <Phone className="h-3 w-3 shrink-0" /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex w-fit items-center gap-1 text-[12px] text-lp-text-secondary hover:text-lp-orange">
                      <Mail className="h-3 w-3 shrink-0" /> {c.email}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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

/** Read view: Complete | In Progress | Not started + coloured dot (needs_review → In Progress). */
function SectionReadStatusBadge({ status }: { status: string }) {
  const sk = status as SectionStatusKey;
  const key: 'complete' | 'in_progress' | 'not_started' =
    sk === 'complete' ? 'complete' : sk === 'not_started' ? 'not_started' : 'in_progress';
  const label = key === 'complete' ? 'Complete' : key === 'not_started' ? 'Not started' : 'In Progress';
  const dotColor =
    key === 'complete' ? 'bg-[#22C55E]' : key === 'in_progress' ? 'bg-[#F59E0B]' : 'bg-lp-text-tertiary';
  const textCls =
    key === 'complete' ? 'text-[#22C55E]'
      : key === 'in_progress' ? 'text-[#F59E0B]'
        : 'text-lp-text-tertiary';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', textCls)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColor)} aria-hidden />
      {label}
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
}: {
  section: SectionDef;
  sectionData: Record<string, unknown>;
  status: SectionStatus | undefined;
  flags: AdvanceFlag[];
  editHref: string;
}) {
  const statusKey = (status?.status ?? 'not_started') as SectionStatusKey;

  // Filter to fields that have actual values
  const filledFields = section.fields.filter(f => !isBlank(sectionData[f.id]));
  const fileFields = filledFields.filter(f => f.type === 'file');
  const contactFields = filledFields.filter(f => f.type === 'contact');
  const otherFields = filledFields.filter(f => f.type !== 'file' && f.type !== 'contact');

  const activeFlags = flags.filter(f => !f.resolved);
  const isEmpty = filledFields.length === 0;

  if (isEmpty && activeFlags.length === 0) return null;

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 border-b border-lp-border bg-lp-surface/60 px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="min-w-0 truncate text-lp-text">{section.label}</h2>
          {activeFlags.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-[#EF4444]">
              <Flag className="h-2.5 w-2.5" />
              {activeFlags.length} {activeFlags.length === 1 ? 'flag' : 'flags'}
            </span>
          )}
        </div>
        <div className="advance-read-no-print flex items-center gap-3 shrink-0">
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
            <div className="space-y-2 border-t border-lp-border pt-1">
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

  const editHref = `/tours/${tourId}/advance/${routingId}?mode=edit`;
  const overviewHref = `/tours/${tourId}/advance`;

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
        <AdvanceReadLoadedBody pageData={pageData} editHref={editHref} />
      ) : null}
    </div>
  );
}

function AdvanceReadLoadedBody({ pageData, editHref }: { pageData: PageData; editHref: string }) {
  const { tour, advance } = pageData;
  const sections = advance?.sections ?? [];
  const data = advance?.data ?? {};
  const sectionStatuses = advance?.section_statuses ?? {};
  const flags = advance?.flags ?? [];

  const topLevelDocs: AdvanceDocument[] = [];

  const visibleSections = sections
    .filter(shouldShowSectionInReadView)
    .sort((a, b) => a.order - b.order);

  const hotelKeyInfo = extractHotelKeyInfo(sections, data);
  const keyContacts = extractKeyContacts(sections, data);

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

      {!hasNoSections && <KeyInfoBlock hotel={hotelKeyInfo} contacts={keyContacts} />}

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
