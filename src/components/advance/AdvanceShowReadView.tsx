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

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Pencil, FileText, Phone, Mail, Globe,
  AlertCircle, ChevronRight, ChevronDown,
  Paperclip, User, ExternalLink, Flag,
  Copy, Loader2,
} from 'lucide-react';
import { cn, parseRoutingDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { isMonoFieldType } from './FieldTypeIcon';

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

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
/* Variant parity followup §H.4 — full-row hover fill on dense field rows. */
.advance-field-row:hover { background-color: var(--lp-surface-hover); }
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

/** Read view section status pill-select — Variant parity §C.3.
 *  Inline native <select> styled as a pill. Persists the change via the
 *  existing /api/tours/[id]/advance/[routingId] PATCH path which expects
 *  the FULL section_statuses map; we merge locally + send. On success
 *  the parent's onChanged callback re-fetches.
 *
 *  needs_review keeps a distinct token here (not collapsed to in_progress
 *  like the old static badge) because the user can pick it explicitly. */
function SectionStatusPillSelect({
  status,
  sectionTemplateId,
  tourId,
  routingId,
  allSectionStatuses,
  onChanged,
  disabled,
}: {
  status: SectionStatusKey;
  sectionTemplateId: string;
  tourId: string;
  routingId: string;
  allSectionStatuses: Record<string, { status: string; assigned_to?: string }>;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const colour = STATUS_TOKEN[status];
  const router = useRouter();

  const handleChange = async (next: SectionStatusKey) => {
    if (disabled || next === status) return;
    const merged = {
      ...allSectionStatuses,
      [sectionTemplateId]: {
        ...(allSectionStatuses[sectionTemplateId] ?? {}),
        status: next,
      },
    };
    try {
      const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_statuses: merged }),
      });
      if (!res.ok) {
        // Non-fatal — leave the prior status visible. Could surface a toast
        // here, but the read view doesn't have a toast host wired in.
        return;
      }
      onChanged();
      // Trigger a server-side re-render so the page-level chunky progress
      // strip (AdvanceShowHeader) refreshes its complete/pending/overdue
      // counts. Without this the strip stays at its initial server values
      // even though the section pill below shows the new status — the
      // "0 / 0 / 0" gap Adam's smoke flagged.
      router.refresh();
    } catch {
      // Same — silently fail. Refetch will re-sync if state diverges.
    }
  };

  return (
    <BrandedStatusPillDropdown
      status={status}
      colour={colour}
      onChange={handleChange}
      disabled={disabled}
    />
  );
}

/** Branded pill-shaped trigger + custom dropdown panel. Replaces the
 *  native <select> overlay so the open menu reads as part of the
 *  Lowpass design language (Variant parity followup §H.2). Keyboard
 *  accessible (arrow keys, Enter to commit, Escape to close);
 *  closes on outside click. */
function BrandedStatusPillDropdown({
  status,
  colour,
  onChange,
  disabled,
}: {
  status: SectionStatusKey;
  colour: string;
  onChange: (next: SectionStatusKey) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<SectionStatusKey>(status);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  // Reset highlight to current status whenever the menu opens. Deferred
  // to a microtask so the setState doesn't fire synchronously within the
  // effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (open) {
      queueMicrotask(() => setHighlighted(status));
    }
  }, [open, status]);

  const options: SectionStatusKey[] = [
    'not_started',
    'in_progress',
    'complete',
    'needs_review',
  ];

  function commit(next: SectionStatusKey) {
    setOpen(false);
    onChange(next);
  }

  return (
    <span
      ref={wrapperRef}
      className="advance-read-no-print relative inline-flex"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex items-center gap-1.5"
        style={{
          background: `color-mix(in srgb, ${colour} 12%, transparent)`,
          color: colour,
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          borderRadius: 9999,
          padding: '2px 8px',
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: colour }}
        />
        <span>{STATUS_LABEL[status]}</span>
        <ChevronDown
          className="h-3 w-3 shrink-0"
          aria-hidden
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 200ms ease-out',
          }}
        />
      </button>
      {open && !disabled ? (
        <ul
          role="listbox"
          aria-label="Section status options"
          className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden"
          style={{
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 4,
            padding: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlighted((cur) => {
                const idx = options.indexOf(cur);
                return options[Math.min(options.length - 1, idx + 1)];
              });
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlighted((cur) => {
                const idx = options.indexOf(cur);
                return options[Math.max(0, idx - 1)];
              });
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit(highlighted);
            }
          }}
          tabIndex={-1}
        >
          {options.map((opt) => {
            const optColour = STATUS_TOKEN[opt];
            const active = opt === highlighted;
            const selected = opt === status;
            return (
              <li key={opt}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHighlighted(opt)}
                  onClick={() => commit(opt)}
                  className="flex w-full items-center gap-2"
                  style={{
                    padding: '6px 10px',
                    background: active
                      ? 'var(--lp-surface-hover)'
                      : 'transparent',
                    border: 'none',
                    borderRadius: 2,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: optColour,
                    textAlign: 'left',
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: optColour }}
                  />
                  <span>{STATUS_LABEL[opt]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
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
  allSectionStatuses,
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
  allSectionStatuses: Record<string, SectionStatus>;
  flags: AdvanceFlag[];
  editHref: string;
  tourId: string;
  routingId: string;
  fullData: Record<string, Record<string, unknown> | undefined>;
  allowCopy: boolean;
  onCopied: () => void;
}) {
  const statusKey = (status?.status ?? 'not_started') as SectionStatusKey;
  const [collapsed, setCollapsed] = useState(false);

  // Filter to fields that have actual values for the rendered table.
  const filledFields = section.fields.filter(f => !isBlank(sectionData[f.id]));
  const fileFields = filledFields.filter(f => f.type === 'file');
  const contactFields = filledFields.filter(f => f.type === 'contact');
  const otherFields = filledFields.filter(f => f.type !== 'file' && f.type !== 'contact');

  // Done-count badge / mini-progress-bar denominators are based on the
  // full template field count, not just non-blank ones — that's the
  // honest "X / Y" for the user (filled vs total fields in this section).
  const totalFieldCount = section.fields.length;
  const filledCount = filledFields.length;
  const pct = totalFieldCount > 0 ? Math.round((filledCount / totalFieldCount) * 100) : 0;

  const activeFlags = flags.filter(f => !f.resolved);
  const isEmpty = filledFields.length === 0;

  // UX22 §7.1 — empty section + no flags → thin "copy from previous show" CTA.
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

  const anchorId = sectionAnchorId(section.label);

  return (
    <section
      id={anchorId}
      data-section-template-id={section.template_id}
      className="scroll-mt-32 overflow-hidden rounded-md border"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      {/* Section header strip — Variant parity §C.1.
          Drag handle (muted in read mode, no DnD here), uppercase title,
          mini-progress, X/Y badge, status pill-select, caret. */}
      <div
        className="flex items-center gap-3 border-b"
        style={{
          borderColor: 'var(--lp-border-subtle)',
          background: 'var(--lp-panel)',
          padding: '8px 12px',
        }}
      >
        {/* Drag handle is hidden in read mode — section reorder is a
            builder-mode operation. Adam's smoke (Variant parity followup
            §G.2) flagged the disabled handle as confusing. The handle
            still renders in builder mode where reorder is functional. */}
        <h2
          className="min-w-0 truncate"
          style={{
            color: 'var(--lp-text)',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {section.label}
        </h2>
        {/* Mini-progress bar */}
        <div
          aria-hidden
          className="shrink-0 overflow-hidden rounded-full"
          style={{
            width: 60,
            height: 4,
            background: 'var(--lp-border-subtle)',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--color-lp-orange)',
              transition: 'width 200ms var(--lp-ease-standard, ease)',
            }}
          />
        </div>
        {/* X / Y done-count badge */}
        <span
          className="lp-mono shrink-0"
          style={{
            fontSize: '11px',
            background: 'var(--lp-bg-deep)',
            color: 'var(--lp-text-secondary)',
            padding: '2px 6px',
            borderRadius: 'var(--border-radius-md, 4px)',
          }}
        >
          {filledCount} / {totalFieldCount}
        </span>
        {activeFlags.length > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              fontSize: '11px',
              fontWeight: 500,
              background: 'color-mix(in srgb, var(--color-lp-day-tv) 15%, transparent)',
              color: 'var(--color-lp-day-tv)',
            }}
          >
            <Flag className="h-2.5 w-2.5" />
            {activeFlags.length} {activeFlags.length === 1 ? 'flag' : 'flags'}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SectionStatusPillSelect
            status={statusKey}
            sectionTemplateId={section.template_id}
            tourId={tourId}
            routingId={routingId}
            allSectionStatuses={allSectionStatuses}
            onChanged={onCopied}
            disabled={!allowCopy}
          />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand section' : 'Collapse section'}
            className="advance-read-no-print btn-transition inline-flex h-6 w-6 items-center justify-center rounded"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            <ChevronDown
              className="h-4 w-4"
              style={{
                transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
                transition: 'transform 200ms ease-out',
              }}
            />
          </button>
        </div>
      </div>

      {/* Flags — always visible regardless of collapse so blockers don't hide. */}
      {activeFlags.map(flag => (
        <div
          key={flag.id}
          className={cn(
            'flex items-start gap-2 border-b text-[12px]',
            flag.type === 'blocker' ? 'bg-red-500/10 text-red-400' :
            flag.type === 'issue' ? 'bg-amber-500/10 text-amber-400' :
            'bg-blue-500/10 text-blue-400',
          )}
          style={{
            borderColor: 'var(--lp-border-subtle)',
            padding: '8px 12px',
          }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{flag.message}</span>
        </div>
      ))}

      {/* Smooth collapse animation via grid-template-rows trick: animates
          between 1fr (open) and 0fr (closed) cleanly without measuring
          content height. Inner div needs overflow:hidden + min-height:0. */}
      {(otherFields.length > 0 || contactFields.length > 0 || fileFields.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            transition: 'grid-template-rows 200ms ease-out',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {/* Dense field rows — Variant parity §C.2.
              4-col grid: type-icon | label | value | meta.
              Per-field assignee + due-date + status pills are not in the
              data model (only per-section status_statuses exists), so the
              meta column is left for future per-field metadata; the row
              hover surface stays uniform. */}
          {otherFields.map((field, i) => {
            const val = sectionData[field.id];
            const isLong =
              field.type === 'textarea' || String(val ?? '').length > 60;
            const useMono = isMonoFieldType(field.type);
            const isLast =
              i === otherFields.length - 1 &&
              contactFields.length === 0 &&
              fileFields.length === 0;
            return (
              <div
                key={field.id}
                className="advance-field-row group"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isLong
                    ? '1fr'
                    : 'minmax(0, 2fr) minmax(0, 5fr)',
                  gap: 0,
                  borderBottom: isLast
                    ? 'none'
                    : '1px solid var(--lp-border-subtle)',
                  alignItems: isLong ? 'start' : 'stretch',
                  transition: 'background-color 120ms ease',
                }}
              >
                {isLong ? (
                  <div
                    className="min-w-0"
                    style={{ padding: '8px 12px' }}
                  >
                    <div
                      className="lp-row-label"
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--lp-text)',
                        marginBottom: 4,
                      }}
                    >
                      {field.label}
                      {field.required ? (
                        <span style={{ color: 'var(--color-lp-error)', marginLeft: 4 }}>
                          *
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={cn(useMono && 'lp-mono')}
                      style={{
                        fontSize: '14px',
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      <FieldValue field={field} value={val} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="lp-row-label min-w-0 truncate"
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--lp-text)',
                        padding: '8px 12px',
                        background: 'var(--lp-bg-deep)',
                        borderRight: '1px solid var(--lp-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <span className="truncate">
                        {field.label}
                        {field.required ? (
                          <span style={{ color: 'var(--color-lp-error)', marginLeft: 4 }}>
                            *
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div
                      className={cn('min-w-0', useMono && 'lp-mono')}
                      style={{
                        fontSize: '14px',
                        color: 'var(--lp-text)',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <FieldValue field={field} value={val} />
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Contacts — full-width rows since contact data spans wide. */}
          {contactFields.length > 0 && (
            <div
              style={{
                borderTop:
                  otherFields.length > 0
                    ? '1px solid var(--lp-border-subtle)'
                    : 'none',
                padding: '8px 12px',
              }}
            >
              {contactFields.map((field) => (
                <div key={field.id} className="mb-3 last:mb-0">
                  <span
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--lp-text-tertiary)',
                      marginBottom: 6,
                    }}
                  >
                    {field.label}
                  </span>
                  <FieldValue field={field} value={sectionData[field.id]} />
                </div>
              ))}
            </div>
          )}

          {/* Files (Documents) — bottom strip. */}
          {fileFields.length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--lp-border-subtle)',
                padding: '8px 12px',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--lp-text-tertiary)',
                  marginBottom: 6,
                }}
              >
                Documents
              </span>
              {fileFields.map((field) => (
                <FieldValue
                  key={field.id}
                  field={field}
                  value={sectionData[field.id]}
                />
              ))}
            </div>
          )}
          </div>
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
          <span
            className="inline-flex items-center gap-1.5"
            style={{
              background: `color-mix(in srgb, ${STATUS_TOKEN.not_started} 12%, transparent)`,
              color: STATUS_TOKEN.not_started,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderRadius: 9999,
              padding: '2px 8px',
            }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: STATUS_TOKEN.not_started }}
            />
            {STATUS_LABEL.not_started}
          </span>
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
              <span className="text-[11px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
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
                            className="text-[11px] font-semibold uppercase tracking-wider"
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
            {doc?.size && <span className="text-lp-text-tertiary shrink-0 text-[11px]">{formatFileSize(doc.size)}</span>}
            <ExternalLink className="h-3 w-3 shrink-0 ml-auto text-lp-text-tertiary group-hover:text-lp-orange" />
          </a>
        ))}
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
      <div
        className="p-8 text-sm"
        style={{ color: 'var(--color-lp-error)' }}
      >
        Failed to load: {error}
      </div>
    );
  }

  return (
    <div className={`advance-read-view space-y-0${publicReadOnly ? ' is-public-readonly' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_HIDE_CSS }} />

      {/* Variant parity §F — page-level "← Advance | Print | Edit advance"
          toolbar removed. Print moved to AdvanceSubHeader actions. The
          back link is replaced by the global ProductHeader breadcrumb;
          the "Edit advance" button is replaced by the Show / Template
          Builder tab toggle in AdvanceSubHeader. */}

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
          allSectionStatuses={sectionStatuses}
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
