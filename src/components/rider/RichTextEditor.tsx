'use client';

/* ============================================
   LOWPASS — <RichTextEditor> (Sprint 12 §9a)

   Tiptap-backed rich text editor for rider sections of
   section_type='rich_text'. Constrained block set per the §9
   spec — Adam said riders are scanned, so structure (heading
   + bullet) carries the weight, not inline emphasis:

     - paragraph    (default body)
     - heading      level 2 and level 3 only (h1 is reserved
                    for the rider title; h2 = section like
                    "Schedule", h3 = sub-section)
     - bulletList   + listItem

   No inline marks. No bold/italic/code/links. The toolbar
   surfaces three buttons (H2, H3, Bullet List) and a
   character count for orientation.

   Data shape — Tiptap's default JSON output stored on
   rider_sections.metadata.content. Read at mount, written via
   debounced PATCH from the parent editor.

   Variable substitution (Sprint 12 §9c) layers on top of this
   in a follow-up commit — typing `{` will open an autocomplete
   menu. Out of scope for §9a; the editor body stays
   substitution-naive for now.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Heading2, Heading3, List } from 'lucide-react';
import { VariableNode } from './VariableNode';
import { VariableAutocomplete } from './VariableAutocomplete';

export interface RichTextEditorProps {
  /** Tiptap document JSON. Pass null/undefined for an empty
   *  editor. The editor takes the value as initial content
   *  only — subsequent updates flow through onChange. */
  value: object | null | undefined;
  onChange: (doc: object) => void;
  placeholder?: string;
  /** Disables typing + toolbar. Used for the inherited-from-
   *  parent-scope state. */
  disabled?: boolean;
  /** Sprint 12 §9c1.b — pack scope drives the variable
   *  autocomplete filter. Artist-scope packs hide tour +
   *  contact variables from suggestions; tour/show-scope
   *  packs see the full registry. Optional — when omitted,
   *  the autocomplete renders the full list (tour scope
   *  treated as default). */
  packScope?: 'artist' | 'tour' | 'show';
  /** Sprint 12 §9c2 — resolved variable values for the pack
   *  this editor sits inside. The VariableNode's double-click
   *  handler reads from this map to compute the literal text
   *  that replaces the chip when the operator override-breaks.
   *  Passed through to Tiptap's storage on mount + on change. */
  variableMap?: Record<string, string>;
}

/* Sprint 12 §9c1.b — autocomplete state shape. `triggerPos` is
   the Tiptap document position immediately AFTER the `{`
   character that opened the autocomplete; the editor's
   onUpdate handler reads document text between triggerPos and
   the current selection.from to compute the live query. */
interface AutocompleteState {
  triggerPos: number;
  query: string;
  anchor: { top: number; left: number; lineHeight: number } | null;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing…',
  disabled = false,
  packScope = 'tour',
  variableMap,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /* Sprint 12 §9c1.b — autocomplete state. Lives in the
     parent because the popover must position itself relative
     to the editor's caret coords (resolved on each query
     change via editor.view.coordsAtPos). */
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);

  const editor = useEditor({
    /* Tiptap v3 — set immediatelyRender:false so Next.js's
       SSR pass doesn't try to instantiate the editor on the
       server (Tiptap's view layer is DOM-only). */
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        /* Disable the marks/nodes we don't want — leaves only
           paragraph, heading (configured below), bulletList,
           listItem, document, text, hardBreak. */
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        orderedList: false,
        link: false,
        underline: false,
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder,
      }),
      /* Sprint 12 §9c1.b — atomic inline variable node. */
      VariableNode,
    ],
    content: value ?? '',
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(ed.getJSON());
      /* If the autocomplete is open, recompute the live query
         from the text between the trigger position and the
         current selection. If the cursor moved before the
         trigger or text was deleted past the `{`, close. */
      setAutocomplete((cur) => {
        if (!cur) return cur;
        const { from } = ed.state.selection;
        if (from < cur.triggerPos) return null;
        const queryRaw = ed.state.doc.textBetween(cur.triggerPos, from, '', '');
        /* Bail out of the autocomplete when the query
           contains whitespace or punctuation that wouldn't
           appear in a variable token. Brackets, dots, and
           letters are valid. */
        if (/[\s,]/.test(queryRaw)) return null;
        return { ...cur, query: queryRaw };
      });
    },
    editorProps: {
      handleKeyDown(view, event) {
        if (disabled) return false;
        if (event.key === '{') {
          /* Defer the open one tick so the `{` lands in the
             doc first; that way the trigger position points
             at the character JUST AFTER the brace, which is
             where typing accumulates the query. */
          const pos = view.state.selection.from + 1;
          requestAnimationFrame(() => {
            const coords = view.coordsAtPos(pos);
            setAutocomplete({
              triggerPos: pos,
              query: '',
              anchor: {
                top: coords.top,
                left: coords.left,
                lineHeight: coords.bottom - coords.top,
              },
            });
          });
        }
        return false;
      },
    },
  });

  /* If the parent's `disabled` flag flips after mount, update
     the Tiptap editor's editable state to match. */
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  /* Sprint 12 §9c2 — push the variable map into Tiptap
     storage whenever the parent's fetched values change. The
     VariableNode NodeView reads from editor.storage to
     compute the override-break replacement text.

     Tiptap's storage API is designed to be mutated in place
     (see https://tiptap.dev/docs/editor/extensions/custom-extensions/extension-storage) —
     the editor instance is a stateful object, not a
     React-managed value. React Compiler's immutability rule
     doesn't model that exception, so we disable it on the
     specific mutation line with the rationale captured here. */
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage as { variableNode?: { resolvedMap: Record<string, string> } };
    if (storage.variableNode) {
      // eslint-disable-next-line react-hooks/immutability -- Tiptap storage is an intentionally mutable per-extension state bag
      storage.variableNode.resolvedMap = variableMap ?? {};
    }
  }, [editor, variableMap]);

  if (!editor) {
    /* SSR / pre-hydration placeholder. Renders the same chrome
       as the active editor so layout doesn't shift on mount. */
    return (
      <div
        style={{
          minHeight: 220,
          padding: 'var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-tertiary)',
          fontStyle: 'italic',
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-md)',
          background: 'var(--lp-bg)',
        }}
      >
        Loading editor…
      </div>
    );
  }

  /* Toolbar buttons reflect the active state of the current
     selection so the operator sees what they're inside. */
  const isH2 = editor.isActive('heading', { level: 2 });
  const isH3 = editor.isActive('heading', { level: 3 });
  const isList = editor.isActive('bulletList');

  return (
    <div
      style={{
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-md)',
        background: 'var(--lp-bg)',
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap: 'var(--lp-space-1)',
          padding: 'var(--lp-space-1) var(--lp-space-2)',
          borderBottom: '1px solid var(--lp-border-light)',
          background: 'var(--lp-panel)',
        }}
      >
        <ToolbarButton
          active={isH2}
          disabled={disabled}
          ariaLabel="Heading 2"
          title="Heading 2 (section)"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={isH3}
          disabled={disabled}
          ariaLabel="Heading 3"
          title="Heading 3 (sub-section)"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>
        <span
          aria-hidden
          style={{ width: 1, height: 16, background: 'var(--lp-border)' }}
        />
        <ToolbarButton
          active={isList}
          disabled={disabled}
          ariaLabel="Bullet list"
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <span
          className="ml-auto text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          {editor.storage.characterCount?.characters?.() ??
            editor.getText().length}{' '}
          chars
        </span>
      </div>
      <EditorContent
        editor={editor}
        className="lp-richtext"
        style={{
          minHeight: 220,
          padding: 'var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
          lineHeight: 1.55,
        }}
      />
      {/* Sprint 12 §9c1.b — variable autocomplete. Renders as
          a fixed-position popover anchored at the `{` coords.
          On pick: replace the trigger range (the `{` + typed
          query) with a VariableNode. On close: leave the
          typed text intact so the operator can backspace
          manually if they decide not to use a variable. */}
      <VariableAutocomplete
        anchor={autocomplete?.anchor ?? null}
        query={autocomplete?.query ?? ''}
        packScope={packScope}
        onPick={(token) => {
          if (!editor || !autocomplete) return;
          /* Replace `{` + query text with the variable node.
             triggerPos is the position AFTER the `{`, so the
             range to remove is [triggerPos - 1, triggerPos + query.length]. */
          const from = autocomplete.triggerPos - 1;
          const to = autocomplete.triggerPos + autocomplete.query.length;
          const bare = token.startsWith('{') ? token.slice(1, -1) : token;
          editor
            .chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent({
              type: 'variableNode',
              attrs: { token: bare },
            })
            .run();
          setAutocomplete(null);
        }}
        onClose={() => setAutocomplete(null)}
      />
      {/* Inline-styles can't reach the ProseMirror content's
          headings + paragraphs + lists because those render
          inside an inner div. A small scoped <style> block
          applies the token-clean defaults the editor surface
          needs. */}
      <style>{`
        .lp-richtext .ProseMirror {
          outline: none;
          min-height: 200px;
        }
        .lp-richtext .ProseMirror p {
          margin: 0 0 0.6em 0;
        }
        .lp-richtext .ProseMirror h2 {
          margin: 0.8em 0 0.3em 0;
          font-size: var(--lp-text-lg);
          font-weight: var(--lp-weight-semibold);
          color: var(--lp-text);
          letter-spacing: -0.01em;
        }
        .lp-richtext .ProseMirror h3 {
          margin: 0.6em 0 0.25em 0;
          font-size: var(--lp-text-base);
          font-weight: var(--lp-weight-semibold);
          color: var(--lp-text);
        }
        .lp-richtext .ProseMirror ul {
          margin: 0.3em 0 0.6em 1.4em;
          padding: 0;
          list-style: disc;
        }
        .lp-richtext .ProseMirror li {
          margin: 0.15em 0;
        }
        .lp-richtext .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--lp-text-tertiary);
          font-style: italic;
          pointer-events: none;
          float: left;
          height: 0;
        }
      `}</style>
    </div>
  );
}

interface ToolbarButtonProps {
  active: boolean;
  disabled: boolean;
  ariaLabel: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({
  active,
  disabled,
  ariaLabel,
  title,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title}
      className="btn-transition inline-flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 'var(--lp-radius-sm)',
        color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
        background: active
          ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
          : 'transparent',
        border: '1px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
