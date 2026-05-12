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
   token string. */
function VariableChip({ node }: NodeViewProps) {
  const attrs = node.attrs as VariableNodeAttrs;
  const bracketed = bracket(attrs.token);
  const label = LABEL_BY_TOKEN[bracketed] ?? bracketed;
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
        background: 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-lp-orange) 35%, transparent)',
        borderRadius: 4,
        verticalAlign: 'baseline',
        cursor: 'default',
        userSelect: 'all',
      }}
      data-token={attrs.token}
      title={bracketed}
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

export const VariableNode = Node.create({
  name: 'variableNode',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

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
