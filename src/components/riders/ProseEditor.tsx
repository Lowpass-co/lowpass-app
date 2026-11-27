'use client';

/* LOWPASS — Riders: a prose block (Tiptap StarterKit). The doc it emits goes
   through cleanDoc on the server; a remote save replaces it only while this
   editor isn't focused (the per-block conflict prompt covers the rest). */

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react';
import type { ProseDoc } from '@/lib/riders/types';

export function ProseEditor({
  doc,
  onChange,
  onFocus,
  onBlur,
  placeholder = 'Write here…',
  autoFocus,
  editable = true,
}: {
  doc: ProseDoc;
  onChange: (doc: ProseDoc) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  // The latest onChange for Tiptap's (stable) onUpdate — kept current after
  // each render, never written during one.
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  const [focused, setFocused] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [3, 4] }, codeBlock: false, link: { openOnClick: false, autolink: true, protocols: ['mailto', 'tel'] } }),
      Placeholder.configure({ placeholder }),
    ],
    content: doc,
    autofocus: autoFocus ? 'end' : false,
    // Only a change to the DOCUMENT is an edit. Tiptap also emits `update`
    // for other things (setEditable does by default) — before this guard,
    // merely opening the page PATCHed every paragraph block.
    onUpdate: ({ editor: e, transaction }) => {
      if (transaction.docChanged) changeRef.current(e.getJSON() as ProseDoc);
    },
    onFocus: () => {
      setFocused(true);
      onFocus?.();
    },
    onBlur: () => {
      setFocused(false);
      onBlur?.();
    },
  });

  // Someone else's save: take it unless I'm typing here.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(doc)) editor.commands.setContent(doc, { emitUpdate: false });
  }, [doc, editor]);

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editable, editor]);

  const btn = (label: string, active: boolean, run: () => void, Icon: typeof Bold) => (
    <button
      type="button"
      className="rdx-tool"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <Icon size={14} aria-hidden />
    </button>
  );

  return (
    <div className="rdx-prose rd-prose">
      {editor && focused && editable ? (
        <div className="rdx-tools" role="toolbar" aria-label="Formatting">
          {btn('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold)}
          {btn('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic)}
          {btn('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), Underline)}
          {btn('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List)}
          {btn('Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
          {btn('Link', editor.isActive('link'), () => {
            const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
            const href = window.prompt('Link to (https://, mailto: or tel:)', prev);
            if (href === null) return;
            if (!href.trim()) editor.chain().focus().unsetLink().run();
            else if (/^(https?:\/\/|mailto:|tel:)/i.test(href.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
          }, Link2)}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
