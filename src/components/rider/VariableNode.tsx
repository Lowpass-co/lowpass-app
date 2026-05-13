'use client';

/* ============================================
   LOWPASS — <VariableNode> Tiptap extension (Sprint 12 §9c1.b)

   Atomic inline node that represents a `{variable}` token in
   the editor. Selectable as a single unit; backspace removes
   the whole token; non-editable interior. Renders as a small
   orange-tinted chip with the token text inside.

   Storage shape (Tiptap doc JSON):
     { "type": "variableNode", "attrs": { "token": "artist" } }

   The token stored on attrs.token is the BARE name (no curly
   braces) for cleanliness — the server resolver normalises
   both bare and bracketed forms.

   Pattern derived from Tiptap's documented "Custom Nodes"
   approach + ReactNodeViewRenderer for the chip render. No
   new dep beyond what §9a already pulled in.

   Override-break (§9c2) will subclass / extend this node to
   convert to plain text on double-click; that pass is out of
   scope here.
   ============================================ */

import { useState } from 'react';
import { Node, mergeAttributes, type RawCommands } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { VARIABLE_REGISTRY } from '@/lib/rider-packs/variable-registry';

/* Build a quick lookup for the chip's label. The chip shows
   the registry label rather than the raw token so the editor
   stays human-readable; the saved doc still stores the bare
   token. */
const LABEL_BY_TOKEN: Record<string, string> = Object.fromEntries(
  VARIABLE_REGISTRY.map((v) => [v.token, v.label]),
);

function bracket(token: string): string {
  return token.startsWith('{') ? token : `{${token}}`;
}

interface VariableNodeAttrs {
  token: string;
}

/* Component rendered as the chip in the editor. Tiptap calls
   it via ReactNodeViewRenderer; props.node.attrs carries the
   token string. The NodeView receives `editor` + `getPos` so
   the double-click handler (override-break) can convert the
   chip in-place to a plain text node holding the resolved
   value. */
function VariableChip({ node, editor, getPos }: NodeViewProps) {
  const attrs = node.attrs as VariableNodeAttrs;
  const bracketed = bracket(attrs.token);
  const label = LABEL_BY_TOKEN[bracketed] ?? bracketed;

  /* Sprint 12 §9c2 — converting flash. The chip briefly
     pulses orange when the operator double-clicks to break
     the binding, so the conversion is visible before the
     node replaces with text. The setTimeout chain handles
     the conversion sequencing: set the flash flag, wait
     220ms for the animation to peak, then dispatch the
     replace command. */
  const [converting, setConverting] = useState(false);

  const handleDoubleClick = () => {
    if (converting) return;
    if (typeof getPos !== 'function') return;
    /* Read the resolved map from Tiptap's storage. Empty
       string when the token isn't in the map (e.g.
       tour-scope variable on an artist-scope pack). Adam's
       spec says "convert to plain text containing the
       currently-resolved value" — for unresolved tokens we
       fall back to the bracketed literal so the operator
       gets a sensible static string. */
    const storage = (editor.storage as { variableNode?: { resolvedMap?: Record<string, string> } })
      .variableNode;
    const resolvedMap = storage?.resolvedMap ?? {};
    const literal = resolvedMap[bracketed] ?? bracketed;
    setConverting(true);
    /* Wait one animation cycle then run the replace. The
       getPos call must happen INSIDE the setTimeout so the
       position is current at replace time (the doc may have
       changed underneath us). */
    setTimeout(() => {
      const from = getPos();
      if (typeof from !== 'number') {
        setConverting(false);
        return;
      }
      const to = from + node.nodeSize;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, literal || ' ')
        .run();
    }, 220);
  };

  return (
    <NodeViewWrapper
      as="span"
      className="lp-variable-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 6px',
        margin: '0 1px',
        fontSize: '0.78em',
        fontWeight: 600,
        lineHeight: 1.5,
        color: 'var(--color-lp-orange)',
        background: converting
          ? 'color-mix(in srgb, var(--color-lp-orange) 35%, transparent)'
          : 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
        border: `1px solid color-mix(in srgb, var(--color-lp-orange) ${converting ? '70%' : '35%'}, transparent)`,
        boxShadow: converting
          ? '0 0 0 3px color-mix(in srgb, var(--color-lp-orange) 20%, transparent)'
          : 'none',
        borderRadius: 4,
        verticalAlign: 'baseline',
        cursor: 'pointer',
        userSelect: 'all',
        transition: 'background 200ms ease-out, border-color 200ms ease-out, box-shadow 200ms ease-out',
      }}
      data-token={attrs.token}
      title={`${bracketed} — double-click to convert to static text`}
      onDoubleClick={handleDoubleClick}
    >
      {label}
    </NodeViewWrapper>
  );
}

/* Tiptap commands surface. `insertVariable(token)` lets the
   autocomplete fire the insertion from the parent component
   without reaching into ProseMirror internals. */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variableNode: {
      /** Insert a VariableNode at the current selection. The
       *  token can be the bare name ('artist') or the
       *  bracketed form — stored bare either way. */
      insertVariable: (token: string) => ReturnType;
    };
  }
}

interface VariableNodeStorage {
  /** Sprint 12 §9c2 — resolved-value map populated by
   *  RichTextEditor when its parent fetches the values for
   *  this pack. The NodeView's double-click handler reads
   *  from here to compute the static literal that replaces
   *  the chip on override-break. */
  resolvedMap: Record<string, string>;
}

export const VariableNode = Node.create<unknown, VariableNodeStorage>({
  name: 'variableNode',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return {
      resolvedMap: {},
    };
  },

  addAttributes() {
    return {
      token: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-token') ?? '',
        renderHTML: (attrs) => ({
          'data-token': attrs.token,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-variable-node]' }];
  },

  renderHTML({ HTMLAttributes }) {
    /* Fallback HTML when the node renders outside the
       NodeView (e.g. server-rendered preview). The chip
       styling above only applies inside the editor. */
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-variable-node': 'true',
        class: 'lp-variable-chip-static',
      }),
      bracket(HTMLAttributes['data-token'] ?? ''),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableChip);
  },

  addCommands(): Partial<RawCommands> {
    return {
      insertVariable:
        (token: string) =>
        ({ commands }) => {
          const bare = token.startsWith('{') ? token.slice(1, -1) : token;
          return commands.insertContent({
            type: 'variableNode',
            attrs: { token: bare },
          });
        },
    };
  },
});
