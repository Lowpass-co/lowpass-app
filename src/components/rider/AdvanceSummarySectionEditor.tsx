'use client';

/* ============================================
   LOWPASS — <AdvanceSummarySectionEditor> (Sprint 12 §9d.a)

   Section editor for section_type='advance_summary' — Adam's
   9-line at-a-glance summary the promoter scans in 30 seconds.
   Each row is `{ subject, body }`: subject names the topic
   (e.g. "Schedule"), body carries one clear line summarising
   the rider's content for that topic.

   Storage: section.metadata.summary = Array<{subject, body}>
   on the rider_sections row (column added in migration 100).

   §9d.a scope (this commit):
     - Render the 9 default rows on first open if metadata is
       empty
     - Add / remove rows inline
     - Edit subject + body via plain text inputs
     - Save through the parent's debounced metadata patch
       (same channel as the rich_text body)
     - Placeholder "Generate from rider content" button is
       rendered but DISABLED with copy "AI generate coming
       soon" — §9d.b wires it to the Claude API.

   §9d.b: AI generate via POST /api/rider-packs/[id]/advance-summary/generate
   §9d.c: drag-reorder via dnd-kit (optional polish)
   ============================================ */

import { useEffect, useState } from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { SaveStatePill, type SavePillState } from '@/components/rider-pack/SaveStatePill';
import type { ResolvedSection } from '@/lib/rider-packs/types';

export interface AdvanceSummaryRow {
  subject: string;
  body: string;
}

/** Default 9 rows seeded on first open per the §9 spec.
 *  Operators can rename / add / remove freely after the seed
 *  lands — the array is just persisted state. */
export const DEFAULT_SUMMARY_ROWS: ReadonlyArray<AdvanceSummaryRow> = [
  { subject: 'Schedule', body: '' },
  { subject: 'Transport', body: '' },
  { subject: 'Dressing Rooms', body: '' },
  { subject: 'Merch', body: '' },
  { subject: 'Towels', body: '' },
  { subject: 'Labour', body: '' },
  { subject: 'Security', body: '' },
  { subject: 'Power', body: '' },
  { subject: 'Audio', body: '' },
];

interface AdvanceSummarySectionEditorProps {
  section: ResolvedSection;
  savePill: { state: SavePillState; error: string | null };
  onTitleCommit: (title: string) => void;
  onSummaryChange: (rows: AdvanceSummaryRow[]) => void;
  onRemove: () => void;
  onOverride: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function parseSummary(metadata: ResolvedSection['metadata']): AdvanceSummaryRow[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const summary = (metadata as { summary?: unknown }).summary;
  if (!Array.isArray(summary)) return [];
  return summary
    .map((row): AdvanceSummaryRow | null => {
      if (!row || typeof row !== 'object') return null;
      const r = row as { subject?: unknown; body?: unknown };
      const subject = typeof r.subject === 'string' ? r.subject : '';
      const body = typeof r.body === 'string' ? r.body : '';
      return { subject, body };
    })
    .filter((r): r is AdvanceSummaryRow => r !== null);
}

export function AdvanceSummarySectionEditor({
  section,
  savePill,
  onTitleCommit,
  onSummaryChange,
  onRemove,
  onOverride,
  onMoveUp,
  onMoveDown,
}: AdvanceSummarySectionEditorProps) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  const inherited = !!section.inherited_from;

  /* Compute initial rows: seed defaults on first open when
     metadata is empty. The seed persists on first edit (any
     row mutation triggers onSummaryChange). */
  const stored = parseSummary(section.metadata);
  const [rows, setRows] = useState<AdvanceSummaryRow[]>(
    stored.length > 0 ? stored : [...DEFAULT_SUMMARY_ROWS],
  );
  useEffect(() => {
    /* When the server-side section changes (e.g. switching
       between sections in the editor), reset local rows. */
    setRows(stored.length > 0 ? stored : [...DEFAULT_SUMMARY_ROWS]);
    /* stored is recomputed every render but only its
       contents matter; depend on the section.id to refresh
       on entity switch. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  const commit = (next: AdvanceSummaryRow[]) => {
    setRows(next);
    onSummaryChange(next);
  };

  const updateRow = (i: number, patch: Partial<AdvanceSummaryRow>) => {
    commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    commit([...rows, { subject: '', body: '' }]);
  };

  const removeRow = (i: number) => {
    commit(rows.filter((_, idx) => idx !== i));
  };

  return (
    <div
      className="mx-auto max-w-3xl overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft !== section.title && !inherited) onTitleCommit(titleDraft);
            }}
            disabled={inherited}
            className="min-w-0 max-w-md flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-lp-text outline-none focus:border-lp-border disabled:text-lp-text-tertiary"
            placeholder="Section title"
          />
          <SaveStatePill state={savePill.state} error={savePill.error} />
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <button
            type="button"
            onClick={onMoveUp}
            className="rounded border border-lp-border px-2 py-1 hover:bg-lp-surface-hover"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="rounded border border-lp-border px-2 py-1 hover:bg-lp-surface-hover"
          >
            ↓
          </button>
          {inherited ? (
            <button
              type="button"
              onClick={onOverride}
              className="rounded bg-[var(--color-lp-orange)] px-2 py-1 text-white hover:opacity-90"
            >
              Override
            </button>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-lp-border px-2 py-1 text-lp-error hover:opacity-90"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {inherited && (
        <div
          className="border-b px-4 py-2 text-xs text-lp-text-secondary"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          Inherited from {section.inherited_from}. Override to edit here.
        </div>
      )}

      <div
        className={inherited ? 'pointer-events-none opacity-60' : ''}
        style={{ padding: 'var(--lp-space-4)', background: 'var(--lp-bg)' }}
      >
        {/* Generate-from-rider-content button. v1 placeholder
            — §9d.b wires the Claude endpoint. */}
        <div
          className="flex items-center justify-between"
          style={{ gap: 'var(--lp-space-2)', marginBottom: 'var(--lp-space-3)' }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            One scannable line per topic. Promoters read this first.
          </p>
          <button
            type="button"
            disabled
            title="AI generate lands in §9d.b — wires this to the Claude API."
            className="btn-transition inline-flex items-center"
            style={{
              gap: 6,
              padding: 'var(--lp-space-1) var(--lp-space-3)',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text-tertiary)',
              background: 'transparent',
              border: '1px solid var(--lp-border)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'not-allowed',
              opacity: 0.7,
            }}
          >
            <Sparkles size={12} />
            Generate from rider content
          </button>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              padding: 'var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-tertiary)',
              fontStyle: 'italic',
              textAlign: 'center',
              border: '1px dashed var(--lp-border)',
              borderRadius: 'var(--lp-radius-md)',
            }}
          >
            No summary rows. Add one to get started.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row, i) => (
              <li
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(7rem, 8rem) minmax(0, 1fr) auto',
                  alignItems: 'start',
                  gap: 'var(--lp-space-2)',
                  padding: 'var(--lp-space-2) 0',
                  borderBottom:
                    i < rows.length - 1 ? '1px solid var(--lp-border-subtle)' : 'none',
                }}
              >
                <input
                  type="text"
                  value={row.subject}
                  onChange={(e) => updateRow(i, { subject: e.target.value })}
                  placeholder="Subject"
                  style={{
                    width: '100%',
                    padding: 'var(--lp-space-1) var(--lp-space-2)',
                    fontSize: 'var(--lp-text-sm)',
                    fontWeight: 'var(--lp-weight-semibold)',
                    color: 'var(--lp-text)',
                    background: 'var(--lp-surface)',
                    border: '1px solid var(--lp-border)',
                    borderRadius: 'var(--lp-radius-sm)',
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  value={row.body}
                  onChange={(e) => updateRow(i, { body: e.target.value })}
                  placeholder="One scannable line for this topic."
                  style={{
                    width: '100%',
                    padding: 'var(--lp-space-1) var(--lp-space-2)',
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    background: 'var(--lp-surface)',
                    border: '1px solid var(--lp-border)',
                    borderRadius: 'var(--lp-radius-sm)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove ${row.subject || 'row'}`}
                  className="btn-transition"
                  style={{
                    padding: 'var(--lp-space-1)',
                    color: 'var(--lp-text-tertiary)',
                    background: 'transparent',
                    border: '1px solid var(--lp-border)',
                    borderRadius: 'var(--lp-radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={addRow}
          className="btn-transition inline-flex items-center"
          style={{
            marginTop: 'var(--lp-space-3)',
            gap: 6,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text-secondary)',
            background: 'transparent',
            border: '1px dashed var(--lp-border)',
            borderRadius: 'var(--lp-radius-md)',
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          Add row
        </button>
      </div>
    </div>
  );
}
