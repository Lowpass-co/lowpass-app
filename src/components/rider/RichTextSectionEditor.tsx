'use client';

/* ============================================
   LOWPASS — <RichTextSectionEditor> (Sprint 12 §9a)

   Section-level chrome wrapping <RichTextEditor> for
   section_type='rich_text' sections inside PackEditor. Shape
   mirrors the existing SectionEditor chrome (title input,
   save pill, override / remove / move buttons) but the body
   is the Tiptap editor reading/writing
   rider_sections.metadata.content.

   This is its own component (not inlined in PackEditor)
   because §9b (cover page + TOC) and §9c (variable
   substitution) will iterate on the rich-text body and the
   chrome shouldn't be in the way.
   ============================================ */

import { useEffect, useState } from 'react';
import { SaveStatePill, type SavePillState } from '@/components/rider-pack/SaveStatePill';
import type { ResolvedSection } from '@/lib/rider-packs/types';
import { RichTextEditor } from './RichTextEditor';

interface RichTextSectionEditorProps {
  section: ResolvedSection;
  /** Sprint 12 §9c1.b — pack scope drives the variable
   *  autocomplete filter inside the rich-text body. */
  packScope: 'artist' | 'tour' | 'show';
  savePill: { state: SavePillState; error: string | null };
  onTitleCommit: (title: string) => void;
  onContentChange: (content: object) => void;
  onRemove: () => void;
  onOverride: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function RichTextSectionEditor({
  section,
  packScope,
  savePill,
  onTitleCommit,
  onContentChange,
  onRemove,
  onOverride,
  onMoveUp,
  onMoveDown,
}: RichTextSectionEditorProps) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync title draft when the server-side section row changes externally
    setTitleDraft(section.title);
  }, [section.title]);

  const inherited = !!section.inherited_from;
  const meta = (section.metadata ?? {}) as { content?: object };
  const initialContent = meta.content ?? null;

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
        className="p-4"
        style={{ background: 'var(--lp-bg)' }}
      >
        <RichTextEditor
          /* Remount the editor when the section id changes so a
             fresh Tiptap instance picks up the new initial
             content; Tiptap doesn't reactively swap docs on
             prop change. */
          key={section.id}
          value={initialContent}
          onChange={onContentChange}
          disabled={inherited}
          placeholder="Start typing the section body…"
          packScope={packScope}
        />
      </div>
    </div>
  );
}
